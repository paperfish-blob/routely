from abc import ABC, abstractmethod
from collections.abc import Sequence

from routely.models import Cluster, Stop
from routely.services.distance import DistanceService


class ProximityService(ABC):
    @abstractmethod
    def cluster(self, stops: Sequence[Stop], threshold_km: float) -> list[Cluster]:
        """Partition stops into groups of mutually reachable nearby stops."""


class _UnionFind:
    def __init__(self, n: int) -> None:
        self._parent = list(range(n))

    def find(self, x: int) -> int:
        while self._parent[x] != x:
            self._parent[x] = self._parent[self._parent[x]]
            x = self._parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self._parent[max(ra, rb)] = min(ra, rb)


class SingleLinkageProximityService(ProximityService):
    """Single-linkage clustering cut at `threshold_km`.

    Two stops share a cluster if a chain of stops connects them where every
    hop is <= threshold. Clusters (including singletons) are ordered by their
    earliest stop in itinerary order; members keep itinerary order.
    """

    def __init__(self, distances: DistanceService) -> None:
        self._distances = distances

    def cluster(self, stops: Sequence[Stop], threshold_km: float) -> list[Cluster]:
        n = len(stops)
        m = self._distances.matrix(stops)
        uf = _UnionFind(n)
        for i in range(n):
            for j in range(i + 1, n):
                if m[i][j] <= threshold_km:
                    uf.union(i, j)
        groups: dict[int, list[str]] = {}
        for i, stop in enumerate(stops):
            groups.setdefault(uf.find(i), []).append(stop.id)
        # find() returns the smallest index in the component, so dict order
        # (insertion by first member) is already itinerary order.
        return [Cluster(id=k, stop_ids=ids) for k, ids in enumerate(groups.values())]
