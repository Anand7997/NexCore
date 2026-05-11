"""
Plugin Registry — dynamic registration of ExecutionPlugins.

Plugins register themselves at module import time (in their package __init__)
or at startup (in main.py lifespan). The registry maps node-types to plugins
and exposes a discovery API for the frontend palette.
"""
from __future__ import annotations

import logging
from typing import Iterable

from app.execution.plugin import ExecutionPlugin, PluginNodeSpec

logger = logging.getLogger(__name__)


class PluginRegistry:
    """In-memory registry. One per process — used as a module-level singleton."""

    def __init__(self) -> None:
        self._plugins: dict[str, ExecutionPlugin] = {}
        self._node_index: dict[str, ExecutionPlugin] = {}

    def register(self, plugin: ExecutionPlugin) -> None:
        if plugin.name in self._plugins:
            logger.warning("Plugin %s already registered; replacing.", plugin.name)
        self._plugins[plugin.name] = plugin

        for spec in plugin.node_specs():
            existing = self._node_index.get(spec.type)
            if existing and existing is not plugin:
                logger.warning(
                    "Node type %s claimed by both %s and %s; %s wins.",
                    spec.type, existing.name, plugin.name, plugin.name,
                )
            self._node_index[spec.type] = plugin

        logger.info(
            "Registered plugin %s v%s with %d node types",
            plugin.name, plugin.version, len(plugin.node_specs()),
        )

    def unregister(self, name: str) -> None:
        plugin = self._plugins.pop(name, None)
        if not plugin:
            return
        for spec in plugin.node_specs():
            if self._node_index.get(spec.type) is plugin:
                self._node_index.pop(spec.type, None)

    def get(self, name: str) -> ExecutionPlugin | None:
        return self._plugins.get(name)

    def get_for_node_type(self, node_type: str) -> ExecutionPlugin | None:
        return self._node_index.get(node_type)

    def all(self) -> list[ExecutionPlugin]:
        return list(self._plugins.values())

    def all_node_specs(self) -> list[PluginNodeSpec]:
        specs: list[PluginNodeSpec] = []
        for plugin in self._plugins.values():
            specs.extend(plugin.node_specs())
        return specs

    def clear(self) -> None:
        self._plugins.clear()
        self._node_index.clear()


# Module-level singleton
_registry = PluginRegistry()


def register_plugin(plugin: ExecutionPlugin) -> None:
    _registry.register(plugin)


def get_plugin_for(node_type: str) -> ExecutionPlugin | None:
    return _registry.get_for_node_type(node_type)


def list_plugins() -> list[ExecutionPlugin]:
    return _registry.all()


def list_node_specs() -> list[PluginNodeSpec]:
    return _registry.all_node_specs()


def get_registry() -> PluginRegistry:
    return _registry
