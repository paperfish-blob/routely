import httpx
import pytest
from fastapi import FastAPI

from routely.deps import get_routing
from routely.models import RouteMode, Stop
from routely.services.routing import (
    HaversineRoutingService,
    OsrmRoutingService,
    RoutingService,
)

PARIS = {"id": "p", "name": "Paris", "lat": 48.8566, "lng": 2.3522}
LYON = {"id": "l", "name": "Lyon", "lat": 45.764, "lng": 4.8357}
NICE = {"id": "n", "name": "Nice", "lat": 43.7102, "lng": 7.262}
STOPS = [Stop(**PARIS), Stop(**LYON), Stop(**NICE)]

OSRM_OK = {
    "code": "Ok",
    "routes": [
        {
            "distance": 930_000.0,
            "duration": 33_000.0,
            "geometry": {
                "type": "LineString",
                "coordinates": [[2.35, 48.85], [3.0, 47.0], [4.83, 45.76], [7.26, 43.71]],
            },
            "legs": [
                {"distance": 465_000.0, "duration": 16_000.0},
                {"distance": 465_000.0, "duration": 17_000.0},
            ],
        }
    ],
}


def make_service(handler) -> tuple[OsrmRoutingService, list[httpx.Request]]:  # noqa: ANN001
    seen: list[httpx.Request] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(wrapped))
    service = OsrmRoutingService(
        client,
        {"driving": "https://car.test", "walking": "https://foot.test/"},
        timeout_s=1,
    )
    return service, seen


# --- OSRM implementation ----------------------------------------------------


async def test_osrm_success_parses_route() -> None:
    service, seen = make_service(lambda _: httpx.Response(200, json=OSRM_OK))
    result = await service.route(STOPS, "driving")
    assert result.fallback is False and result.fallback_reason is None
    assert result.distance_km == pytest.approx(930)
    assert result.duration_s == 33_000
    assert [(leg.from_id, leg.to_id) for leg in result.legs] == [("p", "l"), ("l", "n")]
    assert result.geometry.coordinates[0] == (2.35, 48.85)
    assert "2.3522,48.8566;4.8357,45.764;7.262,43.7102" in str(seen[0].url)
    assert seen[0].url.params["geometries"] == "geojson"


@pytest.mark.parametrize(
    ("mode", "host"), [("driving", "car.test"), ("walking", "foot.test")]
)
async def test_osrm_uses_base_url_per_mode(mode: RouteMode, host: str) -> None:
    service, seen = make_service(lambda _: httpx.Response(200, json=OSRM_OK))
    result = await service.route(STOPS, mode)
    assert seen[0].url.host == host
    assert result.mode == mode


@pytest.mark.parametrize(
    ("handler", "reason"),
    [
        (lambda _: httpx.Response(503), "router_unreachable"),
        (lambda _: httpx.Response(200, content=b"not json"), "router_bad_response"),
        (lambda _: httpx.Response(200, json={"code": "NoRoute"}), "no_route"),
        (lambda _: httpx.Response(200, json={"code": "InvalidQuery"}), "router_error"),
        (lambda _: httpx.Response(200, json={"code": "Ok", "routes": []}), "router_bad_response"),
        (
            lambda _: httpx.Response(
                200, json={"code": "Ok", "routes": [{**OSRM_OK["routes"][0], "legs": []}]}
            ),
            "router_bad_response",
        ),
    ],
)
async def test_osrm_failures_fall_back_to_straight_line(handler, reason: str) -> None:  # noqa: ANN001
    service, _ = make_service(handler)
    result = await service.route(STOPS, "driving")
    assert result.fallback is True
    assert result.fallback_reason == reason
    assert result.geometry.coordinates == [(s.lng, s.lat) for s in STOPS]
    assert result.distance_km > 0


async def test_osrm_network_error_falls_back() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    service, _ = make_service(boom)
    result = await service.route(STOPS, "walking")
    assert result.fallback is True
    assert result.fallback_reason == "router_unreachable"


async def test_haversine_fallback_estimates_duration_by_mode() -> None:
    driving = await HaversineRoutingService().route(STOPS, "driving")
    walking = await HaversineRoutingService().route(STOPS, "walking")
    assert driving.distance_km == pytest.approx(walking.distance_km)
    assert walking.duration_s == pytest.approx(driving.duration_s * 10)
    assert sum(leg.distance_km for leg in driving.legs) == pytest.approx(driving.distance_km)


# --- API ---------------------------------------------------------------------


class FakeRouting(RoutingService):
    def __init__(self, fallback: bool = False) -> None:
        self.fallback = fallback
        self.calls: list[tuple[list[str], RouteMode]] = []

    async def route(self, stops, mode):  # noqa: ANN001, ANN201
        self.calls.append(([s.id for s in stops], mode))
        result = HaversineRoutingService.build(stops, mode, "x")
        result.fallback = self.fallback
        result.fallback_reason = "router_unreachable" if self.fallback else None
        return result


async def test_route_endpoint(app: FastAPI, client: httpx.AsyncClient) -> None:
    fake = FakeRouting()
    app.dependency_overrides[get_routing] = lambda: fake
    r = await client.post("/route", json={"stops": [PARIS, LYON], "mode": "walking"})
    assert r.status_code == 200
    body = r.json()
    assert fake.calls == [(["p", "l"], "walking")]
    assert body["mode"] == "walking"
    assert body["geometry"]["type"] == "LineString"
    assert body["geometry"]["coordinates"][0] == [2.3522, 48.8566]
    assert body["fallback"] is False
    assert body["distance_km"] > 0 and body["duration_s"] > 0
    assert len(body["legs"]) == 1


async def test_route_endpoint_reports_fallback(app: FastAPI, client: httpx.AsyncClient) -> None:
    app.dependency_overrides[get_routing] = lambda: FakeRouting(fallback=True)
    r = await client.post("/route", json={"stops": [PARIS, LYON]})
    body = r.json()
    assert body["mode"] == "driving"  # default
    assert body["fallback"] is True
    assert body["fallback_reason"] == "router_unreachable"


@pytest.mark.parametrize(
    "payload",
    [
        {"stops": [PARIS], "mode": "driving"},
        {"stops": [PARIS, LYON], "mode": "flying"},
        {"stops": [PARIS, {**LYON, "lat": 99}], "mode": "driving"},
        {"stops": [{**PARIS, "id": str(i)} for i in range(26)], "mode": "driving"},
    ],
)
async def test_route_validation(client: httpx.AsyncClient, payload: dict) -> None:
    r = await client.post("/route", json=payload)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
