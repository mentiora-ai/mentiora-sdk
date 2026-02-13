"""Tests for MentioraClient."""

import warnings

import pytest

from mentiora import MentioraClient
from mentiora.errors import ConfigurationError
from mentiora.types import MentioraConfig


def test_client_initialization(mentiora_config: MentioraConfig):
    """Test client initialization."""
    client = MentioraClient(mentiora_config)
    assert client.base_url == 'https://platform.mentiora.ai'
    assert client.tracing is not None
    client.close()


def test_client_custom_base_url():
    """Test client with custom base URL."""
    config = MentioraConfig(
        api_key='test-key',
        base_url='https://custom.mentiora.ai',
    )
    client = MentioraClient(config)
    assert client.base_url == 'https://custom.mentiora.ai'
    client.close()


def test_client_http_client_is_private(mentiora_config: MentioraConfig):
    """Test that http_client is private (not publicly accessible)."""
    client = MentioraClient(mentiora_config)
    assert not hasattr(client, 'http_client')
    assert hasattr(client, '_http_client')
    client.close()


def test_client_warns_on_http_base_url():
    """Test that HTTP base URL (non-localhost) emits a warning."""
    config = MentioraConfig(api_key='test-key', base_url='http://example.com')
    with pytest.warns(UserWarning, match='HTTP'):
        client = MentioraClient(config)
        client.close()


def test_client_no_warning_on_http_localhost():
    """Test that http://localhost does NOT emit a warning."""
    config = MentioraConfig(api_key='test-key', base_url='http://localhost:8080')
    with warnings.catch_warnings():
        warnings.simplefilter('error')
        client = MentioraClient(config)
        client.close()


def test_client_no_warning_on_https():
    """Test that HTTPS base URL does NOT emit a warning."""
    config = MentioraConfig(api_key='test-key', base_url='https://example.com')
    with warnings.catch_warnings():
        warnings.simplefilter('error')
        client = MentioraClient(config)
        client.close()


def test_client_invalid_api_key():
    """Test client with invalid API key."""
    config = MentioraConfig(api_key='')
    with pytest.raises(ConfigurationError, match='api_key is required'):
        MentioraClient(config)


def test_client_debug_mode():
    """Test client with debug mode enabled."""
    config = MentioraConfig(api_key='test-key', debug=True)
    client = MentioraClient(config)
    assert client.debug is True
    client.close()


def test_client_context_manager(mentiora_config: MentioraConfig):
    """Test client as sync context manager calls close."""
    with MentioraClient(mentiora_config) as client:
        assert client.tracing is not None
    # After exiting the context, close() was called — verify by calling close() again (safe to call twice)
    client.close()


@pytest.mark.asyncio
async def test_client_async_context_manager(mentiora_config: MentioraConfig):
    """Test client as async context manager calls aclose."""
    async with MentioraClient(mentiora_config) as client:
        assert client.tracing is not None
    # After exiting the async context, aclose() was called
    client.close()


def test_client_config_options():
    """Test client respects custom timeout and retries from config."""
    config = MentioraConfig(api_key='test-key', timeout=5000, retries=1)
    client = MentioraClient(config)
    assert client._http_client.retries == 1
    assert client._http_client.timeout == 5.0  # 5000ms → 5.0s (httpx uses seconds)
    client.close()
