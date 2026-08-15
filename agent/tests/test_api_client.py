"""Unit tests for CinepaisApiClient using respx mocks."""

from __future__ import annotations

import httpx
import pytest
import respx

from cinepais_agent.api_client import CinepaisApiClient, NotFoundError, ValidationApiError

BASE_URL = "http://localhost:3000"

CITY_PAYLOAD = [{"id": "city-1", "name": "Bogotá"}, {"id": "city-2", "name": "Medellín"}]

FILM_SUMMARY_PAYLOAD = [
    {
        "id": "film-01",
        "title": "La Odisea",
        "posterUrl": "https://placehold.co/300x450?text=Film+01",
        "durationMin": 165,
        "rating": "PG-13",
        "genres": ["Aventura", "Drama"],
    }
]

FILM_DETAIL_PAYLOAD = {
    "id": "film-01",
    "title": "La Odisea",
    "posterUrl": "https://placehold.co/300x450?text=Film+01",
    "durationMin": 165,
    "rating": "PG-13",
    "genres": ["Aventura", "Drama"],
    "synopsis": "Un viaje épico por los siete mares en busca del hogar.",
    "director": "Sofía Restrepo",
    "cast": ["Carlos Vega", "María Ospina", "Andrés Cano"],
}

SHOWTIME_PAYLOAD = [
    {
        "id": "st-site-bog-3-imax-4-2245",
        "filmId": "film-01",
        "siteId": "site-bog-3",
        "siteName": "CinePaís Bogotá Norte",
        "city": "Bogotá",
        "businessDate": "2026-08-04",
        "time": "22:45",
        "room": "imax",
        "formats": ["IMAX"],
        "priceFrom": 32000,
    }
]

SEATS_PAYLOAD = {
    "showtime": {
        "id": "st-site-bog-3-imax-4-2245",
        "filmId": "film-01",
        "siteId": "site-bog-3",
        "siteName": "CinePaís Bogotá Norte",
        "city": "Bogotá",
        "businessDate": "2026-08-04",
        "time": "22:45",
        "room": "imax",
        "formats": ["IMAX"],
        "priceFrom": 32000,
    },
    "seats": [
        {
            "seatId": "1_1_1",
            "row": 1,
            "col": 1,
            "area": 1,
            "status": "Available",
            "areaCategory": "general",
            "qualityTier": "low",
            "price": 32000,
        }
    ],
    "summary": {
        "totalCount": 260,
        "availableCount": 260,
        "byArea": {
            "general": {"total": 156, "available": 156},
            "premium": {"total": 100, "available": 100},
            "wheelchair": {"total": 2, "available": 2},
            "preferential": {"total": 2, "available": 2},
        },
        "priceTable": {
            "general": 32000,
            "preferential": 37000,
            "premium": 43000,
            "wheelchair": 32000,
        },
    },
}


@pytest.fixture
def client() -> CinepaisApiClient:
    return CinepaisApiClient(base_url=BASE_URL)


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


@respx.mock
async def test_get_cities_parses_list(client: CinepaisApiClient) -> None:
    # Given: API returns two cities
    respx.get(f"{BASE_URL}/api/cities").mock(return_value=httpx.Response(200, json=CITY_PAYLOAD))

    # When: we call get_cities()
    cities = await client.get_cities()

    # Then: returns typed City list
    assert len(cities) == 2
    assert cities[0].id == "city-1"
    assert cities[0].name == "Bogotá"
    assert cities[1].id == "city-2"
    assert cities[1].name == "Medellín"


@respx.mock
async def test_get_films_parses_list(client: CinepaisApiClient) -> None:
    # Given: API returns one film summary
    respx.get(f"{BASE_URL}/api/films").mock(
        return_value=httpx.Response(200, json=FILM_SUMMARY_PAYLOAD)
    )

    # When: we call get_films()
    films = await client.get_films()

    # Then: returns typed FilmSummary list
    assert len(films) == 1
    film = films[0]
    assert film.id == "film-01"
    assert film.title == "La Odisea"
    assert film.durationMin == 165
    assert film.rating == "PG-13"
    assert film.genres == ["Aventura", "Drama"]


@respx.mock
async def test_get_films_passes_city_filter(client: CinepaisApiClient) -> None:
    # Given: API endpoint accepts city query param
    route = respx.get(f"{BASE_URL}/api/films").mock(
        return_value=httpx.Response(200, json=FILM_SUMMARY_PAYLOAD)
    )

    # When: we filter by city
    await client.get_films(city="Medellín")

    # Then: city param was forwarded
    assert route.called
    assert route.calls[0].request.url.params.get("city") == "Medellín"


