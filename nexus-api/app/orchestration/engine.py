"""
NEXUS QA Workflow Execution Engine.

Responsibilities:
- Accepts an execution ID and drives it to completion
- Traverses the DAG, resolving dependencies in real-time
- Runs nodes concurrently when dependencies allow
- Manages node lifecycle via state machine
- Emits lifecycle events through the event bus
- Propagates shared context (variables) between nodes
- Handles retries, cancellation, and failure propagation
- Persists state changes to the database
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.session import AsyncSessionLocal
from app.database.models import (
    ArtifactModel,
    ExecutionModel, ExecutionNodeModel,
    ExecutionTimelineModel, VariableSnapshotModel,
    WorkflowModel, WorkflowNodeModel, WorkflowEdgeModel,
)
from app.events.bus import get_event_bus
from app.events.types import (
    ExecutionStarted, ExecutionCompleted, ExecutionFailed, ExecutionCancelled,
    NodeQueued, NodeStarted, NodeCompleted, NodeFailed, NodeRetrying, NodeSkipped,
    TerminalLog, ArtifactCaptured, VariableSet,
)
from app.execution.artifacts import (
    Artifact, ArtifactRecorder, get_artifact_store,
)
from app.execution.plugin import (
    ExecutionEnvelope, PluginResult, PluginValidationError,
)
from app.execution.registry import get_plugin_for, list_plugins
from app.control_plane import get_control_plane
from app.orchestration.context import ExecutionContext
from app.orchestration.conditions import evaluate_condition, evaluate_expression
from app.orchestration.dag import DAGGraph, DAGNode, DAGEdge
from app.orchestration.retry import RetryPolicy
from app.orchestration.simulator import NodeSimulator
from app.orchestration.state_machine import (
    NodeStatus, ExecutionStatus, StateMachineError, transition, is_terminal,
)

logger = logging.getLogger(__name__)


class ExecutionEngine:
    """
    Drives a single workflow execution to completion.
    One instance per execution — created and discarded.
    """

    def __init__(self, execution_id: str, tenant_id: str | None = None) -> None:
        self.execution_id = execution_id
        self.tenant_id = tenant_id
        self._simulator = NodeSimulator()
        self._cancel_event = asyncio.Event()
        self._active_tasks: dict[str, asyncio.Task] = {}
        self._node_outputs: dict[str, dict[str, Any]] = {}

    # ── Public interface ─────────────────────────────────────────────────────

    async def run(self) -> None:
        """Entry point — loads execution, drives DAG, closes out."""
        async with AsyncSessionLocal() as db:
            execution = await self._load_execution(db)
            if not execution:
                logger.error("Execution %s not found", self.execution_id)
                await self._finish_queue("failed")
                return

            workflow = await db.get(WorkflowModel, execution.workflow_id)
            if not workflow:
                logger.error("Workflow %s not found", execution.workflow_id)
                await self._finish_queue("failed")
                return

            dag = await self._build_dag(db, workflow.id)
            context = ExecutionContext(execution.variables or {})

        await self._emit_log("info", f'Execution started — workflow "{workflow.name}"')
        await self._mark_execution_running()
        await self._mark_queue_running()

        bus = get_event_bus()
        await bus.publish(ExecutionStarted(
            execution_id=self.execution_id,
            workflow_id=workflow.id,
            workflow_name=workflow.name,
        ))

        # Notify all plugins so they can spin up per-execution resources
        # (httpx clients, etc). Browser-launch is lazy in the web plugin.
        for plugin in list_plugins():
            try:
                await plugin.on_execution_start(self.execution_id)
            except Exception:
                logger.exception("Plugin %s on_execution_start failed", plugin.name)

        try:
            success = await self._traverse(dag, context)
        except asyncio.CancelledError:
            await self._mark_execution_cancelled()
            await self._finish_queue("cancelled")
            await bus.publish(ExecutionCancelled(
                execution_id=self.execution_id,
                workflow_id=workflow.id,
            ))
            await self._teardown_plugins()
            return
        except Exception as exc:
            logger.exception("Unexpected error in execution %s", self.execution_id)
            await self._mark_execution_failed(str(exc))
            await self._finish_queue("failed")
            await bus.publish(ExecutionFailed(
                execution_id=self.execution_id,
                workflow_id=workflow.id,
                workflow_name=workflow.name,
                error=str(exc),
            ))
            await self._teardown_plugins()
            return

        if success:
            duration_ms = await self._mark_execution_success()
            await self._finish_queue("completed")
            await self._emit_log("success", f"All nodes completed — execution succeeded in {duration_ms}ms")
            await bus.publish(ExecutionCompleted(
                execution_id=self.execution_id,
                workflow_id=workflow.id,
                workflow_name=workflow.name,
                duration_ms=duration_ms,
            ))
        else:
            await self._mark_execution_failed("One or more nodes failed")
            await self._finish_queue("failed")
            await bus.publish(ExecutionFailed(
                execution_id=self.execution_id,
                workflow_id=workflow.id,
                workflow_name=workflow.name,
                error="One or more nodes failed",
            ))

        await self._teardown_plugins()

    async def _teardown_plugins(self) -> None:
        for plugin in list_plugins():
            try:
                await plugin.on_execution_end(self.execution_id)
            except Exception:
                logger.exception("Plugin %s on_execution_end failed", plugin.name)

    def cancel(self) -> None:
        """Signal the engine to cancel the running execution."""
        self._cancel_event.set()
        for task in self._active_tasks.values():
            task.cancel()

    # ── DAG traversal ────────────────────────────────────────────────────────

    async def _traverse(self, dag: DAGGraph, context: ExecutionContext) -> bool:
        """
        Core traversal loop.
        Resolves ready nodes each iteration, runs them concurrently,
        waits for any completion, then finds the next wave.
        """
        completed: set[str] = set()
        failed: set[str] = set()
        skipped: set[str] = set()
        in_progress: set[str] = set()
        branch_skipped: set[str] = set()
        inactive_edges: set[tuple[str, str, str]] = set()

        # Queue every runtime node before traversal. Dependency resolution still
        # controls when nodes run, but this preserves the legal lifecycle:
        # created -> queued -> running.
        for node_key in dag.nodes:
            await self._set_node_status(node_key, NodeStatus.QUEUED)
            await self._add_timeline(node_key, "queued")

        while True:
            if self._cancel_event.is_set():
                raise asyncio.CancelledError()

            branch_pruned, failure_pruned, truly_ready = self._resolve_ready_nodes(
                dag,
                completed=completed,
                failed=failed,
                skipped=skipped,
                in_progress=in_progress,
                inactive_edges=inactive_edges,
            )

            for node_key in branch_pruned:
                await self._skip_node(node_key, dag, "Branch not selected")
                skipped.add(node_key)
                branch_skipped.add(node_key)
                self._mark_outgoing_edges_inactive(dag, node_key, inactive_edges)

            for node_key in failure_pruned:
                await self._skip_node(node_key, dag, "Predecessor failed")
                failed.add(node_key)

            # Launch all newly ready nodes concurrently
            for node_key in truly_ready:
                in_progress.add(node_key)
                task = asyncio.create_task(
                    self._run_node(node_key, dag.nodes[node_key], context, dag),
                    name=f"node-{node_key}",
                )
                self._active_tasks[node_key] = task

            # Continue after a skip-only wave so failure propagation reaches
            # every descendant before the execution closes.
            if not in_progress:
                if branch_pruned or failure_pruned:
                    continue
                break

            # Always wait for at least one in-progress task to finish
            pending = [t for k, t in self._active_tasks.items() if k in in_progress]
            if not pending:
                break  # Defensive: tasks missing from registry

            done, _ = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)

            for task in done:
                node_key = next(
                    (k for k, t in self._active_tasks.items() if t is task), None
                )
                if node_key is None:
                    continue
                self._active_tasks.pop(node_key, None)
                in_progress.discard(node_key)

                exc = task.exception()
                if exc:
                    logger.error("Node %s raised exception: %s", node_key, exc)
                    failed.add(node_key)
                else:
                    result = task.result()
                    if result:
                        completed.add(node_key)
                        await self._resolve_outgoing_edges(
                            node_key,
                            dag,
                            context,
                            inactive_edges=inactive_edges,
                        )
                    else:
                        failed.add(node_key)

        # Execution succeeded only if no nodes permanently failed
        actually_failed = {k for k in failed if k in dag.nodes}
        return len(actually_failed) == 0

    def _resolve_ready_nodes(
        self,
        dag: DAGGraph,
        *,
        completed: set[str],
        failed: set[str],
        skipped: set[str],
        in_progress: set[str],
        inactive_edges: set[tuple[str, str, str]],
    ) -> tuple[list[str], list[str], list[str]]:
        branch_pruned: list[str] = []
        failure_pruned: list[str] = []
        ready: list[str] = []
        terminal = completed | failed | skipped

        for node_key in dag.nodes:
            if node_key in terminal or node_key in in_progress:
                continue

            incoming = dag.incoming_edges(node_key)
            if not incoming:
                ready.append(node_key)
                continue

            active_sources: list[str] = []
            unresolved = False
            for edge in incoming:
                if edge.ref() in inactive_edges:
                    continue
                source = edge.source
                if source not in terminal:
                    unresolved = True
                    break
                active_sources.append(source)

            if unresolved:
                continue
            if not active_sources:
                branch_pruned.append(node_key)
                continue
            if any(source in failed or source in skipped for source in active_sources):
                failure_pruned.append(node_key)
                continue
            if all(source in completed for source in active_sources):
                ready.append(node_key)

        return branch_pruned, failure_pruned, ready

    # ── Node execution ───────────────────────────────────────────────────────

    async def _run_node(
        self,
        node_key: str,
        dag_node: DAGNode,
        context: ExecutionContext,
        dag: DAGGraph,
    ) -> bool:
        """
        Executes a single node with full retry orchestration.
        Returns True on success, False on permanent failure.
        """
        bus = get_event_bus()
        retry_policy = RetryPolicy.from_dict(dag_node.retry_policy or {})
        attempt = 0

        await self._set_node_status(node_key, NodeStatus.RUNNING)

        while True:
            attempt += 1
            await self._inc_node_attempt(node_key)

            await self._emit_log(
                "info",
                f"[{dag_node.label}] Starting — attempt {attempt}/{retry_policy.max_attempts}",
                node_key,
            )
            await bus.publish(NodeStarted(
                execution_id=self.execution_id,
                node_id=node_key,
                node_label=dag_node.label,
                node_type=dag_node.node_type,
                attempt=attempt,
            ))
            await self._add_timeline(node_key, "started", {"attempt": attempt})

            result = await self._dispatch_node(
                node_key, dag_node, context, attempt,
            )

            if result.success:
                # Propagate outputs to shared context
                if result.output:
                    self._node_outputs[node_key] = dict(result.output)
                    await context.set_many(result.output)
                    await self._save_variable_snapshot(node_key, result.output)
                    await bus.publish(VariableSet(
                        execution_id=self.execution_id,
                        node_id=node_key,
                        variables=result.output,
                    ))

                await self._set_node_completed(node_key, result.duration_ms, result.output)
                await self._emit_log(
                    "success",
                    f"[{dag_node.label}] Completed in {result.duration_ms}ms",
                    node_key,
                )
                await bus.publish(NodeCompleted(
                    execution_id=self.execution_id,
                    node_id=node_key,
                    node_label=dag_node.label,
                    node_type=dag_node.node_type,
                    duration_ms=result.duration_ms,
                    output=result.output,
                ))
                await self._add_timeline(node_key, "completed", {"duration_ms": result.duration_ms})
                return True

            # Node failed
            self._node_outputs.pop(node_key, None)
            will_retry = retry_policy.should_retry(attempt)
            await self._emit_log(
                "error",
                f"[{dag_node.label}] Failed: {result.error} {'(will retry)' if will_retry else '(max attempts reached)'}",
                node_key,
            )
            await bus.publish(NodeFailed(
                execution_id=self.execution_id,
                node_id=node_key,
                node_label=dag_node.label,
                node_type=dag_node.node_type,
                error=result.error or "Unknown error",
                attempt=attempt,
                will_retry=will_retry,
            ))

            if not will_retry:
                await self._set_node_status(node_key, NodeStatus.FAILED, error=result.error)
                await self._add_timeline(node_key, "failed", {"error": result.error, "attempts": attempt})
                return False

            # Schedule retry
            delay_ms = await retry_policy.wait(attempt)
            await self._set_node_status(node_key, NodeStatus.RETRYING)
            await bus.publish(NodeRetrying(
                execution_id=self.execution_id,
                node_id=node_key,
                node_label=dag_node.label,
                node_type=dag_node.node_type,
                attempt=attempt + 1,
                delay_ms=int(delay_ms),
            ))
            await self._add_timeline(node_key, "retrying", {"attempt": attempt + 1, "delay_ms": int(delay_ms)})
            await self._emit_log(
                "warn",
                f"[{dag_node.label}] Retrying in {delay_ms:.0f}ms (attempt {attempt+1}/{retry_policy.max_attempts})",
                node_key,
            )
            await self._set_node_status(node_key, NodeStatus.RUNNING)

    async def _dispatch_node(
        self,
        node_key: str,
        dag_node: DAGNode,
        context: ExecutionContext,
        attempt: int,
    ) -> PluginResult:
        """
        Resolve a plugin for the node-type and execute it sandboxed (timeout +
        cancellation). Falls back to the legacy NodeSimulator for node-types
        no plugin claims (preserves the simulated workflows from earlier
        phases — a "real execution layer" doesn't break the demo).
        """
        bus = get_event_bus()
        control_result = await self._dispatch_control_node(dag_node, context)
        if control_result is not None:
            return control_result
        plugin = get_plugin_for(dag_node.node_type)

        # ── Simulator fallback ────────────────────────────────────────
        if plugin is None:
            sim_result = await self._simulator.run(
                node_key=node_key,
                node_type=dag_node.node_type,
                config=dag_node.config,
                context=context,
                cancellation_token=self._cancel_event if self._cancel_event.is_set() else None,
            )
            return PluginResult(
                success=sim_result.success,
                duration_ms=sim_result.duration_ms,
                output=sim_result.output,
                error=sim_result.error,
            )

        # ── Real plugin path ──────────────────────────────────────────
        async def _persist_artifact(artifact: Artifact) -> None:
            try:
                async with AsyncSessionLocal() as db:
                    db.add(ArtifactModel(
                        id=artifact.id,
                        execution_id=artifact.execution_id,
                        node_key=artifact.node_key,
                        kind=artifact.kind.value,
                        name=artifact.name,
                        relative_path=artifact.relative_path,
                        content_type=artifact.content_type,
                        size_bytes=artifact.size_bytes,
                        artifact_metadata=artifact.metadata,
                    ))
                    await db.commit()
            except Exception:
                logger.exception("Failed to persist artifact row")
            await bus.publish(ArtifactCaptured(
                execution_id=artifact.execution_id,
                node_id=artifact.node_key,
                artifact_id=artifact.id,
                kind=artifact.kind.value,
                name=artifact.name,
                content_type=artifact.content_type,
                size_bytes=artifact.size_bytes,
                metadata=artifact.metadata,
            ))

        recorder = ArtifactRecorder(
            execution_id=self.execution_id,
            node_key=node_key,
            store=get_artifact_store(),
            on_record=_persist_artifact,
        )

        async def _log(level: str, message: str, *, source: str = "plugin") -> None:
            await bus.publish(TerminalLog(
                execution_id=self.execution_id,
                node_id=node_key,
                level=level,
                message=message,
                source=source,
            ))

        async def _emit(event: Any) -> None:
            await bus.publish(event)

        envelope = ExecutionEnvelope(
            execution_id=self.execution_id,
            workflow_id="",  # not needed at plugin layer
            node_key=node_key,
            node_label=dag_node.label,
            node_type=dag_node.node_type,
            config=dag_node.config or {},
            timeout_seconds=dag_node.timeout_seconds or 60,
            attempt=attempt,
            context=context,
            artifacts=recorder,
            log=_log,
            emit=_emit,
            cancel_event=self._cancel_event,
        )

        # Validate before executing — reject bad config without retry waste.
        try:
            await plugin.validate(envelope)
        except PluginValidationError as exc:
            return PluginResult(success=False, duration_ms=0,
                                error=f"Validation failed: {exc}")
        except Exception as exc:
            return PluginResult(success=False, duration_ms=0,
                                error=f"Validation crashed: {exc}")

        # Sandbox execution behind a hard timeout.
        try:
            result = await asyncio.wait_for(
                plugin.execute(envelope),
                timeout=envelope.timeout_seconds,
            )
        except asyncio.TimeoutError:
            return PluginResult(
                success=False, duration_ms=envelope.timeout_seconds * 1000,
                error=f"Node timed out after {envelope.timeout_seconds}s",
            )
        except asyncio.CancelledError:
            return PluginResult(success=False, duration_ms=0, error="Cancelled")
        except Exception as exc:
            logger.exception("Plugin %s execute crashed", plugin.name)
            return PluginResult(success=False, duration_ms=0,
                                error=f"Plugin crashed: {exc}")

        # Surface artifact ids onto the result for the engine timeline.
        if recorder.recorded:
            result.artifact_ids = [a.id for a in recorder.recorded]
            result.output.setdefault("artifact_ids", result.artifact_ids)

        return result

    async def _dispatch_control_node(
        self,
        dag_node: DAGNode,
        context: ExecutionContext,
    ) -> PluginResult | None:
        if dag_node.node_type != "conditionalBranch":
            return None

        cfg = dag_node.config or {}
        ctx_vars = await context.all()
        try:
            output = self._evaluate_conditional_branch(cfg, ctx_vars)
        except Exception as exc:
            return PluginResult(
                success=False,
                duration_ms=0,
                error=f"Conditional branch evaluation failed: {exc}",
            )
        return PluginResult(success=True, duration_ms=0, output=output)

    def _evaluate_conditional_branch(
        self,
        cfg: dict[str, Any],
        variables: dict[str, Any],
    ) -> dict[str, Any]:
        variable_name = str(cfg.get("variable") or "branch_decision")
        cases = cfg.get("cases")
        default_case = str(cfg.get("default_case") or "else").strip() or "else"

        if isinstance(cases, dict) and cases:
            selected = default_case
            matched_expression = ""
            for label, expression in cases.items():
                if evaluate_condition(str(expression or ""), variables):
                    selected = str(label)
                    matched_expression = str(expression or "")
                    break
            return {
                variable_name: selected,
                "branch_decision": selected,
                "condition_result": selected != default_case,
                "matched_expression": matched_expression,
                "default_case": default_case,
            }

        expression = str(cfg.get("expression") or cfg.get("condition") or "").strip()
        result = bool(evaluate_expression(expression or "False", variables))
        true_label = str(cfg.get("true_label") or "true")
        false_label = str(cfg.get("false_label") or "false")
        selected = true_label if result else false_label
        return {
            variable_name: selected if variable_name == "branch_decision" else result,
            "branch_decision": selected,
            "condition_result": result,
            "evaluated_expression": expression,
            "true_label": true_label,
            "false_label": false_label,
        }

    async def _resolve_outgoing_edges(
        self,
        node_key: str,
        dag: DAGGraph,
        context: ExecutionContext,
        *,
        inactive_edges: set[tuple[str, str, str]],
    ) -> None:
        outgoing = dag.outgoing_edges(node_key)
        if not outgoing:
            return

        variables = await context.all()
        source_output = self._node_outputs.get(node_key, {})
        extra = {"output": source_output, "node_output": source_output}
        else_edges: list[DAGEdge] = []
        matched_explicit = False

        for edge in outgoing:
            condition = str(edge.condition or "").strip()
            edge_ref = edge.ref()
            if not condition:
                inactive_edges.discard(edge_ref)
                continue
            lowered = condition.lower()
            if lowered in {"else", "default"}:
                else_edges.append(edge)
                continue
            if self._edge_matches(condition, variables, source_output, extra=extra):
                inactive_edges.discard(edge_ref)
                matched_explicit = True
            else:
                inactive_edges.add(edge_ref)

        for edge in else_edges:
            if matched_explicit:
                inactive_edges.add(edge.ref())
            else:
                inactive_edges.discard(edge.ref())

    def _edge_matches(
        self,
        condition: str,
        variables: dict[str, Any],
        source_output: dict[str, Any],
        *,
        extra: dict[str, Any],
    ) -> bool:
        normalized = str(condition or "").strip()
        lowered = normalized.lower()
        branch_decision = str(source_output.get("branch_decision") or "").strip()
        if branch_decision and lowered in {
            branch_decision.lower(),
            f"branch:{branch_decision.lower()}",
            f"case:{branch_decision.lower()}",
        }:
            return True

        condition_result = source_output.get("condition_result")
        if isinstance(condition_result, bool) and lowered in {"true", "false"}:
            return condition_result is (lowered == "true")

        try:
            return evaluate_condition(normalized, variables, extra=extra)
        except NameError:
            return False

    @staticmethod
    def _mark_outgoing_edges_inactive(
        dag: DAGGraph,
        node_key: str,
        inactive_edges: set[tuple[str, str, str]],
    ) -> None:
        for edge in dag.outgoing_edges(node_key):
            inactive_edges.add(edge.ref())

    async def _skip_node(self, node_key: str, dag: DAGGraph, reason: str) -> None:
        bus = get_event_bus()
        await self._set_node_status(node_key, NodeStatus.SKIPPED)
        await bus.publish(NodeSkipped(
            execution_id=self.execution_id,
            node_id=node_key,
            node_label=dag.nodes[node_key].label if node_key in dag.nodes else node_key,
            reason=reason,
        ))
        await self._add_timeline(node_key, "skipped", {"reason": reason})

    # ── Database operations ──────────────────────────────────────────────────

    async def _load_execution(self, db: AsyncSession) -> ExecutionModel | None:
        result = await db.execute(
            select(ExecutionModel).where(ExecutionModel.id == self.execution_id)
        )
        return result.scalar_one_or_none()

    async def _build_dag(self, db: AsyncSession, workflow_id: str) -> DAGGraph:
        nodes_result = await db.execute(
            select(WorkflowNodeModel)
            .where(WorkflowNodeModel.workflow_id == workflow_id)
            .order_by(
                WorkflowNodeModel.position_x.asc(),
                WorkflowNodeModel.position_y.asc(),
                WorkflowNodeModel.node_key.asc(),
            )
        )
        edges_result = await db.execute(
            select(WorkflowEdgeModel)
            .where(WorkflowEdgeModel.workflow_id == workflow_id)
            .order_by(
                WorkflowEdgeModel.execution_order.asc(),
                WorkflowEdgeModel.source_key.asc(),
                WorkflowEdgeModel.target_key.asc(),
            )
        )
        wf_nodes = nodes_result.scalars().all()
        wf_edges = edges_result.scalars().all()

        dag_nodes = [
            DAGNode(
                key=n.node_key,
                label=n.label,
                node_type=n.type,
                config=n.config or {},
                retry_policy=n.retry_policy or {},
                timeout_seconds=n.timeout_seconds,
                position=(n.position_x, n.position_y),
            )
            for n in wf_nodes
        ]
        dag_edges = [
            DAGEdge(source=e.source_key, target=e.target_key, condition=e.condition)
            for e in wf_edges
        ]

        # Ensure execution_nodes rows exist for each DAG node
        async with AsyncSessionLocal() as session:
            for dag_node in dag_nodes:
                existing = await session.execute(
                    select(ExecutionNodeModel).where(
                        ExecutionNodeModel.execution_id == self.execution_id,
                        ExecutionNodeModel.node_key == dag_node.key,
                    )
                )
                if not existing.scalar_one_or_none():
                    session.add(ExecutionNodeModel(
                        execution_id=self.execution_id,
                        node_key=dag_node.key,
                        node_label=dag_node.label,
                        node_type=dag_node.node_type,
                        status=NodeStatus.CREATED,
                    ))
            await session.commit()

        return DAGGraph(dag_nodes, dag_edges)

    async def _mark_execution_running(self) -> None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ExecutionModel).where(ExecutionModel.id == self.execution_id)
            )
            exec_ = result.scalar_one_or_none()
            if exec_:
                exec_.status = ExecutionStatus.RUNNING
                exec_.started_at = datetime.utcnow()
                await db.commit()

    async def _mark_execution_success(self) -> int:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ExecutionModel).where(ExecutionModel.id == self.execution_id)
            )
            exec_ = result.scalar_one_or_none()
            if exec_:
                exec_.status = ExecutionStatus.SUCCESS
                exec_.completed_at = datetime.utcnow()
                duration = int((exec_.completed_at - exec_.started_at).total_seconds() * 1000) if exec_.started_at else 0
                await db.commit()
                return duration
        return 0

    async def _mark_execution_failed(self, error: str) -> None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ExecutionModel).where(ExecutionModel.id == self.execution_id)
            )
            exec_ = result.scalar_one_or_none()
            if exec_:
                exec_.status = ExecutionStatus.FAILED
                exec_.error = error
                exec_.completed_at = datetime.utcnow()
                await db.commit()

    async def _mark_execution_cancelled(self) -> None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ExecutionModel).where(ExecutionModel.id == self.execution_id)
            )
            exec_ = result.scalar_one_or_none()
            if exec_:
                exec_.status = ExecutionStatus.CANCELLED
                exec_.completed_at = datetime.utcnow()
                await db.commit()

    async def _mark_queue_running(self) -> None:
        try:
            await get_control_plane().mark_running(self.execution_id, tenant_id=self.tenant_id)
        except Exception as exc:
            logger.warning("Control plane running report failed for %s: %s", self.execution_id, exc)

    async def _finish_queue(self, final_status: str) -> None:
        # Releases the lease so the control plane can dispatch more work to this agent.
        try:
            await get_control_plane().finish_execution(self.execution_id, final_status, tenant_id=self.tenant_id)
        except Exception as exc:
            logger.warning("Control plane finish report failed for %s: %s", self.execution_id, exc)

    async def _set_node_status(
        self,
        node_key: str,
        status: NodeStatus,
        error: str | None = None,
    ) -> None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ExecutionNodeModel).where(
                    ExecutionNodeModel.execution_id == self.execution_id,
                    ExecutionNodeModel.node_key == node_key,
                )
            )
            node = result.scalar_one_or_none()
            if node:
                current = NodeStatus(node.status)
                if current == status:
                    return
                try:
                    transition(current, status)
                except StateMachineError:
                    logger.exception(
                        "Rejected invalid node transition for %s: %s -> %s",
                        node_key,
                        current.value,
                        status.value,
                    )
                    raise
                node.status = status
                if error:
                    node.error = error
                if status == NodeStatus.RUNNING and not node.started_at:
                    node.started_at = datetime.utcnow()
                await db.commit()

    async def _set_node_completed(
        self, node_key: str, duration_ms: int, output: dict
    ) -> None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ExecutionNodeModel).where(
                    ExecutionNodeModel.execution_id == self.execution_id,
                    ExecutionNodeModel.node_key == node_key,
                )
            )
            node = result.scalar_one_or_none()
            if node:
                current = NodeStatus(node.status)
                if current != NodeStatus.COMPLETED:
                    transition(current, NodeStatus.COMPLETED)
                node.status = NodeStatus.COMPLETED
                node.completed_at = datetime.utcnow()
                node.duration_ms = duration_ms
                node.output = output
                await db.commit()

    async def _inc_node_attempt(self, node_key: str) -> None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ExecutionNodeModel).where(
                    ExecutionNodeModel.execution_id == self.execution_id,
                    ExecutionNodeModel.node_key == node_key,
                )
            )
            node = result.scalar_one_or_none()
            if node:
                node.attempt_count = (node.attempt_count or 0) + 1
                await db.commit()

    async def _add_timeline(
        self, node_key: str, phase: str, metadata: dict | None = None
    ) -> None:
        async with AsyncSessionLocal() as db:
            db.add(ExecutionTimelineModel(
                execution_id=self.execution_id,
                node_key=node_key,
                phase=phase,
                metadata_=metadata or {},
            ))
            await db.commit()

    async def _save_variable_snapshot(self, node_key: str, variables: dict) -> None:
        async with AsyncSessionLocal() as db:
            db.add(VariableSnapshotModel(
                execution_id=self.execution_id,
                node_key=node_key,
                variables=variables,
            ))
            await db.commit()

    async def _emit_log(
        self, level: str, message: str, node_key: str | None = None
    ) -> None:
        bus = get_event_bus()
        await bus.publish(TerminalLog(
            execution_id=self.execution_id,
            node_id=node_key,
            level=level,
            message=message,
            source="engine",
        ))


# ── Engine registry — tracks active executions ───────────────────────────────

_active_engines: dict[str, ExecutionEngine] = {}


def get_active_engine(execution_id: str) -> ExecutionEngine | None:
    return _active_engines.get(execution_id)


def active_execution_count() -> int:
    return len(_active_engines)


async def launch_execution(execution_id: str, tenant_id: str | None = None) -> None:
    """Create an engine, register it, and run it in a background task."""
    engine = ExecutionEngine(execution_id, tenant_id=tenant_id)
    _active_engines[execution_id] = engine

    async def _run_and_cleanup():
        try:
            await engine.run()
        finally:
            _active_engines.pop(execution_id, None)

    asyncio.create_task(_run_and_cleanup(), name=f"execution-{execution_id}")


def cancel_execution(execution_id: str) -> bool:
    engine = _active_engines.get(execution_id)
    if engine:
        engine.cancel()
        return True
    return False
