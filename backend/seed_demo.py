"""Insert or refresh a fictional three-team demo dataset idempotently."""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Match, MatchEvent, MatchPlayer, Player, PlayerAvailability, Team
from app.services import validate_match_player_team

TEAM_FIXTURES = (
    {
        "name": "Aster Vale FC",
        "players": (
            ("Ellis Vance", "Goalkeeper", "active"),
            ("Nia Calder", "Defender", "doubtful"),
            ("Rowan Pike", "Midfielder", "injured"),
            ("Remy Sol", "Forward", "suspended"),
        ),
    },
    {
        "name": "Cedar Bay United",
        "players": (
            ("Avery Fen", "Goalkeeper", "active"),
            ("Luca Mire", "Defender", "active"),
            ("Tavi Cross", "Midfielder", "active"),
            ("Sora Bell", "Forward", "active"),
        ),
    },
    {
        "name": "Morrowfield Athletic",
        "players": (
            ("Jules North", "Goalkeeper", "active"),
            ("Mika Rell", "Defender", "active"),
            ("Oren Ash", "Midfielder", "active"),
            ("Leni Shore", "Forward", "doubtful"),
        ),
    },
)

MATCH_FIXTURES = (
    ("Aster Vale FC", "Cedar Bay United", datetime(2026, 9, 20, 15, tzinfo=UTC), 2, 1),
    ("Cedar Bay United", "Aster Vale FC", datetime(2026, 10, 4, 15, tzinfo=UTC), 1, 1),
    ("Cedar Bay United", "Morrowfield Athletic", datetime(2026, 9, 22, 15, tzinfo=UTC), 3, 0),
    ("Morrowfield Athletic", "Cedar Bay United", datetime(2026, 10, 6, 15, tzinfo=UTC), 1, 2),
    ("Morrowfield Athletic", "Aster Vale FC", datetime(2026, 9, 24, 15, tzinfo=UTC), 0, 2),
    ("Aster Vale FC", "Morrowfield Athletic", datetime(2026, 10, 8, 15, tzinfo=UTC), 1, 3),
)

LEGACY_MATCH_EVENTS = (
    (18 * 60 + 12, "goal", "Aster Vale FC scores in this fictional demo match."),
    (54 * 60 + 5, "goal", "Cedar Bay United scores in this fictional demo match."),
    (78 * 60 + 41, "goal", "Aster Vale FC scores the deciding fictional demo goal."),
)


def get_or_create_team(session: Session, name: str) -> Team:
    team = session.scalar(select(Team).where(Team.name == name))
    if team is None:
        team = Team(name=name)
        session.add(team)
        session.flush()
    return team


def get_or_create_player(
    session: Session, team: Team, name: str, position: str, status: str
) -> Player:
    player = session.scalar(
        select(Player).where(Player.team_id == team.id, Player.name == name)
    )
    if player is None:
        player = Player(team=team, name=name, position=position)
        session.add(player)
        session.flush()
    else:
        player.position = position
    if player.availability is None:
        session.add(PlayerAvailability(player_id=player.id, status=status))
    elif player.availability.status != status:
        player.availability.status = status
        player.availability.updated_at = datetime.now(UTC)
    return player


def _measurement(team_index: int, player_index: int, fixture_index: int) -> tuple[Decimal | None, int | None]:
    # Fictional, stable sample data. The first player's first distance is a
    # measured zero; one appearance deliberately lacks measurements.
    if team_index == 2 and player_index == 3 and fixture_index == 5:
        return None, None
    distance = Decimal("0.00") if team_index == 0 and player_index == 0 and fixture_index == 0 else Decimal(8500 + team_index * 170 + player_index * 95 + fixture_index * 12)
    sprints = (team_index * 3 + player_index + fixture_index) % 14
    return distance, sprints


def seed_demo_data(session: Session) -> None:
    teams_by_name: dict[str, Team] = {}
    players_by_team: dict[str, list[Player]] = {}
    for team_fixture in TEAM_FIXTURES:
        team = get_or_create_team(session, team_fixture["name"])
        teams_by_name[team.name] = team
        players_by_team[team.name] = [
            get_or_create_player(session, team, name, position, status)
            for name, position, status in team_fixture["players"]
        ]

    team_indexes = {fixture["name"]: index for index, fixture in enumerate(TEAM_FIXTURES)}
    for fixture_index, fixture in enumerate(MATCH_FIXTURES):
        home_name, away_name, kickoff, home_score, away_score = fixture
        home_team, away_team = teams_by_name[home_name], teams_by_name[away_name]
        match = session.scalar(
            select(Match).where(
                Match.kickoff_at == kickoff,
                Match.home_team_id == home_team.id,
                Match.away_team_id == away_team.id,
            )
        )
        if match is None:
            match = Match(
                kickoff_at=kickoff, home_team=home_team, away_team=away_team,
                home_score=home_score, away_score=away_score,
            )
            session.add(match)
            session.flush()
        else:
            match.home_score, match.away_score = home_score, away_score

        if fixture_index == 0:
            for occurred_at_seconds, event_type, description in LEGACY_MATCH_EVENTS:
                event = session.scalar(
                    select(MatchEvent).where(
                        MatchEvent.match_id == match.id,
                        MatchEvent.occurred_at_seconds == occurred_at_seconds,
                        MatchEvent.event_type == event_type,
                    )
                )
                if event is None:
                    session.add(MatchEvent(
                        match_id=match.id, occurred_at_seconds=occurred_at_seconds,
                        event_type=event_type, description=description,
                    ))
                else:
                    event.description = description

        for team in (home_team, away_team):
            team_index = team_indexes[team.name]
            validate_match_player_team(match, team.id)
            for player_index, player in enumerate(players_by_team[team.name]):
                participant = session.get(MatchPlayer, (match.id, player.id))
                distance, sprints = _measurement(team_index, player_index, fixture_index)
                if participant is None:
                    participant = MatchPlayer(match_id=match.id, player_id=player.id, team_id=team.id)
                    session.add(participant)
                participant.team_id = team.id
                participant.distance_covered_meters = distance
                participant.sprint_count = sprints


def main() -> None:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL must be set before seeding demo data")
    with SessionLocal() as session:
        seed_demo_data(session)
        session.commit()
    print("Fictional demo data seeded (safe to run again).")


if __name__ == "__main__":
    main()
