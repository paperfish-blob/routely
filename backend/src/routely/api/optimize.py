from typing import Annotated

from fastapi import APIRouter, Depends

from routely.deps import get_optimizer
from routely.models import OptimizeRequest, OptimizeResponse
from routely.services.optimizer import OptimizerService

router = APIRouter()


@router.post("/optimize", response_model=OptimizeResponse)
async def optimize(
    body: OptimizeRequest, optimizer: Annotated[OptimizerService, Depends(get_optimizer)]
) -> OptimizeResponse:
    result = optimizer.optimize(body.stops, body.start_id, body.end_id)
    result.original_total_km = round(result.original_total_km, 3)
    result.new_total_km = round(result.new_total_km, 3)
    result.km_saved = round(result.original_total_km - result.new_total_km, 3)
    return result
