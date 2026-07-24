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


@dataclass(frozen=True)
class UserAgentDescription:
    """Everything the session list can tell the user about a device.

    Derived from the stored user-agent string on read rather than persisted, so
    parser improvements also describe sessions that were created earlier.
    """

    device_type: str
    device_model: str | None
    browser: str
    browser_version: str | None
    operating_system: str
    os_version: str | None
    in_app: bool


UNKNOWN = UserAgentDescription("desktop", None, "Other", None, "Other", None, False)

# ordered: the first token that matches wins, so wrappers (Edge, Opera, the
# iOS Chrome/Firefox skins) are checked before the engine they embed
_BROWSERS: tuple[tuple[str, str, str], ...] = (
    ("edg/", "Edge", r"edg(?:[ae]|ios)?/([\d.]+)"),
    ("opr/", "Opera", r"opr/([\d.]+)"),
    ("yabrowser/", "Yandex Browser", r"yabrowser/([\d.]+)"),
    ("samsungbrowser/", "Samsung Internet", r"samsungbrowser/([\d.]+)"),
    ("crios/", "Chrome", r"crios/([\d.]+)"),
    ("fxios/", "Firefox", r"fxios/([\d.]+)"),
    ("chrome/", "Chrome", r"chrome/([\d.]+)"),
    ("firefox/", "Firefox", r"firefox/([\d.]+)"),
    ("safari/", "Safari", r"version/([\d.]+)"),
)


def _search(pattern: str, value: str) -> str | None:
    match = re.search(pattern, value, re.IGNORECASE)
    return match.group(1) if match else None


def _major(version: str | None) -> str | None:
    """A full version string is noise in the UI — the major release is enough."""
    return version.split(".")[0] if version else None


def _android_model(ua: str) -> str | None:
    # "(Linux; Android 13; SM-A536E Build/TP1A)" → "SM-A536E"
    raw = _search(r"android[\d\s.;]*;\s*([^;)]+)", ua)
    if raw is None:
        return None
    model = re.sub(r"\s*build/.*$", "", raw, flags=re.IGNORECASE).strip()
    # generic webview placeholders say nothing about the device
    if not model or model.lower() in {"k", "wv", "unknown", "generic"}:
        return None
    return model[:60]


def _device_model(ua: str, lower: str) -> str | None:
    if "ipad" in lower:
        return "iPad"
    if "iphone" in lower:
        return "iPhone"
    if "android" in lower:
        return _android_model(ua)
    if "mac os" in lower or "macintosh" in lower:
        return "Mac"
    if "windows" in lower:
        return "Windows PC"
    return None


def _os(lower: str) -> tuple[str, str | None]:
    if "iphone" in lower or "ipad" in lower:
        return "iOS", (_search(r"os (\d+[\d_]*) like mac", lower) or "").replace("_", ".") or None
    if "windows" in lower:
        # NT numbering stopped tracking the marketing name at 10
        nt = _search(r"windows nt ([\d.]+)", lower)
        return "Windows", {"10.0": "10+", "6.3": "8.1", "6.2": "8", "6.1": "7"}.get(nt or "", nt)
    if "mac os" in lower or "macintosh" in lower:
        return "macOS", (_search(r"mac os x (\d+[\d_.]*)", lower) or "").replace("_", ".") or None
    if "android" in lower:
        return "Android", _search(r"android ([\d.]+)", lower)
    if "linux" in lower:
        return "Linux", None
    return "Other", None


def _browser(lower: str) -> tuple[str, str | None]:
    for token, name, version_pattern in _BROWSERS:
        if token in lower:
            return name, _major(_search(version_pattern, lower))
    return "Other", None


def describe_user_agent(user_agent: str | None) -> UserAgentDescription:
    if not user_agent or user_agent.lower() == "unknown":
        return UNKNOWN
    ua = user_agent[:500]
    lower = ua.lower()

    if "ipad" in lower or "tablet" in lower:
        device_type = "tablet"
    elif "mobile" in lower or "iphone" in lower or "android" in lower:
        device_type = "mobile"
    else:
        device_type = "desktop"

    browser, browser_version = _browser(lower)
    operating_system, os_version = _os(lower)
    # "; wv)" is android's webview marker; an apple engine with no browser token
    # is a native wrapper (this is how the telegram clients embed the mini app)
    in_app = "; wv)" in lower or "telegram" in lower or (
        "applewebkit" in lower and browser == "Other"
    )
    return UserAgentDescription(
        device_type=device_type,
        device_model=_device_model(ua, lower),
        browser=browser,
        browser_version=browser_version,
        operating_system=operating_system,
        os_version=os_version,
        in_app=in_app,
    )


def build_session_metadata(user_agent: str | None, ip: str | None, secret: str) -> SessionMetadata:
    ua = (user_agent or "unknown")[:500]
    description = describe_user_agent(ua)
    ip_hash = hashlib.sha256(f"{secret}:{ip or 'unknown'}".encode()).hexdigest()
    return SessionMetadata(
        ua,
        description.device_type,
        description.browser,
        description.operating_system,
        ip_hash,
    )
