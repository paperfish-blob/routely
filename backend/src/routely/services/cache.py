"""Geocode cache interface plus an in-memory TTL/LRU implementation.

A Supabase-backed cache can replace `InMemoryGeocodeCache` by implementing
`GeocodeCache` and being passed to the app factory.
"""

import time
from abc import ABC, abstractmethod
from collections import OrderedDict
from collections.abc import Callable

from routely.models import GeocodeCandidate


class GeocodeCache(ABC):
    @abstractmethod
    async def get(self, key: str) -> list[GeocodeCandidate] | None: ...

    @abstractmethod
    async def set(self, key: str, value: list[GeocodeCandidate]) -> None: ...


class InMemoryGeocodeCache(GeocodeCache):
    def __init__(
        self,
        ttl_s: float = 86_400,
        max_entries: int = 1000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl_s = ttl_s
        self._max_entries = max_entries
        self._clock = clock
        self._data: OrderedDict[str, tuple[float, list[GeocodeCandidate]]] = (
            OrderedDict()
        )

    async def get(self, key: str) -> list[GeocodeCandidate] | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if self._clock() >= expires_at:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return value

    async def set(self, key: str, value: list[GeocodeCandidate]) -> None:
        self._data[key] = (self._clock() + self._ttl_s, value)
        self._data.move_to_end(key)
        while len(self._data) > self._max_entries:
            self._data.popitem(last=False)
