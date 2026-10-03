"""Create the Phase 2 football data schema."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "teams",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_teams_name_nonempty"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "players",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("position", sa.String(length=40), nullable=False),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_players_name_nonempty"),
        sa.CheckConstraint(
            "length(trim(position)) > 0", name="ck_players_position_nonempty"
        ),
        sa.ForeignKeyConstraint(
            ["team_id"], ["teams.id"], name="fk_players_team_id_teams", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id", "name", name="uq_players_team_name"),
    )
    op.create_table(
        "player_availability",
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('active', 'doubtful', 'injured', 'suspended')",
            name="ck_player_availability_status",
        ),
        sa.ForeignKeyConstraint(
            ["player_id"],
            ["players.id"],
            name="fk_player_availability_player_id_players",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("player_id"),
    )
    op.create_table(
        "matches",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("home_team_id", sa.Integer(), nullable=False),
        sa.Column("away_team_id", sa.Integer(), nullable=False),
        sa.Column("kickoff_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "home_team_id <> away_team_id", name="ck_matches_distinct_teams"
        ),
        sa.CheckConstraint(
            "home_score IS NULL OR home_score >= 0", name="ck_matches_home_score_nonnegative"
        ),
        sa.CheckConstraint(
            "away_score IS NULL OR away_score >= 0", name="ck_matches_away_score_nonnegative"
        ),
        sa.CheckConstraint(
            "(home_score IS NULL) = (away_score IS NULL)",
            name="ck_matches_scores_both_present_or_absent",
        ),
        sa.ForeignKeyConstraint(
            ["home_team_id"],
            ["teams.id"],
            name="fk_matches_home_team_id_teams",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["away_team_id"],
            ["teams.id"],
            name="fk_matches_away_team_id_teams",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_matches_home_team_id", "matches", ["home_team_id"])
    op.create_index("ix_matches_away_team_id", "matches", ["away_team_id"])
    op.create_index("ix_matches_kickoff_at", "matches", ["kickoff_at"])

    op.create_table(
        "match_players",
        sa.Column("match_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name="fk_match_players_match_id_matches", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name="fk_match_players_player_id_players", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["team_id"], ["teams.id"], name="fk_match_players_team_id_teams", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("match_id", "player_id"),
    )
    op.create_index("ix_match_players_player_id", "match_players", ["player_id"])

    op.create_table(
        "match_events",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("match_id", sa.Integer(), nullable=False),
        sa.Column("occurred_at_seconds", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "occurred_at_seconds >= 0", name="ck_match_events_time_nonnegative"
        ),
        sa.CheckConstraint(
            "length(trim(event_type)) > 0", name="ck_match_events_type_nonempty"
        ),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name="fk_match_events_match_id_matches", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_match_events_match_time",
        "match_events",
        ["match_id", "occurred_at_seconds"],
    )


def downgrade() -> None:
    op.drop_index("ix_match_events_match_time", table_name="match_events")
    op.drop_table("match_events")
    op.drop_index("ix_match_players_player_id", table_name="match_players")
    op.drop_table("match_players")
    op.drop_index("ix_matches_kickoff_at", table_name="matches")
    op.drop_index("ix_matches_away_team_id", table_name="matches")
    op.drop_index("ix_matches_home_team_id", table_name="matches")
    op.drop_table("matches")
    op.drop_table("player_availability")
    op.drop_table("players")
    op.drop_table("teams")
