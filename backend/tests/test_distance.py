import pytest

from routely.models import Stop
from routely.services.distance import HaversineDistanceService, haversine_km

svc = HaversineDistanceService()


def stop(id: str, lat: float, lng: float) -> Stop:
    return Stop(id=id, name=id, lat=lat, lng=lng)


PARIS = stop("paris", 48.8566, 2.3522)
LONDON = stop("london", 51.5074, -0.1278)
BERLIN = stop("berlin", 52.5200, 13.4050)


def test_haversine_zero() -> None:
    assert haversine_km(10, 20, 10, 20) == 0


def test_haversine_known_distance() -> None:
    # Paris -> London is ~343.5 km great-circle
    assert haversine_km(PARIS.lat, PARIS.lng, LONDON.lat, LONDON.lng) == pytest.approx(343.5, abs=1.0)


def test_haversine_symmetric() -> None:
    assert haversine_km(1, 2, 3, 4) == pytest.approx(haversine_km(3, 4, 1, 2))


def test_haversine_quarter_meridian() -> None:
    # pole to equator ~ 10,007.5 km
    assert haversine_km(90, 0, 0, 0) == pytest.approx(10007.5, abs=1.0)


def test_haversine_antimeridian() -> None:
    near = haversine_km(0, 179.5, 0, -179.5)
    assert near == pytest.approx(haversine_km(0, 0, 0, 1), rel=1e-6)


def test_matrix_symmetric_zero_diagonal() -> None:
    m = svc.matrix([PARIS, LONDON, BERLIN])
    for i in range(3):
        assert m[i][i] == 0
        for j in range(3):
            assert m[i][j] == pytest.approx(m[j][i])


def test_legs_follow_order_and_total() -> None:
    stops = [PARIS, BERLIN, LONDON]
    legs = svc.legs(stops)
    assert [(leg.from_id, leg.to_id) for leg in legs] == [
        ("paris", "berlin"),
        ("berlin", "london"),
    ]
    assert svc.total_km(stops) == pytest.approx(sum(leg.distance_km for leg in legs))


def test_nearest_neighbours() -> None:
    nn = {n.stop_id: n.nearest_id for n in svc.nearest_neighbours([PARIS, LONDON, BERLIN])}
    assert nn == {"paris": "london", "london": "paris", "berlin": "paris"}


def test_nearest_duplicate_coordinates() -> None:
    a, b = stop("a", 1, 1), stop("b", 1, 1)
    nn = svc.nearest_neighbours([a, b, stop("c", 5, 5)])
    assert nn[0].nearest_id == "b" and nn[0].distance_km == 0
