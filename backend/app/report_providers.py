"""Provider interface returning evidence-bound claims, never factual prose."""

from __future__ import annotations

from typing import Any, Protocol


class ReportProvider(Protocol):
    def generate(self, context: dict[str, Any]) -> dict[str, Any]:
        """Select structured claims from supplied context; do not write report text."""
        ...


def _insight_claim(insight: dict[str, Any], team_id: int) -> dict[str, Any]:
    metric = insight["relatedMetric"]
    zone = insight.get("zone", {})
    return {
        "claim_type": "scenario_insight",
        "evidence_id": insight["id"],
        "side": insight["teamSide"],
        "team_id": team_id,
        "category": insight["category"],
        "player_ids": sorted(insight.get("playerIds", [])),
        "metric_key": metric["key"],
        "value": metric["value"],
        "zone_row": zone.get("row"),
        "zone_column": zone.get("column"),
    }


class DeterministicMockProvider:
    """Select all available server facts as structured, evidence-bound claims."""

    def generate(self, context: dict[str, Any]) -> dict[str, Any]:
        observations: list[dict[str, Any]] = []
        recommendations: list[dict[str, Any]] = []
        for insight in context["insights"]:
            claim = _insight_claim(insight, context["teams"][insight["teamSide"]]["id"])
            observations.append({"claim": claim, "confidence": "high"})
            recommendations.append({"claim": claim.copy()})

        if not observations:
            observations.append({
                "claim": {
                    "claim_type": "scenario_metric",
                    "evidence_id": context["empty_scenario_evidence"],
                    "side": None,
                    "team_id": None,
                    "metric_key": "insight_count",
                    "player_ids": [],
                    "value": 0,
                },
                "confidence": "limited",
            })

        for side in ("home", "away"):
            for match in context["historical_context"][side]["matches"]:
                evidence_id = context["match_evidence"][(side, match["id"])]
                observations.append({
                    "claim": {
                        "claim_type": "historical_match",
                        "evidence_id": evidence_id,
                        "team_id": context["scenario"][f"{side}_team"]["id"],
                        "match_id": match["id"],
                        "result": match["result"],
                        "goals_for": match["goals_for"],
                        "goals_against": match["goals_against"],
                        "kickoff_at": match["kickoff_at"],
                    },
                    "confidence": "high",
                })
                for player in match["players"]:
                    for field in ("distance_covered_meters", "sprint_count"):
                        value = player[field]
                        if value is None:
                            continue
                        observations.append({
                            "claim": {
                                "claim_type": "historical_measurement",
                                "evidence_id": context["measurement_evidence"][(side, match["id"], player["player_id"], field)],
                                "team_id": player["team_id"],
                                "match_id": match["id"],
                                "player_id": player["player_id"],
                                "metric_field": field,
                                "value": value,
                            },
                            "confidence": "high",
                        })

        return {"observations": observations, "recommendations": recommendations}
