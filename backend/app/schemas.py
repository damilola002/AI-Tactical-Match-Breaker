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
