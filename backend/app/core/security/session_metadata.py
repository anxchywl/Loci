import hashlib
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SessionMetadata:
    user_agent_summary: str
    device_type: str
    browser: str
    operating_system: str
    ip_hash: str


def _match(pattern: str, value: str, fallback: str) -> str:
    match = re.search(pattern, value, re.IGNORECASE)
    return match.group(1) if match else fallback


def build_session_metadata(user_agent: str | None, ip: str | None, secret: str) -> SessionMetadata:
    ua = (user_agent or "unknown")[:500]
    lower = ua.lower()
    if "ipad" in lower or "tablet" in lower:
        device = "tablet"
    elif "mobile" in lower or "iphone" in lower or "android" in lower:
        device = "mobile"
    else:
        device = "desktop"

    if "edg/" in lower:
        browser = "Edge"
    elif "chrome/" in lower:
        browser = "Chrome"
    elif "firefox/" in lower:
        browser = "Firefox"
    elif "safari/" in lower:
        browser = "Safari"
    else:
        browser = "Other"

    operating_system = "Other"
    if "iphone" in lower or "ipad" in lower:
        operating_system = "iOS"
    elif "windows" in lower:
        operating_system = "Windows"
    elif "mac os" in lower or "macintosh" in lower:
        operating_system = "macOS"
    elif "android" in lower:
        operating_system = "Android"
    elif "linux" in lower:
        operating_system = "Linux"

    ip_hash = hashlib.sha256(f"{secret}:{ip or 'unknown'}".encode()).hexdigest()
    return SessionMetadata(ua, device, browser, operating_system, ip_hash)
