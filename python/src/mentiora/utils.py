"""Shared utilities for the Mentiora SDK."""

import traceback


def format_exception_stack(err: BaseException) -> str | None:
    """Format exception with full traceback as a readable string.

    Returns None if no traceback is available.
    """
    if err.__traceback__ is None:
        return None
    return ''.join(traceback.format_exception(type(err), err, err.__traceback__))
