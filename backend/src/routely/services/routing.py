import logging
from abc import ABC, abstractmethod
from collections.abc import Mapping, Sequence

import httpx

from routely.models import LineStringGeometry, RouteLeg, RouteMode, RouteResponse, Stop
from routely.services.distance import haversine_km

logger = logging.getLogger(__name__)

# Rough speeds used only for the straight-line fallback estimate.
FALLBACK_SPEED_KMH: dict[RouteMode, float] = {"driving": 50.0, "walking": 5.0}


class RoutingService(ABC):
    @abstractmethod
    async def route(self, stops: Sequence[Stop], mode: RouteMode) -> RouteResponse:
        """Route through the stops in order."""


class HaversineRoutingService(RoutingService):
    """Straight lines between stops. Always available; always flagged as fallback."""

    def __init__(self, reason: str = "straight_line") -> None:
        self._reason = reason

    async def route(self, stops: Sequence[Stop], mode: RouteMode) -> RouteResponse:
        return self.build(stops, mode, self._reason)

    @staticmethod
    def build(stops: Sequence[Stop], mode: RouteMode, reason: str) -> RouteResponse:
        speed = FALLBACK_SPEED_KMH[mode]
        legs = [
            RouteLeg(
                from_id=a.id,
                to_id=b.id,
                distance_km=(km := haversine_km(a.lat, a.lng, b.lat, b.lng)),
                duration_s=km / speed * 3600,
            )
            for a, b in zip(stops, stops[1:])
        ]
        return RouteResponse(
            mode=mode,
            geometry=LineStringGeometry(coordinates=[(s.lng, s.lat) for s in stops]),
            distance_km=sum(leg.distance_km for leg in legs),
            duration_s=sum(leg.duration_s for leg in legs),
            legs=legs,
            fallback=True,
            fallback_reason=reason,
        )


class RoutingFailure(Exception):
    """OSRM could not produce a usable route; carries a short machine reason."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class OsrmRoutingService(RoutingService):
    def __init__(
        self,
        client: httpx.AsyncClient,
        base_urls: Mapping[RouteMode, str],
        timeout_s: float = 8.0,
    ) -> None:
        self._client = client
        self._base_urls = {mode: url.rstrip("/") for mode, url in base_urls.items()}
        self._timeout_s = timeout_s

    async def route(self, stops: Sequence[Stop], mode: RouteMode) -> RouteResponse:
        try:
            payload = await self._fetch(stops, mode)
            return self._parse(payload, stops, mode)
        except RoutingFailure as exc:
            logger.warning("OSRM %s routing failed (%s); using straight lines", mode, exc.reason)
            return HaversineRoutingService.build(stops, mode, exc.reason)

    async def _fetch(self, stops: Sequence[Stop], mode: RouteMode) -> object:
        coords = ";".join(f"{s.lng},{s.lat}" for s in stops)
        # OSRM ignores the profile segment on single-profile servers; "driving" is conventional.
        url = f"{self._base_urls[mode]}/route/v1/driving/{coords}"
        try:
            response = await self._client.get(
                url,
                params={"overview": "full", "geometries": "geojson", "steps": "false"},
                timeout=self._timeout_s,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            raise RoutingFailure("router_unreachable") from exc
        except ValueError as exc:
            raise RoutingFailure("router_bad_response") from exc

    @staticmethod
    def _parse(payload: object, stops: Sequence[Stop], mode: RouteMode) -> RouteResponse:
        if not isinstance(payload, dict):
            raise RoutingFailure("router_bad_response")
        if payload.get("code") != "Ok":
            reason = "no_route" if payload.get("code") == "NoRoute" else "router_error"
            raise RoutingFailure(reason)
        try:
            route = payload["routes"][0]
            raw_legs = route["legs"]
            if len(raw_legs) != len(stops) - 1:
                raise RoutingFailure("router_bad_response")
            legs = [
                RouteLeg(
                    from_id=a.id,
                    to_id=b.id,
                    distance_km=leg["distance"] / 1000,
                    duration_s=leg["duration"],
                )
                for (a, b), leg in zip(zip(stops, stops[1:]), raw_legs)
            ]
            return RouteResponse(
                mode=mode,
                geometry=LineStringGeometry(
                    coordinates=[(c[0], c[1]) for c in route["geometry"]["coordinates"]]
                ),
                distance_km=route["distance"] / 1000,
                duration_s=route["duration"],
                legs=legs,
            )
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise RoutingFailure("router_bad_response") from exc
