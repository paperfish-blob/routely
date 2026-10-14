"""Daily weather from Open-Meteo (https://open-meteo.com, no API key).

Three sources, chosen by how far the date is from today:
- recorded: the date is in the past (forecast API for the last ~3 months, archive before that)
- forecast: today up to 15 days ahead
- typical: further ahead, averaged from the same calendar day in recent years
"""

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from collections import OrderedDict
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from routely.errors import RoutelyError
from routely.models import WeatherIcon, WeatherPeriod, WeatherResponse

logger = logging.getLogger(__name__)

FORECAST_DAYS = 16  # Open-Meteo serves today + 15 days
FORECAST_PAST_DAYS = 80  # the forecast API keeps ~92 days of history; stay clear of the edge
TYPICAL_YEARS = 5
WET_DAY_MM = 1.0

# (first hour, last hour exclusive) of each period of the day
PERIODS = {
    "morning": (6, 12),
    "afternoon": (12, 18),
    "evening": (18, 24),
    "night": (0, 6),
}

# WMO weather interpretation codes -> (icon, summary)
_WMO: dict[int, tuple[WeatherIcon, str]] = {
    0: ("sun", "Clear sky"),
    1: ("sun", "Mostly clear"),
    2: ("partly", "Partly cloudy"),
    3: ("cloudy", "Overcast"),
    45: ("fog", "Fog"),
    48: ("fog", "Freezing fog"),
    51: ("rain", "Light drizzle"),
    53: ("rain", "Drizzle"),
    55: ("rain", "Heavy drizzle"),
    56: ("rain", "Freezing drizzle"),
    57: ("rain", "Freezing drizzle"),
    61: ("rain", "Light rain"),
    63: ("rain", "Rain"),
    65: ("rain", "Heavy rain"),
    66: ("rain", "Freezing rain"),
    67: ("rain", "Freezing rain"),
    71: ("snow", "Light snow"),
    73: ("snow", "Snow"),
    75: ("snow", "Heavy snow"),
    77: ("snow", "Snow grains"),
    80: ("rain", "Light showers"),
    81: ("rain", "Showers"),
    82: ("rain", "Heavy showers"),
    85: ("snow", "Snow showers"),
    86: ("snow", "Heavy snow showers"),
    95: ("storm", "Thunderstorms"),
    96: ("storm", "Thunderstorms with hail"),
    99: ("storm", "Thunderstorms with hail"),
}


def describe_code(code: int, *, likely: bool = False) -> tuple[WeatherIcon, str]:
    icon, summary = _WMO.get(code, ("cloudy", "Cloudy"))
    if likely and icon in ("storm",):
        summary = f"{summary} likely"
    return icon, summary


class WeatherService(ABC):
    @abstractmethod
    async def get(self, lat: float, lng: float, day: date) -> WeatherResponse:
        """Weather for one day at one place."""


class _TtlCache:
    def __init__(self, max_entries: int, clock: Callable[[], float]) -> None:
        self._max = max_entries
        self._clock = clock
        self._data: OrderedDict[tuple, tuple[float, WeatherResponse]] = OrderedDict()

    def get(self, key: tuple) -> WeatherResponse | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if self._clock() >= expires_at:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return value

    def set(self, key: tuple, value: WeatherResponse, ttl_s: float) -> None:
        self._data[key] = (self._clock() + ttl_s, value)
        self._data.move_to_end(key)
        while len(self._data) > self._max:
            self._data.popitem(last=False)


def _utc_today() -> date:
    return datetime.now(UTC).date()


