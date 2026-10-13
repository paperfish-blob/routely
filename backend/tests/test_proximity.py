from routely.models import Stop
from routely.services.distance import HaversineDistanceService
from routely.services.proximity import SingleLinkageProximityService

svc = SingleLinkageProximityService(HaversineDistanceService())

# ~1.11 km per 0.01 deg of latitude
def s(id: str, lat: float) -> Stop:
    return Stop(id=id, name=id, lat=lat, lng=0.0)


def groups(stops: list[Stop], threshold: float) -> list[list[str]]:
    return [c.stop_ids for c in svc.cluster(stops, threshold)]


def test_all_far_apart_are_singletons() -> None:
    assert groups([s("a", 0), s("b", 10), s("c", 20)], 5) == [["a"], ["b"], ["c"]]


def test_close_points_group() -> None:
    assert groups([s("a", 0), s("b", 0.01), s("c", 10)], 5) == [["a", "b"], ["c"]]


def test_single_linkage_chains() -> None:
    # a-b 3.3 km, b-c 3.3 km, a-c 6.7 km: a and c join through b.
    assert groups([s("a", 0), s("b", 0.03), s("c", 0.06)], 5) == [["a", "b", "c"]]


def test_threshold_is_inclusive_and_configurable() -> None:
    stops = [s("a", 0), s("b", 0.03)]
    assert groups(stops, 3.0) == [["a"], ["b"]]
    assert groups(stops, 3.4) == [["a", "b"]]


def test_clusters_ordered_by_first_member_in_itinerary_order() -> None:
    stops = [s("a", 0), s("b", 10), s("c", 0.01), s("d", 10.01)]
    result = svc.cluster(stops, 5)
    assert [c.stop_ids for c in result] == [["a", "c"], ["b", "d"]]
    assert [c.id for c in result] == [0, 1]
