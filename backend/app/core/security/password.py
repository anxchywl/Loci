"""Argon2id password hashing and policy.

Policy is length-only by design: a 12-char minimum, generous maximum to accept
passphrases, and no composition rules (which push users toward weaker, predictable
patterns). Long input is rejected, never silently truncated.
"""

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 256

_hasher = PasswordHasher(type=Type.ID)


class PasswordPolicyError(Exception):
    pass


def validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise PasswordPolicyError(
            f"Password must be at most {MAX_PASSWORD_LENGTH} characters"
        )


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    # any failure (mismatch, malformed stored hash) is an invalid credential
    try:
        return _hasher.verify(password_hash, password)
    except Exception:
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True
