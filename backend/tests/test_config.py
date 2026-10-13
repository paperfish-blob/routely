from routely.config import Settings


def test_defaults_match_spec() -> None:
    s = Settings(_env_file=None)
    assert s.nominatim_user_agent == "Routely/0.1 (set contact email in .env)"
    assert s.cluster_threshold_km == 5.0
    assert s.geocode_min_interval_s == 1.0
    assert "http://localhost:5173" in s.cors_origins


def test_env_prefix_overrides(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("ROUTELY_NOMINATIM_USER_AGENT", "Routely/9 (me@example.com)")
    monkeypatch.setenv("ROUTELY_CLUSTER_THRESHOLD_KM", "12.5")
    monkeypatch.setenv("ROUTELY_CORS_ORIGINS", '["https://app.example.com"]')
    s = Settings(_env_file=None)
    assert s.nominatim_user_agent == "Routely/9 (me@example.com)"
    assert s.cluster_threshold_km == 12.5
    assert s.cors_origins == ["https://app.example.com"]
