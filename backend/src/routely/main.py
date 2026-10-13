from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routely.api import distances, geocode, health, optimize, route
from routely.config import Settings, get_settings
from routely.deps import Services
from routely.errors import register_error_handlers
from routely.services.cache import GeocodeCache, InMemoryGeocodeCache
from routely.services.distance import HaversineDistanceService
from routely.services.geocoding import NominatimGeocoder, RateLimiter
from routely.services.optimizer import NearestNeighbourTwoOptOptimizer
from routely.services.proximity import SingleLinkageProximityService
from routely.services.routing import OsrmRoutingService


def build_services(
    settings: Settings, client: httpx.AsyncClient, geocode_cache: GeocodeCache | None
) -> Services:
    cache = geocode_cache or InMemoryGeocodeCache(
        settings.geocode_cache_ttl_s, settings.geocode_cache_max_entries
    )
    geocoder = NominatimGeocoder(
        client,
        settings.nominatim_base_url,
        settings.nominatim_user_agent,
        cache,
        RateLimiter(settings.geocode_min_interval_s),
    )
    distance = HaversineDistanceService()
    return Services(
        geocoder=geocoder,
        distance=distance,
        proximity=SingleLinkageProximityService(distance),
        optimizer=NearestNeighbourTwoOptOptimizer(distance),
        routing=OsrmRoutingService(
            client,
            {"driving": settings.osrm_base_url, "walking": settings.osrm_walking_base_url},
            settings.osrm_timeout_s,
        ),
    )


def create_app(
    settings: Settings | None = None, geocode_cache: GeocodeCache | None = None
) -> FastAPI:
    settings = settings or get_settings()
    client = httpx.AsyncClient(timeout=10.0)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await client.aclose()

    app = FastAPI(title="Routely API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.services = build_services(settings, client, geocode_cache)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(geocode.router)
    app.include_router(distances.router)
    app.include_router(route.router)
    app.include_router(optimize.router)
    return app


app = create_app()
