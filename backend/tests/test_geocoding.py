import httpx
import pytest
from fastapi import FastAPI

from routely.deps import get_geocoder
from routely.errors import RoutelyError, UpstreamError
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
        self.nears: list[tuple[float, float] | None] = []

    async def search(self, query, near=None):  # noqa: ANN001, ANN201
        self.queries.append(query)
        self.nears.append(near)
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


async def test_nominatim_429_becomes_rate_limited_error() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(429))
    geocoder, _ = make_geocoder(transport)
    with pytest.raises(RoutelyError) as exc:
        await geocoder.search("Paris")
    assert exc.value.code == "rate_limited"
    assert exc.value.status_code == 429


async def test_geocode_endpoint_surfaces_rate_limit(app: FastAPI, client: httpx.AsyncClient) -> None:
    app.dependency_overrides[get_geocoder] = lambda: FakeGeocoder(
        RoutelyError("rate_limited", "Too many searches, try again in a moment.", status_code=429)
    )
    r = await client.get("/geocode", params={"q": "paris"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"


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


# --- Proximity bias --------------------------------------------------------

from routely.services.geocoding import (  # noqa: E402
    BIASED_FETCH_LIMIT,
    rank_by_proximity,
    snap_hint,
    viewbox_for,
)

SF_UNION_SQUARE = GeocodeCandidate(display_name="Union Square, San Francisco, California", lat=37.788, lng=-122.4075)
NYC_UNION_SQUARE = GeocodeCandidate(display_name="Union Square, Manhattan, New York", lat=40.7359, lng=-73.9911)
OAKLAND = GeocodeCandidate(display_name="Union Square, Oakland, California", lat=37.8044, lng=-122.2712)
GOLDEN_GATE = (37.8199, -122.4783)


def test_rank_puts_nearby_first_closest_first_then_keeps_relevance_order() -> None:
    ranked = rank_by_proximity([NYC_UNION_SQUARE, OAKLAND, SF_UNION_SQUARE], GOLDEN_GATE)
    assert [c.display_name.split(",")[1].strip() for c in ranked] == ["San Francisco", "Oakland", "Manhattan"]


def test_rank_without_hint_keeps_order_and_limit() -> None:
    many = [SF_UNION_SQUARE] * 9
    assert rank_by_proximity(many, None) == many[:5]


def test_rank_far_results_keep_their_original_order() -> None:
    a = GeocodeCandidate(display_name="A", lat=48.0, lng=2.0)
    b = GeocodeCandidate(display_name="B", lat=35.0, lng=139.0)
    assert rank_by_proximity([a, b], GOLDEN_GATE) == [a, b]


def test_snap_and_viewbox() -> None:
    assert snap_hint((37.82, -122.48)) == (38.0, -122.0)
    left, top, right, bottom = (float(x) for x in viewbox_for((38.0, -122.0)).split(","))
    assert (left, top, right, bottom) == (-123.5, 39.5, -120.5, 36.5)


async def test_nominatim_biases_with_viewbox_and_reranks() -> None:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json=[
                {"display_name": c.display_name, "lat": str(c.lat), "lon": str(c.lng)}
                for c in (NYC_UNION_SQUARE, SF_UNION_SQUARE)
            ],
        )

    geocoder, _ = make_geocoder(httpx.MockTransport(respond))
    results = await geocoder.search("Union Square", near=GOLDEN_GATE)
    params = seen[0].url.params
    assert params["limit"] == str(BIASED_FETCH_LIMIT)
    assert params["bounded"] == "0"
    assert params["viewbox"] == "-123.5,39.5,-120.5,36.5"
    assert "San Francisco" in results[0].display_name

    # Without a hint: plain search, no viewbox, original relevance order.
    results = await geocoder.search("Union Square")
    assert "viewbox" not in seen[1].url.params
    assert seen[1].url.params["limit"] == "5"
    assert "Manhattan" in results[0].display_name


async def test_biased_and_plain_searches_are_cached_separately() -> None:
    geocoder, seen = make_geocoder()
    await geocoder.search("Paris")
    await geocoder.search("Paris", near=GOLDEN_GATE)
    await geocoder.search("Paris", near=(37.9, -122.3))  # same 1-degree cell: cache hit
    assert len(seen) == 2


async def test_geocode_endpoint_passes_the_hint(app: FastAPI, client: httpx.AsyncClient) -> None:
    fake = FakeGeocoder([PARIS])
    app.dependency_overrides[get_geocoder] = lambda: fake
    r = await client.get("/geocode", params={"q": "paris", "near_lat": 37.8, "near_lng": -122.4})
    assert r.status_code == 200
    assert fake.nears == [(37.8, -122.4)]
    await client.get("/geocode", params={"q": "paris"})
    assert fake.nears[-1] is None


@pytest.mark.parametrize(
    "params",
    [
        {"q": "x", "near_lat": 37.8},
        {"q": "x", "near_lng": -122.4},
        {"q": "x", "near_lat": 91, "near_lng": 0},
        {"q": "x", "near_lat": 0, "near_lng": 181},
    ],
)
async def test_geocode_endpoint_rejects_bad_hint(client: httpx.AsyncClient, params: dict) -> None:
    r = await client.get("/geocode", params=params)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
