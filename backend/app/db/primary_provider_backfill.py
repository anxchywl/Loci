"""Canonical backfill statement shared by the primary-provider migration and its test.

Keeping the SQL in one place means the migration and the regression test that
proves it cannot drift apart. The creation provider is the provider of a user's
earliest auth identity: accounts predating the identity table were telegram-only,
and every account-creation path since writes exactly one identity, so the
earliest row is unambiguous. ``id`` breaks a tie no observed data can produce.
"""

PRIMARY_PROVIDER_BACKFILL_SQL = """
UPDATE users u
SET primary_provider = (
    SELECT a.provider
    FROM auth_identities a
    WHERE a.user_id = u.id
    ORDER BY a.created_at, a.id
    LIMIT 1
)
WHERE u.primary_provider IS NULL
"""
