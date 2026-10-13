import math
from abc import ABC, abstractmethod
from collections.abc import Sequence

from routely.models import Leg, NearestNeighbour, Stop

EARTH_RADIUS_KM = 6371.0088

Matrix = list[list[float]]


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


class DistanceService(ABC):
    @abstractmethod
    def matrix(self, stops: Sequence[Stop]) -> Matrix:
        """Symmetric pairwise distance matrix in km, indexed like `stops`."""

    @abstractmethod
    def nearest_neighbours(self, stops: Sequence[Stop]) -> list[NearestNeighbour]:
        """For each stop, the closest other stop."""

    @abstractmethod
    def legs(self, stops: Sequence[Stop]) -> list[Leg]:
        """Consecutive-stop distances following the given order."""

    @abstractmethod
    def total_km(self, stops: Sequence[Stop]) -> float:
        """Sum of leg distances following the given order (open path)."""


def path_length_km(order: Sequence[int], matrix: Matrix) -> float:
    return sum(matrix[a][b] for a, b in zip(order, order[1:]))


class HaversineDistanceService(DistanceService):
    def matrix(self, stops: Sequence[Stop]) -> Matrix:
        n = len(stops)
        m = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                d = haversine_km(stops[i].lat, stops[i].lng, stops[j].lat, stops[j].lng)
                m[i][j] = m[j][i] = d
        return m

    def nearest_neighbours(self, stops: Sequence[Stop]) -> list[NearestNeighbour]:
        if len(stops) < 2:
            return []
        m = self.matrix(stops)
        result: list[NearestNeighbour] = []
        for i, stop in enumerate(stops):
            j = min((k for k in range(len(stops)) if k != i), key=lambda k: m[i][k])
            result.append(
                NearestNeighbour(
                    stop_id=stop.id, nearest_id=stops[j].id, distance_km=m[i][j]
                )
            )
        return result

    def legs(self, stops: Sequence[Stop]) -> list[Leg]:
        return [
            Leg(
                from_id=a.id,
                to_id=b.id,
                distance_km=haversine_km(a.lat, a.lng, b.lat, b.lng),
            )
            for a, b in zip(stops, stops[1:])
        ]

    def total_km(self, stops: Sequence[Stop]) -> float:
        return sum(leg.distance_km for leg in self.legs(stops))
