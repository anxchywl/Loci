"""Managing the sign-in methods attached to one Loci account.

Linking only ever attaches a provider identity to the already-authenticated
users.id — it never merges accounts and never links by matching email. Unlinking
cannot remove the last usable method. Every link/unlink is audited.
"""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.codes import generate_code, hmac_code, verify_code
from app.core.security.password import hash_password, validate_password
from app.db.repositories import audit as audit_repo
from app.db.repositories import credentials as credentials_repo
from app.db.repositories import email_challenges as challenges_repo
from app.db.repositories import identities as identities_repo
from app.integrations import email as email_integ
from app.modules.auth.email import _expiry, _screen_password, normalize_email
from app.modules.auth.schemas import IdentitySummary


class LinkError(Exception):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


class LinkAuthError(Exception):
    """generic bad/expired code on a link verification"""


def _identity_email(identity) -> str | None:
    return identity.provider_subject if identity.provider == "email" else identity.verified_email


async def list_identities(db: AsyncSession, user_id: int) -> list[IdentitySummary]:
    rows = await identities_repo.list_for_user(db, user_id)
    return [
        IdentitySummary(
            provider=r.provider,
            email=_identity_email(r),
            created_at=r.created_at,
            last_used_at=r.last_used_at,
        )
        for r in rows
    ]


async def unlink(db: AsyncSession, user_id: int, provider: str, ip_hash: str | None) -> None:
    identity = await identities_repo.get_for_user_provider(db, user_id, provider)
    if identity is None:
        raise LinkError("That sign-in method is not linked", status_code=404)
    if await identities_repo.count_for_user(db, user_id) <= 1:
        raise LinkError("You can't remove your only sign-in method", status_code=400)

    await identities_repo.delete_for_user_provider(db, user_id, provider)
    if provider == "email":
        await credentials_repo.delete(db, user_id)
    await audit_repo.record(db, user_id, "identity_unlinked", provider=provider, ip_hash=ip_hash)
    await db.commit()


async def start_email_link(
    db: AsyncSession, settings, user_id: int, email_raw: str, password: str, lang: str | None
) -> None:
    email = normalize_email(email_raw)
    validate_password(password)
    await _screen_password(settings, password)
    if await identities_repo.get_for_user_provider(db, user_id, "email") is not None:
        raise LinkError("This account already has an email sign-in", status_code=409)
    if await identities_repo.get_by_provider_subject(db, "email", email) is not None:
        raise LinkError("That email is already in use", status_code=409)

    code = generate_code()
    await challenges_repo.replace(
        db,
        purpose="link_email",
        email=email,
        code_hmac=hmac_code(settings.email_code_secret, "link_email", email, code),
        expires_at=_expiry(settings),
        user_id=user_id,
        password_hash=hash_password(password),
    )
    await db.commit()
    email_integ.send_verification_code(settings, email, code, lang)


async def verify_email_link(
    db: AsyncSession, settings, user_id: int, email_raw: str, code: str, ip_hash: str | None
) -> None:
    email = normalize_email(email_raw)
    now = datetime.now(UTC)
    challenge = await challenges_repo.get_active(db, email, "link_email", now)
    if (
        challenge is None
        or challenge.user_id != user_id
        or challenge.attempts >= settings.email_code_max_attempts
    ):
        raise LinkAuthError("invalid or expired code")
    if not verify_code(settings.email_code_secret, "link_email", email, code, challenge.code_hmac):
        await challenges_repo.increment_attempts(db, challenge.id)
        await db.commit()
        raise LinkAuthError("invalid or expired code")

    # the address must still be free at attach time (guards a race)
    if await identities_repo.get_by_provider_subject(db, "email", email) is not None:
        await challenges_repo.consume(db, challenge.id, now)
        await db.commit()
        raise LinkError("That email is already in use", status_code=409)

    await identities_repo.create_email_identity(db, user_id, email)
    await credentials_repo.upsert(db, user_id, challenge.password_hash)
    await challenges_repo.consume(db, challenge.id, now)
    await audit_repo.record(db, user_id, "identity_linked", provider="email", ip_hash=ip_hash)
    await db.commit()
