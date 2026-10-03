"""Insert or refresh a small, fictional demo dataset without duplicating it."""

from datetime import UTC, datetime

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
)

MATCH_KICKOFF = datetime(2026, 9, 20, 15, 0, tzinfo=UTC)
MATCH_SCORE = (2, 1)
MATCH_EVENTS = (
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


def seed_demo_data(session: Session) -> None:
    teams: list[Team] = []
    team_players: list[list[Player]] = []

    for team_fixture in TEAM_FIXTURES:
        team = get_or_create_team(session, team_fixture["name"])
        players = [
            get_or_create_player(session, team, name, position, status)
            for name, position, status in team_fixture["players"]
        ]
        teams.append(team)
        team_players.append(players)

    home_team, away_team = teams
    match = session.scalar(
        select(Match).where(
            Match.kickoff_at == MATCH_KICKOFF,
            Match.home_team_id == home_team.id,
            Match.away_team_id == away_team.id,
        )
    )
    if match is None:
        match = Match(
            kickoff_at=MATCH_KICKOFF,
            home_team=home_team,
            away_team=away_team,
            home_score=MATCH_SCORE[0],
            away_score=MATCH_SCORE[1],
        )
        session.add(match)
        session.flush()
    else:
        match.home_score, match.away_score = MATCH_SCORE

    for team, players in zip(teams, team_players, strict=True):
        validate_match_player_team(match, team.id)
        for player in players:
            participant = session.get(MatchPlayer, (match.id, player.id))
            if participant is None:
                session.add(
                    MatchPlayer(match_id=match.id, player_id=player.id, team_id=team.id)
                )
            else:
                participant.team_id = team.id

    for occurred_at_seconds, event_type, description in MATCH_EVENTS:
        event = session.scalar(
            select(MatchEvent).where(
                MatchEvent.match_id == match.id,
                MatchEvent.occurred_at_seconds == occurred_at_seconds,
                MatchEvent.event_type == event_type,
            )
        )
        if event is None:
            session.add(
                MatchEvent(
                    match_id=match.id,
                    occurred_at_seconds=occurred_at_seconds,
                    event_type=event_type,
                    description=description,
                )
            )
        else:
            event.description = description


def main() -> None:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL must be set before seeding demo data")

    with SessionLocal() as session:
        seed_demo_data(session)
        session.commit()

    print("Fictional demo data seeded (safe to run again).")


if __name__ == "__main__":
    main()
