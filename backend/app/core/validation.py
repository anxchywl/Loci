"""Reusable Pydantic string types that sanitise before validating length.

Cleaning happens first (``BeforeValidator``) so length limits are checked
against the stored value, and an all-whitespace input becomes empty and is
rejected rather than silently passing a ``min_length`` check on the raw text.
"""
from typing import Annotated

from pydantic import BeforeValidator

from app.core.security.text import clean_line, clean_multiline


def _line(min_len: int, max_len: int):
    def _validate(value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("must be a string")
        value = clean_line(value)
        if len(value) < min_len:
            raise ValueError("must not be empty")
        if len(value) > max_len:
            raise ValueError(f"must be at most {max_len} characters")
        return value

    return Annotated[str, BeforeValidator(_validate)]


def _multiline(min_len: int, max_len: int):
    def _validate(value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("must be a string")
        value = clean_multiline(value)
        if len(value) < min_len:
            raise ValueError("must not be empty")
        if len(value) > max_len:
            raise ValueError(f"must be at most {max_len} characters")
        return value

    return Annotated[str, BeforeValidator(_validate)]


def LineStr(min_len: int, max_len: int):  # noqa: N802 - factory returning a type
    return _line(min_len, max_len)


def MultilineStr(min_len: int, max_len: int):  # noqa: N802
    return _multiline(min_len, max_len)
