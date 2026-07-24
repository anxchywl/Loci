"""Compromised-password screening: enabled/disabled and documented fail-open."""

import pytest

from app.core.config import get_settings
from app.core.security.password import PasswordPolicyError
from app.integrations import hibp
from app.modules.auth import email as email_service


async def test_screen_noop_when_disabled(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "hibp_enabled", False)

    async def boom(password):
        raise AssertionError("must not call hibp when disabled")

    monkeypatch.setattr(hibp, "is_compromised", boom)
    await email_service._screen_password(settings, "whatever passphrase here")


async def test_breached_password_rejected(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "hibp_enabled", True)

    async def compromised(password):
        return True

    monkeypatch.setattr(hibp, "is_compromised", compromised)
    with pytest.raises(PasswordPolicyError):
        await email_service._screen_password(settings, "password in a breach list")


async def test_clean_password_allowed(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "hibp_enabled", True)

    async def clean(password):
        return False

    monkeypatch.setattr(hibp, "is_compromised", clean)
    await email_service._screen_password(settings, "a unique unbreached passphrase")


async def test_fail_open_on_screening_error(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "hibp_enabled", True)

    async def broken(password):
        raise RuntimeError("hibp unreachable")

    monkeypatch.setattr(hibp, "is_compromised", broken)
    # outage must not block a legitimate signup
    await email_service._screen_password(settings, "a perfectly fine passphrase")
