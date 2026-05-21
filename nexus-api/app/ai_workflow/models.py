"""ORM model for AI Workflow records."""
from __future__ import annotations

from datetime import datetime
from typing import Any
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class AIWorkflowModel(Base):
    __tablename__ = "ai_workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    state: Mapped[str] = mapped_column(String(50), nullable=False, default="CREATED", index=True)
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    current_message: Mapped[str] = mapped_column(Text, default="")

    brd_text: Mapped[str] = mapped_column(Text, default="")
    webpage_url: Mapped[str] = mapped_column(String(2048), default="")
    project_name: Mapped[str] = mapped_column(String(255), default="")
    module_name: Mapped[str] = mapped_column(String(255), default="")
    platform: Mapped[str] = mapped_column(String(50), default="web")
    save_mode: Mapped[str] = mapped_column(String(20), default="auto")
    ai_provider: Mapped[str] = mapped_column(String(50), default="")
    ai_model: Mapped[str] = mapped_column(String(100), default="")

    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("test_projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    module_id: Mapped[str | None] = mapped_column(
        ForeignKey("test_modules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    page_id: Mapped[str | None] = mapped_column(
        ForeignKey("page_repository.id", ondelete="SET NULL"), nullable=True, index=True
    )

    elements_saved: Mapped[int] = mapped_column(Integer, default=0)
    scenarios: Mapped[list[Any]] = mapped_column(JSON, default=list)
    testcases_created: Mapped[int] = mapped_column(Integer, default=0)
    teststeps_created: Mapped[int] = mapped_column(Integer, default=0)
    unmapped_steps: Mapped[int] = mapped_column(Integer, default=0)
    low_confidence_locators: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list[str]] = mapped_column(JSON, default=list)

    review_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
