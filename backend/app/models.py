from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (CheckConstraint("length(trim(name)) > 0", name="ck_teams_name_nonempty"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

    players: Mapped[list["Player"]] = relationship(back_populates="team")
    home_matches: Mapped[list["Match"]] = relationship(
        back_populates="home_team", foreign_keys="Match.home_team_id"
    )
    away_matches: Mapped[list["Match"]] = relationship(
        back_populates="away_team", foreign_keys="Match.away_team_id"
    )


class Player(Base):
    __tablename__ = "players"
    __table_args__ = (
        UniqueConstraint("team_id", "name", name="uq_players_team_name"),
        CheckConstraint("length(trim(name)) > 0", name="ck_players_name_nonempty"),
        CheckConstraint("length(trim(position)) > 0", name="ck_players_position_nonempty"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[str] = mapped_column(String(40), nullable=False)

    team: Mapped[Team] = relationship(back_populates="players")
    availability: Mapped["PlayerAvailability | None"] = relationship(
        back_populates="player", cascade="all, delete-orphan", uselist=False
    )
    match_participations: Mapped[list["MatchPlayer"]] = relationship(
        back_populates="player"
    )


class PlayerAvailability(Base):
    __tablename__ = "player_availability"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'doubtful', 'injured', 'suspended')",
            name="ck_player_availability_status",
        ),
    )

    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    player: Mapped[Player] = relationship(back_populates="availability")


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint("home_team_id <> away_team_id", name="ck_matches_distinct_teams"),
        CheckConstraint(
            "home_score IS NULL OR home_score >= 0", name="ck_matches_home_score_nonnegative"
        ),
        CheckConstraint(
            "away_score IS NULL OR away_score >= 0", name="ck_matches_away_score_nonnegative"
        ),
        CheckConstraint(
            "(home_score IS NULL) = (away_score IS NULL)",
            name="ck_matches_scores_both_present_or_absent",
        ),
        Index("ix_matches_home_team_id", "home_team_id"),
        Index("ix_matches_away_team_id", "away_team_id"),
        Index("ix_matches_kickoff_at", "kickoff_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    home_team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    away_team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    kickoff_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    home_team: Mapped[Team] = relationship(
        back_populates="home_matches", foreign_keys=[home_team_id]
    )
    away_team: Mapped[Team] = relationship(
        back_populates="away_matches", foreign_keys=[away_team_id]
    )
    players: Mapped[list["MatchPlayer"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )
    events: Mapped[list["MatchEvent"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )


class MatchPlayer(Base):
    __tablename__ = "match_players"
    __table_args__ = (
        CheckConstraint(
            "distance_covered_meters IS NULL OR distance_covered_meters >= 0",
            name="ck_match_players_distance_nonnegative",
        ),
        CheckConstraint(
            "sprint_count IS NULL OR sprint_count >= 0",
            name="ck_match_players_sprint_count_nonnegative",
        ),
        Index("ix_match_players_player_id", "player_id"),
    )

    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="RESTRICT"), primary_key=True
    )
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )
    distance_covered_meters: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    sprint_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    match: Mapped[Match] = relationship(back_populates="players")
    player: Mapped[Player] = relationship(back_populates="match_participations")
    team: Mapped[Team] = relationship()


class MatchEvent(Base):
    __tablename__ = "match_events"
    __table_args__ = (
        CheckConstraint(
            "occurred_at_seconds >= 0", name="ck_match_events_time_nonnegative"
        ),
        CheckConstraint(
            "length(trim(event_type)) > 0", name="ck_match_events_type_nonempty"
        ),
        Index("ix_match_events_match_time", "match_id", "occurred_at_seconds"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    occurred_at_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    match: Mapped[Match] = relationship(back_populates="events")
