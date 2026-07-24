"""Six-digit email codes, stored only as a keyed HMAC.

A six-digit code has ~20 bits of entropy, so a plain hash would be brute-forceable
offline if the store leaked. Keying the HMAC with a server secret means a stolen
row cannot be attacked without also stealing the secret. Verification is
constant-time and the caller enforces attempt limits and expiry.
"""

import hmac
import secrets
from hashlib import sha256


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hmac_code(secret: str, purpose: str, email: str, code: str) -> str:
    message = f"{purpose}:{email}:{code}".encode()
    return hmac.new(secret.encode(), message, sha256).hexdigest()


def verify_code(secret: str, purpose: str, email: str, code: str, stored_hmac: str) -> bool:
    return hmac.compare_digest(hmac_code(secret, purpose, email, code), stored_hmac)
