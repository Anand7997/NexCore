"""Requirement document upload and library APIs."""
from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.models import RequirementDocumentModel
from app.database.session import get_db

router = APIRouter(prefix="/requirements/documents", tags=["requirements-documents"])

UploadMode = Literal["brd-generation", "direct-implementation"]
FileType = Literal["document", "pdf", "excel"]

ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    "document": {".doc", ".docx"},
    "pdf": {".pdf"},
    "excel": {".xlsx", ".xls"},
}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


class RequirementDocumentResponse(BaseModel):
    id: str
    name: str
    description: str = ""
    original_name: str
    file_type: FileType
    upload_mode: UploadMode
    automation_space: str
    file_size: int
    file_size_label: str
    uploaded_by: str
    uploaded_at: str = ""
    status: str


class RequirementDocumentListResponse(BaseModel):
    documents: list[RequirementDocumentResponse]


def _safe_name(name: str) -> str:
    base = Path(name or "requirement-document").name
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", Path(base).stem).strip("._") or "requirement-document"
    suffix = Path(base).suffix.lower()
    return f"{stem}{suffix}"


def _storage_dir() -> Path:
    path = Path(settings.artifact_dir).expanduser() / "requirements_documents"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _format_file_size(size: int) -> str:
    value = float(size or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} B"
        value /= 1024
    return f"{int(size)} B"


def _normalise_upload_mode(value: str | None) -> UploadMode:
    mode = (value or "brd-generation").strip().lower()
    if mode not in {"brd-generation", "direct-implementation"}:
        raise HTTPException(status_code=400, detail="Invalid upload mode")
    return mode  # type: ignore[return-value]


def _normalise_file_type(value: str | None, filename: str) -> FileType:
    suffix = Path(filename or "").suffix.lower()
    requested = (value or "").strip().lower()
    if requested in ALLOWED_EXTENSIONS:
        return requested  # type: ignore[return-value]
    for file_type, extensions in ALLOWED_EXTENSIONS.items():
        if suffix in extensions:
            return file_type  # type: ignore[return-value]
    raise HTTPException(status_code=400, detail="Invalid file type")


def _serialise(document: RequirementDocumentModel) -> RequirementDocumentResponse:
    created_at = document.created_at.isoformat() if document.created_at else ""
    return RequirementDocumentResponse(
        id=document.id,
        name=document.name,
        description=document.description or "",
        original_name=document.original_name,
        file_type=document.file_type,  # type: ignore[arg-type]
        upload_mode=document.upload_mode,  # type: ignore[arg-type]
        automation_space=document.automation_space,
        file_size=document.file_size or 0,
        file_size_label=_format_file_size(document.file_size or 0),
        uploaded_by=document.uploaded_by or "local",
        uploaded_at=created_at,
        status=document.status or "uploaded",
    )


@router.get("", response_model=RequirementDocumentListResponse)
async def list_requirement_documents(
    automation_space: str = Query(""),
    upload_mode: str = Query(""),
    file_type: str = Query(""),
    db: AsyncSession = Depends(get_db),
):
    query = select(RequirementDocumentModel).order_by(RequirementDocumentModel.created_at.desc())
    if automation_space:
        query = query.where(RequirementDocumentModel.automation_space == automation_space)
    if upload_mode:
        query = query.where(RequirementDocumentModel.upload_mode == _normalise_upload_mode(upload_mode))
    if file_type:
        if file_type not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Invalid file type")
        query = query.where(RequirementDocumentModel.file_type == file_type)
    rows = (await db.execute(query)).scalars().all()
    return RequirementDocumentListResponse(documents=[_serialise(row) for row in rows])


@router.post("", response_model=RequirementDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_requirement_document(
    file: UploadFile = File(...),
    file_type: str = Form("document"),
    upload_mode: str = Form("brd-generation"),
    type: str = Form(""),
    name: str = Form(""),
    description: str = Form(""),
    automation_space: str = Form("web"),
    x_user_email: str = Header("", alias="X-User-Email"),
    db: AsyncSession = Depends(get_db),
):
    original_name = file.filename or ""
    if not original_name:
        raise HTTPException(status_code=400, detail="No file selected")
    mode = _normalise_upload_mode(type or upload_mode)
    kind = _normalise_file_type(file_type, original_name)
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS[kind]:
        raise HTTPException(status_code=400, detail=f"Invalid file extension for {kind} type")

    display_name = (name or Path(original_name).stem).strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Name is required")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded document is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Document is too large. Maximum size is 50 MB.")

    stored_name = f"{uuid.uuid4()}_{_safe_name(original_name)}"
    saved_path = _storage_dir() / stored_name
    saved_path.write_bytes(content)

    document = RequirementDocumentModel(
        name=display_name,
        description=description.strip(),
        original_name=original_name,
        stored_name=stored_name,
        file_type=kind,
        upload_mode=mode,
        automation_space=(automation_space or "web").strip() or "web",
        file_path=str(saved_path),
        file_size=len(content),
        uploaded_by=(x_user_email or "local").strip() or "local",
        status="uploaded",
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return _serialise(document)


@router.get("/{document_id}/download")
async def download_requirement_document(document_id: str, db: AsyncSession = Depends(get_db)):
    document = await db.get(RequirementDocumentModel, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(document.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Document file is missing on disk")
    return FileResponse(path, filename=document.original_name, media_type="application/octet-stream")


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_requirement_document(document_id: str, db: AsyncSession = Depends(get_db)):
    document = await db.get(RequirementDocumentModel, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(document.file_path)
    if path.exists():
        path.unlink()
    await db.delete(document)
    await db.commit()
    return None