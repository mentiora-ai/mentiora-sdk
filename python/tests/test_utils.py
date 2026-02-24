"""Tests for mentiora.utils module."""

import sys
import time
import uuid

from mentiora.utils import format_exception_stack, uuid7


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


class TestUuid7:
    """Tests for uuid7 — RFC 9562 UUID version 7."""

    def test_returns_uuid_object(self):
        result = uuid7()
        assert isinstance(result, uuid.UUID)

    def test_version_is_7(self):
        result = uuid7()
        assert result.version == 7

    def test_variant_is_rfc4122(self):
        result = uuid7()
        # RFC 4122 variant: bits 64-65 are '10'
        assert result.variant == uuid.RFC_4122

    def test_string_format(self):
        result = str(uuid7())
        # Standard UUID format: 8-4-4-4-12 hex
        parts = result.split('-')
        assert len(parts) == 5
        assert [len(p) for p in parts] == [8, 4, 4, 4, 12]

    def test_uniqueness(self):
        uuids = {str(uuid7()) for _ in range(1000)}
        assert len(uuids) == 1000

    def test_timestamp_encodes_current_time(self):
        before_ms = int(time.time() * 1000)
        result = uuid7()
        after_ms = int(time.time() * 1000)

        # Extract the 48-bit timestamp from the UUID (first 6 bytes)
        ts_ms = result.int >> 80
        assert before_ms <= ts_ms <= after_ms

    def test_chronological_ordering(self):
        """UUIDs generated later should sort after earlier ones."""
        first = uuid7()
        time.sleep(0.002)  # 2ms gap to guarantee different timestamp
        second = uuid7()
        assert str(first) < str(second)

    def test_version_nibble_in_hex(self):
        """The 13th hex char (version nibble) must always be '7'."""
        for _ in range(100):
            hex_str = uuid7().hex
            assert hex_str[12] == '7'

    def test_variant_bits_in_hex(self):
        """The 17th hex char (variant nibble) must be 8, 9, a, or b."""
        for _ in range(100):
            hex_str = uuid7().hex
            assert hex_str[16] in '89ab'
