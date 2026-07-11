"""Shared text sanitisation for every user-supplied string.

The rules here are the single source of truth for input hygiene so that
title/body/comment/search/profile fields all behave identically and cannot be
individually forgotten. All of it runs server-side — client validation is only
ever a UX nicety and is re-applied here regardless.
"""
import re
import unicodedata

# C0/C1 control characters except tab/newline/carriage-return, plus zero-width
# and bidi-override characters used to smuggle spoofed or hidden text.
_CONTROL_RE = re.compile(
    "[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f"
    "​-‏‪-‮⁦-⁩﻿]"
)
# any run of whitespace that is not a newline (regular, tab, and unicode spaces)
_INLINE_WS_RE = re.compile(r"[^\S\n]+")
_BLANK_RUN_RE = re.compile(r"\n{3,}")


def _strip_controls(value: str) -> str:
    return _CONTROL_RE.sub("", value)


def clean_line(value: str) -> str:
    """Single-line field (title, name, search): NFC-normalise, strip control
    characters, collapse internal whitespace runs, and trim the ends."""
    value = unicodedata.normalize("NFC", value)
    value = _strip_controls(value.replace("\r", " ").replace("\n", " "))
    value = _INLINE_WS_RE.sub(" ", value)
    return value.strip()


def clean_multiline(value: str) -> str:
    """Multi-line field (body): preserve intentional line breaks but normalise,
    strip control characters, collapse spaces within each line, cap blank runs
    at two newlines, and trim the ends."""
    value = unicodedata.normalize("NFC", value)
    value = _strip_controls(value.replace("\r\n", "\n").replace("\r", "\n"))
    lines = [_INLINE_WS_RE.sub(" ", line).strip() for line in value.split("\n")]
    value = _BLANK_RUN_RE.sub("\n\n", "\n".join(lines))
    return value.strip()


def escape_like(value: str) -> str:
    r"""Escape LIKE/ILIKE wildcards so user input is matched literally.

    Used with ``.ilike(pattern, escape="\\")`` — without this a user typing
    ``%`` or ``_`` would silently widen (or, with many ``%``, slow) the query.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
