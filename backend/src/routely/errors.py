"""Structured JSON errors: {"error": {"code", "message", "details"?}}."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class RoutelyError(Exception):
    """Domain error that maps to a structured response."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class UpstreamError(RoutelyError):
    """An external provider (geocoder, router) failed."""

    def __init__(self, message: str, details: Any | None = None) -> None:
        super().__init__("upstream_error", message, status_code=502, details=details)


def error_body(code: str, message: str, details: Any | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return {"error": body}


def _validation_details(exc: RequestValidationError) -> list[dict[str, Any]]:
    return [
        {
            "field": ".".join(str(p) for p in err["loc"] if p != "body"),
            "message": err["msg"],
            "type": err["type"],
        }
        for err in exc.errors()
    ]


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RoutelyError)
    async def _routely(_: Request, exc: RoutelyError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.code, exc.message, exc.details), status_code=exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        body = error_body(
            "validation_error", "Request validation failed", _validation_details(exc)
        )
        return JSONResponse(jsonable_encoder(body), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            error_body("http_error", str(exc.detail)), status_code=exc.status_code
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            error_body("internal_error", "Internal server error"), status_code=500
        )
