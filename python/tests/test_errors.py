"""Tests for error classes."""

import pytest

from mentiora.errors import (
    ConfigurationError,
    MentioraError,
    NetworkError,
    ValidationError,
)


def test_mentiora_error():
    """Test base MentioraError."""
    error = MentioraError('Test error', 'TEST_CODE')
    assert str(error) == 'Test error'
    assert error.message == 'Test error'
    assert error.code == 'TEST_CODE'
    assert error.name == 'MentioraError'


def test_network_error():
    """Test NetworkError."""
    error = NetworkError('Network error', 500)
    assert str(error) == 'Network error'
    assert error.code == 'NETWORK_ERROR'
    assert error.status_code == 500
    assert error.name == 'NetworkError'

    error_no_status = NetworkError('Network error')
    assert error_no_status.status_code is None


def test_validation_error():
    """Test ValidationError."""
    error = ValidationError('Validation error')
    assert str(error) == 'Validation error'
    assert error.code == 'VALIDATION_ERROR'
    assert error.name == 'ValidationError'


def test_configuration_error():
    """Test ConfigurationError."""
    error = ConfigurationError('Configuration error')
    assert str(error) == 'Configuration error'
    assert error.code == 'CONFIGURATION_ERROR'
    assert error.name == 'ConfigurationError'


def test_error_hierarchy_isinstance():
    """Test that all errors are instances of MentioraError and Exception."""
    errors = [
        NetworkError('net', 500),
        ValidationError('val'),
        ConfigurationError('cfg'),
    ]
    for error in errors:
        assert isinstance(error, MentioraError)
        assert isinstance(error, Exception)


def test_error_message_preserved_in_str():
    """Test that error message is accessible via str() and .message."""
    msg = 'Something went wrong: connection refused'
    error = NetworkError(msg, 503)
    assert str(error) == msg
    assert error.message == msg


def test_error_can_be_caught_as_base():
    """Test that subclass errors can be caught as MentioraError."""
    with pytest.raises(MentioraError):
        raise NetworkError('test')
    with pytest.raises(MentioraError):
        raise ValidationError('test')
    with pytest.raises(MentioraError):
        raise ConfigurationError('test')


def test_network_error_backward_compat():
    """Existing callsites still work."""
    e1 = NetworkError('timeout')
    assert e1.status_code is None
    assert e1.server_code is None
    assert e1.server_message is None

    e2 = NetworkError('not found', 404)
    assert e2.status_code == 404
    assert e2.server_code is None


def test_network_error_server_fields():
    """New server_code/server_message fields work."""
    e = NetworkError(
        'Client error: 404 Not Found: [agent_not_found] Tag "x" not found',
        status_code=404,
        server_code='agent_not_found',
        server_message='Tag "x" not found',
    )
    assert e.status_code == 404
    assert e.server_code == 'agent_not_found'
    assert e.server_message == 'Tag "x" not found'
    assert 'agent_not_found' in str(e)
