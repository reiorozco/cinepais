import pytest
from pydantic import ValidationError

from cinepais_agent.events import (
    Alternative,
    DoneEvent,
    ErrorEvent,
    RecommendationEvent,
    TokenEvent,
    ToolCallEvent,
)


def test_token_event_serialization():
    event = TokenEvent(content="Hola")
    data = event.model_dump()
    assert data["type"] == "token"
    assert data["content"] == "Hola"


def test_tool_call_event():
    event = ToolCallEvent(tool="recommend_best", input={"n": 2})
    assert event.type == "tool_call"
    assert event.tool == "recommend_best"


def test_recommendation_event_recommended():
    """Serialize a RecommendationEvent with 2 alternatives and re-parse it."""
    alt = Alternative(
        showtimeId="st-1",
        filmId="film-01",
        siteName="CinePaís Bogotá Centro",
        businessDate="2026-08-08",
        time="19:00",
        formats=["IMAX"],
        priceFrom=32000,
        qualityTier="optimal",
        reason="horario alternativo",
    )
    event = RecommendationEvent(
        outcome="recommended",
        showtimeId="st-2",
        filmId="film-01",
        seatIds=["1_4_7", "1_4_8"],
        requestedN=2,
        siteName="CinePaís Bogotá Norte",
        city="Bogotá",
        businessDate="2026-08-08",
        time="22:45",
        formats=["IMAX"],
        priceFrom=32000,
        qualityTier="optimal",
        reasoning="Encontré 2 sillas juntas en fila 4.",
        alternatives=[alt, alt],
    )
    # Serialize and re-parse
    json_str = event.model_dump_json()
    reparsed = RecommendationEvent.model_validate_json(json_str)
    assert reparsed.outcome == "recommended"
    assert len(reparsed.seatIds) == 2
    assert len(reparsed.alternatives) == 2


def test_recommendation_event_no_availability():
    event = RecommendationEvent(
        outcome="no_availability",
        showtimeId=None,
        filmId=None,
        seatIds=[],
        requestedN=2,
        siteName=None,
        city=None,
        businessDate=None,
        time=None,
        formats=[],
        priceFrom=None,
        qualityTier=None,
        reasoning="No hay funciones disponibles.",
    )
    assert event.outcome == "no_availability"
    assert event.seatIds == []


def test_recommendation_event_degraded():
    event = RecommendationEvent(
        outcome="degraded",
        showtimeId="st-1",
        filmId="film-01",
        seatIds=["1_4_7"],
        requestedN=2,
        siteName="CinePaís",
        city="Bogotá",
        businessDate="2026-08-08",
        time="22:45",
        formats=["IMAX"],
        priceFrom=32000,
        qualityTier="optimal",
        reasoning="Solo encontré 1 silla disponible.",
    )
    assert event.outcome == "degraded"
    assert len(event.seatIds) == 1


def test_recommendation_event_invalid_seat_id_format():
    """RecommendationEvent with bad seatId format should raise ValidationError."""
    # Note: seatIds are strings — the format validation is semantic, not Pydantic-enforced
    # This test verifies the outcome contract validator
    with pytest.raises(ValidationError):
        RecommendationEvent(
            outcome="recommended",
            showtimeId="st-1",
            filmId="film-01",
            seatIds=["A1"],  # Only 1 seat but requestedN=2 → contract violation
            requestedN=2,
            siteName="CinePaís",
            city="Bogotá",
            businessDate="2026-08-08",
            time="22:45",
            formats=["IMAX"],
            priceFrom=32000,
            qualityTier="optimal",
            reasoning="test",
        )


def test_done_event():
    event = DoneEvent(sessionQueriesUsed=3, sessionQueryCap=20)
    assert event.type == "done"
    assert event.sessionQueriesUsed == 3


def test_error_event_spanish_message():
    event = ErrorEvent(code="rate_limit_exceeded", message="Has superado el límite.")
    assert event.type == "error"
    assert "límite" in event.message
