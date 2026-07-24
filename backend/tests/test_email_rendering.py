from types import SimpleNamespace

import pytest

from app.integrations import email as email_integration


@pytest.fixture
def settings():
    return SimpleNamespace(email_code_ttl_minutes=10)


@pytest.mark.parametrize("lang", ["en", "kk", "ru"])
@pytest.mark.parametrize(
    ("sender_name", "templates"),
    [
        ("send_verification_code", email_integration.VERIFY),
        ("send_reset_code", email_integration.RESET),
    ],
)
def test_code_email_has_localized_html_and_plaintext(
    monkeypatch, settings, lang, sender_name, templates
):
    delivered = []
    monkeypatch.setattr(email_integration, "_deliver", lambda *args: delivered.append(args))

    sender = getattr(email_integration, sender_name)
    sender(settings, "reader@example.com", "123456", lang)

    _, _, subject, html, text, _, code = delivered[0]
    assert subject == templates[lang]["subject"]
    assert f'<html lang="{lang}">' in html
    assert templates[lang]["title"] in html
    assert "123456" in html
    assert "123456" in text
    assert code == "123456"
    assert "gradient" not in html.lower()


@pytest.mark.parametrize("lang", ["en", "kk", "ru"])
def test_password_changed_email_has_no_code(monkeypatch, settings, lang):
    delivered = []
    monkeypatch.setattr(email_integration, "_deliver", lambda *args: delivered.append(args))

    email_integration.send_password_changed(settings, "reader@example.com", lang)

    _, _, subject, html, text, _, code = delivered[0]
    assert subject == email_integration.CHANGED[lang]["subject"]
    assert f'<html lang="{lang}">' in html
    assert email_integration.CHANGED[lang]["title"] in text
    assert code is None


def test_unknown_language_falls_back_to_english(monkeypatch, settings):
    delivered = []
    monkeypatch.setattr(email_integration, "_deliver", lambda *args: delivered.append(args))

    email_integration.send_verification_code(
        settings, "reader@example.com", "123456", "de-DE"
    )

    _, _, subject, html, _, _, _ = delivered[0]
    assert subject == email_integration.VERIFY["en"]["subject"]
    assert '<html lang="en">' in html
