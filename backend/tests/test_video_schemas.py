from datetime import datetime

import pytest
from pydantic import ValidationError

from app.video_schemas import VideoEvidenceCreate, VideoEvidenceRead, VideoMetadataRead


def test_video_metadata_schema_allows_unknown_duration_and_exposes_no_storage_path():
    payload = {
        "id": 4,
        "match_id": 2,
        "original_filename": "final-match.mp4",
        "content_type": "video/mp4",
        "size_bytes": 12_345,
        "duration_ms": None,
        "sha256": None,
        "status": "ready",
        "created_at": datetime(2026, 1, 1),
    }
    parsed = VideoMetadataRead.model_validate(payload)
    assert parsed.duration_ms is None
    assert "storage_key" not in parsed.model_dump()
    assert "path" not in parsed.model_dump()


def test_video_metadata_schema_rejects_unexpected_filesystem_fields():
    with pytest.raises(ValidationError):
        VideoMetadataRead.model_validate(
            {
                "id": 4,
                "match_id": 2,
                "original_filename": "final-match.mp4",
                "content_type": "video/mp4",
                "size_bytes": 12_345,
                "duration_ms": None,
                "sha256": None,
                "status": "ready",
                "created_at": datetime(2026, 1, 1),
                "storage_path": "/private/media/file.mp4",
            }
        )


def test_video_evidence_input_trims_text_and_accepts_millisecond_interval():
    evidence = VideoEvidenceCreate(
        start_ms=1_250,
        end_ms=2_000,
        description="  Fullback recovery  ",
        related_tactical_issue="  Space left behind  ",
    )
    assert evidence.description == "Fullback recovery"
    assert evidence.related_tactical_issue == "Space left behind"


@pytest.mark.parametrize(
    "payload",
    [
        {"start_ms": -1, "end_ms": 0, "description": "Note"},
        {"start_ms": 0, "end_ms": -1, "description": "Note"},
        {"start_ms": 3, "end_ms": 2, "description": "Note"},
        {"start_ms": 0, "end_ms": 1, "description": "   "},
        {"start_ms": 0, "end_ms": 1, "description": "x" * 1001},
        {"start_ms": 0, "end_ms": 1, "description": "Note", "extra": "no"},
        {"start_ms": True, "end_ms": 1, "description": "Note"},
    ],
)
def test_video_evidence_input_rejects_invalid_intervals_and_text(payload):
    with pytest.raises(ValidationError):
        VideoEvidenceCreate.model_validate(payload)


def test_video_evidence_response_is_typed_and_contains_no_storage_path():
    response = VideoEvidenceRead.model_validate(
        {
            "id": 7,
            "video_id": 4,
            "start_ms": 1_250,
            "end_ms": 2_000,
            "description": "A user note.",
            "related_tactical_issue": None,
            "created_at": datetime(2026, 1, 1),
        }
    )
    assert response.start_ms == 1_250
    assert "storage_path" not in response.model_dump()


def test_video_evidence_response_rejects_reversed_interval_like_database():
    with pytest.raises(ValidationError, match="end_ms"):
        VideoEvidenceRead.model_validate(
            {
                "id": 7,
                "video_id": 4,
                "start_ms": 2_000,
                "end_ms": 1_250,
                "description": "Invalid stored note.",
                "related_tactical_issue": None,
                "created_at": datetime(2026, 1, 1),
            }
        )
