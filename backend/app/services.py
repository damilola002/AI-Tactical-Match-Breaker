from app.models import Match


def validate_match_player_team(match: Match, team_id: int) -> None:
    """Ensure a participant is recorded for one of the match's two teams."""
    if team_id not in {match.home_team_id, match.away_team_id}:
        raise ValueError("A match participant's team must be the home or away team")
