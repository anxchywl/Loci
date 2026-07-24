"""Unit tests for password policy/hashing and keyed verification codes."""

import pytest

from app.core.security import codes
from app.core.security.password import (
    PasswordPolicyError,
    hash_password,
    needs_rehash,
    validate_password,
    verify_password,
)

SECRET = "unit-test-secret"


def test_short_password_rejected():
    with pytest.raises(PasswordPolicyError):
        validate_password("short")


def test_long_passphrase_allowed():
    validate_password("correct horse battery staple and then some more words")


def test_oversized_password_rejected():
    with pytest.raises(PasswordPolicyError):
        validate_password("x" * 300)


def test_hash_is_argon2id_and_verifies():
    hashed = hash_password("a strong enough passphrase")
    assert hashed.startswith("$argon2id$")
    assert verify_password(hashed, "a strong enough passphrase") is True
    assert verify_password(hashed, "wrong password entirely") is False


def test_needs_rehash_false_for_current_params():
    assert needs_rehash(hash_password("a strong enough passphrase")) is False


def test_verify_handles_malformed_hash():
    assert verify_password("not-a-real-hash", "whatever") is False


def test_code_is_six_digits():
    for _ in range(50):
        code = codes.generate_code()
        assert len(code) == 6 and code.isdigit()


def test_hmac_is_keyed_and_constant_time_verify():
    code = "123456"
    stored = codes.hmac_code(SECRET, "register", "a@b.com", code)
    assert stored != code  # never the plaintext
    assert codes.verify_code(SECRET, "register", "a@b.com", code, stored) is True
    # wrong code, wrong purpose, wrong email, wrong secret all fail
    assert codes.verify_code(SECRET, "register", "a@b.com", "000000", stored) is False
    assert codes.verify_code(SECRET, "reset", "a@b.com", code, stored) is False
    assert codes.verify_code(SECRET, "register", "x@b.com", code, stored) is False
    assert codes.verify_code("other-secret", "register", "a@b.com", code, stored) is False
