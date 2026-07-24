"""Network seams for Google OIDC: token exchange and JWKS retrieval.

Kept thin and side-effect-isolated so the auth service can be tested without
touching the network — tests monkeypatch these two coroutines.
"""

import time

import httpx

GOOGLE_ISSUERS = frozenset({"https://accounts.google.com", "accounts.google.com"})
# canonical issuer stored as the identity key regardless of which form the token uses
GOOGLE_ISSUER = "https://accounts.google.com"
GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs"

_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict[str, object] = {"keys": None, "expires_at": 0.0}


async def exchange_code(settings, code: str, code_verifier: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            GOOGLE_TOKEN_ENDPOINT,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.google_redirect_uri,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code_verifier": code_verifier,
            },
        )
    resp.raise_for_status()
    return resp.json()


async def fetch_jwks() -> list[dict]:
    now = time.time()
    cached = _jwks_cache.get("keys")
    if cached is not None and float(_jwks_cache["expires_at"]) > now:
        return cached  # type: ignore[return-value]
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(GOOGLE_JWKS_URI)
    resp.raise_for_status()
    keys = resp.json().get("keys", [])
    _jwks_cache["keys"] = keys
    _jwks_cache["expires_at"] = now + _JWKS_TTL_SECONDS
    return keys
