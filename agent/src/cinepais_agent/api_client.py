from __future__ import annotations

import httpx

from .config import settings
from .models import City, FilmDetail, FilmSummary, Showtime, ShowtimeSeatsResponse


class NotFoundError(Exception):
    """Raised when the API returns 404 {error: "not_found"}."""


class ValidationApiError(Exception):
    """Raised when the API returns 400 {error: "validation_error", details: [...]}."""

    def __init__(self, details: list[object]) -> None:
        self.details = details
        super().__init__(f"Validation error: {details}")


class CinepaisApiClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or settings.web_api_base_url
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=10.0)

    async def __aenter__(self) -> CinepaisApiClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, str] | None = None) -> object:
        resp = await self._client.get(path, params=params)
        if resp.status_code == 404:
            raise NotFoundError(f"Not found: {path}")
        if resp.status_code == 400:
            body = resp.json()
            raise ValidationApiError(body.get("details", []))
        resp.raise_for_status()
        return resp.json()

    async def get_cities(self) -> list[City]:
        data = await self._get("/api/cities")
        return [City.model_validate(c) for c in data]  # type: ignore[union-attr]

    async def get_films(self, city: str | None = None) -> list[FilmSummary]:
        params = {"city": city} if city else None
        data = await self._get("/api/films", params=params)
        return [FilmSummary.model_validate(f) for f in data]  # type: ignore[union-attr]

    async def get_film(self, film_id: str) -> FilmDetail:
        data = await self._get(f"/api/films/{film_id}")
        return FilmDetail.model_validate(data)

    async def get_showtimes(
        self,
        film_id: str | None = None,
        city: str | None = None,
        date: str | None = None,
        format: str | None = None,
    ) -> list[Showtime]:
        params: dict[str, str] = {}
        if film_id:
            params["filmId"] = film_id
        if city:
            params["city"] = city
        if date:
            params["date"] = date
        if format:
            params["format"] = format
        data = await self._get("/api/showtimes", params=params or None)
        return [Showtime.model_validate(s) for s in data]  # type: ignore[union-attr]

    async def get_seats(self, showtime_id: str) -> ShowtimeSeatsResponse:
        data = await self._get(f"/api/showtimes/{showtime_id}/seats")
        return ShowtimeSeatsResponse.model_validate(data)
