"""Stateless tactical report orchestration and server-side evidence validation."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import math
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.analytics import list_team_match_analytics, summarize_team_history
from app.models import Player, Team
from app.report_providers import DeterministicMockProvider, ReportProvider
from app.report_schemas import ProviderReport, ReportRequest, TacticalReportResponse
from app.schemas import DEMO_DATA_LABEL
from app.tactical_insights import calculate_tactical_insights
from app.tactical_metrics import calculate_team_metrics, calculate_zone_occupancy

FORMATION_SLOT_COUNTS = {"4-3-3": 11, "4-4-2": 11, "3-5-2": 11}


class ReportNotFound(Exception):
    pass


class ReportValidationError(Exception):
    pass


def _json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def _expected_claim(claim_type: str, evidence_id: str, item: dict[str, Any]) -> dict[str, Any]:
    kind = item["kind"]
    value = item.get("value")
    if claim_type == "scenario_metric" and kind == "scenario_metric":
        return {
            "claim_type": claim_type, "evidence_id": evidence_id,
            "side": item.get("side"), "team_id": item.get("team_id"),
            "metric_key": item["source_key"], "player_ids": item.get("player_ids", []), "value": value,
        }
    if claim_type == "scenario_insight" and kind == "scenario_insight":
        metric = value["relatedMetric"]
        zone = value.get("zone", {})
        return {
            "claim_type": claim_type, "evidence_id": evidence_id,
            "side": item["side"], "team_id": item["team_id"],
            "category": item["source_key"], "player_ids": sorted(item.get("player_ids", [])),
            "metric_key": metric["key"], "value": metric["value"],
            "zone_row": zone.get("row"), "zone_column": zone.get("column"),
        }
    if claim_type == "historical_match" and kind == "historical_match":
        return {
            "claim_type": claim_type, "evidence_id": evidence_id,
            "team_id": item["team_id"], "match_id": item["match_id"],
            **value,
        }
    if claim_type == "historical_measurement" and kind == "historical_measurement":
        return {
            "claim_type": claim_type, "evidence_id": evidence_id,
            "team_id": item["team_id"], "match_id": item["match_id"],
            "player_id": item["player_id"], "metric_field": item["source_key"], "value": value,
        }
    raise ReportValidationError("Claim type does not match its evidence")


def _same_claim_value(actual: Any, expected: Any) -> bool:
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(
            _same_claim_value(actual[key], expected[key]) for key in expected
        )
    if isinstance(expected, list):
        return len(actual) == len(expected) and all(
            _same_claim_value(left, right) for left, right in zip(actual, expected)
        )
    return actual == expected


def validate_evidence_links(report: dict[str, Any], evidence: dict[str, dict[str, Any]]) -> ProviderReport:
    """Accept only structured claims whose every asserted field matches one evidence record."""
    try:
        parsed = ProviderReport.model_validate(report)
    except ValidationError as error:
        raise ReportValidationError("Provider output must contain structured claims only") from error

    def validate_claim(claim: Any) -> dict[str, Any]:
        evidence_id = claim.evidence_id
        source = evidence.get(evidence_id)
        if source is None:
            raise ReportValidationError("Claim references unknown evidence")
        actual = claim.model_dump()
        expected = _expected_claim(claim.claim_type, evidence_id, source)
        if not _same_claim_value(actual, expected):
            raise ReportValidationError("Structured claim does not match its referenced evidence")
        return source

    for observation in parsed.observations:
        validate_claim(observation.claim)
    for recommendation in parsed.recommendations:
        source = validate_claim(recommendation.claim)
        if recommendation.claim.claim_type == "scenario_metric" and source["source_key"] == "insight_count":
            raise ReportValidationError("A threshold-insight count cannot support a recommendation")
    return parsed


def _render_observation(claim: Any, evidence: dict[str, Any], teams: dict[str, Any]) -> tuple[str, str]:
    """Render factual prose only from the claim already matched to its registry record."""
    kind = claim.claim_type
    if kind == "scenario_insight":
        return "current_scenario", evidence["value"]["description"]
    if kind == "scenario_metric":
        key, value = claim.metric_key, claim.value
        if key == "insight_count":
            return "current_scenario", "No threshold-based tactical insight was generated from the currently placed players."
        if key == "zone_occupancy":
            return "current_scenario", f"Current scenario occupancy in {value['label']}: Home {value['homeCount']}, Away {value['awayCount']}."
        team_name = teams[claim.side]["name"]
        if key == "placed_player_count":
            text = f"{team_name} has {value} players placed on the current tactical board."
        elif key == "width_meters":
            text = f"{team_name}'s current pitch width is {value}m." if value is not None else f"{team_name}'s pitch width is unavailable because no players are placed."
        elif key == "average_position":
            text = (
                f"{team_name}'s average board position is x={value['x']}%, y={value['y']}%."
                if value is not None else f"{team_name}'s average board position is unavailable because no players are placed."
            )
        elif key.startswith("line_spacing_"):
            relation = key.removeprefix("line_spacing_").replace("To", " to ")
            text = f"{team_name}'s {relation} line spacing is {value}m." if value is not None else f"{team_name}'s {relation} line spacing is unavailable because a line has no placed players."
        elif key.startswith("line_"):
            line = key.removeprefix("line_")
            text = (
                f"{team_name}'s {line} line averages {value['averageDepthMeters']}m of attack-relative depth across {value['playerCount']} players."
                if value is not None else f"{team_name}'s {line} line is unavailable because no matching players are placed."
            )
        elif key == "spatial_gap":
            text = f"Current board spacing between {value['firstPlayer']} and {value['secondPlayer']} is {value['distanceMeters']}m."
        else:
            raise ReportValidationError("Scenario metric has no deterministic report renderer")
        return "current_scenario", text
    if kind == "historical_match":
        team_name = next(team["name"] for team in teams.values() if team["id"] == claim.team_id)
        if claim.result is None:
            text = f"Stored historical match {claim.match_id} involving {team_name} is pending; no result is classified."
        else:
            text = (
                f"Stored historical match {claim.match_id} ended {claim.goals_for}–{claim.goals_against} "
                f"from {team_name}'s perspective ({claim.result})."
            )
        return "historical_context", text
    field_label = "distance covered" if claim.metric_field == "distance_covered_meters" else "sprint count"
    unit = " m" if claim.metric_field == "distance_covered_meters" else ""
    return (
        "historical_context",
        f"Stored {field_label} for player {claim.player_id} in match {claim.match_id} is {claim.value}{unit}.",
    )


def _render_recommendation(claim: Any, evidence: dict[str, Any], teams: dict[str, Any]) -> str:
    if claim.claim_type == "scenario_metric":
        if claim.value is None:
            raise ReportValidationError("Unavailable metrics cannot support a recommendation")
        team_name = teams[claim.side]["name"] if claim.side in teams else "the selected teams"
        targets = {
            "placed_player_count": "the number of placed players",
            "average_position": "the current average position",
            "width_meters": "the current pitch width",
            "line_defense": "the defensive line depth",
            "line_midfield": "the midfield line depth",
            "line_forward": "the forward line depth",
            "line_spacing_defenseToMidfield": "defensive-to-midfield spacing",
            "line_spacing_midfieldToForward": "midfield-to-forward spacing",
            "spatial_gap": "the measured player spacing",
        }
        if claim.metric_key == "zone_occupancy":
            target = f"player coverage in {evidence['value']['label']}"
        else:
            target = targets.get(claim.metric_key)
        if target is None:
            raise ReportValidationError("Scenario metric cannot support a recommendation")
        return f"Review {team_name}'s {target} on the current tactical board."
    insight = evidence["value"]
    team_name = teams[claim.side]["name"]
    if claim.category == "line_spacing":
        relation = {
            "defenseToMidfield": "defensive-to-midfield",
            "midfieldToForward": "midfield-to-forward",
        }[claim.metric_key]
        return f"Review {team_name}'s current {relation} separation on the tactical board."
    if claim.category == "zone_difference":
        return f"Review {team_name}'s player coverage in {insight['zone']['label']} against the selected shape."
    first, second = insight["players"]
    return f"Review the current spacing between {first} and {second} on the board."


def _append_evidence(registry: list[dict[str, Any]], item: dict[str, Any]) -> str:
    registry.append(item)
    return item["id"]


def _insight_evidence_id(insight: dict[str, Any]) -> str:
    if insight["category"] == "line_spacing":
        key = insight["relatedMetric"]["key"]
        return f"scenario_insight:line_spacing:{insight['teamSide']}:{key}"
    if insight["category"] == "zone_difference":
        return f"scenario_insight:zone:{insight['zone']['row']}:{insight['zone']['column']}"
    player_ids = insight.get("playerIds", [])
    if player_ids:
        pair = ":".join(str(item) for item in sorted(player_ids))
    else:
        pair = "unknown-player-pair"
    return f"scenario_insight:spatial_gap:{insight['teamSide']}:{pair}"


def generate_tactical_report(
    db: Session,
    request: ReportRequest,
    provider: ReportProvider | None = None,
) -> TacticalReportResponse:
    if request.home_team_id == request.away_team_id:
        raise ReportValidationError("Home and away teams must be different")
    teams = {"home": db.get(Team, request.home_team_id), "away": db.get(Team, request.away_team_id)}
    if teams["home"] is None or teams["away"] is None:
        raise ReportNotFound("Team not found")

    player_rows: dict[str, list[dict[str, Any]]] = {"home": [], "away": []}
    used_players: set[int] = set()
    used_slots: dict[str, set[int]] = {"home": set(), "away": set()}
    for assigned in request.players:
        side = assigned.side
        if assigned.player_id in used_players:
            raise ReportValidationError("A player can only be assigned once")
        used_players.add(assigned.player_id)
        if assigned.formation_slot >= FORMATION_SLOT_COUNTS[request.formation_by_side[side]]:
            raise ReportValidationError("Formation slot is outside the selected formation")
        if assigned.formation_slot in used_slots[side]:
            raise ReportValidationError("A formation slot can only be occupied once per side")
        used_slots[side].add(assigned.formation_slot)
        player = db.get(Player, assigned.player_id)
        if player is None:
            raise ReportNotFound("Player not found")
        if player.team_id != teams[side].id:
            raise ReportValidationError("Player does not belong to the selected team")
        position = assigned.position.model_dump()
        if not all(math.isfinite(value) and 0 <= value <= 100 for value in position.values()):
            raise ReportValidationError("Player coordinates must be finite and within 0 to 100")
        player_rows[side].append({
            "player_id": player.id,
            "name": player.name,
            "position_role": player.position,
            "position": position,
        })

    metrics = {side: calculate_team_metrics(side, player_rows[side]) for side in ("home", "away")}
    zones = calculate_zone_occupancy(player_rows["home"], player_rows["away"])
    team_names = {side: teams[side].name for side in ("home", "away")}
    insights = calculate_tactical_insights(metrics, zones, team_names)
    placed_counts = {side: len(player_rows[side]) for side in ("home", "away")}
    scenario = {
        "home_team": {"id": teams["home"].id, "name": teams["home"].name},
        "away_team": {"id": teams["away"].id, "name": teams["away"].name},
        "formation_by_side": dict(request.formation_by_side),
        "placed_player_count": placed_counts,
    }

    registry: list[dict[str, Any]] = []
    historical: dict[str, Any] = {}
    match_evidence: dict[tuple[str, int], str] = {}
    measurement_evidence: dict[tuple[str, int, int, str], str] = {}
    for side in ("home", "away"):
        team = teams[side]
        summary = summarize_team_history(db, team.id, result="all")
        matches = _json_safe(list_team_match_analytics(db, team.id, result="all"))
        historical[side] = {
            "team": {"id": team.id, "name": team.name},
            "summary": _json_safe(summary),
            "matches": matches,
        }
        for match in matches:
            match_id = match["id"]
            evidence_id = f"historical_match:{match_id}:team:{team.id}"
            match_evidence[(side, match_id)] = evidence_id
            _append_evidence(registry, {
                "id": evidence_id,
                "kind": "historical_match",
                "label": f"Stored match {match_id} involving {team.name}",
                "source_key": "match_result",
                "team_id": team.id,
                "match_id": match_id,
                "value": {key: match[key] for key in ("result", "goals_for", "goals_against", "kickoff_at")},
            })
            for participant in match["players"]:
                for field in ("distance_covered_meters", "sprint_count"):
                    if participant[field] is None:
                        continue
                    key = (side, match_id, participant["player_id"], field)
                    evidence_id = f"historical_measurement:{match_id}:{participant['player_id']}:{field}"
                    measurement_evidence[key] = evidence_id
                    # A match visible in both selected-team histories still has one stored measurement.
                    if not any(item["id"] == evidence_id for item in registry):
                        _append_evidence(registry, {
                            "id": evidence_id,
                            "kind": "historical_measurement",
                            "label": f"Stored {field} for player {participant['player_id']} in match {match_id}",
                            "source_key": field,
                            "team_id": participant["team_id"],
                            "match_id": match_id,
                            "player_id": participant["player_id"],
                            "value": participant[field],
                        })

    metric_ids: dict[tuple[str, str], str] = {}
    for side in ("home", "away"):
        team_metrics = metrics[side]
        metric_values = {
            "placed_player_count": team_metrics["placedPlayerCount"],
            "average_position": team_metrics["averagePosition"],
            "width_meters": team_metrics["widthMeters"],
            **{f"line_{key}": value for key, value in team_metrics["lines"].items()},
            **{f"line_spacing_{key}": value for key, value in team_metrics["lineSpacingMeters"].items()},
        }
        for key, value in metric_values.items():
            evidence_id = f"scenario_metric:{side}:{key}"
            metric_ids[(side, key)] = evidence_id
            _append_evidence(registry, {
                "id": evidence_id,
                "kind": "scenario_metric",
                "label": f"Current scenario {side} {key}",
                "source_key": key,
                "side": side,
                "team_id": teams[side].id,
                "value": value,
            })
        for gap in team_metrics["spatialGaps"]:
            first_id, second_id = sorted((gap["firstPlayerId"], gap["secondPlayerId"]))
            evidence_id = f"scenario_metric:{side}:spatial_gap:{first_id}:{second_id}"
            metric_ids[(side, f"spatial_gap:{first_id}:{second_id}")] = evidence_id
            _append_evidence(registry, {
                "id": evidence_id,
                "kind": "scenario_metric",
                "label": f"Current scenario spatial gap for {side}",
                "source_key": "spatial_gap",
                "side": side,
                "team_id": teams[side].id,
                "player_ids": [first_id, second_id],
                "value": gap,
            })

    for zone in zones:
        _append_evidence(registry, {
            "id": f"scenario_metric:zone:{zone['row']}:{zone['column']}",
            "kind": "scenario_metric",
            "label": f"Current scenario occupancy for {zone['label']}",
            "source_key": "zone_occupancy",
            "value": zone,
        })
    for insight in insights:
        evidence_id = _insight_evidence_id(insight)
        insight["id"] = evidence_id
        _append_evidence(registry, {
            "id": evidence_id,
            "kind": "scenario_insight",
            "label": insight["title"],
            "source_key": insight["category"],
            "side": insight["teamSide"],
            "team_id": teams[insight["teamSide"]].id,
            "player_ids": insight.get("playerIds", []),
            "value": insight,
        })

    empty_insight_evidence = f"scenario_metric:insight_count:{len(insights)}"
    _append_evidence(registry, {
        "id": empty_insight_evidence,
        "kind": "scenario_metric",
        "label": "Current scenario threshold-based insight count",
        "source_key": "insight_count",
        "value": len(insights),
    })
    context = {
        "scenario": scenario,
        "teams": {side: {"id": teams[side].id, "name": teams[side].name} for side in ("home", "away")},
        "metrics": metrics,
        "zones": zones,
        "insights": insights,
        "historical_context": historical,
        "insight_evidence": {insight["id"]: insight["id"] for insight in insights},
        "match_evidence": match_evidence,
        "measurement_evidence": measurement_evidence,
        "empty_scenario_evidence": empty_insight_evidence,
    }
    provider_output = (provider or DeterministicMockProvider()).generate(context)
    evidence_by_id = {item["id"]: item for item in registry}
    claims = validate_evidence_links(provider_output, evidence_by_id)
    observations = []
    for index, item in enumerate(claims.observations):
        claim = item.claim
        evidence_id = claim.evidence_id
        scope, text = _render_observation(claim, evidence_by_id[evidence_id], context["teams"])
        observations.append({
            "id": f"observation:{evidence_id}:{index}",
            "scope": scope,
            "text": text,
            "evidence_ids": [evidence_id],
            "confidence": item.confidence,
            "claim": claim.model_dump(),
        })
    recommendations = []
    for item in claims.recommendations:
        claim = item.claim
        evidence_id = claim.evidence_id
        recommendations.append({
            "id": f"recommendation:{evidence_id}",
            "text": _render_recommendation(claim, evidence_by_id[evidence_id], context["teams"]),
            "evidence_ids": [evidence_id],
            "limitations": ["This is a prompt for human review, not a prediction or proof of tactical effect."],
            "claim": claim.model_dump(),
        })
    relevant_player_ids = sorted({
        player_id
        for item in claims.recommendations
        for player_id in item.claim.player_ids
    })
    summary = (
        "Rule-based demo report for the current tactical-board scenario. "
        f"It contains {placed_counts['home']} placed home players and {placed_counts['away']} placed away players. "
        "Historical results and physical measurements are separate context and do not describe these board positions."
    )
    response = {
        "report_mode": "deterministic_mock",
        "data_label": DEMO_DATA_LABEL,
        "report_notice": "Rule-based demonstration; this report was not generated by a real AI model.",
        "scenario": scenario,
        "executive_summary": summary,
        "observations": observations,
        "recommendations": recommendations,
        "relevant_player_ids": relevant_player_ids,
        "limitations": [
            "This deterministic report is a rule-based demonstration, not output from a real AI model.",
            "The current tactical scenario is not a historical tactical snapshot.",
            "Recommendations are prompts for human review and do not establish cause or predict outcomes.",
            "Demo match history or player measurements may be incomplete; missing values are not inferred.",
        ],
        "evidence_refs": registry,
        "historical_context": historical,
    }
    return TacticalReportResponse.model_validate(response)
