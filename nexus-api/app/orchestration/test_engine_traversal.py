import asyncio
import unittest

from app.orchestration.context import ExecutionContext
from app.orchestration.dag import DAGEdge, DAGGraph, DAGNode
from app.orchestration.engine import ExecutionEngine


class _TraversalEngine(ExecutionEngine):
    def __init__(self, node_results: dict[str, bool]) -> None:
        super().__init__("execution-1")
        self.node_results = node_results
        self.skipped: list[str] = []
        self.ran: list[str] = []

    async def _set_node_status(self, node_key, status, error=None):
        return

    async def _add_timeline(self, node_key, phase, metadata=None):
        return

    async def _skip_node(self, node_key, dag, reason):
        self.skipped.append(node_key)

    async def _run_node(self, node_key, dag_node, context, dag):
        self.ran.append(node_key)
        return self.node_results[node_key]


class _BranchingTraversalEngine(_TraversalEngine):
    def __init__(self, node_results: dict[str, bool], outputs: dict[str, dict]) -> None:
        super().__init__(node_results)
        self.outputs = outputs

    async def _run_node(self, node_key, dag_node, context, dag):
        self.ran.append(node_key)
        output = self.outputs.get(node_key, {})
        if output:
            self._node_outputs[node_key] = dict(output)
            await context.set_many(output)
        return self.node_results[node_key]


class EngineTraversalTests(unittest.TestCase):
    def test_failed_node_skips_entire_descendant_chain(self):
        dag = DAGGraph(
            nodes=[
                DAGNode("a", "A", "web.click", {}, {}, 60),
                DAGNode("b", "B", "web.click", {}, {}, 60),
                DAGNode("c", "C", "web.click", {}, {}, 60),
            ],
            edges=[
                DAGEdge("a", "b"),
                DAGEdge("b", "c"),
            ],
        )
        engine = _TraversalEngine({"a": False})

        success = asyncio.run(engine._traverse(dag, ExecutionContext()))

        self.assertFalse(success)
        self.assertEqual(engine.skipped, ["b", "c"])

    def test_conditional_branch_prunes_false_path_and_runs_join(self):
        dag = DAGGraph(
            nodes=[
                DAGNode("branch", "Branch", "conditionalBranch", {}, {}, 60),
                DAGNode("approve", "Approve", "web.click", {}, {}, 60),
                DAGNode("reject", "Reject", "web.click", {}, {}, 60),
                DAGNode("join", "Join", "web.click", {}, {}, 60),
            ],
            edges=[
                DAGEdge("branch", "approve", "true"),
                DAGEdge("branch", "reject", "false"),
                DAGEdge("approve", "join"),
                DAGEdge("reject", "join"),
            ],
        )
        engine = _BranchingTraversalEngine(
            {"branch": True, "approve": True, "join": True},
            {"branch": {"condition_result": True, "branch_decision": "true"}},
        )

        success = asyncio.run(engine._traverse(dag, ExecutionContext()))

        self.assertTrue(success)
        self.assertEqual(engine.skipped, ["reject"])
        self.assertEqual(engine.ran, ["branch", "approve", "join"])

    def test_else_branch_runs_when_expression_does_not_match(self):
        dag = DAGGraph(
            nodes=[
                DAGNode("branch", "Branch", "conditionalBranch", {}, {}, 60),
                DAGNode("matched", "Matched", "web.click", {}, {}, 60),
                DAGNode("fallback", "Fallback", "web.click", {}, {}, 60),
            ],
            edges=[
                DAGEdge("branch", "matched", "approved"),
                DAGEdge("branch", "fallback", "else"),
            ],
        )
        engine = _BranchingTraversalEngine(
            {"branch": True, "fallback": True},
            {"branch": {"branch_decision": "rejected", "condition_result": False}},
        )

        success = asyncio.run(engine._traverse(dag, ExecutionContext()))

        self.assertTrue(success)
        self.assertEqual(engine.skipped, ["matched"])
        self.assertEqual(engine.ran, ["branch", "fallback"])
