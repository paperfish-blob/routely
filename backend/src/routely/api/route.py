from typing import Annotated

from fastapi import APIRouter, Depends

from routely.deps import get_routing
from routely.models import RouteRequest, RouteResponse
from routely.services.routing import RoutingService

router = APIRouter()


def _round(response: RouteResponse) -> RouteResponse:
    response.distance_km = round(response.distance_km, 3)
    response.duration_s = round(response.duration_s)
    for leg in response.legs:
        leg.distance_km = round(leg.distance_km, 3)
        leg.duration_s = round(leg.duration_s)
    return response


@router.post("/route", response_model=RouteResponse)
async def route(
    body: RouteRequest, routing: Annotated[RoutingService, Depends(get_routing)]
) -> RouteResponse:
    return _round(await routing.route(body.stops, body.mode))
