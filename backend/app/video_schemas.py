"""Typed response and input schemas for video metadata and timestamp evidence."""

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field, StrictInt, StrictStr, field_validator, model_validator

from app.report_schemas import StrictModel


class VideoMetadataRead(StrictModel):
    id: StrictInt
    match_id: StrictInt
    original_filename: str
    content_type: Literal["video/mp4", "video/webm"]
    size_bytes: StrictInt = Field(ge=0)
    duration_ms: StrictInt | None = Field(default=None, ge=0)
    sha256: str | None = None
    status: Literal["ready"]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, extra="forbid")


class VideoListResponse(StrictModel):
    count: StrictInt = Field(ge=0)
    items: list[VideoMetadataRead]


class VideoEvidenceCreate(StrictModel):
    start_ms: StrictInt = Field(ge=0)
    end_ms: StrictInt = Field(ge=0)
    description: StrictStr = Field(min_length=1, max_length=1000)
    related_tactical_issue: StrictStr | None = Field(default=None, max_length=500)

    @field_validator("description", "related_tactical_issue")
    @classmethod
    def strip_and_require_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Text must not be blank")
        return cleaned

    @model_validator(mode="after")
    def end_not_before_start(self) -> "VideoEvidenceCreate":
        if self.end_ms < self.start_ms:
            raise ValueError("end_ms must be greater than or equal to start_ms")
        return self


class VideoEvidenceRead(StrictModel):
    id: StrictInt
    video_id: StrictInt
    start_ms: StrictInt = Field(ge=0)
    end_ms: StrictInt = Field(ge=0)
    description: str
    related_tactical_issue: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    @model_validator(mode="after")
    def end_not_before_start(self) -> "VideoEvidenceRead":
        if self.end_ms < self.start_ms:
            raise ValueError("end_ms must be greater than or equal to start_ms")
        return self
