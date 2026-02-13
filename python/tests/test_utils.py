"""Tests for mentiora.utils module."""

import sys

from mentiora.utils import format_exception_stack


class TestFormatExceptionStack:
    """Tests for format_exception_stack."""

    def test_standard_exception(self):
        """Should format a standard exception with traceback."""
        try:
            raise ValueError('test error')
        except ValueError:
            exc_info = sys.exc_info()
            result = format_exception_stack(exc_info[1])
            assert result is not None
            assert 'ValueError' in result
            assert 'test error' in result

    def test_chained_exception(self):
        """Should format chained exception."""
        try:
            try:
                raise ValueError('original')
            except ValueError as e:
                raise RuntimeError('wrapper') from e
        except RuntimeError:
            exc_info = sys.exc_info()
            result = format_exception_stack(exc_info[1])
            assert result is not None
            assert 'RuntimeError' in result

    def test_exception_no_traceback(self):
        """Should return None for exception with no traceback."""
        exc = Exception('no traceback')
        result = format_exception_stack(exc)
        assert result is None

    def test_traceback_contains_file_info(self):
        """Should include file and line information in traceback."""
        try:
            raise TypeError('type issue')
        except TypeError:
            exc_info = sys.exc_info()
            result = format_exception_stack(exc_info[1])
            assert result is not None
            assert 'test_utils.py' in result
