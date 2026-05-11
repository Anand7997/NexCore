"""
Plugin discovery endpoint — feeds the frontend node palette.

GET /api/plugins              list all registered plugins + their node specs
GET /api/plugins/node-types   flat list of all PluginNodeSpecs
"""
from __future__ import annotations

from fastapi import APIRouter

from app.execution.registry import list_plugins

router = APIRouter(prefix="/plugins", tags=["plugins"])


@router.get("/")
async def list_all_plugins() -> dict:
    plugins = list_plugins()
    return {
        "plugins": [
            {
                "name": p.name,
                "version": p.version,
                "description": p.description,
                "node_types": [spec.to_dict() for spec in p.node_specs()],
            }
            for p in plugins
        ],
    }


@router.get("/node-types")
async def list_all_node_types() -> list[dict]:
    out: list[dict] = []
    for plugin in list_plugins():
        for spec in plugin.node_specs():
            out.append(spec.to_dict())
    return out
