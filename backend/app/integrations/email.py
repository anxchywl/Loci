"""Localized transactional email for Loci auth.

Loci restyle of the events-bot reference: no emoji, no gradients, neutral surfaces,
typography-led, and readable when a mail client forces dark mode. HTML with a
plaintext alternative. Codes are never written to production logs.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger(__name__)

# en/kk/ru copy for each purpose; {code}/{ttl} are filled per send
VERIFY = {
    "en": {
        "subject": "Your Loci verification code",
        "title": "Verify your email",
        "intro": "Use this code to finish setting up your Loci account:",
        "expires": "This code expires in {ttl} minutes.",
        "ignore": "If you didn't request this, you can ignore this email.",
    },
    "kk": {
        "subject": "Loci растау коды",
        "title": "Электрондық поштаңызды растаңыз",
        "intro": "Loci тіркелгіңізді аяқтау үшін осы кодты пайдаланыңыз:",
        "expires": "Кодтың жарамдылық мерзімі — {ttl} минут.",
        "ignore": "Егер сіз мұны сұрамаған болсаңыз, бұл хатты елемей қойыңыз.",
    },
    "ru": {
        "subject": "Код подтверждения Loci",
        "title": "Подтвердите вашу почту",
        "intro": "Используйте этот код, чтобы завершить создание аккаунта Loci:",
        "expires": "Код действителен {ttl} минут.",
        "ignore": "Если вы не запрашивали это, просто проигнорируйте письмо.",
    },
}

RESET = {
    "en": {
        "subject": "Your Loci password reset code",
        "title": "Reset your password",
        "intro": "Use this code to set a new password for your Loci account:",
        "expires": "This code expires in {ttl} minutes.",
        "ignore": "If you didn't request this, you can safely ignore this email — your password won't change.",
    },
    "kk": {
        "subject": "Loci құпиясөзін қалпына келтіру коды",
        "title": "Құпиясөзді қалпына келтіру",
        "intro": "Loci тіркелгіңізге жаңа құпиясөз орнату үшін осы кодты пайдаланыңыз:",
        "expires": "Кодтың жарамдылық мерзімі — {ttl} минут.",
        "ignore": "Егер сіз мұны сұрамаған болсаңыз, хатты елемеңіз — құпиясөзіңіз өзгермейді.",
    },
    "ru": {
        "subject": "Код сброса пароля Loci",
        "title": "Сброс пароля",
        "intro": "Используйте этот код, чтобы задать новый пароль для аккаунта Loci:",
        "expires": "Код действителен {ttl} минут.",
        "ignore": "Если вы не запрашивали это, проигнорируйте письмо — пароль не изменится.",
    },
}

CHANGED = {
    "en": {
        "subject": "Your Loci password was changed",
        "title": "Password changed",
        "intro": "Your Loci password was just changed and all sessions were signed out.",
        "expires": "",
        "ignore": "If this wasn't you, reset your password immediately.",
    },
    "kk": {
        "subject": "Loci құпиясөзі өзгертілді",
        "title": "Құпиясөз өзгертілді",
        "intro": "Loci құпиясөзіңіз жаңа ғана өзгертілді, барлық сеанстар аяқталды.",
        "expires": "",
        "ignore": "Егер бұл сіз болмасаңыз, құпиясөзді дереу қалпына келтіріңіз.",
    },
    "ru": {
        "subject": "Пароль Loci изменён",
        "title": "Пароль изменён",
        "intro": "Ваш пароль Loci только что изменён, все сеансы завершены.",
        "expires": "",
        "ignore": "Если это были не вы, немедленно сбросьте пароль.",
    },
}


def _language_code(lang: str | None) -> str:
    code = (lang or "en").lower()[:2]
    return code if code in VERIFY else "en"


def _pick(templates: dict, lang: str | None) -> dict:
    return templates[_language_code(lang)]


def _render_html(
    lang: str, title: str, intro: str, code: str | None, expires: str, ignore: str
) -> str:
    code_block = (
        f'<div style="margin:24px 0;padding:16px 24px;background:#f4f4f5;'
        f'border:1px solid #e4e4e7;border-radius:10px;text-align:center;'
        f'font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b;'
        f'font-family:ui-monospace,SFMono-Regular,Menlo,monospace">{code}</div>'
        if code
        else ""
    )
    expires_p = f'<p style="margin:0 0 8px;font-size:13px;color:#71717a">{expires}</p>' if expires else ""
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:transparent;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:440px;margin:0 auto">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:1px;color:#a1a1aa;text-transform:uppercase">Loci</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b">{title}</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#3f3f46">{intro}</p>
    {code_block}
    {expires_p}
    <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa">{ignore}</p>
  </div>
</body>
</html>"""


def _render_text(title: str, intro: str, code: str | None, expires: str, ignore: str) -> str:
    lines = ["Loci", "", title, "", intro]
    if code:
        lines += ["", f"    {code}"]
    if expires:
        lines += ["", expires]
    lines += ["", ignore]
    return "\n".join(lines)


def _deliver(settings, to: str, subject: str, html: str, text: str, log_label: str, code: str | None) -> None:
    if settings.email_host in ("console", "", None):
        # never log codes in production; a dev may see them locally for testing
        suffix = f" code={code}" if code and settings.app_env == "development" else ""
        logger.info("email (console) to=%s subject=%s%s%s", to, subject, f" [{log_label}]", suffix)
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    port = settings.email_port or 587
    ctx = ssl.create_default_context()
    try:
        if port == 465:
            with smtplib.SMTP_SSL(settings.email_host, port, timeout=10, context=ctx) as smtp:
                _login_send(smtp, settings, msg)
        else:
            with smtplib.SMTP(settings.email_host, port, timeout=10) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ctx)
                smtp.ehlo()
                _login_send(smtp, settings, msg)
    except Exception as exc:  # surfaced honestly to the caller, never swallowed
        logger.error("email delivery failed to=%s subject=%s", to, subject)
        raise EmailDeliveryError("email delivery failed") from exc


def _login_send(smtp, settings, msg) -> None:
    if settings.email_username and settings.email_password:
        smtp.login(settings.email_username, settings.email_password)
    smtp.send_message(msg)


class EmailDeliveryError(Exception):
    pass


def send_verification_code(settings, to: str, code: str, lang: str | None) -> None:
    t = _pick(VERIFY, lang)
    expires = t["expires"].format(ttl=settings.email_code_ttl_minutes)
    html = _render_html(_language_code(lang), t["title"], t["intro"], code, expires, t["ignore"])
    text = _render_text(t["title"], t["intro"], code, expires, t["ignore"])
    _deliver(settings, to, t["subject"], html, text, "verify", code)


def send_reset_code(settings, to: str, code: str, lang: str | None) -> None:
    t = _pick(RESET, lang)
    expires = t["expires"].format(ttl=settings.email_code_ttl_minutes)
    html = _render_html(_language_code(lang), t["title"], t["intro"], code, expires, t["ignore"])
    text = _render_text(t["title"], t["intro"], code, expires, t["ignore"])
    _deliver(settings, to, t["subject"], html, text, "reset", code)


def send_password_changed(settings, to: str, lang: str | None) -> None:
    t = _pick(CHANGED, lang)
    html = _render_html(_language_code(lang), t["title"], t["intro"], None, "", t["ignore"])
    text = _render_text(t["title"], t["intro"], None, "", t["ignore"])
    _deliver(settings, to, t["subject"], html, text, "changed", None)