@respx.mock
async def test_get_film_parses_detail(client: CinepaisApiClient) -> None:
    # Given: API returns full film detail
    respx.get(f"{BASE_URL}/api/films/film-01").mock(
        return_value=httpx.Response(200, json=FILM_DETAIL_PAYLOAD)
    )

    # When: we call get_film("film-01")
    film = await client.get_film("film-01")

    # Then: returns typed FilmDetail including inherited + extended fields
    assert film.id == "film-01"
    assert film.synopsis == "Un viaje épico por los siete mares en busca del hogar."
    assert film.director == "Sofía Restrepo"
    assert film.cast == ["Carlos Vega", "María Ospina", "Andrés Cano"]


@respx.mock
async def test_get_showtimes_parses_list(client: CinepaisApiClient) -> None:
    # Given: API returns one showtime
    respx.get(f"{BASE_URL}/api/showtimes").mock(
        return_value=httpx.Response(200, json=SHOWTIME_PAYLOAD)
    )

    # When: we call get_showtimes()
    showtimes = await client.get_showtimes()

    # Then: returns typed Showtime list
    assert len(showtimes) == 1
    st = showtimes[0]
    assert st.id == "st-site-bog-3-imax-4-2245"
    assert st.filmId == "film-01"
    assert st.city == "Bogotá"
    assert st.formats == ["IMAX"]
    assert st.priceFrom == 32000


@respx.mock
async def test_get_showtimes_passes_filters(client: CinepaisApiClient) -> None:
    # Given: API endpoint accepts filter params
    route = respx.get(f"{BASE_URL}/api/showtimes").mock(
        return_value=httpx.Response(200, json=SHOWTIME_PAYLOAD)
    )

    # When: we filter by filmId + city + date + format
    await client.get_showtimes(film_id="film-01", city="Bogotá", date="2026-08-04", format="IMAX")

    # Then: all params forwarded correctly
    params = route.calls[0].request.url.params
    assert params.get("filmId") == "film-01"
    assert params.get("city") == "Bogotá"
    assert params.get("date") == "2026-08-04"
    assert params.get("format") == "IMAX"


@respx.mock
async def test_get_seats_parses_full_response(client: CinepaisApiClient) -> None:
    # Given: API returns verbatim seats payload from README
    respx.get(f"{BASE_URL}/api/showtimes/st-site-bog-3-imax-4-2245/seats").mock(
        return_value=httpx.Response(200, json=SEATS_PAYLOAD)
    )

    # When: we call get_seats()
    response = await client.get_seats("st-site-bog-3-imax-4-2245")

    # Then: all nested models parsed correctly
    assert response.showtime.id == "st-site-bog-3-imax-4-2245"
    assert response.showtime.priceFrom == 32000

    assert len(response.seats) == 1
    seat = response.seats[0]
    assert seat.seatId == "1_1_1"
    assert seat.row == 1
    assert seat.col == 1
    assert seat.area == 1
    assert seat.status == "Available"
    assert seat.areaCategory == "general"
    assert seat.qualityTier == "low"
    assert seat.price == 32000

    summary = response.summary
    assert summary.totalCount == 260
    assert summary.availableCount == 260
    assert summary.byArea.general.total == 156
    assert summary.byArea.general.available == 156
    assert summary.byArea.premium.total == 100
    assert summary.byArea.wheelchair.total == 2
    assert summary.byArea.preferential.total == 2
    assert summary.priceTable.general == 32000
    assert summary.priceTable.preferential == 37000
    assert summary.priceTable.premium == 43000
    assert summary.priceTable.wheelchair == 32000


# ---------------------------------------------------------------------------
# Error-path tests
# ---------------------------------------------------------------------------


@respx.mock
async def test_404_raises_not_found_error(client: CinepaisApiClient) -> None:
    # Given: API returns 404
    respx.get(f"{BASE_URL}/api/films/nonexistent").mock(
        return_value=httpx.Response(404, json={"error": "not_found"})
    )

    # When / Then: NotFoundError is raised
    with pytest.raises(NotFoundError):
        await client.get_film("nonexistent")


@respx.mock
async def test_400_raises_validation_api_error_with_details(
    client: CinepaisApiClient,
) -> None:
    # Given: API returns 400 with validation details
    details = [{"code": "invalid_type", "path": ["city"], "message": "Expected string"}]
    respx.get(f"{BASE_URL}/api/showtimes").mock(
        return_value=httpx.Response(400, json={"error": "validation_error", "details": details})
    )

    # When / Then: ValidationApiError is raised with details preserved
    with pytest.raises(ValidationApiError) as exc_info:
        await client.get_showtimes(city="123")

    assert exc_info.value.details == details


# ---------------------------------------------------------------------------
# Integration smoke test (requires live web server on :3000)
# ---------------------------------------------------------------------------


@pytest.mark.integration
async def test_integration_get_cities_live() -> None:
    """Smoke test: hits the real dev server. Skipped when server is down."""
    try:
        async with CinepaisApiClient(base_url="http://localhost:3000") as api:
            cities = await api.get_cities()
        assert len(cities) >= 1
        assert all(c.id and c.name for c in cities)
    except (httpx.ConnectError, httpx.ConnectTimeout):
        pytest.skip("Web server not reachable on localhost:3000")
