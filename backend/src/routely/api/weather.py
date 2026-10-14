from datetime import date as Date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from routely.deps import get_weather
from routely.errors import RoutelyError
from routely.models import WeatherResponse
from routely.services.weather import WeatherService

router = APIRouter()

MIN_DATE = Date(1950, 1, 1)
MAX_DATE = Date(2100, 1, 1)


@router.get("/weather", response_model=WeatherResponse)
async def weather(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    date: Annotated[Date, Query(description="Day to look up, YYYY-MM-DD")],
    service: Annotated[WeatherService, Depends(get_weather)],
) -> WeatherResponse:
    if not MIN_DATE <= date < MAX_DATE:
        raise RoutelyError(
            "validation_error", "date must be between 1950 and 2099", status_code=422
        )
    return await service.get(lat, lng, date)
