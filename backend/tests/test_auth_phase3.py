"""Phase 3: Telegram login resolves through auth identities.

Proves that resolution goes through auth_identities, that a pre-existing owner
(as produced by the Phase 1 backfill) keeps the same users.id, and that profile
fields still refresh on each login.
"""

from sqlalchemy import func, select

from app.db.models import AuthIdentity, User
from tests.factories import build_init_data
from tests.test_stories_api import authenticate

AUTH_URL = "/api/v1/auth/telegram"


async def test_returning_user_resolves_to_same_account(client, db_session):
    first = await client.post(AUTH_URL, json={"init_data": build_init_data(telegram_id=700)})
    first_id = first.json()["user"]["id"]

    second = await client.post(AUTH_URL, json={"init_data": build_init_data(telegram_id=700)})
    assert second.json()["user"]["id"] == first_id

    users = (await db_session.execute(select(func.count()).select_from(User))).scalar_one()
    identities = (
        await db_session.execute(select(func.count()).select_from(AuthIdentity))
    ).scalar_one()
    assert users == 1
    assert identities == 1


async def test_backfilled_owner_keeps_users_id(client, db_session):
    # simulate the Phase 1 state: an account that already exists with a telegram
    # identity pointing at it, created before this login path ran
    owner = User(id=4242, telegram_id=880, username="owner")
    db_session.add(owner)
    await db_session.flush()
    db_session.add(
        AuthIdentity(user_id=owner.id, provider="telegram", provider_subject="880")
    )
    await db_session.commit()

    resp = await client.post(AUTH_URL, json={"init_data": build_init_data(telegram_id=880)})
    assert resp.status_code == 200
    # resolved through the identity to the existing account, not a fresh user
    assert resp.json()["user"]["id"] == 4242

    users = (await db_session.execute(select(func.count()).select_from(User))).scalar_one()
    assert users == 1


async def test_login_refreshes_profile_fields(client, db_session):
    await client.post(
        AUTH_URL, json={"init_data": build_init_data(telegram_id=900, username="before")}
    )
    updated = await client.post(
        AUTH_URL, json={"init_data": build_init_data(telegram_id=900, username="after")}
    )
    assert updated.json()["user"]["username"] == "after"

    user = (
        await db_session.execute(select(User).where(User.telegram_id == 900))
    ).scalar_one()
    assert user.username == "after"


async def test_blocked_user_rejected_on_resolution(client, db_session):
    await authenticate(client, telegram_id=910)
    user = (
        await db_session.execute(select(User).where(User.telegram_id == 910))
    ).scalar_one()
    user.is_blocked = True
    await db_session.commit()

    resp = await client.post(AUTH_URL, json={"init_data": build_init_data(telegram_id=910)})
    assert resp.status_code == 403
