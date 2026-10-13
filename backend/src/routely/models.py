"""Request/response schemas shared across endpoints."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, model_validator

MAX_STOPS = 25
MIN_STOPS = 2


class Stop(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=64)]
    name: Annotated[str, Field(max_length=300)] = ""
    lat: Annotated[float, Field(ge=-90, le=90)]
    lng: Annotated[float, Field(ge=-180, le=180)]


class StopsRequest(BaseModel):
    stops: Annotated[list[Stop], Field(min_length=MIN_STOPS, max_length=MAX_STOPS)]

    @model_validator(mode="after")
    def _unique_ids(self) -> Self:
        ids = [s.id for s in self.stops]
        if len(set(ids)) != len(ids):
            raise ValueError("stop ids must be unique")
        return self


class GeocodeCandidate(BaseModel):
    display_name: str
    lat: float
    lng: float


class GeocodeResponse(BaseModel):
    query: str
    results: list[GeocodeCandidate]


class Leg(BaseModel):
    from_id: str
    to_id: str
    distance_km: float


class NearestNeighbour(BaseModel):
    stop_id: str
    nearest_id: str
    distance_km: float


class Cluster(BaseModel):
    id: int
    stop_ids: list[str]


class DistancesRequest(StopsRequest):
    cluster_threshold_km: Annotated[float, Field(gt=0, le=20_000)] | None = None


class DistancesResponse(BaseModel):
    stop_ids: list[str]
    matrix_km: list[list[float]]
    legs: list[Leg]
    total_km: float
    nearest: list[NearestNeighbour]
    clusters: list[Cluster]
    cluster_threshold_km: float


RouteMode = Literal["driving", "walking"]


class RouteRequest(StopsRequest):
    mode: RouteMode = "driving"


class LineStringGeometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]]  # GeoJSON order: [lng, lat]


class RouteLeg(BaseModel):
    from_id: str
    to_id: str
    distance_km: float
    duration_s: float


class RouteResponse(BaseModel):
    mode: RouteMode
    geometry: LineStringGeometry
    distance_km: float
    duration_s: float
    legs: list[RouteLeg]
    # True when the road router was unavailable and we returned straight lines.
    fallback: bool = False
    fallback_reason: str | None = None


class OptimizeRequest(StopsRequest):
    # If set, this stop stays first and the rest are reordered after it.
    start_id: str | None = None

    @model_validator(mode="after")
    def _start_exists(self) -> Self:
        if self.start_id is not None and self.start_id not in {s.id for s in self.stops}:
            raise ValueError("start_id must match one of the stops")
        return self


class OptimizeResponse(BaseModel):
    order: list[str]
    original_total_km: float
    new_total_km: float
    km_saved: float
