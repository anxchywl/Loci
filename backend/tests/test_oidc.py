"""Unit tests for the pure id_token verification logic."""

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.security import oidc
from app.integrations.google import GOOGLE_ISSUERS
from tests.google_helpers import CLIENT_ID, public_jwk, sign_id_token

JWKS = [public_jwk()]
NONCE = "server-nonce"


def _verify(token: str, *, nonce: str = NONCE):
    return oidc.verify_id_token(
        token, JWKS, client_id=CLIENT_ID, nonce=nonce, issuers=GOOGLE_ISSUERS
    )


def test_valid_token_returns_claims():
    token = sign_id_token(sub="google-123", nonce=NONCE)
    claims = _verify(token)
    assert claims["sub"] == "google-123"
    assert claims["email_verified"] is True


def test_wrong_audience_rejected():
    token = sign_id_token(sub="x", nonce=NONCE, aud="someone-else")
    with pytest.raises(oidc.OidcError):
        _verify(token)


def test_untrusted_issuer_rejected():
    token = sign_id_token(sub="x", nonce=NONCE, iss="https://evil.example")
    with pytest.raises(oidc.OidcError):
        _verify(token)


def test_nonce_mismatch_rejected():
    token = sign_id_token(sub="x", nonce="attacker-nonce")
    with pytest.raises(oidc.OidcError):
        _verify(token, nonce=NONCE)


def test_expired_token_rejected():
    token = sign_id_token(sub="x", nonce=NONCE, exp_offset=-10)
    with pytest.raises(oidc.OidcError):
        _verify(token)


def test_unknown_signing_key_rejected():
    token = sign_id_token(sub="x", nonce=NONCE, kid="other-kid")
    with pytest.raises(oidc.OidcError):
        _verify(token)


def test_wrong_signature_rejected():
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = sign_id_token(sub="x", nonce=NONCE, private_key=other_key)
    with pytest.raises(oidc.OidcError):
        _verify(token)


def test_authorized_party_mismatch_rejected():
    token = sign_id_token(sub="x", nonce=NONCE, extra={"azp": "another-client"})
    with pytest.raises(oidc.OidcError):
        _verify(token)


def test_pkce_challenge_is_s256():
    verifier, challenge = oidc.generate_pkce_pair()
    import base64
    import hashlib

    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    assert challenge == expected
