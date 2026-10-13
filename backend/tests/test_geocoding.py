import httpx
import pytest
from fastapi import FastAPI

from routely.deps import get_geocoder
from routely.errors import UpstreamError
from routely.models import GeocodeCandidate
from routely.services.cache import InMemoryGeocodeCache
from routely.services.geocoding import (
    GeocodingService,
    NominatimGeocoder,
    RateLimiter,
)

PARIS = GeocodeCandidate(display_name="Paris, France", lat=48.85, lng=2.35)


class FakeGeocoder(GeocodingService):
    def __init__(self, results: list[GeocodeCandidate] | Exception) -> None:
        self.results = results
        self.queries: list[str] = []

    async def search(self, query: str) -> list[GeocodeCandidate]:
        self.queries.append(query)
        if isinstance(self.results, Exception):
            raise self.results
        return self.results


# --- API -------------------------------------------------------------------


async def test_geocode_endpoint(app: FastAPI, client: httpx.AsyncClient) -> None:
    fake = FakeGeocoder([PARIS])
    app.dependency_overrides[get_geocoder] = lambda: fake
    r = await client.get("/geocode", params={"q": "  paris "})
    assert r.status_code == 200
    assert r.json() == {
        "query": "paris",
        "results": [{"display_name": "Paris, France", "lat": 48.85, "lng": 2.35}],
    }
    assert fake.queries == ["paris"]


@pytest.mark.parametrize("params", [{}, {"q": ""}, {"q": "   "}, {"q": "x" * 201}])
async def test_geocode_rejects_bad_query(
    client: httpx.AsyncClient, params: dict[str, str]
) -> None:
    r = await client.get("/geocode", params=params)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


async def test_geocode_upstream_failure_is_502(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    app.dependency_overrides[get_geocoder] = lambda: FakeGeocoder(UpstreamError("down"))
    r = await client.get("/geocode", params={"q": "paris"})
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "upstream_error"


# --- Nominatim implementation ---------------------------------------------


def make_geocoder(
    handler: httpx.MockTransport | None = None, cache: InMemoryGeocodeCache | None = None
) -> tuple[NominatimGeocoder, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json=[{"display_name": "Paris, France", "lat": "48.85", "lon": "2.35"}],
        )

    client = httpx.AsyncClient(transport=handler or httpx.MockTransport(respond))
    geocoder = NominatimGeocoder(
        client,
        "https://nominatim.test/",
        "Routely/test",
        cache or InMemoryGeocodeCache(),
        RateLimiter(0),
    )
    return geocoder, seen


async def test_nominatim_sends_user_agent_and_parses() -> None:
    geocoder, seen = make_geocoder()
    results = await geocoder.search("Paris")
    assert results == [PARIS]
    assert seen[0].headers["user-agent"] == "Routely/test"
    assert seen[0].url.params["q"] == "Paris"
    assert seen[0].url.params["limit"] == "5"


async def test_nominatim_caches_normalised_queries() -> None:
    geocoder, seen = make_geocoder()
    await geocoder.search("Paris")
    await geocoder.search("  paris  ")
    assert len(seen) == 1


async def test_nominatim_http_error_becomes_upstream_error() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(503))
    geocoder, _ = make_geocoder(transport)
    with pytest.raises(UpstreamError):
        await geocoder.search("Paris")


async def test_nominatim_errors_are_not_cached() -> None:
    calls = 0

    def flaky(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(500)
        return httpx.Response(200, json=[])

    geocoder, _ = make_geocoder(httpx.MockTransport(flaky))
    with pytest.raises(UpstreamError):
        await geocoder.search("x")
    assert await geocoder.search("x") == []


async def test_nominatim_malformed_payload() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json=[{"nope": 1}]))
    geocoder, _ = make_geocoder(transport)
    with pytest.raises(UpstreamError):
        await geocoder.search("x")


# --- Cache -----------------------------------------------------------------


async def test_cache_ttl_expiry() -> None:
    now = [0.0]
    cache = InMemoryGeocodeCache(ttl_s=10, clock=lambda: now[0])
    await cache.set("a", [PARIS])
    assert await cache.get("a") == [PARIS]
    now[0] = 10.0
    assert await cache.get("a") is None


async def test_cache_lru_eviction() -> None:
    cache = InMemoryGeocodeCache(max_entries=2)
    await cache.set("a", [PARIS])
    await cache.set("b", [PARIS])
    await cache.get("a")  # refresh a
    await cache.set("c", [PARIS])
    assert await cache.get("b") is None
    assert await cache.get("a") is not None
    assert await cache.get("c") is not None


# --- Rate limiter ----------------------------------------------------------


async def test_rate_limiter_spaces_calls() -> None:
    now = [0.0]
    sleeps: list[float] = []

    async def fake_sleep(s: float) -> None:
        sleeps.append(s)
        now[0] += s

    limiter = RateLimiter(1.0, clock=lambda: now[0], sleep=fake_sleep)
    await limiter.wait()  # first call: no wait
    now[0] += 0.25
    await limiter.wait()  # must wait the remaining 0.75
    await limiter.wait()  # immediately again: full second
    assert sleeps == pytest.approx([0.75, 1.0])
