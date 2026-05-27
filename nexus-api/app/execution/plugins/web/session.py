"""
Browser session manager — one Playwright browser/context/page per execution.

Why one browser per execution (not per node)?
- Cookies, localStorage, and auth state must persist between nodes.
- A workflow is a *session* — login once, click through many flows.
- Spinning up a fresh browser per node would be ~1s overhead × N nodes.

Why isolated context per execution?
- Two parallel executions must NEVER see each other's cookies.
- Playwright BrowserContext gives us a sandbox for cheap (no new process).

Tracing & video are enabled per session and finalised on close, then handed
to the artifact recorder so the engine can publish them as evidence.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class WebSessionConfig:
    headless: bool = False
    browser_name: str = "chromium"   # chromium / firefox / webkit
    record_video: bool = False
    record_trace: bool = True
    slow_mo_ms: int = 250
    viewport_width: int = 1280
    viewport_height: int = 800
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )


class WebSession:
    """
    Owns a Playwright browser + context + (single) page for one execution.

    All Playwright APIs are accessed lazily so the rest of the codebase doesn't
    pay an import cost — and so the system still boots when Playwright isn't
    installed (the plugin will fail validate() instead).
    """

    def __init__(self, execution_id: str, config: WebSessionConfig, scratch_dir: Path) -> None:
        self.execution_id = execution_id
        self.config = config
        self.scratch_dir = scratch_dir
        self.scratch_dir.mkdir(parents=True, exist_ok=True)

        # Set on start() — kept loose so we don't require playwright at import.
        self._playwright: Any | None = None
        self._browser: Any | None = None
        self._context: Any | None = None
        self._page: Any | None = None
        self._lock = asyncio.Lock()
        self._network_log: list[dict[str, Any]] = []

    # ── Lifecycle ───────────────────────────────────────────────────────

    async def start(self) -> None:
        async with self._lock:
            if self._page is not None:
                return
            try:
                from playwright.async_api import async_playwright
            except ImportError as exc:
                raise RuntimeError(
                    "playwright not installed — pip install playwright "
                    "&& playwright install chromium"
                ) from exc

            self._playwright = await async_playwright().start()
            launcher = getattr(self._playwright, self.config.browser_name)
            launch_kwargs: dict[str, Any] = {
                "headless": self.config.headless,
            }
            if self.config.slow_mo_ms > 0:
                launch_kwargs["slow_mo"] = self.config.slow_mo_ms

            try:
                self._browser = await launcher.launch(**launch_kwargs)
            except Exception:
                if self.config.headless:
                    raise
                logger.exception(
                    "Headed browser launch failed for execution %s; retrying headless",
                    self.execution_id,
                )
                self.config.headless = True
                launch_kwargs["headless"] = True
                self._browser = await launcher.launch(**launch_kwargs)

            ctx_kwargs: dict[str, Any] = {
                "viewport": {
                    "width": self.config.viewport_width,
                    "height": self.config.viewport_height,
                },
                "user_agent": self.config.user_agent,
                "locale": "en-US",
            }
            if self.config.record_video:
                ctx_kwargs["record_video_dir"] = str(self.scratch_dir)
                ctx_kwargs["record_video_size"] = ctx_kwargs["viewport"]

            self._context = await self._browser.new_context(**ctx_kwargs)

            if self.config.record_trace:
                await self._context.tracing.start(
                    screenshots=True, snapshots=True, sources=False,
                )

            self._page = await self._context.new_page()
            self._wire_page_listeners(self._page)
            if not self.config.headless:
                try:
                    await self._page.bring_to_front()
                except Exception:
                    pass
            logger.info("Web session started for execution %s", self.execution_id)

    async def stop(self) -> tuple[Path | None, Path | None]:
        """
        Tears down the browser. Returns (trace_path, video_path) if produced.
        Caller is responsible for handing them to the artifact recorder.
        """
        async with self._lock:
            if self._page is None and self._browser is None:
                return None, None

            trace_path: Path | None = None
            video_path: Path | None = None

            try:
                if self._context is not None and self.config.record_trace:
                    trace_path = self.scratch_dir / "trace.zip"
                    try:
                        await self._context.tracing.stop(path=str(trace_path))
                    except Exception:
                        logger.exception("trace.stop failed")
                        trace_path = None

                if self._page is not None and self.config.record_video:
                    try:
                        video = self._page.video
                        if video is not None:
                            video_path_str = await video.path()
                            if video_path_str:
                                video_path = Path(video_path_str)
                    except Exception:
                        logger.exception("video resolution failed")

                if self._context is not None:
                    try:
                        await self._context.close()
                    except Exception:
                        logger.exception("context.close failed")

                if self._browser is not None:
                    try:
                        await self._browser.close()
                    except Exception:
                        logger.exception("browser.close failed")

                if self._playwright is not None:
                    try:
                        await self._playwright.stop()
                    except Exception:
                        logger.exception("playwright.stop failed")

            finally:
                self._page = None
                self._context = None
                self._browser = None
                self._playwright = None

            logger.info("Web session stopped for execution %s", self.execution_id)
            return trace_path, video_path

    @property
    def page(self) -> Any:
        if self._page is None:
            raise RuntimeError("WebSession not started")
        return self._page

    @property
    def context(self) -> Any:
        if self._context is None:
            raise RuntimeError("WebSession not started")
        return self._context

    @property
    def network_log(self) -> list[dict[str, Any]]:
        return list(self._network_log)

    # ── Network capture ────────────────────────────────────────────────

    def _wire_page_listeners(self, page: Any) -> None:
        def _on_request(request: Any) -> None:
            try:
                self._network_log.append({
                    "phase": "request",
                    "method": request.method,
                    "url": request.url,
                    "resource_type": request.resource_type,
                })
            except Exception:
                pass

        def _on_response(response: Any) -> None:
            try:
                self._network_log.append({
                    "phase": "response",
                    "url": response.url,
                    "status": response.status,
                })
            except Exception:
                pass

        page.on("request", _on_request)
        page.on("response", _on_response)
