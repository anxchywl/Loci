"""Privacy-preserving compromised-password screening (HaveIBeenPwned range API).

Only the first 5 hex chars of the SHA-1 are sent, so the full password hash never
leaves the process (k-anonymity). Network seam kept thin so it can be mocked.
"""

import hashlib

import httpx

_RANGE_URL = "https://api.pwnedpasswords.com/range/"


async def is_compromised(password: str) -> bool:
    digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(f"{_RANGE_URL}{prefix}", headers={"Add-Padding": "true"})
    resp.raise_for_status()
    for line in resp.text.splitlines():
        candidate, _, count = line.partition(":")
        if candidate.strip().upper() == suffix and count.strip() not in ("", "0"):
            return True
    return False
