"""Mentiora SDK client.

Main entry point for the Mentiora SDK. Provides access to all SDK features
through namespaced properties (e.g., client.tracing).
"""

from typing import Any

from . import http
from .agents.client import AgentsClient
from .errors import ConfigurationError
from .tracing import TracingClient
from .types import MentioraConfig

DEFAULT_BASE_URL = 'https://platform.mentiora.ai'


class MentioraClient:
    """Main Mentiora SDK client.

    Provides access to all SDK features through namespaced properties:
    - `client.tracing` - Send agent traces
    """

    def __init__(self, config: MentioraConfig) -> None:
        """Initialize Mentiora client.

        Args:
            config: SDK configuration (API key, optional baseUrl).
        """
        self._validate_config(config)
        self.base_url = config.base_url or DEFAULT_BASE_URL
        if self.base_url.startswith('http://') and not self.base_url.startswith('http://localhost'):
            import warnings

            warnings.warn(
                'Mentiora base URL uses HTTP. API key will be sent in cleartext.'
                ' Use HTTPS in production.',
                UserWarning,
                stacklevel=2,
            )
        self.debug = config.debug
        self._http_client = http.HttpClient(
            base_url=self.base_url,
            api_key=config.api_key,
            timeout=config.timeout,
            retries=config.retries,
            debug=self.debug,
        )

        # Initialize feature clients
        self.tracing = TracingClient(self._http_client)
        self.agents = AgentsClient(self._http_client)

    def _validate_config(self, config: MentioraConfig) -> None:
        """Validate configuration.

        Args:
            config: SDK configuration to validate.

        Raises:
            ConfigurationError: If ``api_key`` is invalid.
        """
        if not config.api_key or not isinstance(config.api_key, str):
            raise ConfigurationError('api_key is required and must be a string')

    def close(self) -> None:
        """Close HTTP clients and cleanup resources.

        Closes the underlying httpx sync and async clients. Safe to call multiple times.
        """
        self._http_client.close()

    async def aclose(self) -> None:
        """Close async HTTP clients and cleanup resources.

        Closes both the underlying httpx sync and async clients. Safe to call multiple times.
        """
        await self._http_client.aclose()

    def __enter__(self) -> 'MentioraClient':
        """Context manager entry."""
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.close()

    async def __aenter__(self) -> 'MentioraClient':
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.aclose()
