from __future__ import annotations

import ssl

import httpx


def build_async_http_client() -> httpx.AsyncClient:
    """Create an HTTP client that prefers the OS certificate store when available."""
    try:
        import truststore  # type: ignore[import]
    except ImportError:
        return httpx.AsyncClient(timeout=None, trust_env=False)

    context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    return httpx.AsyncClient(verify=context, timeout=None, trust_env=False)
