"""Add video metadata and timestamped evidence tables."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_video_evidence"
down_revision: Union[str, None] = "0002_physical_metrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "videos",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("match_id", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=64), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="ready", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("size_bytes >= 0", name="ck_videos_size_nonnegative"),
        sa.CheckConstraint(
            "duration_ms IS NULL OR duration_ms >= 0",
            name="ck_videos_duration_nonnegative",
        ),
        sa.CheckConstraint(
            "content_type IN ('video/mp4', 'video/webm')", name="ck_videos_content_type"
        ),
        sa.CheckConstraint("status IN ('ready')", name="ck_videos_status"),
        sa.CheckConstraint(
            "length(trim(original_filename)) > 0", name="ck_videos_filename_nonempty"
        ),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name="fk_videos_match_id_matches", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key", name="uq_videos_storage_key"),
    )
    op.create_index("ix_videos_match_id", "videos", ["match_id"])

    op.create_table(
        "video_evidence",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("video_id", sa.Integer(), nullable=False),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=False),
        sa.Column("related_tactical_issue", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("start_ms >= 0", name="ck_video_evidence_start_nonnegative"),
        sa.CheckConstraint("end_ms >= 0", name="ck_video_evidence_end_nonnegative"),
        sa.CheckConstraint("end_ms >= start_ms", name="ck_video_evidence_end_after_start"),
        sa.CheckConstraint(
            "length(trim(description)) > 0", name="ck_video_evidence_description_nonempty"
        ),
        sa.ForeignKeyConstraint(
            ["video_id"], ["videos.id"], name="fk_video_evidence_video_id_videos", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_video_evidence_video_time", "video_evidence", ["video_id", "start_ms", "id"]
    )


def downgrade() -> None:
    op.drop_index("ix_video_evidence_video_time", table_name="video_evidence")
    op.drop_table("video_evidence")
    op.drop_index("ix_videos_match_id", table_name="videos")
    op.drop_table("videos")
