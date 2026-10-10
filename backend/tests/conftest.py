import asyncio
from datetime import datetime

import httpx
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.models import Base, Match, MatchEvent, MatchPlayer, Player, PlayerAvailability, Team
from main import app


class LocalASGITestClient:
    def __init__(self, application):
        self.transport = httpx.ASGITransport(app=application)

    def get(self, path: str, **kwargs):
        async def request():
            async with httpx.AsyncClient(
                transport=self.transport, base_url="http://testserver"
            ) as client:
                return await client.get(path, **kwargs)

        return asyncio.run(request())

    def post(self, path: str, **kwargs):
        async def request():
            async with httpx.AsyncClient(
                transport=self.transport, base_url="http://testserver"
            ) as client:
                return await client.post(path, **kwargs)

        return asyncio.run(request())


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    testing_sessions = sessionmaker(bind=engine, expire_on_commit=False)

    with testing_sessions() as session:
        home = Team(name="Northbridge FC")
        away = Team(name="Harbor City FC")
        session.add_all([home, away])
        session.flush()

        goalkeeper = Player(team=home, name="Jordan Vale", position="Goalkeeper")
        defender = Player(team=away, name="Casey Rowan", position="Defender")
        session.add_all([goalkeeper, defender])
        session.flush()
        session.add_all(
            [
                PlayerAvailability(player_id=goalkeeper.id, status="active"),
                PlayerAvailability(player_id=defender.id, status="injured"),
            ]
        )

        match = Match(
            home_team=home,
            away_team=away,
            kickoff_at=datetime(2026, 9, 20, 15, 0),
            home_score=2,
            away_score=1,
        )
        session.add(match)
        session.flush()
        session.add_all(
            [
                MatchPlayer(match_id=match.id, player_id=goalkeeper.id, team_id=home.id),
                MatchPlayer(match_id=match.id, player_id=defender.id, team_id=away.id),
                MatchEvent(
                    match_id=match.id,
                    occurred_at_seconds=1092,
                    event_type="goal",
                    description="Fictional demo event.",
                ),
            ]
        )
        session.commit()

    def override_get_db():
        with testing_sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield LocalASGITestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()
