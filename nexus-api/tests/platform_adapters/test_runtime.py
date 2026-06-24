"""Tests for adapter runtime readiness probing.

These exercise the device-aware status logic without requiring a real Appium
server, adb, or attached device — all external probes are monkeypatched.
"""
from __future__ import annotations

import app.platform_adapters.runtime as runtime
from app.platform_adapters import (
    adapter_status_report,
    validate_adapter_environment,
)

ANDROID = runtime.ADAPTER_RUNTIMES["android"]


def _patch(monkeypatch, *, command="C:/appium", endpoint=True, env=True, devices):
    monkeypatch.setattr(runtime, "_command_path", lambda rt: command)
    monkeypatch.setattr(runtime, "_endpoint_reachable", lambda ep: endpoint)
    monkeypatch.setattr(runtime, "_list_android_devices", lambda: devices)
    for name in ("ANDROID_HOME", "JAVA_HOME"):
        if env:
            monkeypatch.setenv(name, "C:/sdk")
        else:
            monkeypatch.delenv(name, raising=False)


# ── Capability advertising stays in sync with the plugin handlers ────────────

def test_android_advertises_select_option_and_assert_visible():
    caps = set(ANDROID.capabilities)
    assert "select_option" in caps
    assert "assert_visible" in caps


def test_ios_advertises_select_option_and_assert_visible():
    caps = set(runtime.ADAPTER_RUNTIMES["ios"].capabilities)
    assert "select_option" in caps
    assert "assert_visible" in caps


# ── Device-aware readiness ───────────────────────────────────────────────────

def test_android_ready_when_server_env_and_device_present(monkeypatch):
    _patch(monkeypatch, devices=[{"serial": "emulator-5554", "state": "device"}])
    status = runtime._runtime_status(ANDROID)
    assert status["status"] == "available"
    assert status["device_available"] is True
    assert status["devices"][0]["serial"] == "emulator-5554"


def test_android_configured_when_server_up_but_no_device(monkeypatch):
    _patch(monkeypatch, devices=[])
    status = runtime._runtime_status(ANDROID)
    assert status["status"] == "configured"
    assert status["device_available"] is False
    assert any("No connected Android device" in d for d in status["diagnostics"])


def test_android_reports_adb_missing(monkeypatch):
    _patch(monkeypatch, devices=None)  # None == adb not on PATH
    status = runtime._runtime_status(ANDROID)
    assert status["device_available"] is False
    assert any("adb not found" in d for d in status["diagnostics"])
    assert "devices" not in status  # not enumerable without adb


def test_android_unavailable_when_nothing_present(monkeypatch):
    _patch(monkeypatch, command=None, endpoint=False, env=False, devices=None)
    status = runtime._runtime_status(ANDROID)
    assert status["status"] == "unavailable"


def test_offline_device_does_not_count_as_available(monkeypatch):
    _patch(monkeypatch, devices=[{"serial": "x", "state": "offline"}])
    status = runtime._runtime_status(ANDROID)
    assert status["status"] == "configured"
    assert status["device_available"] is False


# ── validate_adapter_environment ─────────────────────────────────────────────

def test_validate_environment_accepts_new_capabilities(monkeypatch):
    _patch(monkeypatch, devices=[{"serial": "emulator-5554", "state": "device"}])
    result = validate_adapter_environment("android", ["select_option", "assert_visible"])
    assert result["missing_capabilities"] == []
    assert result["valid"] is True


def test_validate_environment_flags_unknown_capability(monkeypatch):
    _patch(monkeypatch, devices=[{"serial": "emulator-5554", "state": "device"}])
    result = validate_adapter_environment("android", ["teleport"])
    assert result["missing_capabilities"] == ["teleport"]
    assert result["valid"] is False


def test_status_report_lists_all_platforms(monkeypatch):
    monkeypatch.setattr(runtime, "_command_path", lambda rt: None)
    monkeypatch.setattr(runtime, "_endpoint_reachable", lambda ep: False)
    monkeypatch.setattr(runtime, "_list_android_devices", lambda: None)
    report = adapter_status_report()
    platforms = {r["platform"] for r in report["runtimes"]}
    assert platforms == {"android", "ios", "desktop"}
