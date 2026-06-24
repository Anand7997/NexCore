"""Mobile and desktop adapter environment contracts.

Phase 8 starts by making runtime availability explicit. Appium and
WinAppDriver are external systems, so this module detects whether the local
machine is ready before any workflow can target those adapters.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

AdapterStatus = Literal["available", "configured", "unavailable"]


@dataclass(frozen=True)
class AdapterRuntime:
    platform: str
    adapter: str
    runtime: str
    command: str | None
    endpoint_env: str | None = None
    default_endpoint: str | None = None
    required_env: tuple[str, ...] = ()
    isolation: tuple[str, ...] = ()
    capabilities: tuple[str, ...] = ()
    executable_paths: tuple[str, ...] = ()


ADAPTER_RUNTIMES: dict[str, AdapterRuntime] = {
    "android": AdapterRuntime(
        platform="android",
        adapter="appium-android",
        runtime="Appium UiAutomator2",
        command="appium",
        endpoint_env="APPIUM_SERVER_URL",
        default_endpoint="http://127.0.0.1:4723",
        required_env=("ANDROID_HOME", "JAVA_HOME"),
        isolation=("emulator_or_device_id", "app_package", "app_activity", "system_port"),
        capabilities=(
            "tap", "type_text", "select_option", "assert_text", "assert_visible",
            "extract_text", "screenshot", "deep_link",
        ),
    ),
    "ios": AdapterRuntime(
        platform="ios",
        adapter="appium-ios",
        runtime="Appium XCUITest",
        command="appium",
        endpoint_env="APPIUM_SERVER_URL",
        default_endpoint="http://127.0.0.1:4723",
        required_env=("XCODE_DEVELOPER_DIR",),
        isolation=("simulator_udid", "bundle_id", "wda_local_port"),
        capabilities=(
            "tap", "type_text", "select_option", "assert_text", "assert_visible",
            "extract_text", "screenshot", "universal_link", "deep_link",
        ),
    ),
    "desktop": AdapterRuntime(
        platform="desktop",
        adapter="winappdriver",
        runtime="WinAppDriver",
        command="WinAppDriver.exe",
        endpoint_env="WINAPPDRIVER_URL",
        default_endpoint="http://127.0.0.1:4723",
        required_env=(),
        isolation=("app_id_or_executable", "user_data_dir", "window_handle"),
        capabilities=("click", "type_text", "assert_text", "extract_text", "screenshot", "file_dialog"),
        executable_paths=(
            r"C:\Program Files (x86)\Windows Application Driver\WinAppDriver.exe",
            r"C:\Program Files\Windows Application Driver\WinAppDriver.exe",
        ),
    ),
}


def _command_path(runtime: AdapterRuntime) -> str | None:
    if runtime.command:
        found = shutil.which(runtime.command)
        if found:
            return found
    for candidate in runtime.executable_paths:
        if Path(candidate).exists():
            return candidate
    return None


def _endpoint_reachable(endpoint: str | None) -> bool:
    if not endpoint:
        return False
    try:
        request = urllib.request.Request(endpoint.rstrip("/") + "/status", method="GET")
        with urllib.request.urlopen(request, timeout=0.35) as response:
            return 200 <= response.status < 500
    except (urllib.error.URLError, TimeoutError, ValueError):
        return False


def _list_android_devices() -> list[dict[str, str]] | None:
    """Return connected Android devices via `adb devices -l`.

    Returns None when adb itself is missing (distinct from "adb ran but no
    devices are attached", which returns an empty list).
    """
    adb = shutil.which("adb")
    if not adb:
        return None
    try:
        completed = subprocess.run(
            [adb, "devices", "-l"],
            capture_output=True,
            text=True,
            timeout=3.0,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    devices: list[dict[str, str]] = []
    for line in completed.stdout.splitlines()[1:]:
        line = line.strip()
        if not line or line.startswith("*"):
            continue
        parts = line.split()
        serial, state = parts[0], (parts[1] if len(parts) > 1 else "offline")
        model = next((p.split(":", 1)[1] for p in parts if p.startswith("model:")), None)
        entry = {"serial": serial, "state": state}
        if model:
            entry["model"] = model
        devices.append(entry)
    return devices


def _runtime_status(runtime: AdapterRuntime) -> dict[str, Any]:
    command_path = _command_path(runtime)
    endpoint = os.getenv(runtime.endpoint_env or "") or runtime.default_endpoint
    endpoint_reachable = _endpoint_reachable(endpoint)
    missing_env = [name for name in runtime.required_env if not os.getenv(name)]
    configured = bool(command_path or os.getenv(runtime.endpoint_env or ""))

    # Device availability — only Android can be probed locally via adb. iOS
    # simulators require macOS/xcrun (validated on the Nest side), and desktop
    # targets the host machine itself, so both are treated as "device present".
    devices: list[dict[str, str]] | None = None
    device_available = True
    adb_missing = False
    if runtime.platform == "android":
        devices = _list_android_devices()
        if devices is None:
            adb_missing = True
            device_available = False
        else:
            device_available = any(d["state"] in {"device", "emulator"} for d in devices)

    status: AdapterStatus
    if endpoint_reachable and (command_path and not missing_env) and device_available:
        status = "available"
    elif endpoint_reachable or configured:
        status = "configured"
    else:
        status = "unavailable"

    diagnostics: list[str] = []
    if not command_path:
        diagnostics.append(f"{runtime.runtime} command was not found on PATH.")
    if missing_env:
        diagnostics.append("Missing environment variables: " + ", ".join(missing_env))
    if adb_missing:
        diagnostics.append("adb not found on PATH. Install Android SDK platform-tools to enumerate devices.")
    elif runtime.platform == "android" and not device_available:
        diagnostics.append("No connected Android device or running emulator found (adb devices is empty).")
    if status == "configured" and not diagnostics:
        diagnostics.append("Runtime endpoint is configured, but local executable discovery is incomplete.")

    report: dict[str, Any] = {
        "platform": runtime.platform,
        "adapter": runtime.adapter,
        "runtime": runtime.runtime,
        "status": status,
        "endpoint": endpoint,
        "endpoint_reachable": endpoint_reachable,
        "command_path": command_path,
        "missing_env": missing_env,
        "device_available": device_available,
        "isolation": list(runtime.isolation),
        "capabilities": list(runtime.capabilities),
        "diagnostics": diagnostics,
    }
    if devices is not None:
        report["devices"] = devices
    return report


def adapter_status_report() -> dict[str, Any]:
    return {"runtimes": [_runtime_status(runtime) for runtime in ADAPTER_RUNTIMES.values()]}


def validate_adapter_environment(platform: str, required_capabilities: list[str] | None = None) -> dict[str, Any]:
    runtime = ADAPTER_RUNTIMES.get(platform)
    if runtime is None:
        return {
            "valid": False,
            "platform": platform,
            "reason": f"Unknown adapter platform '{platform}'.",
            "runtime": None,
            "missing_capabilities": required_capabilities or [],
        }

    status = _runtime_status(runtime)
    requested = required_capabilities or []
    supported = set(runtime.capabilities)
    missing_capabilities = [capability for capability in requested if capability not in supported]
    valid = status["status"] == "available" and not missing_capabilities

    reason = "Adapter runtime is ready."
    if status["status"] != "available":
        reason = "Adapter runtime is not fully available."
    if missing_capabilities:
        reason = "Adapter is missing required capabilities."

    return {
        "valid": valid,
        "platform": platform,
        "reason": reason,
        "runtime": status,
        "missing_capabilities": missing_capabilities,
    }
