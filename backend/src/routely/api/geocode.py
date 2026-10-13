from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import StringConstraints

from routely.deps import get_geocoder
from routely.models import GeocodeResponse
from routely.services.geocoding import GeocodingService

router = APIRouter()

SearchText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode(
    q: Annotated[SearchText, Query(description="Free-text place search")],
    geocoder: Annotated[GeocodingService, Depends(get_geocoder)],
) -> GeocodeResponse:
    return GeocodeResponse(query=q, results=await geocoder.search(q))
