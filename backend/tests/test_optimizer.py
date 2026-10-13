import itertools
import random

import httpx
import pytest

from routely.models import Stop
from routely.services.distance import HaversineDistanceService, path_length_km
from routely.services.optimizer import (
    NearestNeighbourTwoOptOptimizer,
    nearest_neighbour_order,
    two_opt,
)

distances = HaversineDistanceService()
optimizer = NearestNeighbourTwoOptOptimizer(distances)


def stop(id: str, lat: float, lng: float) -> Stop:
    return Stop(id=id, name=id, lat=lat, lng=lng)


def line_stops(*positions: float) -> list[Stop]:
    """Stops along the equator at the given longitudes (ids are the letters a, b, c...)."""
    return [stop(chr(97 + i), 0.0, lng) for i, lng in enumerate(positions)]


def euclid(points: list[tuple[float, float]]) -> list[list[float]]:
    return [[((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5 for bx, by in points] for ax, ay in points]


# --- building blocks ---------------------------------------------------------


def test_nearest_neighbour_visits_every_stop_once() -> None:
    m = euclid([(0, 0), (5, 0), (1, 0), (9, 0)])
    order = nearest_neighbour_order(m, 0)
    assert order == [0, 2, 1, 3]
    assert sorted(order) == [0, 1, 2, 3]


def test_two_opt_removes_a_crossing() -> None:
    # Square corners visited in a bow-tie order: 0-2 and 1-3 cross.
    m = euclid([(0, 0), (1, 0), (1, 1), (0, 1)])
    crossing = [0, 2, 1, 3]
    fixed = two_opt(crossing, m)
    assert path_length_km(fixed, m) < path_length_km(crossing, m)
    assert path_length_km(fixed, m) == pytest.approx(3.0)


def test_two_opt_never_moves_a_fixed_start() -> None:
    rng = random.Random(1)
    pts = [(rng.random(), rng.random()) for _ in range(12)]
    m = euclid(pts)
    shuffled = list(range(12))
    rng.shuffle(shuffled)
    result = two_opt(shuffled, m, fixed_first=True)
    assert result[0] == shuffled[0]
    assert sorted(result) == list(range(12))
    assert path_length_km(result, m) <= path_length_km(shuffled, m) + 1e-9


def test_two_opt_can_reverse_the_tail_of_an_open_path() -> None:
    # Points sit at x = 0, 1, 3, 2; visiting 0,1,2,3 overshoots to x=3 then doubles back.
    # Reversing the tail (indices 2..3) gives the optimal 0,1,3,2.
    m = euclid([(0, 0), (1, 0), (3, 0), (2, 0)])
    assert two_opt([0, 1, 2, 3], m, fixed_first=True) == [0, 1, 3, 2]


# --- service -----------------------------------------------------------------


def test_scrambled_line_is_sorted() -> None:
    stops = line_stops(0, 3, 1, 4, 2)  # a=0 b=3 c=1 d=4 e=2 along the equator
    result = optimizer.optimize(stops)
    positions = {s.id: s.lng for s in stops}
    ordered = [positions[i] for i in result.order]
    assert ordered in ([0, 1, 2, 3, 4], [4, 3, 2, 1, 0])
    assert result.new_total_km < result.original_total_km
    assert result.km_saved == pytest.approx(result.original_total_km - result.new_total_km)


def test_already_optimal_order_is_kept() -> None:
    stops = line_stops(0, 1, 2, 3)
    result = optimizer.optimize(stops)
    assert result.order == ["a", "b", "c", "d"]
    assert result.km_saved == pytest.approx(0)


def test_fixed_start_is_first() -> None:
    stops = line_stops(0, 3, 1, 4, 2)
    result = optimizer.optimize(stops, start_id="c")  # c is at lng 1
    assert result.order[0] == "c"
    assert sorted(result.order) == ["a", "b", "c", "d", "e"]


def test_fixed_start_equal_to_first_never_worse_than_original() -> None:
    stops = line_stops(0, 3, 1, 4, 2)
    result = optimizer.optimize(stops, start_id="a")
    assert result.order[0] == "a"
    assert result.new_total_km <= result.original_total_km + 1e-9


def test_two_stops_are_a_no_op() -> None:
    result = optimizer.optimize(line_stops(0, 5))
    assert result.order == ["a", "b"]
    assert result.km_saved == pytest.approx(0)


def random_stops(rng: random.Random, n: int) -> list[Stop]:
    return [stop(f"s{i}", rng.uniform(-50, 60), rng.uniform(-100, 100)) for i in range(n)]


@pytest.mark.parametrize("seed", range(25))
def test_property_valid_never_worse_and_close_to_optimal(seed: int) -> None:
    rng = random.Random(seed)
    stops = random_stops(rng, rng.randint(3, 7))
    result = optimizer.optimize(stops)
    assert sorted(result.order) == sorted(s.id for s in stops)
    assert result.new_total_km <= result.original_total_km + 1e-6

    m = distances.matrix(stops)
    optimum = min(path_length_km(p, m) for p in itertools.permutations(range(len(stops))))
    assert result.new_total_km >= optimum - 1e-6
    assert result.new_total_km <= optimum * 1.10 + 1e-6


@pytest.mark.parametrize("seed", range(10))
def test_property_fixed_start_respected_at_scale(seed: int) -> None:
    rng = random.Random(100 + seed)
    stops = random_stops(rng, 25)
    start = rng.choice(stops).id
    result = optimizer.optimize(stops, start_id=start)
    assert result.order[0] == start
    assert sorted(result.order) == sorted(s.id for s in stops)


# --- API ---------------------------------------------------------------------


def wire(stops: list[Stop]) -> list[dict]:
    return [s.model_dump() for s in stops]


async def test_optimize_endpoint(client: httpx.AsyncClient) -> None:
    stops = line_stops(0, 3, 1, 4, 2)
    r = await client.post("/optimize", json={"stops": wire(stops)})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"order", "original_total_km", "new_total_km", "km_saved"}
    assert sorted(body["order"]) == ["a", "b", "c", "d", "e"]
    assert body["km_saved"] > 0
    assert body["km_saved"] == pytest.approx(
        body["original_total_km"] - body["new_total_km"], abs=0.002
    )


async def test_optimize_endpoint_fixed_start(client: httpx.AsyncClient) -> None:
    r = await client.post(
        "/optimize", json={"stops": wire(line_stops(0, 3, 1, 4, 2)), "start_id": "d"}
    )
    assert r.status_code == 200
    assert r.json()["order"][0] == "d"


@pytest.mark.parametrize(
    "payload",
    [
        {"stops": wire(line_stops(0))},
        {"stops": wire(line_stops(0, 1)), "start_id": "zzz"},
        {"stops": wire(line_stops(*range(26)))},
        {"stops": [{"id": "a", "name": "a", "lat": 100, "lng": 0}, {"id": "b", "name": "b", "lat": 0, "lng": 0}]},
    ],
)
async def test_optimize_validation(client: httpx.AsyncClient, payload: dict) -> None:
    r = await client.post("/optimize", json=payload)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
