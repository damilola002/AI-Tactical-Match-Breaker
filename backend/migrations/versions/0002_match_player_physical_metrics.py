"""Add nullable historical physical metrics to match players."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_physical_metrics"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "match_players",
        sa.Column("distance_covered_meters", sa.Numeric(8, 2), nullable=True),
    )
    op.add_column(
        "match_players", sa.Column("sprint_count", sa.Integer(), nullable=True)
    )
    op.create_check_constraint(
        "ck_match_players_distance_nonnegative",
        "match_players",
        "distance_covered_meters IS NULL OR distance_covered_meters >= 0",
    )
    op.create_check_constraint(
        "ck_match_players_sprint_count_nonnegative",
        "match_players",
        "sprint_count IS NULL OR sprint_count >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_match_players_sprint_count_nonnegative", "match_players", type_="check"
    )
    op.drop_constraint(
        "ck_match_players_distance_nonnegative", "match_players", type_="check"
    )
    op.drop_column("match_players", "sprint_count")
    op.drop_column("match_players", "distance_covered_meters")
