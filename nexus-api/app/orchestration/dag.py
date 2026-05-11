"""
DAG (Directed Acyclic Graph) dependency resolver for workflow execution.
Implements topological sort (Kahn's algorithm), cycle detection,
and ready-node resolution for the execution engine.
"""
from __future__ import annotations
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any


@dataclass
class DAGNode:
    key: str
    label: str
    node_type: str
    config: dict[str, Any]
    retry_policy: dict[str, Any]
    timeout_seconds: int
    position: tuple[float, float] = (0.0, 0.0)


@dataclass
class DAGEdge:
    source: str
    target: str
    condition: str | None = None


class DAGGraph:
    """
    Represents an executable workflow DAG.
    Provides dependency resolution and traversal utilities.
    """

    def __init__(self, nodes: list[DAGNode], edges: list[DAGEdge]) -> None:
        self.nodes: dict[str, DAGNode] = {n.key: n for n in nodes}
        self.edges: list[DAGEdge] = edges
        self._validate()

    # ── Construction helpers ─────────────────────────────────────────────────

    def _validate(self) -> None:
        if self.detect_cycle():
            raise ValueError("Workflow DAG contains a cycle — invalid workflow")

    def detect_cycle(self) -> bool:
        """DFS-based cycle detection. Returns True if a cycle exists."""
        visited: set[str] = set()
        rec_stack: set[str] = set()

        def dfs(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)
            for edge in self.successors(node):
                if edge not in visited:
                    if dfs(edge):
                        return True
                elif edge in rec_stack:
                    return True
            rec_stack.discard(node)
            return False

        return any(dfs(n) for n in self.nodes if n not in visited)

    # ── Dependency queries ───────────────────────────────────────────────────

    def predecessors(self, node_key: str) -> list[str]:
        """Returns all nodes that must complete before node_key can run."""
        return [e.source for e in self.edges if e.target == node_key]

    def successors(self, node_key: str) -> list[str]:
        """Returns all nodes that depend on node_key completing."""
        return [e.target for e in self.edges if e.source == node_key]

    def roots(self) -> list[str]:
        """Nodes with no incoming edges (entry points of the DAG)."""
        has_incoming = {e.target for e in self.edges}
        return [n for n in self.nodes if n not in has_incoming]

    def leaves(self) -> list[str]:
        """Nodes with no outgoing edges (terminal nodes)."""
        has_outgoing = {e.source for e in self.edges}
        return [n for n in self.nodes if n not in has_outgoing]

    # ── Execution helpers ────────────────────────────────────────────────────

    def get_ready_nodes(self, completed: set[str], in_progress: set[str]) -> list[str]:
        """
        Returns node keys that are ready to execute:
        - All predecessors are in `completed`
        - Not already in `in_progress` or `completed`
        """
        ready = []
        for key in self.nodes:
            if key in completed or key in in_progress:
                continue
            preds = self.predecessors(key)
            if all(p in completed for p in preds):
                ready.append(key)
        return ready

    def topological_order(self) -> list[str]:
        """Kahn's algorithm — returns nodes in a valid execution order."""
        in_degree: dict[str, int] = defaultdict(int)
        for edge in self.edges:
            in_degree[edge.target] += 1

        queue: deque[str] = deque(n for n in self.nodes if in_degree[n] == 0)
        order: list[str] = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for succ in self.successors(node):
                in_degree[succ] -= 1
                if in_degree[succ] == 0:
                    queue.append(succ)

        return order

    def all_descendants(self, node_key: str) -> set[str]:
        """All nodes reachable from node_key — used for failure propagation."""
        visited: set[str] = set()
        stack = [node_key]
        while stack:
            curr = stack.pop()
            for succ in self.successors(curr):
                if succ not in visited:
                    visited.add(succ)
                    stack.append(succ)
        return visited

    def summary(self) -> dict:
        return {
            "node_count": len(self.nodes),
            "edge_count": len(self.edges),
            "roots": self.roots(),
            "leaves": self.leaves(),
            "order": self.topological_order(),
        }
