"""Platform adapter runtime discovery for mobile and desktop execution."""

from app.platform_adapters.runtime import (
    ADAPTER_RUNTIMES,
    adapter_status_report,
    validate_adapter_environment,
)

__all__ = [
    "ADAPTER_RUNTIMES",
    "adapter_status_report",
    "validate_adapter_environment",
]
