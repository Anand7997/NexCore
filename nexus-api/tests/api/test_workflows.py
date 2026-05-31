"""Workflow API regression tests."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.events.brokers.memory import InMemoryBroker
from app.events.bus import init_event_bus


@pytest.mark.asyncio
async def test_create_workflow_returns_nodes_without_async_lazy_load(client: AsyncClient):
    init_event_bus(InMemoryBroker())

    response = await client.post(
        "/api/workflows/",
        json={
            "name": "Saved Desktop Workflow",
            "description": "Compiled from desktop recorder.",
            "platforms": ["desktop"],
            "nodes": [
                {
                    "node_key": "desktop_launch",
                    "type": "desktop.launch",
                    "label": "Launch App",
                    "config": {"app": "notepad.exe", "driver_type": "uia3"},
                    "position": {"x": 100, "y": 120},
                },
                {
                    "node_key": "desktop_type",
                    "type": "desktop.type_text",
                    "label": "Type Text",
                    "config": {"value": "NexCore"},
                    "position": {"x": 340, "y": 120},
                },
            ],
            "edges": [
                {
                    "source_key": "desktop_launch",
                    "target_key": "desktop_type",
                    "execution_order": 1,
                }
            ],
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["platforms"] == ["desktop"]
    assert [node["type"] for node in data["nodes"]] == ["desktop.launch", "desktop.type_text"]
    assert data["edges"][0]["source_key"] == "desktop_launch"
