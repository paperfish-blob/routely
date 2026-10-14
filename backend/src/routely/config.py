from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ROUTELY_", env_file=".env", extra="ignore"
    )

    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "Routely/0.1 (set contact email in .env)"
    geocode_min_interval_s: float = 1.0
    geocode_cache_ttl_s: float = 86_400
    geocode_cache_max_entries: int = 1000

    # The public demo server (router.project-osrm.org) only serves the car profile
    # and ignores the profile in the URL, so walking needs its own foot-profile instance.
    osrm_base_url: str = "https://router.project-osrm.org"
    osrm_walking_base_url: str = "https://routing.openstreetmap.de/routed-foot"
    osrm_timeout_s: float = 8.0

    open_meteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"
    weather_timeout_s: float = 8.0
    weather_forecast_ttl_s: float = 3_600
    weather_history_ttl_s: float = 86_400
    weather_cache_max_entries: int = 500

    cluster_threshold_km: float = 5.0
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
