"""Execution must refuse to launch test cases whose steps were never bound."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes.executions import _unbound_steps, _assert_all_steps_bound


def _step(order: int, name: str, test_data: dict | None = None, **overrides):
    defaults = {
        "step_order": order,
        "name": name,
        "is_enabled": True,
        "test_data": test_data or {},
        "page_element_id": "el-1",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _case(name: str, steps: list):
    return SimpleNamespace(name=name, test_steps=steps)


def test_no_unbound_steps_when_every_step_is_bound():
    case = _case("Search flights", [_step(1, "Click Search")])

    assert _unbound_steps([case]) == []


def test_step_flagged_for_review_is_reported_as_unbound():
    case = _case("Search flights", [
        _step(1, "Click Search"),
        _step(2, "Select Economy class", {"needs_review": True, "review_reason": "no element matched"}),
    ])

    unbound = _unbound_steps([case])

    assert len(unbound) == 1
    assert unbound[0]["step_order"] == 2
    assert unbound[0]["reason"] == "no element matched"


def test_disabled_step_flagged_for_review_is_ignored():
    case = _case("Search flights", [
        _step(1, "Select Economy class", {"needs_review": True}, is_enabled=False),
    ])

    assert _unbound_steps([case]) == []


def test_navigate_step_without_element_is_not_unbound():
    case = _case("Search flights", [_step(1, "Open the flights page", page_element_id=None)])

    assert _unbound_steps([case]) == []


def test_assert_raises_http_400_listing_every_unbound_step():
    case = _case("Search flights", [
        _step(2, "Select Economy class", {"needs_review": True, "review_reason": "no element matched"}),
        _step(5, "Apply travellers selector", {"needs_review": True}),
    ])

    with pytest.raises(HTTPException) as excinfo:
        _assert_all_steps_bound([case])

    assert excinfo.value.status_code == 400
    detail = str(excinfo.value.detail)
    assert "Select Economy class" in detail
    assert "Apply travellers selector" in detail


def test_assert_passes_when_all_steps_are_bound():
    case = _case("Search flights", [_step(1, "Click Search")])

    _assert_all_steps_bound([case])
