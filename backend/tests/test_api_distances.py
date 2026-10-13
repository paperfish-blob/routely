import httpx
import pytest

PARIS = {"id": "p", "name": "Paris", "lat": 48.8566, "lng": 2.3522}
LONDON = {"id": "l", "name": "London", "lat": 51.5074, "lng": -0.1278}
NEAR_PARIS = {"id": "n", "name": "Near Paris", "lat": 48.86, "lng": 2.36}


async def test_distances_happy_path(client: httpx.AsyncClient) -> None:
    r = await client.post("/distances", json={"stops": [PARIS, LONDON, NEAR_PARIS]})
    assert r.status_code == 200
    body = r.json()
    assert body["stop_ids"] == ["p", "l", "n"]
    assert len(body["matrix_km"]) == 3
    assert body["matrix_km"][0][0] == 0
    assert [(x["from_id"], x["to_id"]) for x in body["legs"]] == [("p", "l"), ("l", "n")]
    assert body["total_km"] == pytest.approx(sum(x["distance_km"] for x in body["legs"]), abs=0.01)
    assert {n["stop_id"]: n["nearest_id"] for n in body["nearest"]}["p"] == "n"
    assert body["cluster_threshold_km"] == 5.0
    assert [c["stop_ids"] for c in body["clusters"]] == [["p", "n"], ["l"]]


async def test_custom_cluster_threshold(client: httpx.AsyncClient) -> None:
    r = await client.post(
        "/distances", json={"stops": [PARIS, LONDON], "cluster_threshold_km": 500}
    )
    body = r.json()
    assert body["cluster_threshold_km"] == 500
    assert len(body["clusters"]) == 1


@pytest.mark.parametrize(
    "stops",
    [
        [],
        [PARIS],
        [PARIS, {**LONDON, "lat": 91}],
        [PARIS, {**LONDON, "lat": -91}],
        [PARIS, {**LONDON, "lng": 181}],
        [PARIS, {**LONDON, "lng": -181}],
        [PARIS, {**LONDON, "id": "p"}],  # duplicate id
        [PARIS, {**LONDON, "id": ""}],
        [PARIS, {"id": "x", "name": "x"}],  # missing coords
        [{**PARIS, "id": str(i)} for i in range(26)],
    ],
)
async def test_distances_validation(client: httpx.AsyncClient, stops: list[dict]) -> None:
    r = await client.post("/distances", json={"stops": stops})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error"
    assert err["details"]


async def test_max_25_stops_ok(client: httpx.AsyncClient) -> None:
    stops = [{**PARIS, "id": str(i), "lat": i} for i in range(25)]
    r = await client.post("/distances", json={"stops": stops})
    assert r.status_code == 200


@pytest.mark.parametrize("threshold", [0, -1])
async def test_bad_threshold(client: httpx.AsyncClient, threshold: float) -> None:
    r = await client.post(
        "/distances", json={"stops": [PARIS, LONDON], "cluster_threshold_km": threshold}
    )
    assert r.status_code == 422
