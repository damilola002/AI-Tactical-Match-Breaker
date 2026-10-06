"""Deterministic historical match analytics derived from stored match data."""

from collections import Counter
from decimal import Decimal
from typing import Literal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Match, MatchPlayer, Team

ResultFilter = Literal["all", "win", "draw", "loss"]


def classify_result(goals_for: int | None, goals_against: int | None) -> str | None:
    """Classify a completed score from the selected team's perspective."""
    if goals_for is None or goals_against is None:
        return None
    if goals_for > goals_against:
        return "win"
    if goals_for < goals_against:
        return "loss"
    return "draw"


def _metric_summary(values: list[Decimal | int]) -> dict[str, Decimal | int | None]:
    if not values:
        return {"total": None, "mean_per_measured_player": None, "measured_player_count": 0}
    total = sum(values, Decimal(0))
    return {
        "total": total,
        "mean_per_measured_player": total / len(values),
        "measured_player_count": len(values),
    }


def _comparison(
    match: Match, selected_team_id: int, opponent_id: int
) -> tuple[dict[str, object], list[dict[str, object]]]:
    measured: dict[int, dict[str, list[Decimal | int]]] = {
        selected_team_id: {"distance": [], "sprints": []},
        opponent_id: {"distance": [], "sprints": []},
    }
    players: list[dict[str, object]] = []
    for participant in sorted(match.players, key=lambda row: row.player_id):
        player = participant.player
        distance = participant.distance_covered_meters
        sprints = participant.sprint_count
        players.append(
            {
                "player_id": player.id,
                "player_name": player.name,
                "team_id": participant.team_id,
                "distance_covered_meters": distance,
                "sprint_count": sprints,
            }
        )
        if participant.team_id not in measured:
            continue
        if distance is not None:
            measured[participant.team_id]["distance"].append(distance)
        if sprints is not None:
            measured[participant.team_id]["sprints"].append(sprints)

    selected_distance = _metric_summary(measured[selected_team_id]["distance"])
    opponent_distance = _metric_summary(measured[opponent_id]["distance"])
    selected_sprints = _metric_summary(measured[selected_team_id]["sprints"])
    opponent_sprints = _metric_summary(measured[opponent_id]["sprints"])

    def delta(left: dict[str, object], right: dict[str, object]) -> Decimal | int | None:
        if left["total"] is None or right["total"] is None:
            return None
        return left["total"] - right["total"]  # type: ignore[operator]

    return (
        {
            "selected_team": {"distance": selected_distance, "sprints": selected_sprints},
            "opponent": {"distance": opponent_distance, "sprints": opponent_sprints},
            "selected_minus_opponent": {
                "distance_total": delta(selected_distance, opponent_distance),
                "sprint_total": delta(selected_sprints, opponent_sprints),
            },
        },
        players,
    )


def _match_query(team_id: int):
    return (
        select(Match)
        .options(
            selectinload(Match.home_team),
            selectinload(Match.away_team),
            selectinload(Match.players).selectinload(MatchPlayer.player),
        )
        .where(or_(Match.home_team_id == team_id, Match.away_team_id == team_id))
        .order_by(Match.kickoff_at.desc(), Match.id.desc())
    )


def list_team_match_analytics(
    db: Session, team_id: int, result: ResultFilter = "all"
) -> list[dict[str, object]]:
    if db.get(Team, team_id) is None:
        return []
    rows = db.scalars(_match_query(team_id)).all()
    items: list[dict[str, object]] = []
    for match in rows:
        is_home = match.home_team_id == team_id
        selected = match.home_team if is_home else match.away_team
        opponent = match.away_team if is_home else match.home_team
        goals_for = match.home_score if is_home else match.away_score
        goals_against = match.away_score if is_home else match.home_score
        classification = classify_result(goals_for, goals_against)
        if result != "all" and classification != result:
            continue
        if classification is None:
            physical, players = None, [
                {
                    "player_id": item.player_id,
                    "player_name": item.player.name,
                    "team_id": item.team_id,
                    "distance_covered_meters": item.distance_covered_meters,
                    "sprint_count": item.sprint_count,
                }
                for item in sorted(match.players, key=lambda row: row.player_id)
            ]
        else:
            physical, players = _comparison(match, team_id, opponent.id)
        items.append(
            {
                "id": match.id,
                "kickoff_at": match.kickoff_at,
                "home_team": {"id": match.home_team.id, "name": match.home_team.name},
                "away_team": {"id": match.away_team.id, "name": match.away_team.name},
                "selected_team": {"id": selected.id, "name": selected.name},
                "opponent": {"id": opponent.id, "name": opponent.name},
                "venue_context": "home" if is_home else "away",
                "result": classification,
                "goals_for": goals_for,
                "goals_against": goals_against,
                "physical_comparison": physical,
                "players": players,
            }
        )
    return items


