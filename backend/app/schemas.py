from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict

DEMO_DATA_LABEL = "DEMO DATA — fictional examples"


class AvailabilityStatus(str, Enum):
    active = "active"
    doubtful = "doubtful"
    injured = "injured"
    suspended = "suspended"


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class AvailabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    player_id: int
    status: AvailabilityStatus
    updated_at: datetime


class PlayerAvailabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    player_id: int
    player_name: str
    team: TeamRead
    status: AvailabilityStatus
    updated_at: datetime


class PlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    position: str
    team: TeamRead
    availability: AvailabilityRead | None


class MatchPlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    player_id: int
    team_id: int
    player: PlayerRead
    team: TeamRead


class MatchEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    occurred_at_seconds: int
    event_type: str
    description: str | None


class MatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kickoff_at: datetime
    home_team: TeamRead
    away_team: TeamRead
    home_score: int | None
    away_score: int | None


class MatchDetailRead(MatchRead):
    players: list[MatchPlayerRead]
    events: list[MatchEventRead]


class HistoricalPlayerMeasurementRead(BaseModel):
    player_id: int
    player_name: str
    team_id: int
    distance_covered_meters: float | None
    sprint_count: int | None


class HistoricalMetricRead(BaseModel):
    total: float | int | None
    mean_per_measured_player: float | None
    measured_player_count: int


class HistoricalSidePhysicalRead(BaseModel):
    distance: HistoricalMetricRead
    sprints: HistoricalMetricRead


class HistoricalDeltaRead(BaseModel):
    distance_total: float | None
    sprint_total: int | None


class HistoricalPhysicalComparisonRead(BaseModel):
    selected_team: HistoricalSidePhysicalRead
    opponent: HistoricalSidePhysicalRead
    selected_minus_opponent: HistoricalDeltaRead


class HistoricalMatchRead(BaseModel):
    id: int
    kickoff_at: datetime
    home_team: TeamRead
    away_team: TeamRead
    selected_team: TeamRead
    opponent: TeamRead
    venue_context: str
    result: str | None
    goals_for: int | None
    goals_against: int | None
    physical_comparison: HistoricalPhysicalComparisonRead | None
    players: list[HistoricalPlayerMeasurementRead]


class HistoricalMatchesResponse(BaseModel):
    data_label: str
    count: int
    items: list[HistoricalMatchRead]


class HistoricalPhysicalAverageRead(BaseModel):
    selected_team_average_total: float | None
    opponent_average_total: float | None
    selected_team_average_per_measured_player: float | None
    opponent_average_per_measured_player: float | None
    selected_minus_opponent_average_delta: float | None


class HistoricalPhysicalAveragesRead(BaseModel):
    distance: HistoricalPhysicalAverageRead
    sprints: HistoricalPhysicalAverageRead


class MeasurementCoverageSideRead(BaseModel):
    measured_player_appearances: int
    player_appearances: int
    percentage: float | None


class HistoricalSummaryRead(BaseModel):
    data_label: str
    match_count: int
    results: dict[str, int]
    physical_averages: HistoricalPhysicalAveragesRead
    measurement_coverage: dict[str, dict[str, MeasurementCoverageSideRead]]
