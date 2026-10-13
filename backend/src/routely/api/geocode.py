from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import StringConstraints

from routely.deps import get_geocoder
from routely.errors import RoutelyError
from routely.models import GeocodeResponse
from routely.services.geocoding import GeocodingService

router = APIRouter()

SearchText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode(
    q: Annotated[SearchText, Query(description="Free-text place search")],
    geocoder: Annotated[GeocodingService, Depends(get_geocoder)],
    near_lat: Annotated[float | None, Query(ge=-90, le=90, description="Location hint: latitude")] = None,
    near_lng: Annotated[float | None, Query(ge=-180, le=180, description="Location hint: longitude")] = None,
) -> GeocodeResponse:
    if (near_lat is None) != (near_lng is None):
        raise RoutelyError(
            "validation_error", "near_lat and near_lng must be given together", status_code=422
        )
    near = (near_lat, near_lng) if near_lat is not None and near_lng is not None else None
    return GeocodeResponse(query=q, results=await geocoder.search(q, near))
