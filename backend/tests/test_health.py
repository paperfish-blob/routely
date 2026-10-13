import httpx


async def test_health(client: httpx.AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_cors_allows_dev_origin(client: httpx.AsyncClient) -> None:
    r = await client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


async def test_unknown_route_is_structured(client: httpx.AsyncClient) -> None:
    r = await client.get("/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "http_error"
