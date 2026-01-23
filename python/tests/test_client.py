"""Tests for MentioraClient."""

import pytest

from mentiora import MentioraClient
from mentiora.errors import ConfigurationError
from mentiora.types import MentioraConfig


def test_client_initialization(mentiora_config: MentioraConfig):
    """Test client initialization."""
    client = MentioraClient(mentiora_config)
    assert client.base_url == 'https://staging.mentiora.ai'
    assert client.tracing is not None
    client.close()


def test_client_initialization_production():
    """Test client initialization with production environment."""
    config = MentioraConfig(api_key='test-key', environment='production')
    client = MentioraClient(config)
    assert client.base_url == 'https://platform.mentiora.ai'
    client.close()


def test_client_custom_base_url():
    """Test client with custom base URL."""
    config = MentioraConfig(
        api_key='test-key',
        environment='staging',
        base_url='https://custom.mentiora.ai',
    )
    client = MentioraClient(config)
    assert client.base_url == 'https://custom.mentiora.ai'
    client.close()


def test_client_invalid_api_key():
    """Test client with invalid API key."""
    config = MentioraConfig(api_key='', environment='staging')
    with pytest.raises(ConfigurationError, match='api_key is required'):
        MentioraClient(config)


def test_client_invalid_environment():
    """Test client with invalid environment."""
    config = MentioraConfig(api_key='test-key', environment='invalid')  # type: ignore
    with pytest.raises(ConfigurationError, match='environment must be'):
        MentioraClient(config)
