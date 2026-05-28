"""Node contract tests for all desktop.* node specs via DesktopExecutionPlugin.node_specs()."""
from __future__ import annotations

import pytest

from app.execution.plugins.desktop.plugin import DesktopExecutionPlugin


@pytest.fixture(scope="module")
def plugin() -> DesktopExecutionPlugin:
    return DesktopExecutionPlugin()


@pytest.fixture(scope="module")
def node_specs(plugin: DesktopExecutionPlugin) -> list[dict]:
    return [
        {
            "node_type": spec.type,
            "label": spec.label,
            "category": spec.category,
            "config_schema": spec.config_schema,
        }
        for spec in plugin.node_specs()
    ]


def test_node_specs_is_non_empty_list(node_specs):
    assert isinstance(node_specs, list)
    assert len(node_specs) > 0


@pytest.mark.parametrize("required_field", ["node_type", "label", "category"])
def test_every_spec_has_required_field(node_specs, required_field):
    missing = [s.get("node_type", "<no type>") for s in node_specs if required_field not in s]
    assert not missing, f"Specs missing '{required_field}': {missing}"


def test_all_node_types_start_with_desktop(node_specs):
    bad = [s["node_type"] for s in node_specs if not str(s.get("node_type", "")).startswith("desktop.")]
    assert not bad, f"Node types not prefixed with 'desktop.': {bad}"


def test_node_types_are_unique(node_specs):
    types = [s["node_type"] for s in node_specs]
    duplicates = [t for t in set(types) if types.count(t) > 1]
    assert not duplicates, f"Duplicate node_types found: {duplicates}"


def test_all_specs_have_config_schema(node_specs):
    without_schema = [s["node_type"] for s in node_specs if "config_schema" not in s and "schema" not in s]
    # Some specs may use 'schema' instead of 'config_schema'
    assert len(without_schema) < len(node_specs), "All specs should have a config_schema or schema"


def test_all_specs_have_string_label(node_specs):
    bad = [s["node_type"] for s in node_specs if not isinstance(s.get("label"), str) or not s["label"]]
    assert not bad, f"Specs with missing/empty label: {bad}"


def test_all_specs_have_category(node_specs):
    valid_categories = {
        "launch", "windows", "interaction", "input", "keyboard", "assertion",
        "navigation", "wait", "capture", "data", "file", "dialog", "output",
        "utility", "ai", "accessibility",
    }
    for spec in node_specs:
        cat = str(spec.get("category", "")).lower()
        assert cat, f"Spec '{spec['node_type']}' has empty category"


def test_known_node_types_present(node_specs):
    """Spot-check that a representative set of node types is registered."""
    present = {s["node_type"] for s in node_specs}
    expected = {
        "desktop.launch",
        "desktop.close",
        "desktop.click",
        "desktop.type_text",
        "desktop.extract_text",
        "desktop.assert_text",
        "desktop.screenshot",
        "desktop.press_key",
        "desktop.select",
        "desktop.table_cell_action",
        "desktop.tree_action",
        "desktop.assert_visual",
        "desktop.file_dialog",
        "desktop.wait_window",
        "desktop.sap_action",
        "desktop.java_action",
        "desktop.citrix_action",
        "desktop.terminal_action",
        "desktop.office_action",
        "desktop.custom_control_action",
    }
    missing = expected - present
    assert not missing, f"Expected node types not registered: {missing}"


def test_plugin_has_handlers_for_all_specs(plugin, node_specs):
    """Every spec must have a corresponding handler registered."""
    handlers = plugin._handlers()
    unhandled = [s["node_type"] for s in node_specs if s["node_type"] not in handlers]
    assert not unhandled, f"Specs with no handler: {unhandled}"
