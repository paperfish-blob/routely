import asyncio
import re
import time
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable

import httpx

from routely.errors import RoutelyError, UpstreamError
from routely.models import GeocodeCandidate
from routely.services.cache import GeocodeCache
from routely.services.distance import haversine_km

MAX_CANDIDATES = 5
# With a location hint we over-fetch, then re-rank, so local matches are not cut off.
BIASED_FETCH_LIMIT = 15
# Results this close to the hint are listed first (nearest first); the rest keep Nominatim's order.
NEARBY_KM = 150.0
# The hint is snapped to a grid so nearby searches share cache entries and the search area.
BIAS_GRID_DEG = 1.0
BIAS_HALF_WIDTH_DEG = 1.5

LatLng = tuple[float, float]


class GeocodingService(ABC):
    @abstractmethod
    async def search(
        self, query: str, near: LatLng | None = None
    ) -> list[GeocodeCandidate]:
        """Return up to MAX_CANDIDATES matches for a free-text query.

        `near` (lat, lng) is a location hint: matches close to it are preferred, so
        "Union Square" while planning San Francisco finds San Francisco's first.
        """


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


def snap_hint(near: LatLng) -> LatLng:
    """Round a location hint to the grid centre, keeping cache keys and viewboxes stable."""
    lat, lng = near
    return (
        round(lat / BIAS_GRID_DEG) * BIAS_GRID_DEG,
        round(lng / BIAS_GRID_DEG) * BIAS_GRID_DEG,
    )


def viewbox_for(near: LatLng) -> str:
    """Nominatim viewbox: left,top,right,bottom (lng/lat degrees)."""
    lat, lng = near
    h = BIAS_HALF_WIDTH_DEG
    return f"{lng - h},{lat + h},{lng + h},{lat - h}"


def rank_by_proximity(
    candidates: list[GeocodeCandidate], near: LatLng | None, limit: int = MAX_CANDIDATES
) -> list[GeocodeCandidate]:
    """Nearby results first (closest first), then the rest in their original relevance order."""
    if near is None:
        return candidates[:limit]
    dist = [haversine_km(near[0], near[1], c.lat, c.lng) for c in candidates]
    nearby = sorted(
        (i for i, d in enumerate(dist) if d <= NEARBY_KM), key=lambda i: (dist[i], i)
    )
    far = [i for i, d in enumerate(dist) if d > NEARBY_KM]
    return [candidates[i] for i in [*nearby, *far]][:limit]


def parse_nominatim(payload: object, limit: int = MAX_CANDIDATES) -> list[GeocodeCandidate]:
    if not isinstance(payload, list):
        raise UpstreamError("Unexpected geocoder response")
    results: list[GeocodeCandidate] = []
    for item in payload[:limit]:
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

    async def search(
        self, query: str, near: LatLng | None = None
    ) -> list[GeocodeCandidate]:
        snapped = snap_hint(near) if near else None
        key = normalize_query(query)
        if snapped:
            key = f"{key}@{snapped[0]:.1f},{snapped[1]:.1f}"
        cached = await self._cache.get(key)
        if cached is None:
            cached = await self._fetch(query.strip(), snapped)
            await self._cache.set(key, cached)
        # Re-rank against the exact hint; the cache holds the grid-level fetch.
        return rank_by_proximity(cached, near)

    async def _fetch(self, query: str, snapped: LatLng | None) -> list[GeocodeCandidate]:
        params: dict[str, str | int] = {"q": query, "format": "jsonv2", "limit": MAX_CANDIDATES}
        if snapped:
            params.update(limit=BIASED_FETCH_LIMIT, viewbox=viewbox_for(snapped), bounded=0)
        await self._limiter.wait()
        try:
            response = await self._client.get(
                f"{self._base_url}/search",
                params=params,
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
        return parse_nominatim(payload, limit=params["limit"])  # type: ignore[arg-type]
