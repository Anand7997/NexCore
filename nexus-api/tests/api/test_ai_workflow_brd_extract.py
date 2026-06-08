"""AI workflow BRD file extraction tests."""
from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape
import zipfile

import pytest
from httpx import AsyncClient


def _docx_bytes(*paragraphs: str) -> bytes:
    body = "".join(
        f"<w:p><w:r><w:t>{escape(paragraph)}</w:t></w:r></w:p>"
        for paragraph in paragraphs
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body>"
        "</w:document>"
    )
    stream = BytesIO()
    with zipfile.ZipFile(stream, mode="w") as archive:
        archive.writestr("word/document.xml", document)
    return stream.getvalue()


@pytest.mark.asyncio
async def test_extract_brd_docx_upload_returns_plain_text(client: AsyncClient):
    response = await client.post(
        "/api/ai-workflows/brd/extract",
        files={
            "file": (
                "requirements.docx",
                _docx_bytes("Login requirements", "Search bookings"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "requirements.docx"
    assert data["text"] == "Login requirements\nSearch bookings"
    assert data["characters"] == len(data["text"])


@pytest.mark.asyncio
async def test_extract_brd_docx_upload_rejects_corrupt_file(client: AsyncClient):
    response = await client.post(
        "/api/ai-workflows/brd/extract",
        files={
            "file": (
                "requirements.docx",
                b"not a zip file",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "The uploaded DOCX file could not be read."
