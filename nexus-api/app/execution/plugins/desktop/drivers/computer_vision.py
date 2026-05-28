"""Computer-vision desktop adapter — screen capture + OCR + template matching."""
from __future__ import annotations

import asyncio
import io
import subprocess
import time
from typing import Any

from .base import DesktopDriver, DriverResult, LocatorCandidate

_TEMPLATE_MATCH_THRESHOLD = 0.8


class ComputerVisionAdapter(DesktopDriver):
    """Drives desktop apps using mss (capture), pytesseract (OCR), and opencv (visual)."""

    def __init__(self) -> None:
        self._process: subprocess.Popen | None = None

    # ── internal helpers (all synchronous, called via asyncio.to_thread) ───────

    def _grab_screen(self):
        import mss
        from PIL import Image
        with mss.mss() as sct:
            monitor = sct.monitors[0]
            shot = sct.grab(monitor)
            return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

    def _screenshot_bytes(self) -> bytes:
        img = self._grab_screen()
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def _find_by_ocr(self, text: str) -> tuple[int, int] | None:
        import pytesseract
        img = self._grab_screen()
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        for i, word in enumerate(data["text"]):
            if text.lower() in str(word).lower() and int(data["conf"][i]) > 50:
                x = data["left"][i] + data["width"][i] // 2
                y = data["top"][i] + data["height"][i] // 2
                return (x, y)
        return None

    def _find_by_template(self, template_path: str) -> tuple[int, int] | None:
        import cv2
        import numpy as np
        img = self._grab_screen()
        screen_np = np.array(img.convert("RGB"))
        screen_gray = cv2.cvtColor(screen_np, cv2.COLOR_RGB2GRAY)
        template = cv2.imread(template_path, cv2.IMREAD_GRAYSCALE)
        if template is None:
            return None
        result = cv2.matchTemplate(screen_gray, template, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result)
        if max_val >= _TEMPLATE_MATCH_THRESHOLD:
            h, w = template.shape
            return (max_loc[0] + w // 2, max_loc[1] + h // 2)
        return None

    def _locate(self, candidate: LocatorCandidate) -> tuple[int, int] | None:
        if candidate.strategy == "ocr":
            return self._find_by_ocr(candidate.value)
        if candidate.strategy == "visual":
            return self._find_by_template(candidate.value)
        return None

    # ── DesktopDriver interface ────────────────────────────────────────────────

    async def launch(
        self,
        app_path: str,
        args: list[str] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> DriverResult:
        def _do():
            cmd = [app_path] + (args or [])
            self._process = subprocess.Popen(cmd)
            time.sleep(2.0)
            return self._process.pid

        try:
            pid = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"app": app_path, "pid": pid})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def attach(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult:
        return DriverResult(
            success=True,
            metadata={"window_title": window_title, "process_name": process_name},
        )

    async def close(self) -> DriverResult:
        def _do():
            if self._process:
                self._process.terminate()
                self._process = None

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def activate_window(self, window_title: str | None = None) -> DriverResult:
        return DriverResult(success=True, metadata={"window_title": window_title or ""})

    async def wait_app(
        self,
        process_name: str | None = None,
        timeout: float = 10.0,
    ) -> DriverResult:
        if self._process and self._process.poll() is None:
            return DriverResult(success=True, metadata={"pid": self._process.pid})
        if process_name:
            return DriverResult(success=True, metadata={"process_name": process_name})
        return DriverResult(success=False, error="No active computer-vision process")

    async def find_element(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(
                    success=False,
                    error="Element not found by OCR or template matching",
                )
            return DriverResult(
                success=True,
                metadata={
                    "x": pos[0],
                    "y": pos[1],
                    "strategy": candidate.strategy,
                    "value": candidate.value,
                },
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    pyautogui.click(pos[0], pos[1])
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(success=False, error="Click failed: element not found")
            return DriverResult(
                success=True,
                metadata={"x": pos[0], "y": pos[1], "strategy": candidate.strategy},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def double_click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    pyautogui.doubleClick(pos[0], pos[1])
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(success=False, error="Double click failed: element not found")
            return DriverResult(success=True, metadata={"x": pos[0], "y": pos[1], "strategy": candidate.strategy})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def right_click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    pyautogui.rightClick(pos[0], pos[1])
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(success=False, error="Right click failed: element not found")
            return DriverResult(success=True, metadata={"x": pos[0], "y": pos[1], "strategy": candidate.strategy})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def hover(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    pyautogui.moveTo(pos[0], pos[1])
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(success=False, error="Hover failed: element not found")
            return DriverResult(success=True, metadata={"x": pos[0], "y": pos[1], "strategy": candidate.strategy})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def type_text(
        self,
        candidates: list[LocatorCandidate],
        text: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    pyautogui.click(pos[0], pos[1])
                    pyautogui.typewrite(text, interval=0.05)
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(
                    success=False, error="Type text failed: element not found"
                )
            return DriverResult(
                success=True,
                metadata={"strategy": candidate.strategy, "chars": len(text)},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def clear_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    pyautogui.click(pos[0], pos[1])
                    pyautogui.hotkey("ctrl", "a")
                    pyautogui.press("backspace")
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(success=False, error="Clear text failed: element not found")
            return DriverResult(success=True, metadata={"strategy": candidate.strategy})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def scroll(
        self,
        candidates: list[LocatorCandidate] | None = None,
        delta: int = -5,
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            if candidates:
                for candidate in candidates:
                    pos = self._locate(candidate)
                    if pos:
                        pyautogui.moveTo(pos[0], pos[1])
                        break
            pyautogui.scroll(int(delta))

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"delta": delta})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def drag_and_drop(
        self,
        source_candidates: list[LocatorCandidate],
        target_candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            source_pos = None
            target_pos = None
            source_candidate = None
            target_candidate = None
            for candidate in source_candidates:
                source_pos = self._locate(candidate)
                if source_pos:
                    source_candidate = candidate
                    break
            for candidate in target_candidates:
                target_pos = self._locate(candidate)
                if target_pos:
                    target_candidate = candidate
                    break
            if not source_pos or not target_pos:
                raise RuntimeError("Source or target element not found for drag_and_drop")
            pyautogui.moveTo(source_pos[0], source_pos[1])
            pyautogui.dragTo(target_pos[0], target_pos[1], duration=0.25, button="left")
            return source_candidate, target_candidate

        try:
            source_candidate, target_candidate = await asyncio.to_thread(_do)
            return DriverResult(
                success=True,
                metadata={
                    "source_strategy": source_candidate.strategy,
                    "target_strategy": target_candidate.strategy,
                },
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def press_key(self, key: str) -> DriverResult:
        def _do():
            import pyautogui
            pyautogui.press(key.lower())

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"key": key})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def hotkey(self, keys: list[str]) -> DriverResult:
        def _do():
            import pyautogui
            pyautogui.hotkey(*[str(key).lower() for key in keys])

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"keys": keys})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def clipboard_set(self, text: str) -> DriverResult:
        def _do():
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            root.clipboard_clear()
            root.clipboard_append(text)
            root.update()
            root.destroy()

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"chars": len(text)})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def clipboard_get(self) -> DriverResult:
        def _do():
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            value = root.clipboard_get()
            root.destroy()
            return value

        try:
            value = await asyncio.to_thread(_do)
            return DriverResult(success=True, value=str(value), metadata={"chars": len(str(value))})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def select(
        self,
        candidates: list[LocatorCandidate],
        value: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        click = await self.click(candidates, timeout=timeout)
        if not click.success:
            return click
        text = await self.type_text(candidates, value, timeout=timeout)
        if text.success:
            text.metadata["selected"] = value
        return text

    async def set_checked(
        self,
        candidates: list[LocatorCandidate],
        checked: bool,
        timeout: float = 10.0,
    ) -> DriverResult:
        click = await self.click(candidates, timeout=timeout)
        if click.success:
            click.metadata["checked"] = checked
        return click

    async def get_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pytesseract
            img = self._grab_screen()
            for candidate in candidates:
                if candidate.strategy == "ocr":
                    data = pytesseract.image_to_data(
                        img, output_type=pytesseract.Output.DICT
                    )
                    words = [w for w in data["text"] if str(w).strip()]
                    return " ".join(words), candidate
            return None, None

        try:
            text, candidate = await asyncio.to_thread(_do)
            if text is None:
                return DriverResult(
                    success=False,
                    error="Get text requires an 'ocr' strategy candidate",
                )
            return DriverResult(
                success=True,
                value=text,
                metadata={"strategy": candidate.strategy},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def screenshot(self) -> DriverResult:
        try:
            data = await asyncio.to_thread(self._screenshot_bytes)
            return DriverResult(success=True, screenshot_bytes=data)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def get_ui_tree(self) -> DriverResult:
        def _do():
            import pytesseract
            img = self._grab_screen()
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            parts = ["<OCRTree>"]
            for i, text in enumerate(data["text"]):
                if str(text).strip():
                    parts.append(
                        f'<text value="{text}" x="{data["left"][i]}" '
                        f'y="{data["top"][i]}" conf="{data["conf"][i]}" />'
                    )
            parts.append("</OCRTree>")
            return "\n".join(parts)

        try:
            tree = await asyncio.to_thread(_do)
            return DriverResult(success=True, ui_tree=tree)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def report_capabilities(self) -> dict[str, Any]:
        return {
            "driver": "computer_vision",
            "requires_server": False,
            "platform": "all",
            "ocr": True,
            "visual_matching": True,
        }