def _average(values: list[Decimal | int]) -> Decimal | None:
    if not values:
        return None
    return sum(values, Decimal(0)) / len(values)


def summarize_team_history(
    db: Session, team_id: int, result: ResultFilter = "all"
) -> dict[str, object] | None:
    if db.get(Team, team_id) is None:
        return None
    matches = db.scalars(_match_query(team_id)).all()
    completed = [
        match
        for match in matches
        if classify_result(
            match.home_score if match.home_team_id == team_id else match.away_score,
            match.away_score if match.home_team_id == team_id else match.home_score,
        )
        is not None
    ]
    cohort = [
        match
        for match in completed
        if result == "all"
        or classify_result(
            match.home_score if match.home_team_id == team_id else match.away_score,
            match.away_score if match.home_team_id == team_id else match.home_score,
        )
        == result
    ]

    result_counts: Counter[str] = Counter()
    distances: dict[str, list[Decimal | int]] = {
        "selected_total": [], "opponent_total": [],
        "selected_mean": [], "opponent_mean": [], "delta": [],
    }
    sprints: dict[str, list[Decimal | int]] = {
        "selected_total": [], "opponent_total": [],
        "selected_mean": [], "opponent_mean": [], "delta": [],
    }
    coverage = {
        metric: {
            side: {"measured_player_appearances": 0, "player_appearances": 0}
            for side in ("selected_team", "opponent")
        }
        for metric in ("distance", "sprints")
    }
    for match in cohort:
        is_home = match.home_team_id == team_id
        opponent_id = match.away_team_id if is_home else match.home_team_id
        classification = classify_result(
            match.home_score if is_home else match.away_score,
            match.away_score if is_home else match.home_score,
        )
        if classification:
            result_counts[classification] += 1
        comparison, _players = _comparison(match, team_id, opponent_id)
        for metric, target in (("distance", distances), ("sprints", sprints)):
            selected = comparison["selected_team"][metric]  # type: ignore[index]
            other = comparison["opponent"][metric]  # type: ignore[index]
            delta_key = "distance_total" if metric == "distance" else "sprint_total"
            if selected["total"] is not None:
                target["selected_total"].append(selected["total"])
                target["selected_mean"].append(selected["mean_per_measured_player"])
            if other["total"] is not None:
                target["opponent_total"].append(other["total"])
                target["opponent_mean"].append(other["mean_per_measured_player"])
            delta_value = comparison["selected_minus_opponent"][delta_key]  # type: ignore[index]
            if delta_value is not None:
                target["delta"].append(delta_value)
        for participant in match.players:
            if participant.team_id == team_id:
                coverage_side = "selected_team"
            elif participant.team_id == opponent_id:
                coverage_side = "opponent"
            else:
                continue
            coverage["distance"][coverage_side]["player_appearances"] += 1
            coverage["sprints"][coverage_side]["player_appearances"] += 1
            if participant.distance_covered_meters is not None:
                coverage["distance"][coverage_side]["measured_player_appearances"] += 1
            if participant.sprint_count is not None:
                coverage["sprints"][coverage_side]["measured_player_appearances"] += 1

    def pack(values: dict[str, list[Decimal | int]]) -> dict[str, Decimal | None]:
        return {
            "selected_team_average_total": _average(values["selected_total"]),
            "opponent_average_total": _average(values["opponent_total"]),
            "selected_team_average_per_measured_player": _average(values["selected_mean"]),
            "opponent_average_per_measured_player": _average(values["opponent_mean"]),
            "selected_minus_opponent_average_delta": _average(values["delta"]),
        }

    for metric_coverage in coverage.values():
        for item in metric_coverage.values():
            measured = item["measured_player_appearances"]
            appearances = item["player_appearances"]
            item["percentage"] = (measured / appearances * 100) if appearances else None

    return {
        "match_count": len(cohort),
        "results": {
            "wins": result_counts["win"],
            "draws": result_counts["draw"],
            "losses": result_counts["loss"],
        },
        "physical_averages": {"distance": pack(distances), "sprints": pack(sprints)},
        "measurement_coverage": coverage,
    }
