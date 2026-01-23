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
