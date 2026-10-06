from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.analytics import list_team_match_analytics, summarize_team_history
from app.database import get_db
from app.models import Team
from app.schemas import (
    DEMO_DATA_LABEL,
    HistoricalMatchesResponse,
    HistoricalSummaryRead,
)

router = APIRouter(prefix="/api/analytics/teams", tags=["historical analytics"])
DatabaseSession = Annotated[Session, Depends(get_db)]
ResultQuery = Annotated[Literal["all", "win", "draw", "loss"], Query()]


@router.get("/{team_id}/matches", response_model=HistoricalMatchesResponse)
def team_match_history(
    team_id: int, db: DatabaseSession, result: ResultQuery = "all"
) -> dict[str, object]:
    if db.get(Team, team_id) is None:
        raise HTTPException(status_code=404, detail="Team not found")
    items = list_team_match_analytics(db, team_id, result)
    return {"data_label": DEMO_DATA_LABEL, "count": len(items), "items": items}


@router.get("/{team_id}/summary", response_model=HistoricalSummaryRead)
def team_history_summary(
    team_id: int, db: DatabaseSession, result: ResultQuery = "all"
) -> dict[str, object]:
    summary = summarize_team_history(db, team_id, result)
    if summary is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return {"data_label": DEMO_DATA_LABEL, **summary}
