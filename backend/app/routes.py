from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Match, MatchPlayer, Player, PlayerAvailability, Team
from app.schemas import (
    AvailabilityStatus,
    DEMO_DATA_LABEL,
    MatchDetailRead,
    MatchEventRead,
    MatchPlayerRead,
    MatchRead,
    PlayerAvailabilityRead,
    PlayerRead,
    TeamRead,
)

router = APIRouter(prefix="/api")
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("/teams")
def list_teams(db: DatabaseSession) -> dict[str, object]:
    teams = db.scalars(select(Team).order_by(Team.name)).all()
    items = [TeamRead.model_validate(team) for team in teams]
    return {"data_label": DEMO_DATA_LABEL, "count": len(items), "items": items}


@router.get("/teams/{team_id}")
def get_team(team_id: int, db: DatabaseSession) -> dict[str, object]:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return {"data_label": DEMO_DATA_LABEL, "item": TeamRead.model_validate(team)}


@router.get("/players")
def list_players(
    db: DatabaseSession,
    team_id: int | None = None,
) -> dict[str, object]:
    query = select(Player).options(
        selectinload(Player.team), selectinload(Player.availability)
    )
    if team_id is not None:
        query = query.where(Player.team_id == team_id)
    players = db.scalars(query.order_by(Player.team_id, Player.name)).all()
    items = [PlayerRead.model_validate(player) for player in players]
    return {"data_label": DEMO_DATA_LABEL, "count": len(items), "items": items}


@router.get("/players/{player_id}")
def get_player(player_id: int, db: DatabaseSession) -> dict[str, object]:
    player = db.scalar(
        select(Player)
        .options(selectinload(Player.team), selectinload(Player.availability))
        .where(Player.id == player_id)
    )
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return {"data_label": DEMO_DATA_LABEL, "item": PlayerRead.model_validate(player)}


@router.get("/availability")
def list_availability(
    db: DatabaseSession,
    status: AvailabilityStatus | None = None,
    team_id: int | None = None,
) -> dict[str, object]:
    query = select(PlayerAvailability).options(
        selectinload(PlayerAvailability.player).selectinload(Player.team)
    )
    if status is not None:
        query = query.where(PlayerAvailability.status == status.value)
    if team_id is not None:
        query = query.join(Player).where(Player.team_id == team_id)
    availability_rows = db.scalars(
        query.order_by(PlayerAvailability.player_id)
    ).all()
    items = [
        PlayerAvailabilityRead(
            player_id=row.player_id,
            player_name=row.player.name,
            team=row.player.team,
            status=row.status,
            updated_at=row.updated_at,
        )
        for row in availability_rows
    ]
    return {"data_label": DEMO_DATA_LABEL, "count": len(items), "items": items}


@router.get("/players/{player_id}/availability")
def get_player_availability(player_id: int, db: DatabaseSession) -> dict[str, object]:
    row = db.scalar(
        select(PlayerAvailability)
        .options(selectinload(PlayerAvailability.player).selectinload(Player.team))
        .where(PlayerAvailability.player_id == player_id)
    )
    if row is None:
        if db.get(Player, player_id) is None:
            raise HTTPException(status_code=404, detail="Player not found")
        raise HTTPException(status_code=404, detail="Availability not found")

    item = PlayerAvailabilityRead(
        player_id=row.player_id,
        player_name=row.player.name,
        team=row.player.team,
        status=row.status,
        updated_at=row.updated_at,
    )
    return {"data_label": DEMO_DATA_LABEL, "item": item}


@router.get("/matches")
def list_matches(
    db: DatabaseSession,
    team_id: int | None = None,
) -> dict[str, object]:
    query = select(Match).options(
        selectinload(Match.home_team), selectinload(Match.away_team)
    )
    if team_id is not None:
        query = query.where(
            or_(Match.home_team_id == team_id, Match.away_team_id == team_id)
        )
    matches = db.scalars(query.order_by(Match.kickoff_at.desc())).all()
    items = [MatchRead.model_validate(match) for match in matches]
    return {"data_label": DEMO_DATA_LABEL, "count": len(items), "items": items}


@router.get("/matches/{match_id}")
def get_match(match_id: int, db: DatabaseSession) -> dict[str, object]:
    match = db.scalar(
        select(Match)
        .options(
            selectinload(Match.home_team),
            selectinload(Match.away_team),
            selectinload(Match.players)
            .selectinload(MatchPlayer.player)
            .selectinload(Player.team),
            selectinload(Match.players).selectinload(MatchPlayer.team),
            selectinload(Match.players)
            .selectinload(MatchPlayer.player)
            .selectinload(Player.availability),
            selectinload(Match.events),
        )
        .where(Match.id == match_id)
    )
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")

    item = MatchDetailRead(
        **MatchRead.model_validate(match).model_dump(),
        players=[MatchPlayerRead.model_validate(player) for player in match.players],
        events=[
            MatchEventRead.model_validate(event)
            for event in sorted(match.events, key=lambda item: item.occurred_at_seconds)
        ],
    )
    return {"data_label": DEMO_DATA_LABEL, "item": item}
