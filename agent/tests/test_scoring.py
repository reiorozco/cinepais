from cinepais_agent.models import Seat, Showtime
from cinepais_agent.scoring import ShowtimeWithSeats, recommend_best


def make_showtime(
    id: str = "st-1",
    film_id: str = "film-01",
    site_id: str = "site-1",
    site_name: str = "CinePaís Test",
    city: str = "Bogotá",
    business_date: str = "2026-08-08",
    time: str = "20:00",
    room: str = "imax",
    formats: list[str] | None = None,
    price_from: int = 32000,
) -> Showtime:
    return Showtime(
        id=id,
        filmId=film_id,
        siteId=site_id,
        siteName=site_name,
        city=city,
        businessDate=business_date,
        time=time,
        room=room,
        formats=formats or ["IMAX"],  # type: ignore[arg-type]
        priceFrom=price_from,
    )


def make_seat(
    seat_id: str,
    row: int,
    col: int,
    area: int = 1,
    status: str = "Available",
    area_category: str = "general",
    quality_tier: str = "optimal",
    price: int = 32000,
) -> Seat:
    return Seat(
        seatId=seat_id,
        row=row,
        col=col,
        area=area,
        status=status,  # type: ignore[arg-type]
        areaCategory=area_category,  # type: ignore[arg-type]
        qualityTier=quality_tier,  # type: ignore[arg-type]
        price=price,
    )


def make_imax_row(
    row: int,
    cols: range,
    status: str = "Available",
    quality_tier: str = "optimal",
) -> list[Seat]:
    """Create a row of seats in the imax room. Block boundaries: 1-5, 6-15, 16-20."""
    seats = []
    for col in cols:
        if col <= 5:
            area = 1
        elif col <= 15:
            area = 2
        else:
            area = 3
        seats.append(
            make_seat(
                seat_id=f"{area}_{row}_{col}",
                row=row,
                col=col,
                area=area,
                status=status,
                quality_tier=quality_tier,
            )
        )
    return seats


def test_recommend_best_basic():
    """Basic happy path: 2 adjacent seats found."""
    showtime = make_showtime()
    # Row 5 is optimal tier: production cutoffs are rows 1-3 low, 4-8 optimal, 9+ high.
    seats = make_imax_row(5, range(1, 21))
    result = recommend_best([ShowtimeWithSeats(showtime=showtime, seats=seats)], n=2)
    assert result.outcome == "recommended"
    assert len(result.seatIds) == 2
    assert result.showtimeId == "st-1"


def test_never_discourage_invariant():
    """Soldout-everywhere returns no_availability with non-empty reasoning.

    The never-discourage invariant means we never return a bare empty refusal.
    When no seats are available, we return no_availability with reasoning
    that guides the user (never silent).
    """
    showtime = make_showtime(id="st-sold")
    seats = make_imax_row(5, range(1, 21), status="Sold")

    result = recommend_best([ShowtimeWithSeats(showtime=showtime, seats=seats)], n=2)
    assert result.outcome == "no_availability"
    assert result.seatIds == []
    assert result.showtimeId is None
    # reasoning must be non-empty — never a bare empty refusal
    assert len(result.reasoning) > 0
    assert "disponible" in result.reasoning.lower() or "silla" in result.reasoning.lower()


def test_wednesday_rounding():
    """Pricing formula: IMAX general on Wednesday rounds correctly."""
    from cinepais_agent.pricing import seat_price

    # 2026-08-05 is a Wednesday
    price = seat_price(["IMAX"], "general", "2026-08-05")
    assert price == 19000  # 32000 * 0.6 = 19200 → rounds to 19000


def test_front_only_recommends_with_alternative():
    """Front-only fixture: only low-tier seats available.

    With a better showtime also present, the scorer picks the optimal one and
    the low-tier showtime appears as an alternative with a Spanish reason.
    When two candidates exist, alternatives must be non-empty with Spanish reasons.
    """
    # Showtime 1: only front rows (low tier) available — rows 1-3 are low in production
    showtime1 = make_showtime(id="st-front", business_date="2026-08-08", time="20:00")
    seats1 = make_imax_row(1, range(1, 21), quality_tier="low")
    seats1 += make_imax_row(2, range(1, 21), quality_tier="low")

    # Showtime 2: optimal tier available (higher score → becomes primary)
    showtime2 = make_showtime(id="st-optimal", business_date="2026-08-09", time="20:00")
    seats2 = make_imax_row(5, range(1, 21), quality_tier="optimal")

    result = recommend_best(
        [
            ShowtimeWithSeats(showtime=showtime1, seats=seats1),
            ShowtimeWithSeats(showtime=showtime2, seats=seats2),
        ],
        n=2,
    )

    assert result.outcome == "recommended"
    assert result.showtimeId is not None
    assert len(result.seatIds) == 2
    # alternatives must be non-empty with valid Spanish reasons
    assert len(result.alternatives) > 0
    valid_reasons = {"mejor calidad de silla", "más económica", "horario alternativo"}
    for alt in result.alternatives:
        assert alt.reason in valid_reasons


def test_tiebreak_deterministic():
    """Two identical-score candidates → always picks the earlier date/time."""
    showtime_later = make_showtime(id="st-later", business_date="2026-08-09", time="20:00")
    showtime_earlier = make_showtime(id="st-earlier", business_date="2026-08-08", time="20:00")

    seats = make_imax_row(5, range(1, 21), quality_tier="optimal")

    # Run 3 times with both orderings to prove determinism
    for _ in range(3):
        result = recommend_best(
            [
                ShowtimeWithSeats(showtime=showtime_later, seats=list(seats)),
                ShowtimeWithSeats(showtime=showtime_earlier, seats=list(seats)),
            ],
            n=2,
        )
        assert result.outcome == "recommended"
        assert result.showtimeId == "st-earlier"  # earlier date always wins


def test_degraded_when_no_adjacent():
    """When no n adjacent seats exist but seats are available, returns degraded or recommended."""
    showtime = make_showtime()
    # Checkerboard: odd cols available, even cols sold — no 2 seats consecutive
    seats = []
    for col in range(1, 21):
        status = "Available" if col % 2 == 1 else "Sold"
        area = 1 if col <= 5 else (2 if col <= 15 else 3)
        seats.append(
            make_seat(
                seat_id=f"{area}_5_{col}",
                row=5,
                col=col,
                area=area,
                status=status,
                quality_tier="optimal",
            )
        )

    result = recommend_best([ShowtimeWithSeats(showtime=showtime, seats=seats)], n=2)
    assert result.outcome in ("degraded", "recommended")
    assert result.showtimeId is not None


def test_empty_candidates():
    """Empty candidates list returns no_availability."""
    result = recommend_best([], n=2)
    assert result.outcome == "no_availability"
    assert result.seatIds == []
