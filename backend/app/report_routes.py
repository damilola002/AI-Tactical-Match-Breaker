from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.report_schemas import ReportRequest, TacticalReportResponse
from app.report_service import ReportNotFound, ReportValidationError, generate_tactical_report

router = APIRouter(prefix="/api/analysis", tags=["tactical reports"])
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.post("/reports", response_model=TacticalReportResponse)
def create_tactical_report(request: ReportRequest, db: DatabaseSession) -> TacticalReportResponse:
    try:
        return generate_tactical_report(db, request)
    except ReportNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ReportValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="Tactical report could not be generated") from error
