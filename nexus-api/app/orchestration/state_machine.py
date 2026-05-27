"""
Node lifecycle state machine.
Enforces valid transitions and guards against illegal state changes.

  created -> queued -> waiting -> running -> completed
                |         |         |   ^
                v         v         v   |
            cancelled   skipped  retrying
                                  |
                                  v
                                failed
"""
from __future__ import annotations
from enum import Enum


class NodeStatus(str, Enum):
    CREATED = "created"
    QUEUED = "queued"
    WAITING = "waiting"
    RUNNING = "running"
    RETRYING = "retrying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class ExecutionStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Valid state transitions: current -> set of allowed next states
TRANSITIONS: dict[NodeStatus, set[NodeStatus]] = {
    NodeStatus.CREATED: {NodeStatus.QUEUED, NodeStatus.CANCELLED},
    NodeStatus.QUEUED: {NodeStatus.WAITING, NodeStatus.RUNNING, NodeStatus.CANCELLED, NodeStatus.SKIPPED},
    NodeStatus.WAITING: {NodeStatus.RUNNING, NodeStatus.CANCELLED, NodeStatus.SKIPPED},
    NodeStatus.RUNNING: {NodeStatus.COMPLETED, NodeStatus.FAILED, NodeStatus.CANCELLED, NodeStatus.RETRYING},
    NodeStatus.RETRYING: {NodeStatus.RUNNING, NodeStatus.FAILED, NodeStatus.CANCELLED},
    NodeStatus.COMPLETED: set(),  # terminal
    NodeStatus.FAILED: set(),  # terminal
    NodeStatus.CANCELLED: set(),  # terminal
    NodeStatus.SKIPPED: set(),  # terminal
}

TERMINAL_STATUSES = {
    NodeStatus.COMPLETED,
    NodeStatus.FAILED,
    NodeStatus.CANCELLED,
    NodeStatus.SKIPPED,
}

SUCCESS_STATUSES = {NodeStatus.COMPLETED, NodeStatus.SKIPPED}
FAILURE_STATUSES = {NodeStatus.FAILED, NodeStatus.CANCELLED}


class StateMachineError(Exception):
    pass


def transition(current: NodeStatus, next_: NodeStatus) -> NodeStatus:
    """
    Attempt a state transition. Raises StateMachineError on illegal transition.
    Returns the new status on success.
    """
    allowed = TRANSITIONS.get(current, set())
    if next_ not in allowed:
        raise StateMachineError(
            f"Invalid node transition: {current.value} -> {next_.value}. "
            f"Allowed: {[s.value for s in allowed]}"
        )
    return next_


def is_terminal(status: NodeStatus) -> bool:
    return status in TERMINAL_STATUSES


def is_success(status: NodeStatus) -> bool:
    return status in SUCCESS_STATUSES
