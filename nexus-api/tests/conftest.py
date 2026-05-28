from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

_TEST_DB = Path(tempfile.gettempdir()) / f"nexcore_pytest_{os.getpid()}.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TEST_DB.as_posix()}"
os.environ["DATABASE_URL_SYNC"] = f"sqlite:///{_TEST_DB.as_posix()}"

from app.database.session import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client
