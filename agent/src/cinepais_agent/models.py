from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

Format = Literal["IMAX", "Onyx", "2D", "Doblada", "Subtitulada", "Premium"]


class City(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str


class FilmSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    posterUrl: str
    durationMin: int
    rating: str
    genres: list[str]


class FilmDetail(FilmSummary):
    synopsis: str
    director: str
    cast: list[str]


class Showtime(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    filmId: str
    siteId: str
    siteName: str
    city: str
    businessDate: str  # YYYY-MM-DD
    time: str  # HH:MM
    room: str
    formats: list[Format]
    priceFrom: int


class Seat(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    seatId: str
    row: int
    col: int
    area: int
    status: Literal["Available", "Sold"]
    areaCategory: Literal["general", "premium", "wheelchair", "preferential"]
    qualityTier: Literal["low", "optimal", "high"]
    price: int


class AreaCount(BaseModel):
    total: int
    available: int


class ByArea(BaseModel):
    general: AreaCount
    premium: AreaCount
    wheelchair: AreaCount
    preferential: AreaCount


class PriceTable(BaseModel):
    general: int
    preferential: int
    premium: int
    wheelchair: int


class SeatSummary(BaseModel):
    totalCount: int
    availableCount: int
    byArea: ByArea
    priceTable: PriceTable


class ShowtimeSeatsResponse(BaseModel):
    showtime: Showtime
    seats: list[Seat]
    summary: SeatSummary
