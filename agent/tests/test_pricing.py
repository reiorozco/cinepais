from cinepais_agent.pricing import dominant_format, is_wednesday, seat_price


def test_dominant_format_imax_wins():
    assert dominant_format(["IMAX", "2D"]) == "IMAX"


def test_dominant_format_onyx_over_2d():
    assert dominant_format(["2D", "Onyx"]) == "Onyx"


def test_dominant_format_single():
    assert dominant_format(["2D"]) == "2D"


def test_is_wednesday_true():
    # 2026-08-05 is a Wednesday
    assert is_wednesday("2026-08-05") is True


def test_is_wednesday_false():
    # 2026-08-06 is a Thursday
    assert is_wednesday("2026-08-06") is False


def test_wednesday_rounding():
    """IMAX general on Wednesday: 32000 * 1.0 * 0.6 = 19200 → rounds to 19000."""
    price = seat_price(["IMAX"], "general", "2026-08-05")
    assert price == 19000


def test_imax_general_non_wednesday():
    """IMAX general non-Wednesday: 32000 * 1.0 * 1.0 = 32000."""
    price = seat_price(["IMAX"], "general", "2026-08-06")
    assert price == 32000


def test_imax_premium_zone():
    """IMAX premium zone: 32000 * 1.35 = 43200 → rounds to 43000."""
    price = seat_price(["IMAX"], "premium", "2026-08-06")
    assert price == 43000


def test_2d_preferential():
    """2D preferential: 18000 * 1.15 = 20700 → rounds to 20500 (41.4 → 41 × 500)."""
    price = seat_price(["2D"], "preferential", "2026-08-06")
    assert price == 20500


def test_wednesday_imax_premium():
    """IMAX premium on Wednesday: 32000 * 1.35 * 0.6 = 25920 → rounds to 26000."""
    price = seat_price(["IMAX"], "premium", "2026-08-05")
    assert price == 26000
