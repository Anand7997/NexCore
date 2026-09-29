"""Tests for the web.assert_visible / web.assert_enabled state assertions."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.execution.plugin import PluginValidationError
from app.execution.plugins.web.plugin import WebExecutionPlugin


class FakeLocator:
    def __init__(self, *, visible: bool = True, enabled: bool = True):
        self._visible = visible
        self._enabled = enabled
        self.waited_states: list[str] = []

    async def wait_for(self, state: str, timeout: float = 0):
        self.waited_states.append(state)
        reachable = self._visible if state == "visible" else not self._visible
        if not reachable:
            raise TimeoutError(f"locator did not reach state {state!r}")

    async def is_enabled(self, timeout: float = 0) -> bool:
        return self._enabled


class FakeEnvelope:
    def __init__(self, node_type: str = "", config: dict | None = None):
        self.node_type = node_type
        self.config = config or {}
        self.execution_id = "exec-test"
        self.node_key = "node-test"
        self.logs: list[tuple[str, str]] = []
        self.emitted: list = []
        self.artifacts = SimpleNamespace(record_text=self._record_text)

    async def log(self, level, message, source=""):
        self.logs.append((level, message))

    async def emit(self, event):
        self.emitted.append(event)

    async def _record_text(self, *args, **kwargs):
        return None


class FakePage:
    def locator(self, selector: str):
        return _LOCATOR

    async def content(self) -> str:
        return "<html></html>"


_LOCATOR = FakeLocator()


@pytest.fixture
def plugin() -> WebExecutionPlugin:
    return WebExecutionPlugin()


def _patch_locator(monkeypatch, locator: FakeLocator):
    monkeypatch.setattr(
        "app.execution.plugins.web.plugin._playwright_locator",
        lambda page, candidate: locator,
    )


def _spec_types(plugin: WebExecutionPlugin) -> set[str]:
    return {spec.type for spec in plugin.node_specs()}


def test_assert_visible_is_a_published_node_spec(plugin):
    assert "web.assert_visible" in _spec_types(plugin)


def test_assert_enabled_is_a_published_node_spec(plugin):
    assert "web.assert_enabled" in _spec_types(plugin)


async def test_assert_visible_requires_a_selector(plugin):
    with pytest.raises(PluginValidationError):
        await plugin.validate(FakeEnvelope("web.assert_visible", {"state": "visible"}))


async def test_assert_enabled_requires_a_selector(plugin):
    with pytest.raises(PluginValidationError):
        await plugin.validate(FakeEnvelope("web.assert_enabled", {"enabled": True}))


async def test_assert_visible_passes_when_element_is_visible(plugin, monkeypatch):
    locator = FakeLocator(visible=True)
    _patch_locator(monkeypatch, locator)
    envelope = FakeEnvelope()

    result = await plugin._do_assert_visible(
        envelope, FakePage(), {"selector": "#search", "state": "visible", "timeout_ms": 500}
    )

    assert result["state"] == "visible"
    assert locator.waited_states == ["visible"]


async def test_assert_visible_fails_when_element_never_appears(plugin, monkeypatch):
    _patch_locator(monkeypatch, FakeLocator(visible=False))

    with pytest.raises(AssertionError):
        await plugin._do_assert_visible(
            FakeEnvelope(), FakePage(), {"selector": "#search", "state": "visible", "timeout_ms": 50}
        )


async def test_assert_visible_hidden_state_passes_for_absent_element(plugin, monkeypatch):
    locator = FakeLocator(visible=False)
    _patch_locator(monkeypatch, locator)

    result = await plugin._do_assert_visible(
        FakeEnvelope(), FakePage(), {"selector": "#spinner", "state": "hidden", "timeout_ms": 500}
    )

    assert result["state"] == "hidden"
    assert locator.waited_states == ["hidden"]


async def test_assert_enabled_passes_for_enabled_element(plugin, monkeypatch):
    _patch_locator(monkeypatch, FakeLocator(enabled=True))

    result = await plugin._do_assert_enabled(
        FakeEnvelope(), FakePage(), {"selector": "#search", "enabled": True, "timeout_ms": 500}
    )

    assert result["enabled"] is True
    assert result["actual"] is True


async def test_assert_enabled_fails_when_element_is_disabled(plugin, monkeypatch):
    _patch_locator(monkeypatch, FakeLocator(enabled=False))

    with pytest.raises(AssertionError):
        await plugin._do_assert_enabled(
            FakeEnvelope(), FakePage(), {"selector": "#search", "enabled": True, "timeout_ms": 500}
        )


async def test_assert_enabled_false_passes_for_disabled_element(plugin, monkeypatch):
    _patch_locator(monkeypatch, FakeLocator(enabled=False))

    result = await plugin._do_assert_enabled(
        FakeEnvelope(), FakePage(), {"selector": "#search", "enabled": False, "timeout_ms": 500}
    )

    assert result["actual"] is False
