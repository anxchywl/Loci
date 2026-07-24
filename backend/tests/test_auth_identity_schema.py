"""Phase 1 identity model: constraints and the telegram backfill.

The migration builds the schema once for the suite (conftest upgrades to head), so
these tests exercise the live constraints and run the shared backfill SQL against
seeded users to prove it preserves users.id and cannot duplicate identities.
"""

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.db.identity_backfill import TELEGRAM_IDENTITY_BACKFILL_SQL
from app.db.models import AuthIdentity, User


async def _make_user(db_session, telegram_id: int) -> User:
    user = User(telegram_id=telegram_id, username=f"u{telegram_id}")
    db_session.add(user)
    await db_session.flush()
    return user


async def test_is_admin_defaults_false(db_session):
    user = await _make_user(db_session, telegram_id=1)
    await db_session.refresh(user)
    assert user.is_admin is False


async def test_telegram_identity_unique_by_subject(db_session):
    a = await _make_user(db_session, telegram_id=10)
    b = await _make_user(db_session, telegram_id=11)
    db_session.add(AuthIdentity(user_id=a.id, provider="telegram", provider_subject="900"))
    await db_session.flush()
    db_session.add(AuthIdentity(user_id=b.id, provider="telegram", provider_subject="900"))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_one_identity_per_provider_per_user(db_session):
    a = await _make_user(db_session, telegram_id=20)
    db_session.add(AuthIdentity(user_id=a.id, provider="telegram", provider_subject="901"))
    await db_session.flush()
    db_session.add(AuthIdentity(user_id=a.id, provider="telegram", provider_subject="902"))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_unknown_provider_rejected(db_session):
    a = await _make_user(db_session, telegram_id=30)
    db_session.add(AuthIdentity(user_id=a.id, provider="facebook", provider_subject="x"))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_google_requires_issuer(db_session):
    a = await _make_user(db_session, telegram_id=40)
    db_session.add(
        AuthIdentity(user_id=a.id, provider="google", provider_issuer=None, provider_subject="sub")
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_non_google_rejects_issuer(db_session):
    a = await _make_user(db_session, telegram_id=41)
    db_session.add(
        AuthIdentity(
            user_id=a.id,
            provider="telegram",
            provider_issuer="https://accounts.google.com",
            provider_subject="903",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_google_unique_by_issuer_and_subject(db_session):
    a = await _make_user(db_session, telegram_id=50)
    b = await _make_user(db_session, telegram_id=51)
    issuer = "https://accounts.google.com"
    db_session.add(
        AuthIdentity(user_id=a.id, provider="google", provider_issuer=issuer, provider_subject="sub-1")
    )
    await db_session.flush()
    db_session.add(
        AuthIdentity(user_id=b.id, provider="google", provider_issuer=issuer, provider_subject="sub-1")
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_backfill_creates_one_identity_per_user_preserving_id(db_session):
    users = [await _make_user(db_session, telegram_id=tg) for tg in (500, 910000001, 910000002)]
    original_ids = {u.telegram_id: u.id for u in users}
    await db_session.commit()

    await db_session.execute(text(TELEGRAM_IDENTITY_BACKFILL_SQL))
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(AuthIdentity).where(AuthIdentity.provider == "telegram")
        )
    ).scalars().all()
    assert len(rows) == len(users)
    for row in rows:
        # identity points at the same permanent users.id, keyed by telegram id
        assert original_ids[int(row.provider_subject)] == row.user_id


async def test_backfill_is_idempotent(db_session):
    await _make_user(db_session, telegram_id=600)
    await db_session.commit()

    await db_session.execute(text(TELEGRAM_IDENTITY_BACKFILL_SQL))
    await db_session.execute(text(TELEGRAM_IDENTITY_BACKFILL_SQL))
    await db_session.commit()

    count = (
        await db_session.execute(
            select(AuthIdentity).where(AuthIdentity.provider == "telegram")
        )
    ).scalars().all()
    assert len(count) == 1
