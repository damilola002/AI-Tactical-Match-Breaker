"""Independent Python calculations matching the current tactical board rules."""

from __future__ import annotations

import math
import re
from typing import Any, Literal

Side = Literal["home", "away"]
Player = dict[str, Any]
Position = dict[str, float]
PITCH_LENGTH_METERS = 105
PITCH_WIDTH_METERS = 68
LARGE_GAP_THRESHOLD_METERS = 25


def map_player_role(position: str | None) -> str | None:
    if not isinstance(position, str):
        return None
    role = re.sub(r"[._-]+", " ", position.strip().lower())
    if role in {"gk", "keeper", "goalkeeper", "goal keeper"}:
        return "goalkeeper"
    if role in {"def", "defender", "defence", "defense", "centre back", "center back", "cb", "lb", "rb", "lwb", "rwb"}:
        return "defender"
    if role in {"mid", "midfielder", "midfield", "cm", "cdm", "cam", "lm", "rm", "dm", "am"}:
        return "midfielder"
    if role in {"fwd", "forward", "striker", "attacker", "winger", "st", "cf", "lw", "rw"}:
        return "forward"
    return None


def _coord(position: Position) -> tuple[float, float]:
    return (position["x"] / 100) * 105, (position["y"] / 100) * 68


def distance_meters(first: Position, second: Position) -> float:
    a_x, a_y = _coord(first)
    b_x, b_y = _coord(second)
    return math.hypot(a_x - b_x, a_y - b_y)


def _placed(players: list[Player]) -> list[Player]:
    return [player for player in players if player.get("position") is not None]


def _mean(values: list[float]) -> float | None:
    return sum(values, 0) / len(values) if values else None


def _line(players: list[Player], side: Side, role: str) -> dict[str, Any] | None:
    members = [player for player in players if map_player_role(player.get("position_role")) == role]
    if not members:
        return None
    progress = [p["position"]["x"] if side == "home" else 100 - p["position"]["x"] for p in members]
    return {"averageDepthMeters": (_mean(progress) / 100) * 105, "playerCount": len(members)}


def _spatial_gaps(players: list[Player]) -> list[dict[str, Any]]:
    gaps: dict[tuple[int, int], dict[str, Any]] = {}
    for player in players:
        nearest: Player | None = None
        nearest_distance = math.inf
        for candidate in players:
            if candidate["player_id"] == player["player_id"]:
                continue
            distance = distance_meters(player["position"], candidate["position"])
            # Strict comparison preserves the first candidate on a tie.
            if distance < nearest_distance:
                nearest, nearest_distance = candidate, distance
        if nearest is not None and nearest_distance > LARGE_GAP_THRESHOLD_METERS:
            first, second = sorted((player, nearest), key=lambda item: item["player_id"])
            pair = (first["player_id"], second["player_id"])
            gaps[pair] = {
                "firstPlayer": first["name"],
                "secondPlayer": second["name"],
                "firstPlayerId": first["player_id"],
                "secondPlayerId": second["player_id"],
                "distanceMeters": nearest_distance,
            }
    # Python's sort is stable, matching the insertion order of the TS Map for ties.
    return sorted(gaps.values(), key=lambda gap: -gap["distanceMeters"])


def calculate_team_metrics(side: Side, players: list[Player]) -> dict[str, Any]:
    placed = _placed(players)
    xs = [item["position"]["x"] for item in placed]
    ys = [item["position"]["y"] for item in placed]
    lines = {
        "defense": _line(placed, side, "defender"),
        "midfield": _line(placed, side, "midfielder"),
        "forward": _line(placed, side, "forward"),
    }

    def spacing(first: dict[str, Any] | None, second: dict[str, Any] | None) -> float | None:
        if first is None or second is None:
            return None
        return abs(first["averageDepthMeters"] - second["averageDepthMeters"])

    return {
        "side": side,
        "placedPlayerCount": len(placed),
        "averagePosition": {"x": _mean(xs), "y": _mean(ys)} if placed else None,
        "widthMeters": ((max(ys) - min(ys)) / 100) * 68 if ys else None,
        "lines": lines,
        "lineSpacingMeters": {
            "defenseToMidfield": spacing(lines["defense"], lines["midfield"]),
            "midfieldToForward": spacing(lines["midfield"], lines["forward"]),
        },
        "spatialGaps": _spatial_gaps(placed),
    }


def calculate_zone_occupancy(home: list[Player], away: list[Player]) -> list[dict[str, Any]]:
    counts = [[{"homeCount": 0, "awayCount": 0} for _ in range(3)] for _ in range(3)]

    def zone_index(value: float) -> int:
        return min(2, max(0, math.floor((value / 100) * 3)))

    for side, players in (("home", home), ("away", away)):
        for player in _placed(players):
            pos = player["position"]
            counts[zone_index(pos["y"])][zone_index(pos["x"])][f"{side}Count"] += 1
    vertical, horizontal = ["Top", "Middle", "Bottom"], ["Left", "Center", "Right"]
    return [
        {
            "row": row,
            "column": column,
            "label": f"{vertical[row]} · {horizontal[column]}",
            "homeCount": cell["homeCount"],
            "awayCount": cell["awayCount"],
            "homeDifference": cell["homeCount"] - cell["awayCount"],
        }
        for row in range(3)
        for column in range(3)
        for cell in (counts[row][column],)
    ]
