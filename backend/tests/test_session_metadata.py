from app.core.security.session_metadata import build_session_metadata


def test_session_metadata_stores_only_hashed_ip_and_classifies_client() -> None:
    metadata = build_session_metadata(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        "203.0.113.10",
        "test-secret",
    )

    assert metadata.device_type == "mobile"
    assert metadata.browser == "Safari"
    assert metadata.operating_system == "iOS"
    assert metadata.ip_hash != "203.0.113.10"
    assert len(metadata.ip_hash) == 64


def test_session_ip_hash_is_keyed_and_deterministic() -> None:
    first = build_session_metadata("unknown", "203.0.113.10", "test-secret")
    second = build_session_metadata("unknown", "203.0.113.10", "test-secret")
    other_secret = build_session_metadata("unknown", "203.0.113.10", "other-secret")

    assert first.ip_hash == second.ip_hash
    assert first.ip_hash != other_secret.ip_hash
