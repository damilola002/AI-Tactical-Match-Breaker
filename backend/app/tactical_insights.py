"""Deterministic Python insights derived only from recomputed board metrics."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from functools import cmp_to_key
import math
import json
import re
from typing import Any
from urllib.parse import quote

LINE_SPACING_THRESHOLD_METERS = 18
ZONE_DIFFERENCE_THRESHOLD_PLAYERS = 2
LARGE_GAP_THRESHOLD_METERS = 25


def _js_text_compare(first: str, second: str) -> int:
    """JavaScript relational string comparison compares UTF-16 code units."""
    a, b = first.encode("utf-16-be", "surrogatepass"), second.encode("utf-16-be", "surrogatepass")
    return (a > b) - (a < b)


def _display_one(value: float) -> str:
    # JS toFixed rounds the exact represented value to nearest, ties upward.
    return str(Decimal.from_float(float(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def _js_number_json(value: float) -> str:
    """Number spelling used only to reproduce the frontend's insight ordering key."""
    if value == 0:
        return "0"
    spelling = repr(float(value))
    if "e" not in spelling.lower():
        return spelling
    mantissa, exponent_text = re.split("e", spelling, flags=re.IGNORECASE)
    exponent = int(exponent_text)
    if 1e-6 <= abs(value) < 1e21:
        sign = "-" if mantissa.startswith("-") else ""
        digits = mantissa.lstrip("-").replace(".", "")
        decimals = len(mantissa.lstrip("-").split(".")[1]) if "." in mantissa else 0
        point = len(digits) - decimals + exponent
        if point <= 0:
            return sign + "0." + "0" * -point + digits
        if point >= len(digits):
            return sign + digits + "0" * (point - len(digits))
        return sign + digits[:point] + "." + digits[point:]
    sign = "+" if exponent >= 0 else ""
    return f"{mantissa}e{sign}{exponent}"


def _frontend_order_key(insight: dict[str, Any]) -> str:
    category = insight["category"]
    side = insight["teamSide"]
    if category == "line_spacing":
        return f"line_spacing:{side}:{insight['relatedMetric']['key']}"
    if category == "zone_difference":
        zone = insight["zone"]
        return f"zone_difference:{zone['row']}:{zone['column']}"
    names = insight["players"]
    record = "[" + ",".join((
        json.dumps(names[0], ensure_ascii=False),
        json.dumps(names[1], ensure_ascii=False),
        _js_number_json(insight["relatedMetric"]["value"]),
    )) + "]"
    return f"spatial_gap:{side}:{quote(record, safe="-_.!~*'()") }"


def _zone_compare(first: dict[str, Any], second: dict[str, Any]) -> int:
    for key in ("row", "column", "label", "homeCount", "awayCount", "homeDifference"):
        a, b = first[key], second[key]
        result = _js_text_compare(a, b) if isinstance(a, str) and isinstance(b, str) else (a > b) - (a < b)
        if result:
            return result
    return 0


