"""Shared utilities for the Mentiora SDK."""

import os
import time
import traceback
import uuid


def format_exception_stack(err: BaseException) -> str | None:
    """Format exception with full traceback as a readable string.

    Returns None if no traceback is available.
    """
    if err.__traceback__ is None:
        return None
    return ''.join(traceback.format_exception(type(err), err, err.__traceback__))


def uuid7() -> uuid.UUID:
    """Generate a UUID version 7 (RFC 9562) with millisecond timestamp precision."""
    ms = int(time.time() * 1000)
    rand = bytearray(os.urandom(10))
    rand[0] = (rand[0] & 0x0F) | 0x70  # version 7
    rand[2] = (rand[2] & 0x3F) | 0x80  # RFC 4122 variant
    return uuid.UUID(bytes=ms.to_bytes(6, 'big') + bytes(rand))
