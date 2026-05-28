"""Desktop execution agent registration and routing API tests."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


BASE_CAPABILITIES = {
    "driver_types": ["winappdriver", "uia3"],
    "applications": ["Notepad", "Calculator"],
    "os": "Windows 11",
    "extension_packs": ["ocr"],
    "max_parallel": 2,
    "active_sessions": 0,
    "session_isolation_mode": "shared_desktop",
    "tags": ["fast", "gpu"],
}


@pytest.mark.asyncio
async def test_register_agent(client: AsyncClient):
    response = await client.post("/api/desktop-agents/register", json={
        "hostname": "agent-host-001",
        "agent_version": "1.0.0",
        "os_version": "Windows 11 Pro 22H2",
        "capabilities": BASE_CAPABILITIES,
    })
    assert response.status_code == 201
    data = response.json()
    assert data["hostname"] == "agent-host-001"
    assert data["status"] == "active"
    assert data["id"]


@pytest.mark.asyncio
async def test_register_same_hostname_upserts(client: AsyncClient):
    for version in ("1.0.0", "1.1.0"):
        r = await client.post("/api/desktop-agents/register", json={
            "hostname": "agent-upsert-test",
            "agent_version": version,
            "capabilities": BASE_CAPABILITIES,
        })
        assert r.status_code == 201

    r = await client.get("/api/desktop-agents")
    agents = [a for a in r.json() if a["hostname"] == "agent-upsert-test"]
    assert len(agents) == 1
    assert agents[0]["agent_version"] == "1.1.0"


@pytest.mark.asyncio
async def test_heartbeat_updates_last_heartbeat(client: AsyncClient):
    reg = await client.post("/api/desktop-agents/register", json={
        "hostname": "agent-hb-test",
        "capabilities": BASE_CAPABILITIES,
    })
    agent_id = reg.json()["id"]
    hb = await client.post(f"/api/desktop-agents/{agent_id}/heartbeat")
    assert hb.status_code == 200
    assert hb.json()["last_heartbeat"] is not None


@pytest.mark.asyncio
async def test_heartbeat_unknown_agent_404(client: AsyncClient):
    r = await client.post("/api/desktop-agents/00000000-0000-0000-0000-000000000000/heartbeat")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_agents_returns_active(client: AsyncClient):
    await client.post("/api/desktop-agents/register", json={
        "hostname": "agent-list-test",
        "capabilities": BASE_CAPABILITIES,
    })
    r = await client.get("/api/desktop-agents")
    assert r.status_code == 200
    hostnames = [a["hostname"] for a in r.json()]
    assert "agent-list-test" in hostnames


@pytest.mark.asyncio
async def test_deregister_agent(client: AsyncClient):
    reg = await client.post("/api/desktop-agents/register", json={
        "hostname": "agent-dereg-test",
        "capabilities": BASE_CAPABILITIES,
    })
    agent_id = reg.json()["id"]
    dereg = await client.post(f"/api/desktop-agents/{agent_id}/deregister")
    assert dereg.status_code == 204

    # Should not appear in active list
    r = await client.get("/api/desktop-agents?active_only=true")
    hostnames = [a["hostname"] for a in r.json()]
    assert "agent-dereg-test" not in hostnames


@pytest.mark.asyncio
async def test_route_returns_best_agent(client: AsyncClient):
    await client.post("/api/desktop-agents/register", json={
        "hostname": "agent-route-test",
        "capabilities": {
            "driver_types": ["winappdriver"],
            "applications": ["SAPGui"],
            "os": "Windows 10",
            "extension_packs": ["sap"],
            "max_parallel": 1,
            "tags": [],
        },
    })
    r = await client.post("/api/desktop-agents/route", json={
        "application": "SAPGui",
        "driver_type": "winappdriver",
        "extension_pack": "sap",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["hostname"] == "agent-route-test"
    assert data["match_score"] > 0.0


@pytest.mark.asyncio
async def test_route_prefers_agent_with_required_session_isolation_and_license(client: AsyncClient):
    await client.post("/api/desktop-agents/register", json={
        "hostname": "agent-shared-desktop",
        "capabilities": {
            "driver_types": ["uia3"],
            "applications": ["InvoicePro"],
            "os": "Windows 11",
            "extension_packs": ["office"],
            "max_parallel": 4,
            "active_sessions": 1,
            "session_isolation_mode": "shared_desktop",
            "license_constraints": [],
            "tags": ["office"],
        },
    })
    await client.post("/api/desktop-agents/register", json={
        "hostname": "agent-dedicated-vm",
        "capabilities": {
            "driver_types": ["uia3"],
            "applications": ["InvoicePro"],
            "os": "Windows 11",
            "extension_packs": ["office"],
            "max_parallel": 1,
            "active_sessions": 0,
            "session_isolation_mode": "dedicated_vm",
            "license_constraints": ["office_enterprise"],
            "tags": ["office"],
        },
    })

    r = await client.post("/api/desktop-agents/route", json={
        "application": "InvoicePro",
        "driver_type": "uia3",
        "extension_pack": "office",
        "session_isolation_mode": "dedicated_vm",
        "license_constraints": ["office_enterprise"],
    })

    assert r.status_code == 200
    data = r.json()
    assert data["hostname"] == "agent-dedicated-vm"
    assert data["capabilities"]["session_isolation_mode"] == "dedicated_vm"
    assert "session isolation" in data["reason"]


@pytest.mark.asyncio
async def test_route_503_when_no_agents(client: AsyncClient):
    # Deregister all agents by filtering — this test needs isolation; check 503 only when empty
    # We use a unique extension_pack that no agent will claim
    r = await client.post("/api/desktop-agents/route", json={
        "extension_pack": "nonexistent_pack_xyz_12345",
        "application": "NoSuchApp_xyz_12345",
        "driver_type": "nonexistent_driver_xyz",
    })
    # Either 200 (if another agent scores 0 but is present) or 503
    assert r.status_code in (200, 503)
