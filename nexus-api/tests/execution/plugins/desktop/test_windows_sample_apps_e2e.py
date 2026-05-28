"""Optional live Windows desktop adapter tests.

Run with NEXCORE_RUN_DESKTOP_E2E=1 on a Windows desktop agent that has the
sample applications installed.  They are skipped in normal CI because desktop
session automation requires an interactive Windows session.
"""
from __future__ import annotations

import os
import sys

import pytest

from app.execution.plugins.desktop.drivers import get_driver


pytestmark = pytest.mark.skipif(
    os.getenv("NEXCORE_RUN_DESKTOP_E2E") != "1" or sys.platform != "win32",
    reason="Live desktop adapter tests require NEXCORE_RUN_DESKTOP_E2E=1 on Windows",
)


@pytest.mark.asyncio
async def test_uia3_notepad_launch_type_and_close():
    driver = get_driver("uia3")
    launch = await driver.launch("notepad.exe")
    assert launch.success, launch.error
    typed = await driver.type_text([], "NexCore desktop e2e")
    assert typed.success, typed.error
    close = await driver.close()
    assert close.success, close.error


@pytest.mark.asyncio
async def test_uia3_calculator_launch_and_snapshot():
    driver = get_driver("uia3")
    launch = await driver.launch("calc.exe")
    assert launch.success, launch.error
    tree = await driver.get_ui_tree()
    assert tree.success, tree.error
    assert tree.ui_tree
    await driver.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("env_var", "label"),
    [
        ("NEXCORE_WPF_SAMPLE_APP", "WPF"),
        ("NEXCORE_WINFORMS_SAMPLE_APP", "WinForms"),
        ("NEXCORE_UWP_SAMPLE_APP", "UWP"),
    ],
)
async def test_uia3_framework_sample_app_snapshot(env_var: str, label: str):
    app_path = os.getenv(env_var)
    if not app_path:
        pytest.skip(f"{label} sample path not configured: {env_var}")
    driver = get_driver("uia3")
    launch = await driver.launch(app_path)
    assert launch.success, launch.error
    tree = await driver.get_ui_tree()
    assert tree.success, tree.error
    assert tree.ui_tree
    await driver.close()