class OpenMeteoWeatherService(WeatherService):
    def __init__(
        self,
        client: httpx.AsyncClient,
        forecast_url: str,
        archive_url: str,
        *,
        timeout_s: float = 8.0,
        forecast_ttl_s: float = 3_600,
        history_ttl_s: float = 86_400,
        max_entries: int = 500,
        clock: Callable[[], float] = time.monotonic,
        today: Callable[[], date] = _utc_today,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._client = client
        self._forecast_url = forecast_url
        self._archive_url = archive_url
        self._timeout_s = timeout_s
        self._forecast_ttl_s = forecast_ttl_s
        self._history_ttl_s = history_ttl_s
        self._cache = _TtlCache(max_entries, clock)
        self._today = today
        self._now = now

    async def get(self, lat: float, lng: float, day: date) -> WeatherResponse:
        # ~1 km grid: nearby requests share a cache entry and we send coarser coordinates upstream.
        lat, lng = round(lat, 2), round(lng, 2)
        key = (lat, lng, day)
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        today = self._today()
        ahead = (day - today).days
        if ahead >= FORECAST_DAYS:
            result = await self._typical(lat, lng, day)
            ttl = self._history_ttl_s
        elif ahead >= -FORECAST_PAST_DAYS:
            result = await self._daily(self._forecast_url, lat, lng, day, "recorded" if ahead < 0 else "forecast")
            ttl = self._forecast_ttl_s if ahead >= 0 else self._history_ttl_s
        else:
            result = await self._daily(self._archive_url, lat, lng, day, "recorded")
            ttl = self._history_ttl_s
        self._cache.set(key, result, ttl)
        return result

    async def _request(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._client.get(url, params=params, timeout=self._timeout_s)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Open-Meteo request failed: %s", exc)
            raise RoutelyError(
                "weather_unavailable", "Weather is not available right now.", status_code=502
            ) from exc
        if not isinstance(payload, dict):
            raise RoutelyError(
                "weather_unavailable", "Weather is not available right now.", status_code=502
            )
        return payload

    async def _daily(
        self, url: str, lat: float, lng: float, day: date, source: str
    ) -> WeatherResponse:
        is_forecast = source == "forecast"
        recorded = source == "recorded"  # past days: a chance of rain no longer means anything
        daily = [
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "wind_speed_10m_max",
        ]
        hourly = ["temperature_2m"]
        if url == self._forecast_url:
            daily += ["precipitation_probability_max", "uv_index_max"]
            hourly += ["precipitation_probability"]
        payload = await self._request(
            url,
            {
                "latitude": lat,
                "longitude": lng,
                "start_date": day.isoformat(),
                "end_date": day.isoformat(),
                "daily": ",".join(daily),
                "hourly": ",".join(hourly),
                "timezone": "auto",
            },
        )
        try:
            d = payload["daily"]
            code = int(_first(d["weather_code"]))
            icon, summary = describe_code(code, likely=is_forecast)
            return WeatherResponse(
                date=day,
                lat=lat,
                lng=lng,
                source=source,  # type: ignore[arg-type]
                summary=summary,
                icon=icon,
                temp_max_c=round(float(_first(d["temperature_2m_max"])), 1),
                temp_min_c=round(float(_first(d["temperature_2m_min"])), 1),
                rain_chance=None if recorded else _opt_int(d.get("precipitation_probability_max")),
                rain_mm=round(float(_first(d["precipitation_sum"], 0.0)), 1),
                wind_kmh=_opt_float(d.get("wind_speed_10m_max")),
                uv_index=None if recorded else _opt_float(d.get("uv_index_max")),
                periods=_periods(payload.get("hourly") or {}, with_chance=not recorded),
                fetched_at=self._now(),
            )
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            logger.warning("Open-Meteo returned an unexpected shape: %s", exc)
            raise RoutelyError(
                "weather_unavailable", "Weather is not available right now.", status_code=502
            ) from exc

    async def _typical(self, lat: float, lng: float, day: date) -> WeatherResponse:
        today = self._today()
        years = [today.year - n for n in range(1, TYPICAL_YEARS + 1)]
        samples = await asyncio.gather(
            *(self._daily(self._archive_url, lat, lng, _same_day(day, y), "recorded") for y in years)
        )
        n = len(samples)
        wet = sum(1 for s in samples if s.rain_mm >= WET_DAY_MM)
        share = wet / n
        if share >= 0.5:
            icon, summary = "rain", "Showers are common"
        elif share >= 0.25:
            icon, summary = "partly", "Occasional showers"
        else:
            icon, summary = "sun", "Mostly dry"
        return WeatherResponse(
            date=day,
            lat=lat,
            lng=lng,
            source="typical",
            summary=summary,
            icon=icon,
            temp_max_c=round(sum(s.temp_max_c for s in samples) / n, 1),
            temp_min_c=round(sum(s.temp_min_c for s in samples) / n, 1),
            rain_mm=round(sum(s.rain_mm for s in samples) / n, 1),
            wind_kmh=None,
            wet_day_share=round(share, 2),
            years=n,
            fetched_at=self._now(),
        )


def _same_day(day: date, year: int) -> date:
    try:
        return day.replace(year=year)
    except ValueError:  # 29 Feb in a non-leap year
        return day.replace(year=year, day=28)


def _first(values: Any, default: Any = None) -> Any:
    value = values[0]
    if value is None:
        if default is None:
            raise ValueError("missing value")
        return default
    return value


def _opt_float(values: Any) -> float | None:
    if not values or values[0] is None:
        return None
    return round(float(values[0]), 1)


def _opt_int(values: Any) -> int | None:
    if not values or values[0] is None:
        return None
    return round(float(values[0]))


def _periods(hourly: dict[str, Any], with_chance: bool = True) -> list[WeatherPeriod]:
    temps = hourly.get("temperature_2m") or []
    probs = (hourly.get("precipitation_probability") or []) if with_chance else []
    if len(temps) < 24:
        return []
    out: list[WeatherPeriod] = []
    for name, (start, end) in PERIODS.items():
        t = [v for v in temps[start:end] if v is not None]
        if not t:
            continue
        p = [v for v in probs[start:end] if v is not None]
        out.append(
            WeatherPeriod(
                name=name,  # type: ignore[arg-type]
                temp_c=round(sum(t) / len(t)),
                rain_chance=round(max(p)) if p else None,
            )
        )
    return out
