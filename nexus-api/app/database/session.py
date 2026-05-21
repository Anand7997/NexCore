from __future__ import annotations
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# Incremental migrations – safe to run on every startup (all idempotent).
# SQLAlchemy create_all() creates missing *tables* but never alters existing
# ones, so new columns on pre-existing tables must be added here.
# ---------------------------------------------------------------------------

_MIGRATIONS: list[str] = [
    # ── testing_types ── new table, handled by create_all

    # ── test_cases: add project_id + testing_type_id ──
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES test_projects(id)",
    "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS testing_type_id VARCHAR(36) REFERENCES testing_types(id)",
    "CREATE INDEX IF NOT EXISTS ix_test_cases_project_id ON test_cases(project_id)",
    "CREATE INDEX IF NOT EXISTS ix_test_cases_testing_type_id ON test_cases(testing_type_id)",

    # ── test_steps: add normalized action columns ──
    "ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS action_type VARCHAR(100) DEFAULT ''",
    "ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS page_id VARCHAR(36) REFERENCES page_repository(id)",
    "ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS page_element_id VARCHAR(36) REFERENCES page_elements(id)",
    "ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS api_endpoint_id VARCHAR(36) REFERENCES api_endpoints(id)",
    "ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS input_value TEXT DEFAULT ''",
    "ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS assertion_type VARCHAR(100) DEFAULT ''",
    "ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS secondary_action VARCHAR(100) DEFAULT ''",
    "ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS secondary_value TEXT DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS ix_test_steps_page_id ON test_steps(page_id)",
    "CREATE INDEX IF NOT EXISTS ix_test_steps_page_element_id ON test_steps(page_element_id)",
    "CREATE INDEX IF NOT EXISTS ix_test_steps_api_endpoint_id ON test_steps(api_endpoint_id)",

    # ── page_repository: add project/module context ──
    "ALTER TABLE page_repository ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES test_projects(id)",
    "ALTER TABLE page_repository ADD COLUMN IF NOT EXISTS module_id VARCHAR(36) REFERENCES test_modules(id)",
    "CREATE INDEX IF NOT EXISTS ix_page_repository_project_id ON page_repository(project_id)",
    "CREATE INDEX IF NOT EXISTS ix_page_repository_module_id ON page_repository(module_id)",

    # ── workflows: add project/module context ──
    "ALTER TABLE workflows ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES test_projects(id)",
    "ALTER TABLE workflows ADD COLUMN IF NOT EXISTS module_id VARCHAR(36) REFERENCES test_modules(id)",
    "CREATE INDEX IF NOT EXISTS ix_workflows_project_id ON workflows(project_id)",
    "CREATE INDEX IF NOT EXISTS ix_workflows_module_id ON workflows(module_id)",

    # ── workflow_nodes: link to test_case ──
    "ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS test_case_id VARCHAR(36) REFERENCES test_cases(id)",
    "CREATE INDEX IF NOT EXISTS ix_workflow_nodes_test_case_id ON workflow_nodes(test_case_id)",

    # ── workflow_edges: execution ordering ──
    "ALTER TABLE workflow_edges ADD COLUMN IF NOT EXISTS execution_order INTEGER DEFAULT 0",

    # ── executions: add project/module/testing_type/triggered_by ──
    "ALTER TABLE executions ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES test_projects(id)",
    "ALTER TABLE executions ADD COLUMN IF NOT EXISTS module_id VARCHAR(36) REFERENCES test_modules(id)",
    "ALTER TABLE executions ADD COLUMN IF NOT EXISTS testing_type_id VARCHAR(36) REFERENCES testing_types(id)",
    "ALTER TABLE executions ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(255) DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS ix_executions_project_id ON executions(project_id)",
    "CREATE INDEX IF NOT EXISTS ix_executions_module_id ON executions(module_id)",
    "CREATE INDEX IF NOT EXISTS ix_executions_testing_type_id ON executions(testing_type_id)",

    # ── execution_artifacts: link to test_case + test_step ──
    "ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS test_case_id VARCHAR(36) REFERENCES test_cases(id)",
    "ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS test_step_id VARCHAR(36) REFERENCES test_steps(id)",
    "CREATE INDEX IF NOT EXISTS ix_execution_artifacts_test_case_id ON execution_artifacts(test_case_id)",
    "CREATE INDEX IF NOT EXISTS ix_execution_artifacts_test_step_id ON execution_artifacts(test_step_id)",

    # ── page_elements: Element Discovery Agent columns ──
    "ALTER TABLE page_elements ADD COLUMN IF NOT EXISTS confidence_score DOUBLE PRECISION",
    "ALTER TABLE page_elements ADD COLUMN IF NOT EXISTS alternative_locators JSON",
    "ALTER TABLE page_elements ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT ''",
    "ALTER TABLE page_elements ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP",
    "ALTER TABLE page_elements ADD COLUMN IF NOT EXISTS discovery_metadata JSON",
]


async def run_migrations() -> None:
    """Apply incremental DDL changes to existing tables (idempotent)."""
    async with engine.connect() as conn:
        for stmt in _MIGRATIONS:
            try:
                await conn.execute(text(stmt))
                await conn.commit()
            except Exception as exc:
                await conn.rollback()
                logger.warning("Migration skipped [%s…]: %s", stmt[:55], exc)


async def init_db() -> None:
    from app.database import models  # noqa: F401 – ensure all models are registered
    from app.ai_workflow import models as ai_workflow_models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Apply column additions to pre-existing tables
    await run_migrations()
