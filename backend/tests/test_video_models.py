from datetime import datetime

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, Match, Team, Video, VideoEvidence


@pytest.fixture
def database():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        home, away = Team(name="Video Home"), Team(name="Video Away")
        session.add_all([home, away])
        session.flush()
        match = Match(
            home_team_id=home.id,
            away_team_id=away.id,
            kickoff_at=datetime(2026, 1, 1),
        )
        session.add(match)
        session.commit()
        yield session, match.id
    Base.metadata.drop_all(engine)
    engine.dispose()


def _video(match_id: int, **overrides) -> Video:
    values = {
        "match_id": match_id,
        "storage_key": "1" * 32 + ".mp4",
        "original_filename": "match.mp4",
        "content_type": "video/mp4",
        "size_bytes": 20,
        "duration_ms": None,
        "sha256": None,
        "status": "ready",
    }
    values.update(overrides)
    return Video(**values)


def test_video_match_relationship_required_match_and_nullable_duration(database):
    session, match_id = database
    video = _video(match_id)
    session.add(video)
    session.commit()
    assert video.match.id == match_id
    assert video.duration_ms is None
    assert video in video.match.videos

    session.add(_video(999))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()

    session.add(_video(None, storage_key="2" * 32 + ".mp4"))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


@pytest.mark.parametrize(
    "overrides",
    [
        {"size_bytes": -1},
        {"duration_ms": -1},
        {"content_type": "video/quicktime"},
        {"status": "processing"},
        {"storage_key": "1" * 32 + ".mp4"},
    ],
)
def test_video_constraints_reject_invalid_metadata_and_duplicate_keys(database, overrides):
    session, match_id = database
    session.add(_video(match_id))
    session.commit()
    session.add(_video(match_id, **overrides))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_video_evidence_relationship_and_timestamp_constraints(database):
    session, match_id = database
    video = _video(match_id)
    session.add(video)
    session.flush()
    evidence = VideoEvidence(
        video_id=video.id,
        start_ms=1_250,
        end_ms=2_000,
        description="A manually noted sequence.",
        related_tactical_issue=None,
    )
    session.add(evidence)
    session.commit()
    assert evidence.video is video
    assert evidence in video.evidence

    invalid = VideoEvidence(
        video_id=video.id,
        start_ms=2_001,
        end_ms=2_000,
        description="Invalid interval.",
    )
    session.add(invalid)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_video_with_evidence_cannot_be_deleted_and_evidence_survives(database):
    session, match_id = database
    video = _video(match_id)
    evidence = VideoEvidence(
        start_ms=10,
        end_ms=20,
        description="Keep this annotation.",
    )
    video.evidence.append(evidence)
    session.add(video)
    session.commit()
    evidence_id = evidence.id

    session.delete(video)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()

    assert session.get(Video, video.id) is not None
    preserved = session.get(VideoEvidence, evidence_id)
    assert preserved is not None
    assert preserved.video_id == video.id


def test_video_evidence_foreign_key_restricts_direct_video_delete(database):
    from sqlalchemy import delete

    session, match_id = database
    video = _video(match_id)
    video.evidence.append(
        VideoEvidence(start_ms=0, end_ms=0, description="Protected evidence.")
    )
    session.add(video)
    session.commit()

    with pytest.raises(IntegrityError):
        session.execute(delete(Video).where(Video.id == video.id))
        session.commit()
    session.rollback()
    assert session.query(VideoEvidence).filter_by(video_id=video.id).count() == 1


@pytest.mark.parametrize(
    ("start_ms", "end_ms"),
    [(-1, 0), (0, -1), (5, 4)],
)
def test_video_evidence_rejects_negative_or_reversed_times(database, start_ms, end_ms):
    session, match_id = database
    video = _video(match_id)
    session.add(video)
    session.flush()
    session.add(
        VideoEvidence(
            video_id=video.id,
            start_ms=start_ms,
            end_ms=end_ms,
            description="Invalid interval.",
        )
    )
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_video_evidence_requires_existing_video(database):
    session, _match_id = database
    session.add(
        VideoEvidence(
            video_id=999,
            start_ms=0,
            end_ms=0,
            description="No matching video.",
        )
    )
    with pytest.raises(IntegrityError):
        session.commit()
