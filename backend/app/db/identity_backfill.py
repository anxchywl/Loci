"""Canonical backfill statement shared by the identity migration and its test.

Keeping the SQL in one place means the migration and the regression test that
proves it cannot drift apart. It is idempotent: ``ON CONFLICT DO NOTHING`` lets a
partial or re-run migration converge without creating duplicate identities.
"""

TELEGRAM_IDENTITY_BACKFILL_SQL = """
INSERT INTO auth_identities (user_id, provider, provider_subject, created_at, updated_at, last_used_at)
SELECT id, 'telegram', telegram_id::text, now(), now(), now()
FROM users
WHERE telegram_id IS NOT NULL
ON CONFLICT DO NOTHING
"""
