"""Execution intelligence routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.intelligence.analyzer import ExecutionIntelligenceAnalyzer

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@router.get("/executions/{execution_id}")
async def analyze_execution(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    analyzer = ExecutionIntelligenceAnalyzer(db)
    analysis = await analyzer.analyze(execution_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    return analysis

