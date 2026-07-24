"""OpenID Connect primitives: PKCE, and strict id_token verification.

Verification is deliberately pure — it takes the JWKS as input so it can be unit
tested with a local key and has no network or global state.
"""

import base64
import hashlib
import json
import secrets

import jwt
from jwt.algorithms import RSAAlgorithm


class OidcError(Exception):
    pass


def random_url_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def generate_pkce_pair() -> tuple[str, str]:
    """return (code_verifier, code_challenge) using S256"""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def verify_id_token(
    id_token: str,
    jwks: list[dict],
    *,
    client_id: str,
    nonce: str,
    issuers: frozenset[str],
) -> dict:
    """Verify signature and claims, returning the validated claim set.

    Checks signature (RS256 against the matching JWKS key), audience, expiry and
    issued-at, issuer, nonce, and authorized party. Raises OidcError on any
    failure so callers surface a single generic error.
    """
    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.PyJWTError as exc:
        raise OidcError("malformed id token") from exc

    kid = header.get("kid")
    key_data = next((k for k in jwks if k.get("kid") == kid), None)
    if key_data is None:
        raise OidcError("unknown signing key")

    try:
        public_key = RSAAlgorithm.from_jwk(json.dumps(key_data))
        claims = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=client_id,
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise OidcError("invalid id token") from exc

    if claims.get("iss") not in issuers:
        raise OidcError("untrusted issuer")
    if claims.get("nonce") != nonce:
        raise OidcError("nonce mismatch")
    azp = claims.get("azp")
    if azp is not None and azp != client_id:
        raise OidcError("authorized party mismatch")
    if not claims.get("sub"):
        raise OidcError("missing subject")
    return claims
