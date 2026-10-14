from datetime import UTC, date, datetime

import httpx
import pytest
from fastapi import FastAPI

from routely.deps import get_weather
from routely.errors import RoutelyError
from routely.services.weather import OpenMeteoWeatherService, WeatherService

TODAY = date(2026, 10, 14)
NOW = datetime(2026, 10, 14, 6, 0, tzinfo=UTC)
FORECAST_URL = "https://forecast.test/v1/forecast"
ARCHIVE_URL = "https://archive.test/v1/archive"


def hourly(temp: float = 26.0, wet_hours: range = range(13, 19)) -> dict:
    return {
        "time": [f"2026-10-25T{h:02d}:00" for h in range(24)],
        "temperature_2m": [temp + (4 if 12 <= h < 18 else 0) for h in range(24)],
        "precipitation_probability": [80 if h in wet_hours else 10 for h in range(24)],
    }


def payload(code: int = 95, **daily: object) -> dict:
    base = {
        "weather_code": [code],
        "temperature_2m_max": [30.4],
        "temperature_2m_min": [24.1],
        "precipitation_sum": [12.0],
        "wind_speed_10m_max": [14.2],
        "precipitation_probability_max": [75],
        "uv_index_max": [7.3],
    }
    base.update({k: v for k, v in daily.items()})
    return {"daily": base, "hourly": hourly()}


def make(handler) -> tuple[OpenMeteoWeatherService, list[httpx.Request]]:  # noqa: ANN001
    seen: list[httpx.Request] = []
    ticks = [0.0]

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    service = OpenMeteoWeatherService(
        httpx.AsyncClient(transport=httpx.MockTransport(wrapped)),
        FORECAST_URL,
        ARCHIVE_URL,
        forecast_ttl_s=100,
        history_ttl_s=1000,
        clock=lambda: ticks[0],
        today=lambda: TODAY,
        now=lambda: NOW,
    )
    service.ticks = ticks  # type: ignore[attr-defined]
    return service, seen


async def test_forecast_parses_daily_and_periods() -> None:
    service, seen = make(lambda r: httpx.Response(200, json=payload()))
    w = await service.get(3.1390, 101.6869, date(2026, 10, 25))
    assert w.source == "forecast"
    assert (w.icon, w.summary) == ("storm", "Thunderstorms likely")
    assert (w.temp_max_c, w.temp_min_c, w.rain_chance, w.rain_mm) == (30.4, 24.1, 75, 12.0)
    assert (w.wind_kmh, w.uv_index) == (14.2, 7.3)
    assert [p.name for p in w.periods] == ["morning", "afternoon", "evening", "night"]
    afternoon = w.periods[1]
    assert afternoon.temp_c == 30 and afternoon.rain_chance == 80
    assert w.periods[0].rain_chance == 10
    assert seen[0].url.host == "forecast.test"
    assert seen[0].url.params["latitude"] == "3.14"  # rounded before leaving the server
    assert seen[0].url.params["start_date"] == "2026-10-25"
    assert seen[0].url.params["timezone"] == "auto"


async def test_today_and_fifteen_days_ahead_are_forecasts() -> None:
    service, _ = make(lambda r: httpx.Response(200, json=payload(code=3)))
    assert (await service.get(1, 1, TODAY)).source == "forecast"
    assert (await service.get(1, 1, date(2026, 10, 29))).source == "forecast"


async def test_recent_past_is_recorded_from_forecast_api() -> None:
    service, seen = make(lambda r: httpx.Response(200, json=payload(code=1)))
    w = await service.get(1, 1, date(2026, 10, 5))
    assert w.source == "recorded"
    assert (w.icon, w.summary) == ("sun", "Mostly clear")
    assert seen[0].url.host == "forecast.test"
    # the forecast API still returns chances for past days; they are meaningless there
    assert w.rain_chance is None and w.uv_index is None
    assert w.periods and all(p.rain_chance is None for p in w.periods)


