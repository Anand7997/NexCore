import unittest

from app.orchestration.state_machine import NodeStatus, StateMachineError, transition


class StateMachineTests(unittest.TestCase):
    def test_running_can_transition_to_retrying(self):
        self.assertEqual(transition(NodeStatus.RUNNING, NodeStatus.RETRYING), NodeStatus.RETRYING)

    def test_retrying_can_transition_back_to_running(self):
        self.assertEqual(transition(NodeStatus.RETRYING, NodeStatus.RUNNING), NodeStatus.RUNNING)

    def test_failed_state_is_terminal(self):
        with self.assertRaises(StateMachineError):
            transition(NodeStatus.FAILED, NodeStatus.RETRYING)
