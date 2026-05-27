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

    async def _set_node_status(self, node_key, status, error=None):
        return

    async def _add_timeline(self, node_key, phase, metadata=None):
        return

    async def _skip_node(self, node_key, dag, reason):
        self.skipped.append(node_key)

    async def _run_node(self, node_key, dag_node, context, dag):
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