async def test_old_past_uses_archive_without_rain_chance() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "archive.test"
        assert "precipitation_probability" not in str(request.url)
        data = payload(code=63)
        data["daily"].pop("precipitation_probability_max")
        data["daily"].pop("uv_index_max")
        data["hourly"].pop("precipitation_probability")
        return httpx.Response(200, json=data)

    service, _ = make(handler)
    w = await service.get(1, 1, date(2025, 1, 5))
    assert w.source == "recorded" and w.rain_chance is None and w.uv_index is None
    assert all(p.rain_chance is None for p in w.periods)


async def test_far_future_is_typical_average_of_past_years() -> None:
    wet_by_year = {2025: 12.0, 2024: 0.0, 2023: 5.0, 2022: 0.2, 2021: 8.0}

    def handler(request: httpx.Request) -> httpx.Response:
        year = int(request.url.params["start_date"][:4])
        data = payload(code=3, precipitation_sum=[wet_by_year[year]])
        data["daily"]["temperature_2m_max"] = [31.0]
        data["daily"]["temperature_2m_min"] = [24.0]
        return httpx.Response(200, json=data)

    service, seen = make(handler)
    w = await service.get(1, 1, date(2026, 11, 14))
    assert w.source == "typical" and w.years == 5
    assert w.wet_day_share == 0.6 and w.summary == "Showers are common"
    assert (w.temp_max_c, w.temp_min_c) == (31.0, 24.0)
    assert w.rain_mm == 5.0
    assert w.rain_chance is None and w.periods == []
    assert {r.url.params["start_date"] for r in seen} == {
        f"{y}-11-14" for y in wet_by_year
    }


async def test_results_are_cached_until_ttl_expires() -> None:
    service, seen = make(lambda r: httpx.Response(200, json=payload()))
    day = date(2026, 10, 25)
    await service.get(3.139, 101.687, day)
    await service.get(3.1391, 101.6869, day)  # same ~1 km cell
    assert len(seen) == 1
    service.ticks[0] = 101  # type: ignore[attr-defined]
    await service.get(3.139, 101.687, day)
    assert len(seen) == 2


@pytest.mark.parametrize(
    "handler",
    [
        lambda r: httpx.Response(500),
        lambda r: httpx.Response(429, json={"reason": "limit"}),
        lambda r: httpx.Response(200, text="not json"),
        lambda r: httpx.Response(200, json={"daily": {}}),
        lambda r: httpx.Response(200, json=[1, 2]),
    ],
)
async def test_upstream_problems_become_weather_unavailable(handler) -> None:  # noqa: ANN001
    service, _ = make(handler)
    with pytest.raises(RoutelyError) as exc:
        await service.get(1, 1, date(2026, 10, 25))
    assert exc.value.code == "weather_unavailable" and exc.value.status_code == 502


class FakeWeather(WeatherService):
    async def get(self, lat: float, lng: float, day: date):  # noqa: ANN201
        service, _ = make(lambda r: httpx.Response(200, json=payload()))
        return await service.get(lat, lng, day)


@pytest.fixture
def stubbed(app: FastAPI) -> FastAPI:
    app.dependency_overrides[get_weather] = lambda: FakeWeather()
    return app


async def test_endpoint_returns_weather(stubbed: FastAPI, client: httpx.AsyncClient) -> None:
    r = await client.get("/weather", params={"lat": 3.1, "lng": 101.7, "date": "2026-10-25"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "forecast" and body["summary"] == "Thunderstorms likely"
    assert body["attribution"] == "Weather by Open-Meteo.com"


@pytest.mark.parametrize(
    "params",
    [
        {"lat": 91, "lng": 0, "date": "2026-10-25"},
        {"lat": 0, "lng": 181, "date": "2026-10-25"},
        {"lat": 0, "lng": 0, "date": "yesterday"},
        {"lat": 0, "lng": 0, "date": "1900-01-01"},
        {"lat": 0, "lng": 0},
    ],
)
async def test_endpoint_validates_input(
    stubbed: FastAPI, client: httpx.AsyncClient, params: dict
) -> None:
    r = await client.get("/weather", params=params)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
