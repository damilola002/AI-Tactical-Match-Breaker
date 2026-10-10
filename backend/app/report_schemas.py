"""Pydantic contracts for report requests and structured responses."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StrictInt, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BoardPosition(StrictModel):
    x: FiniteFloat = Field(ge=0, le=100)
    y: FiniteFloat = Field(ge=0, le=100)


class ReportPlayerInput(StrictModel):
    player_id: StrictInt = Field(gt=0)
    side: Literal["home", "away"]
    formation_slot: StrictInt = Field(ge=0)
    position: BoardPosition


class ReportRequest(StrictModel):
    home_team_id: StrictInt = Field(gt=0)
    away_team_id: StrictInt = Field(gt=0)
    formation_by_side: dict[Literal["home", "away"], Literal["4-3-3", "4-4-2", "3-5-2"]]
    players: list[ReportPlayerInput]

    @model_validator(mode="after")
    def require_both_formations(self) -> "ReportRequest":
        if set(self.formation_by_side) != {"home", "away"}:
            raise ValueError("formation_by_side must include exactly home and away")
        return self


class EvidenceRef(StrictModel):
    id: str
    kind: Literal["scenario_metric", "scenario_insight", "historical_match", "historical_measurement"]
    label: str
    source_key: str
    side: Literal["home", "away"] | None = None
    team_id: StrictInt | None = None
    match_id: StrictInt | None = None
    player_id: StrictInt | None = None
    player_ids: list[StrictInt] = Field(default_factory=list)
    value: Any = None


class ScenarioMetricClaim(StrictModel):
    claim_type: Literal["scenario_metric"]
    evidence_id: str
    side: Literal["home", "away"] | None = None
    team_id: StrictInt | None = None
    metric_key: str
    player_ids: list[StrictInt] = Field(default_factory=list)
    value: Any


class ScenarioInsightClaim(StrictModel):
    claim_type: Literal["scenario_insight"]
    evidence_id: str
    side: Literal["home", "away"]
    team_id: StrictInt
    category: Literal["line_spacing", "zone_difference", "spatial_gap"]
    player_ids: list[StrictInt] = Field(default_factory=list)
    metric_key: str
    value: int | float
    zone_row: int | None = None
    zone_column: int | None = None


class HistoricalMatchClaim(StrictModel):
    claim_type: Literal["historical_match"]
    evidence_id: str
    team_id: StrictInt
    match_id: StrictInt
    result: Literal["win", "draw", "loss"] | None
    goals_for: int | None
    goals_against: int | None
    kickoff_at: str


class HistoricalMeasurementClaim(StrictModel):
    claim_type: Literal["historical_measurement"]
    evidence_id: str
    team_id: StrictInt
    match_id: StrictInt
    player_id: StrictInt
    metric_field: Literal["distance_covered_meters", "sprint_count"]
    value: int | float


StructuredClaim = Annotated[
    ScenarioMetricClaim | ScenarioInsightClaim | HistoricalMatchClaim | HistoricalMeasurementClaim,
    Field(discriminator="claim_type"),
]
RecommendationClaim = Annotated[
    ScenarioMetricClaim | ScenarioInsightClaim,
    Field(discriminator="claim_type"),
]


class ProviderObservation(StrictModel):
    claim: StructuredClaim
    confidence: Literal["high", "moderate", "limited"]


class ProviderRecommendation(StrictModel):
    claim: RecommendationClaim


class ProviderReport(StrictModel):
    observations: list[ProviderObservation]
    recommendations: list[ProviderRecommendation]


class Observation(StrictModel):
    id: str
    scope: Literal["current_scenario", "historical_context"]
    text: str
    evidence_ids: list[str] = Field(min_length=1)
    confidence: Literal["high", "moderate", "limited"]
    claim: StructuredClaim


class Recommendation(StrictModel):
    id: str
    text: str
    evidence_ids: list[str] = Field(min_length=1)
    limitations: list[str]
    claim: RecommendationClaim


class ScenarioTeam(StrictModel):
    id: StrictInt
    name: str


class ReportScenario(StrictModel):
    home_team: ScenarioTeam
    away_team: ScenarioTeam
    formation_by_side: dict[Literal["home", "away"], Literal["4-3-3", "4-4-2", "3-5-2"]]
    placed_player_count: dict[Literal["home", "away"], int]


class HistoricalContextTeam(StrictModel):
    id: StrictInt
    name: str


class HistoricalContextPlayer(StrictModel):
    player_id: StrictInt
    player_name: str
    team_id: StrictInt
    distance_covered_meters: float | None
    sprint_count: int | None


class HistoricalContextMetric(StrictModel):
    total: float | int | None
    mean_per_measured_player: float | None
    measured_player_count: int


class HistoricalContextSidePhysical(StrictModel):
    distance: HistoricalContextMetric
    sprints: HistoricalContextMetric


class HistoricalContextDelta(StrictModel):
    distance_total: float | None
    sprint_total: int | None


class HistoricalContextPhysicalComparison(StrictModel):
    selected_team: HistoricalContextSidePhysical
    opponent: HistoricalContextSidePhysical
    selected_minus_opponent: HistoricalContextDelta


class HistoricalContextMatch(StrictModel):
    id: StrictInt
    kickoff_at: str
    home_team: HistoricalContextTeam
    away_team: HistoricalContextTeam
    selected_team: HistoricalContextTeam
    opponent: HistoricalContextTeam
    venue_context: str
    result: str | None
    goals_for: int | None
    goals_against: int | None
    physical_comparison: HistoricalContextPhysicalComparison | None
    players: list[HistoricalContextPlayer]


class HistoricalContextAverage(StrictModel):
    selected_team_average_total: float | None
    opponent_average_total: float | None
    selected_team_average_per_measured_player: float | None
    opponent_average_per_measured_player: float | None
    selected_minus_opponent_average_delta: float | None


class HistoricalContextPhysicalAverages(StrictModel):
    distance: HistoricalContextAverage
    sprints: HistoricalContextAverage


class HistoricalContextCoverage(StrictModel):
    measured_player_appearances: int
    player_appearances: int
    percentage: float | None


class HistoricalContextMetricCoverage(StrictModel):
    selected_team: HistoricalContextCoverage
    opponent: HistoricalContextCoverage


class HistoricalContextMeasurementCoverage(StrictModel):
    distance: HistoricalContextMetricCoverage
    sprints: HistoricalContextMetricCoverage


class HistoricalContextResults(StrictModel):
    wins: int
    draws: int
    losses: int


class HistoricalContextSummary(StrictModel):
    match_count: int
    results: HistoricalContextResults
    physical_averages: HistoricalContextPhysicalAverages
    measurement_coverage: HistoricalContextMeasurementCoverage


class HistoricalContextSide(StrictModel):
    team: HistoricalContextTeam
    summary: HistoricalContextSummary
    matches: list[HistoricalContextMatch]


class TacticalReportResponse(StrictModel):
    report_mode: Literal["deterministic_mock"]
    data_label: str
    report_notice: str
    scenario: ReportScenario
    executive_summary: str
    observations: list[Observation]
    recommendations: list[Recommendation]
    evidence_refs: list[EvidenceRef]
    relevant_player_ids: list[StrictInt]
    historical_context: dict[Literal["home", "away"], HistoricalContextSide]
    limitations: list[str]
