import asyncio
import re
import time
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable

import httpx

from routely.errors import RoutelyError, UpstreamError
from routely.models import GeocodeCandidate
from routely.services.cache import GeocodeCache

MAX_CANDIDATES = 5


class GeocodingService(ABC):
    @abstractmethod
    async def search(self, query: str) -> list[GeocodeCandidate]:
        """Return up to MAX_CANDIDATES matches for a free-text query."""


class RateLimiter:
    """Serialises callers so successive calls start >= min_interval_s apart."""

    def __init__(
        self,
        min_interval_s: float,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._min_interval_s = min_interval_s
        self._clock = clock
        self._sleep = sleep
        self._lock = asyncio.Lock()
        self._last_start: float | None = None

    async def wait(self) -> None:
        async with self._lock:
            if self._last_start is not None:
                remaining = self._min_interval_s - (self._clock() - self._last_start)
                if remaining > 0:
                    await self._sleep(remaining)
            self._last_start = self._clock()


def normalize_query(query: str) -> str:
    return re.sub(r"\s+", " ", query.strip()).casefold()


def parse_nominatim(payload: object) -> list[GeocodeCandidate]:
    if not isinstance(payload, list):
        raise UpstreamError("Unexpected geocoder response")
    results: list[GeocodeCandidate] = []
    for item in payload[:MAX_CANDIDATES]:
        try:
            results.append(
                GeocodeCandidate(
                    display_name=item["display_name"],
                    lat=float(item["lat"]),
                    lng=float(item["lon"]),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise UpstreamError("Malformed geocoder result") from exc
    return results


class NominatimGeocoder(GeocodingService):
    def __init__(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        user_agent: str,
        cache: GeocodeCache,
        limiter: RateLimiter,
    ) -> None:
        self._client = client
        self._base_url = base_url.rstrip("/")
        self._user_agent = user_agent
        self._cache = cache
        self._limiter = limiter

    async def search(self, query: str) -> list[GeocodeCandidate]:
        key = normalize_query(query)
        cached = await self._cache.get(key)
        if cached is not None:
            return cached
        results = await self._fetch(query.strip())
        await self._cache.set(key, results)
        return results

    async def _fetch(self, query: str) -> list[GeocodeCandidate]:
        await self._limiter.wait()
        try:
            response = await self._client.get(
                f"{self._base_url}/search",
                params={"q": query, "format": "jsonv2", "limit": MAX_CANDIDATES},
                headers={"User-Agent": self._user_agent},
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise RoutelyError(
                    "rate_limited",
                    "Too many searches, try again in a moment.",
                    status_code=429,
                ) from exc
            raise UpstreamError("Geocoding provider unavailable") from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise UpstreamError("Geocoding provider unavailable") from exc
        return parse_nominatim(payload)
