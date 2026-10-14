"""FastAPI dependencies. Services live on app.state and can be overridden in tests."""

from dataclasses import dataclass

from fastapi import Request

from routely.config import Settings
from routely.services.distance import DistanceService
from routely.services.geocoding import GeocodingService
from routely.services.optimizer import OptimizerService
from routely.services.proximity import ProximityService
from routely.services.routing import RoutingService
from routely.services.weather import WeatherService


@dataclass
class Services:
    geocoder: GeocodingService
    distance: DistanceService
    proximity: ProximityService
    routing: RoutingService
    optimizer: OptimizerService
    weather: WeatherService


def get_services(request: Request) -> Services:
    return request.app.state.services


def get_geocoder(request: Request) -> GeocodingService:
    return get_services(request).geocoder


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_routing(request: Request) -> RoutingService:
    return get_services(request).routing


def get_optimizer(request: Request) -> OptimizerService:
    return get_services(request).optimizer


def get_weather(request: Request) -> WeatherService:
    return get_services(request).weather
