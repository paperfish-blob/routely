from typing import Annotated

from fastapi import APIRouter, Depends

from routely.config import Settings
from routely.deps import Services, get_app_settings, get_services
from routely.models import DistancesRequest, DistancesResponse

router = APIRouter()

PRECISION = 3  # metres


def _r(value: float) -> float:
    return round(value, PRECISION)


@router.post("/distances", response_model=DistancesResponse)
async def distances(
    body: DistancesRequest,
    services: Annotated[Services, Depends(get_services)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> DistancesResponse:
    stops = body.stops
    threshold = body.cluster_threshold_km or settings.cluster_threshold_km
    legs = services.distance.legs(stops)
    nearest = services.distance.nearest_neighbours(stops)
    for leg in legs:
        leg.distance_km = _r(leg.distance_km)
    for nn in nearest:
        nn.distance_km = _r(nn.distance_km)
    return DistancesResponse(
        stop_ids=[s.id for s in stops],
        matrix_km=[[_r(d) for d in row] for row in services.distance.matrix(stops)],
        legs=legs,
        total_km=_r(sum(leg.distance_km for leg in legs)),
        nearest=nearest,
        clusters=services.proximity.cluster(stops, threshold),
        cluster_threshold_km=threshold,
    )
