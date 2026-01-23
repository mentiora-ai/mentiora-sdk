"""Mentiora SDK client.

Main entry point for the Mentiora SDK. Provides access to all SDK features
through namespaced properties (e.g., client.tracing, client.vectordb).
"""

from . import http
from .errors import ConfigurationError
from .tracing import TracingClient
from .types import Environment, MentioraConfig

ENVIRONMENT_URLS: dict[Environment, str] = {
    'staging': 'https://staging.mentiora.ai',
    'production': 'https://platform.mentiora.ai',
}


class MentioraClient:
    """Main Mentiora SDK client.

    Provides access to all SDK features through namespaced properties:
    - `client.tracing` - Send agent traces
    - `client.vectordb` - Vector database operations (coming soon)
    """

    def __init__(self, config: MentioraConfig) -> None:
        """Initialize Mentiora client."""
        self._validate_config(config)
        self.base_url = config.base_url or ENVIRONMENT_URLS[config.environment]
        self.http_client = http.HttpClient(
            base_url=self.base_url,
            api_key=config.api_key,
            timeout=config.timeout,
            retries=config.retries,
        )

        # Initialize feature clients
        self.tracing = TracingClient(self.http_client, self.base_url)
        # Future: self.vectordb = VectorDBClient(self.http_client, self.base_url)

    def _validate_config(self, config: MentioraConfig) -> None:
        """Validate configuration."""
        if not config.api_key or not isinstance(config.api_key, str):
            raise ConfigurationError('api_key is required and must be a string')

        if not config.environment or config.environment not in ['staging', 'production']:
            raise ConfigurationError(
                'environment must be either "staging" or "production"',
            )

    def close(self) -> None:
        """Close HTTP clients and cleanup resources."""
        self.http_client.close()

    async def aclose(self) -> None:
        """Close async HTTP clients and cleanup resources."""
        await self.http_client.aclose()
