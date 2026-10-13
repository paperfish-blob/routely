from abc import ABC, abstractmethod
from collections.abc import Sequence

from routely.models import OptimizeResponse, Stop
from routely.services.distance import DistanceService, Matrix, path_length_km

EPSILON = 1e-9


class OptimizerService(ABC):
    @abstractmethod
    def optimize(
        self,
        stops: Sequence[Stop],
        start_id: str | None = None,
        end_id: str | None = None,
    ) -> OptimizeResponse:
        """Suggest a visiting order that shortens the open path through all stops.

        `start_id` / `end_id` pin a stop to the first / last position.
        """


def nearest_neighbour_order(matrix: Matrix, start: int, end: int | None = None) -> list[int]:
    """Greedy path from `start`; a pinned `end` is held back and appended last."""
    n = len(matrix)
    order = [start]
    remaining = set(range(n)) - {start}
    if end is not None:
        remaining.discard(end)
    while remaining:
        last = order[-1]
        nxt = min(remaining, key=lambda k: (matrix[last][k], k))
        order.append(nxt)
        remaining.remove(nxt)
    if end is not None:
        order.append(end)
    return order


def two_opt(
    order: Sequence[int],
    matrix: Matrix,
    fixed_first: bool = False,
    fixed_last: bool = False,
) -> list[int]:
    """Improve an open path by reversing segments while that shortens it.

    Reversing order[i..j] only changes the edges entering i and leaving j, so
    the gain is computed in O(1). The first / last position is never moved when
    pinned.
    """
    path = list(order)
    n = len(path)
    last_j = n - 2 if fixed_last else n - 1
    improved = True
    while improved:
        improved = False
        for i in range(1 if fixed_first else 0, n - 1):
            for j in range(i + 1, last_j + 1):
                if _reversal_gain(path, matrix, i, j) > EPSILON:
                    path[i : j + 1] = reversed(path[i : j + 1])
                    improved = True
    return path


def _reversal_gain(path: Sequence[int], m: Matrix, i: int, j: int) -> float:
    gain = 0.0
    if i > 0:
        gain += m[path[i - 1]][path[i]] - m[path[i - 1]][path[j]]
    if j < len(path) - 1:
        gain += m[path[j]][path[j + 1]] - m[path[i]][path[j + 1]]
    return gain


class NearestNeighbourTwoOptOptimizer(OptimizerService):
    """Nearest-neighbour construction refined by 2-opt.

    Without a pinned start every stop (other than a pinned end) is tried as the
    starting point (cheap for <= 27 stops) and the shortest result wins. The
    current order is returned when the heuristic cannot beat it, so a
    suggestion is never worse.
    """

    def __init__(self, distances: DistanceService) -> None:
        self._distances = distances

    def optimize(
        self,
        stops: Sequence[Stop],
        start_id: str | None = None,
        end_id: str | None = None,
    ) -> OptimizeResponse:
        matrix = self._distances.matrix(stops)
        n = len(stops)
        original = list(range(n))
        original_km = path_length_km(original, matrix)

        index = {s.id: i for i, s in enumerate(stops)}
        start = index.get(start_id) if start_id is not None else None
        end = index.get(end_id) if end_id is not None else None
        starts = [start] if start is not None else [i for i in original if i != end]
        candidates = [
            two_opt(
                nearest_neighbour_order(matrix, s, end),
                matrix,
                fixed_first=start is not None,
                fixed_last=end is not None,
            )
            for s in starts
        ]
        best = min(candidates, key=lambda p: path_length_km(p, matrix))

        # Keep the user's order if it is already at least as good and honours the pins.
        original_is_valid = (start is None or start == 0) and (end is None or end == n - 1)
        if original_is_valid and path_length_km(best, matrix) >= original_km - EPSILON:
            best = original

        new_km = path_length_km(best, matrix)
        return OptimizeResponse(
            order=[stops[i].id for i in best],
            original_total_km=original_km,
            new_total_km=new_km,
            km_saved=original_km - new_km,
        )
