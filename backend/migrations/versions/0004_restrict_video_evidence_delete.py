"""Prevent video deletion from cascading to timestamped evidence."""

from typing import Sequence, Union

from alembic import op

revision: str = "0004_restrict_evidence_delete"
down_revision: Union[str, None] = "0003_video_evidence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "fk_video_evidence_video_id_videos", "video_evidence", type_="foreignkey"
    )
    op.create_foreign_key(
        "fk_video_evidence_video_id_videos",
        "video_evidence",
        "videos",
        ["video_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_video_evidence_video_id_videos", "video_evidence", type_="foreignkey"
    )
    op.create_foreign_key(
        "fk_video_evidence_video_id_videos",
        "video_evidence",
        "videos",
        ["video_id"],
        ["id"],
        ondelete="CASCADE",
    )