def calculate_tactical_insights(
    metrics: dict[str, dict[str, Any]],
    zones: list[dict[str, Any]],
    team_names: dict[str, str],
) -> list[dict[str, Any]]:
    insights: list[dict[str, Any]] = []

    def label(side: str) -> str:
        name = team_names.get(side, "").strip()
        return name or ("Home" if side == "home" else "Away")

    relations = (
        ("defenseToMidfield", "defensive-to-midfield"),
        ("midfieldToForward", "midfield-to-forward"),
    )
    for side in ("home", "away"):
        spacing = metrics.get(side, {}).get("lineSpacingMeters", {})
        for key, phrase in relations:
            value = spacing.get(key)
            if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= LINE_SPACING_THRESHOLD_METERS:
                continue
            insights.append({
                "id": f"scenario_insight:line_spacing:{side}:{key}",
                "category": "line_spacing",
                "severity": "notable",
                "teamSide": side,
                "title": f"{phrase[0].upper()}{phrase[1:]} separation",
                "description": f"{label(side)} {phrase} separation is {_display_one(value)}m.",
                "relatedMetric": {"key": key, "value": value, "unit": "m", "threshold": LINE_SPACING_THRESHOLD_METERS},
            })

    by_cell: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for zone in zones:
        by_cell.setdefault((zone["row"], zone["column"]), []).append(zone)
    canonical = [
        items[0] if len(items) == 1 else sorted(items, key=cmp_to_key(_zone_compare))[0]
        for items in by_cell.values()
    ]
    for zone in canonical:
        difference = zone["homeDifference"]
        if difference == 0 or abs(difference) < ZONE_DIFFERENCE_THRESHOLD_PLAYERS:
            continue
        side = "home" if difference > 0 else "away"
        advantage = zone["homeCount"] if side == "home" else zone["awayCount"]
        other = zone["awayCount"] if side == "home" else zone["homeCount"]
        insights.append({
            "id": f"scenario_insight:zone:{zone['row']}:{zone['column']}",
            "category": "zone_difference",
            "severity": "notable",
            "teamSide": side,
            "title": f"Numerical difference · {zone['label']}",
            "description": f"{label(side)} has a {advantage}–{other} numerical advantage in {zone['label']}.",
            "relatedMetric": {"key": "zoneDifference", "value": abs(difference), "unit": "players", "threshold": ZONE_DIFFERENCE_THRESHOLD_PLAYERS},
            "zone": {key: zone[key] for key in ("row", "column", "label", "homeCount", "awayCount")},
        })

    for side in ("home", "away"):
        gaps = metrics.get(side, {}).get("spatialGaps", [])
        canonical_gaps = []
        for gap in gaps:
            if not math.isfinite(gap["distanceMeters"]) or gap["distanceMeters"] <= LARGE_GAP_THRESHOLD_METERS:
                continue
            names = sorted((gap["firstPlayer"], gap["secondPlayer"]), key=lambda value: value.encode("utf-16-be", "surrogatepass"))
            canonical_gaps.append((gap, names))
        canonical_gaps.sort(key=cmp_to_key(lambda a, b: (
            _js_text_compare(a[1][0], b[1][0])
            or _js_text_compare(a[1][1], b[1][1])
            or ((a[0]["distanceMeters"] > b[0]["distanceMeters"]) - (a[0]["distanceMeters"] < b[0]["distanceMeters"]))
        )))
        seen: set[tuple[str, str, float]] = set()
        for gap, names in canonical_gaps:
            record = (names[0], names[1], gap["distanceMeters"])
            if record in seen:
                continue
            seen.add(record)
            first_id = gap.get("firstPlayerId")
            second_id = gap.get("secondPlayerId")
            structural_pair = f"{min(first_id, second_id)}:{max(first_id, second_id)}" if first_id is not None and second_id is not None else "unknown-player-pair"
            distance = gap["distanceMeters"]
            insights.append({
                "id": f"scenario_insight:spatial_gap:{side}:{structural_pair}",
                "category": "spatial_gap",
                "severity": "notable",
                "teamSide": side,
                "title": "Nearest-player spatial gap",
                "description": f"{label(side)} spatial gap: {names[0]} ↔ {names[1]} — {_display_one(distance)}m.",
                "relatedMetric": {"key": "spatialGapDistance", "value": distance, "unit": "m", "threshold": LARGE_GAP_THRESHOLD_METERS},
                "players": names,
                "playerIds": [first_id, second_id] if first_id is not None and second_id is not None else [],
            })

    category_order = {"line_spacing": 0, "zone_difference": 1, "spatial_gap": 2}
    side_order = {"home": 0, "away": 1}
    insights.sort(key=lambda item: (
        category_order[item["category"]],
        side_order[item["teamSide"]],
        _frontend_order_key(item).encode("utf-16-be", "surrogatepass"),
    ))
    return insights
