"""Local RS256 signing so google id_tokens can be forged in tests without network."""

import json
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

KID = "test-key-1"
CLIENT_ID = "test-google-client-id.apps.googleusercontent.com"
ISSUER = "https://accounts.google.com"

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def public_jwk(kid: str = KID) -> dict:
    jwk = json.loads(RSAAlgorithm.to_jwk(_private_key.public_key()))
    jwk["kid"] = kid
    jwk["alg"] = "RS256"
    jwk["use"] = "sig"
    return jwk


def sign_id_token(
    *,
    sub: str,
    nonce: str,
    aud: str = CLIENT_ID,
    iss: str = ISSUER,
    email: str | None = "user@example.com",
    email_verified: bool = True,
    exp_offset: int = 3600,
    kid: str = KID,
    extra: dict | None = None,
    private_key=_private_key,
) -> str:
    now = int(time.time())
    claims = {
        "iss": iss,
        "aud": aud,
        "sub": sub,
        "iat": now,
        "exp": now + exp_offset,
        "nonce": nonce,
    }
    if email is not None:
        claims["email"] = email
        claims["email_verified"] = email_verified
    if extra:
        claims.update(extra)
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})
