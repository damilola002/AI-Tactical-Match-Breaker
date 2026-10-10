import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import re

from app.tactical_insights import calculate_tactical_insights
from app.tactical_metrics import calculate_team_metrics, calculate_zone_occupancy

FIXTURE = Path(__file__).parents[2] / "tests" / "fixtures" / "tactical_report_parity.json"
if not FIXTURE.exists():
    FIXTURE = Path(__file__).parent / "fixtures" / "tactical_report_parity.json"
ABS_TOLERANCE_METERS = 1e-9


def _fixture():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _numeric_close(actual, expected, path="value"):
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys(), path
        for key in expected:
            _numeric_close(actual[key], expected[key], f"{path}.{key}")
    elif isinstance(expected, list):
        assert len(actual) == len(expected), path
        for index, (left, right) in enumerate(zip(actual, expected)):
            _numeric_close(left, right, f"{path}[{index}]")
    elif isinstance(expected, float):
        assert abs(actual - expected) <= ABS_TOLERANCE_METERS, f"{path}: {actual} != {expected} within tolerance"
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


def _metric_projection(metrics):
    projected = {}
    for side, team in metrics.items():
        projected[side] = {**team}
        projected[side]["spatialGaps"] = [
            {key: gap[key] for key in ("firstPlayer", "secondPlayer", "distanceMeters")}
            for gap in team["spatialGaps"]
        ]
    return projected


def _insight_projection(insights):
    return [
        {key: value for key, value in item.items() if key not in {"id", "playerIds"}}
        for item in insights
    ]


def _descriptions_close(actual, expected):
    pattern = re.compile(r"(\d+\.\d+)m")
    actual_numbers = [Decimal(value) for value in pattern.findall(actual)]
    expected_numbers = [Decimal(value) for value in pattern.findall(expected)]
    assert len(actual_numbers) == len(expected_numbers)
    actual_text = pattern.sub("<METRES>", actual)
    expected_text = pattern.sub("<METRES>", expected)
    assert actual_text == expected_text
    for left, right in zip(actual_numbers, expected_numbers):
        # Each implementation displays one decimal; permit at most one display unit
        # for language-specific ties while raw values remain checked separately.
        assert abs(left - right) <= Decimal("0.1")
        assert left == left.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def _compare_insights(actual, expected):
    assert len(actual) == len(expected)
    for index, (left, right) in enumerate(zip(actual, expected)):
        label = f"insight[{index}]"
        assert left["category"] == right["category"], label
        assert left.get("teamSide") == right.get("teamSide"), label
        assert left["title"] == right["title"], label
        _descriptions_close(left["description"], right["description"])
        assert left["severity"] == right["severity"], label
        left_metric, right_metric = left["relatedMetric"], right["relatedMetric"]
        assert {k: v for k, v in left_metric.items() if k != "value"} == {k: v for k, v in right_metric.items() if k != "value"}, label
        if left_metric["unit"] == "m":
            assert abs(left_metric["value"] - right_metric["value"]) <= ABS_TOLERANCE_METERS, label
        else:
            assert left_metric["value"] == right_metric["value"], label
        for key in ("zone", "players"):
            if key in left or key in right:
                assert left.get(key) == right.get(key), label


def test_shared_metric_fixtures_match_with_numeric_tolerance_and_exact_structure():
    for case in _fixture()["cases"]:
        metrics = {side: calculate_team_metrics(side, case[side]) for side in ("home", "away")}
        zones = calculate_zone_occupancy(case["home"], case["away"])
        insights = calculate_tactical_insights(metrics, zones, case["teams"])
        expected = case["frontend_expected"]
        _numeric_close(_metric_projection(metrics), expected["metrics"], case["name"] + ".metrics")
        assert zones == expected["zones"], case["name"] + ".zones"
        _compare_insights(_insight_projection(insights), expected["insights"])


def test_shared_insight_fixtures_keep_thresholds_duplicates_and_order_exact():
    for case in _fixture()["insight_cases"]:
        insights = calculate_tactical_insights(case["metrics"], case["zones"], case["teams"])
        _compare_insights(_insight_projection(insights), case["frontend_expected"])
    strict = _fixture()["insight_cases"][0]
    actual = calculate_tactical_insights(strict["metrics"], strict["zones"], strict["teams"])
    assert not any(item["category"] == "line_spacing" and item["relatedMetric"]["value"] == 18 for item in actual)
    assert any(item["category"] == "line_spacing" and item["relatedMetric"]["value"] > 18 for item in actual)
    assert not any(item["category"] == "spatial_gap" and item["relatedMetric"]["value"] == 25 for item in actual)


def test_input_order_resolves_equal_nearest_player_distances():
    case = next(item for item in _fixture()["cases"] if item["name"] == "equal-distance-tie-preserves-input-order")
    metrics = calculate_team_metrics("home", case["home"])
    assert metrics["spatialGaps"][0]["firstPlayer"] == "Center"
    assert metrics["spatialGaps"][0]["secondPlayer"] == "Right / wing"
    assert metrics["spatialGaps"][0]["firstPlayerId"] == 61
    assert metrics["spatialGaps"][0]["secondPlayerId"] == 63


def test_equal_distance_tie_and_insight_order_are_repeatable():
    case = next(item for item in _fixture()["cases"] if item["name"] == "equal-distance-tie-preserves-input-order")
    first = calculate_team_metrics("home", case["home"])
    second = calculate_team_metrics("home", case["home"])
    assert first == second
    assert [gap["firstPlayerId"] for gap in first["spatialGaps"]] == [gap["firstPlayerId"] for gap in second["spatialGaps"]]
    zones = calculate_zone_occupancy(case["home"], case["away"])
    first_insights = calculate_tactical_insights(
        {side: calculate_team_metrics(side, case[side]) for side in ("home", "away")}, zones, case["teams"]
    )
    second_insights = calculate_tactical_insights(
        {side: calculate_team_metrics(side, case[side]) for side in ("home", "away")}, zones, case["teams"]
    )
    assert [item["id"] for item in first_insights] == [item["id"] for item in second_insights]


def test_exact_zone_difference_of_two_is_reported():
    empty_metrics = {
        side: {"lineSpacingMeters": {}, "spatialGaps": []}
        for side in ("home", "away")
    }
    zones = [{
        "row": 0, "column": 1, "label": "Top · Center",
        "homeCount": 2, "awayCount": 0, "homeDifference": 2,
    }]
    insights = calculate_tactical_insights(empty_metrics, zones, {"home": "Home", "away": "Away"})
    assert len(insights) == 1
    assert insights[0]["category"] == "zone_difference"
    assert insights[0]["teamSide"] == "home"
    assert insights[0]["relatedMetric"]["value"] == 2


def test_thresholds_from_position_fixtures_agree_with_frontend():
    cases = {item["name"]: item for item in _fixture()["cases"]}
    exact = calculate_team_metrics("home", cases["exact-gap-threshold"]["home"])
    above = calculate_team_metrics("home", cases["just-above-gap-threshold"]["home"])
    assert exact["spatialGaps"] == []
    assert len(above["spatialGaps"]) == 1
