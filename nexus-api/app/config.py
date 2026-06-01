from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
DEFAULT_OPENAI_MODEL = "gpt-5.5"
DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-20250514"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    app_name: str = "NEXUS QA Orchestration API"
    app_version: str = "1.0.0"
    debug: bool = True

    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/NexCore"
    database_url_sync: str = "postgresql://postgres:password@localhost:5432/NexCore"

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    ws_heartbeat_interval: int = 30

    sim_base_delay_min: float = 0.4
    sim_base_delay_max: float = 3.0
    sim_failure_rate: float = 0.08
    sim_retry_backoff_base: float = 1.5

    # Execution plugin layer
    artifact_dir: str = "./artifacts"
    enable_web_plugin: bool = True
    enable_api_plugin: bool = True
    enable_mobile_plugin: bool = True
    enable_desktop_plugin: bool = True
    web_plugin_headless: bool = False
    web_plugin_browser: str = "chromium"   # chromium / firefox / webkit
    web_plugin_record_video: bool = False  # enables MP4 capture per session
    web_plugin_record_trace: bool = True   # Playwright trace.zip per session
    web_plugin_slow_mo_ms: int = 250       # visible delay between Playwright actions
    web_plugin_type_delay_ms: int = 35     # per-character delay for visible typing
    web_plugin_live_screenshots: bool = True
    discovery_allow_private_network: bool = False
    api_plugin_default_timeout: float = 30.0
    control_plane_url: str = "http://localhost:3001"
    appium_server_url: str = "http://127.0.0.1:4723"
    winappdriver_url: str = "http://127.0.0.1:4723"
    keycloak_issuer_url: str = ""
    keycloak_client_id: str = "nexus-qa"
    keycloak_audience: str = "nexus-qa-api"

    # ── AI Workflow ───────────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    default_ai_provider: str = "openai"
    default_ai_model: str = DEFAULT_OPENAI_MODEL
    default_claude_model: str = DEFAULT_CLAUDE_MODEL
    ai_workflow_testcase_concurrency: int = 2
    mcp_playwright_url: str = ""
    playwright_fallback: bool = True

    # ── Phase 6: AI Intelligence ──────────────────────────────────────────────
    # NATS transport (Python worker ↔ NestJS AI gateway)
    nats_url: str = "nats://localhost:4222"

    # Qdrant vector store
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # Embedding model
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_dim: int = 384
    warmup_embeddings_on_startup: bool = False
    use_openai_embeddings: bool = False
    openai_api_key: str = ""

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug_mode(cls, value: Any) -> Any:
        if isinstance(value, str) and value.lower() in {"release", "prod", "production"}:
            return False
        return value


settings = Settings()
