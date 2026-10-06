from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError

from app.analytics import classify_result, list_team_match_analytics, summarize_team_history
from app.database import get_db
from app.models import Base, Match, MatchPlayer, Player, Team
from app.schemas import DEMO_DATA_LABEL
from main import app
from seed_demo import seed_demo_data
from conftest import LocalASGITestClient


@pytest.fixture
def analytics_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as session:
        selected, rival_one, rival_two, unused = [
            Team(name=name)
            for name in ("Analytics FC", "Rival One", "Rival Two", "Unused FC")
        ]
        session.add_all([selected, rival_one, rival_two, unused])
        session.flush()
        selected_player = Player(team=selected, name="Alex Metric", position="Midfielder")
        rival_one_player = Player(team=rival_one, name="Blair Metric", position="Forward")
        rival_two_player = Player(team=rival_two, name="Casey Metric", position="Defender")
        session.add_all([selected_player, rival_one_player, rival_two_player])
        session.flush()

        # The selected club has each outcome in both home and away contexts.
        fixtures = [
            (selected, rival_one, 2, 0),
            (selected, rival_one, 0, 1),
            (selected, rival_one, 1, 1),
            (rival_one, selected, 0, 3),
            (rival_one, selected, 4, 2),
            (rival_two, selected, 2, 2),
        ]
        for index, (home, away, home_score, away_score) in enumerate(fixtures):
            match = Match(
                home_team=home,
                away_team=away,
                kickoff_at=datetime(2026, 1, 1) + timedelta(days=index),
                home_score=home_score,
                away_score=away_score,
            )
            session.add(match)
            session.flush()
            for team, player, distance, sprints in (
                (selected, selected_player, Decimal("100.00") if index != 4 else None, 0 if index == 0 else index),
                (home if home.id != selected.id else away,
                 rival_one_player if rival_one.id == home.id or rival_one.id == away.id else rival_two_player,
                 Decimal("80.00"), 2),
            ):
                session.add(
                    MatchPlayer(
                        match_id=match.id,
                        player_id=player.id,
                        team_id=team.id,
                        distance_covered_meters=distance,
                        sprint_count=sprints,
                    )
                )
        pending = Match(
            home_team=rival_one,
            away_team=selected,
            kickoff_at=datetime(2026, 2, 1),
        )
        session.add(pending)
        session.flush()
        session.add(MatchPlayer(match_id=pending.id, player_id=selected_player.id, team_id=selected.id))
        session.commit()

    def override_get_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield sessions
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def analytics_client(analytics_db):
    return LocalASGITestClient(app)


@pytest.mark.parametrize(
    ("for_score", "against_score", "expected"),
    [(2, 1, "win"), (0, 2, "loss"), (1, 1, "draw"), (None, None, None)],
)
def test_result_classification(for_score, against_score, expected):
    assert classify_result(for_score, against_score) == expected


def test_result_classification_is_team_perspective_for_home_and_away():
    # These score pairs represent home win/loss/draw and away win/loss/draw.
    assert [classify_result(*score) for score in [(2, 0), (0, 2), (1, 1)]] == ["win", "loss", "draw"]
    assert [classify_result(*score) for score in [(0, 2), (2, 0), (1, 1)]] == ["loss", "win", "draw"]


def test_history_api_filters_perspective_and_orders_deterministically(analytics_client):
    all_response = analytics_client.get("/api/analytics/teams/1/matches")
    wins = analytics_client.get("/api/analytics/teams/1/matches?result=win")
    draws = analytics_client.get("/api/analytics/teams/1/matches?result=draw")
    losses = analytics_client.get("/api/analytics/teams/1/matches?result=loss")
    assert all_response.status_code == wins.status_code == 200
    assert all_response.json()["data_label"] == DEMO_DATA_LABEL
    assert all_response.json()["count"] == 7  # includes one unclassified pending fixture
    assert [row["result"] for row in wins.json()["items"]] == ["win", "win"]
    assert [row["result"] for row in draws.json()["items"]] == ["draw", "draw"]
    assert [row["result"] for row in losses.json()["items"]] == ["loss", "loss"]
    assert {row["venue_context"] for row in wins.json()["items"]} == {"home", "away"}
    assert {row["venue_context"] for row in draws.json()["items"]} == {"home", "away"}
    assert {row["venue_context"] for row in losses.json()["items"]} == {"home", "away"}
    away_win = next(row for row in wins.json()["items"] if row["venue_context"] == "away")
    assert (away_win["goals_for"], away_win["goals_against"]) == (3, 0)
    items = all_response.json()["items"]
    assert [(row["kickoff_at"], row["id"]) for row in items] == sorted(
        [(row["kickoff_at"], row["id"]) for row in items], reverse=True
    )
    assert items[0]["result"] is None
    assert all([player["player_id"] for player in row["players"]] == sorted(player["player_id"] for player in row["players"]) for row in items)


