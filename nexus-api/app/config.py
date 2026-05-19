from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
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
    web_plugin_headless: bool = True
    web_plugin_browser: str = "chromium"   # chromium / firefox / webkit
    web_plugin_record_video: bool = False  # enables MP4 capture per session
    web_plugin_record_trace: bool = True   # Playwright trace.zip per session
    discovery_allow_private_network: bool = False
    api_plugin_default_timeout: float = 30.0
    control_plane_url: str = "http://localhost:3001"
    appium_server_url: str = "http://127.0.0.1:4723"
    winappdriver_url: str = "http://127.0.0.1:4723"
    keycloak_issuer_url: str = ""
    keycloak_client_id: str = "nexus-qa"
    keycloak_audience: str = "nexus-qa-api"

    # ── Phase 6: AI Intelligence ──────────────────────────────────────────────
    # NATS transport (Python worker ↔ NestJS AI gateway)
    nats_url: str = "nats://localhost:4222"

    # Qdrant vector store
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # Embedding model
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_dim: int = 384
    use_openai_embeddings: bool = False
    openai_api_key: str = ""

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug_mode(cls, value: Any) -> Any:
        if isinstance(value, str) and value.lower() in {"release", "prod", "production"}:
            return False
        return value

    class Config:
        env_file = ".env"


settings = Settings()
