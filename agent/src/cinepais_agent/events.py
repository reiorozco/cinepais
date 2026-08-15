from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, model_validator

Format = Literal["IMAX", "Onyx", "2D", "Doblada", "Subtitulada", "Premium"]


class TokenEvent(BaseModel):
    type: Literal["token"] = "token"
    content: str


class ToolCallEvent(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    tool: str
    input: dict  # type: ignore[type-arg]


class Alternative(BaseModel):
    """An alternative showtime option to present alongside the main recommendation."""

    showtimeId: str
    filmId: str
    siteName: str
    businessDate: str  # YYYY-MM-DD
    time: str  # HH:MM
    formats: list[Format]
    priceFrom: int
    qualityTier: Literal["low", "optimal", "high"] | None
    reason: str  # Spanish reason, e.g. "mejor calidad de silla"


class RecommendationEvent(BaseModel):
    type: Literal["recommendation"] = "recommendation"
    outcome: Literal["recommended", "degraded", "no_availability"]
    showtimeId: str | None
    filmId: str | None
    seatIds: list[str]
    requestedN: int
    siteName: str | None
    city: str | None
    businessDate: str | None
    time: str | None
    formats: list[Format]
    priceFrom: int | None
    qualityTier: Literal["low", "optimal", "high"] | None
    reasoning: str
    alternatives: list[Alternative] = []

    @model_validator(mode="after")
    def validate_outcome_contract(self) -> RecommendationEvent:
        """Enforce the outcome branch contract."""
        if self.outcome == "recommended":
            if self.showtimeId is None:
                raise ValueError("recommended outcome requires showtimeId")
            if len(self.seatIds) != self.requestedN:
                raise ValueError(
                    f"recommended outcome requires len(seatIds)==requestedN, "
                    f"got {len(self.seatIds)} != {self.requestedN}"
                )
        elif self.outcome == "degraded":
            if self.showtimeId is None:
                raise ValueError("degraded outcome requires showtimeId")
            if not (1 <= len(self.seatIds) < self.requestedN):
                raise ValueError(
                    f"degraded outcome requires 1<=len(seatIds)<requestedN, "
                    f"got {len(self.seatIds)}, requestedN={self.requestedN}"
                )
        elif self.outcome == "no_availability":
            if self.showtimeId is not None:
                raise ValueError("no_availability outcome requires showtimeId to be None")
            if self.seatIds:
                raise ValueError("no_availability outcome requires seatIds to be []")
        return self


class DoneEvent(BaseModel):
    type: Literal["done"] = "done"
    sessionQueriesUsed: int
    sessionQueryCap: int


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str  # Spanish message