def test_physical_comparison_keeps_zero_null_and_team_perspective(analytics_db):
    with analytics_db() as session:
        rows = list_team_match_analytics(session, 1, "win")
        home_win = next(row for row in rows if row["venue_context"] == "home")
        comparison = home_win["physical_comparison"]
        selected = comparison["selected_team"]["sprints"]
        assert selected["total"] == 0
        assert selected["mean_per_measured_player"] == 0
        assert selected["measured_player_count"] == 1
        assert comparison["selected_minus_opponent"]["sprint_total"] == -2
        missing_match = next(row for row in list_team_match_analytics(session, 1, "loss") if row["venue_context"] == "away")
        missing_player = next(row for row in missing_match["players"] if row["team_id"] == 1)
        assert missing_player["distance_covered_meters"] is None


def test_missing_side_measurement_produces_null_delta(analytics_db):
    with analytics_db() as session:
        rows = list_team_match_analytics(session, 1, "loss")
        away_loss = next(row for row in rows if row["venue_context"] == "away")
        assert away_loss["physical_comparison"]["selected_minus_opponent"]["distance_total"] is None


def test_summary_counts_averages_coverage_and_empty_cohort(analytics_client, analytics_db):
    response = analytics_client.get("/api/analytics/teams/1/summary")
    data = response.json()
    assert response.status_code == 200
    assert data["match_count"] == 6
    assert data["results"] == {"wins": 2, "draws": 2, "losses": 2}
    assert data["physical_averages"]["distance"]["selected_team_average_total"] == 100
    assert data["measurement_coverage"]["distance"]["selected_team"]["measured_player_appearances"] == 5
    assert data["measurement_coverage"]["distance"]["opponent"]["measured_player_appearances"] == 6
    with analytics_db() as session:
        empty = summarize_team_history(session, 4)
    assert empty["match_count"] == 0
    assert empty["results"] == {"wins": 0, "draws": 0, "losses": 0}
    assert empty["physical_averages"]["distance"]["selected_team_average_total"] is None
    assert empty["measurement_coverage"]["distance"]["selected_team"]["percentage"] is None


def test_api_errors_and_empty_filtered_cohort(analytics_client):
    assert analytics_client.get("/api/analytics/teams/999/matches").status_code == 404
    assert analytics_client.get("/api/analytics/teams/999/summary").status_code == 404
    assert analytics_client.get("/api/analytics/teams/1/matches?result=unbeaten").status_code == 422
    assert analytics_client.get("/api/analytics/teams/1/summary?result=bad").status_code == 422
    empty = analytics_client.get("/api/analytics/teams/4/matches?result=win")
    assert empty.status_code == 200
    assert empty.json()["count"] == 0
    assert empty.json()["items"] == []


def test_physical_columns_nullable_and_nonnegative_constraints(analytics_db):
    with analytics_db() as session:
        participant = session.scalar(select(MatchPlayer).where(MatchPlayer.distance_covered_meters == 100))
        assert participant is not None
        assert participant.distance_covered_meters == Decimal("100.00")
        participant.distance_covered_meters = None
        participant.sprint_count = None
        session.flush()
        participant.sprint_count = -1
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()


def test_demo_seed_is_repeatable_and_creates_six_fixtures():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as session:
        seed_demo_data(session)
        session.commit()
        first_counts = (
            session.scalar(select(func.count()).select_from(Team)),
            session.scalar(select(func.count()).select_from(Player)),
            session.scalar(select(func.count()).select_from(Match)),
            session.scalar(select(func.count()).select_from(MatchPlayer)),
        )
        seed_demo_data(session)
        session.commit()
        second_counts = (
            session.scalar(select(func.count()).select_from(Team)),
            session.scalar(select(func.count()).select_from(Player)),
            session.scalar(select(func.count()).select_from(Match)),
            session.scalar(select(func.count()).select_from(MatchPlayer)),
        )
        assert first_counts == second_counts == (3, 12, 6, 48)
    engine.dispose()
