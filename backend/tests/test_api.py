import pytest

from app.services import validate_match_player_team
from app.models import Match


def test_teams_and_players_are_labeled_demo_data(client):
    teams_response = client.get("/api/teams")
    players_response = client.get("/api/players?team_id=1")

    assert teams_response.status_code == 200
    assert teams_response.json()["data_label"] == "DEMO DATA — fictional examples"
    assert teams_response.json()["count"] == 2
    assert players_response.status_code == 200
    assert players_response.json()["items"][0]["name"] == "Jordan Vale"
    assert players_response.json()["items"][0]["availability"]["status"] == "active"


def test_team_player_and_availability_detail_endpoints(client):
    team_response = client.get("/api/teams/1")
    player_response = client.get("/api/players/1")
    availability_response = client.get("/api/players/1/availability")

    assert team_response.json()["item"]["name"] == "Northbridge FC"
    assert player_response.json()["item"]["name"] == "Jordan Vale"
    assert availability_response.json()["item"]["status"] == "active"


def test_availability_can_be_filtered_and_rejects_unknown_status(client):
    response = client.get("/api/availability?status=injured")
    invalid = client.get("/api/availability?status=unavailable")

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["items"][0]["player_name"] == "Casey Rowan"
    assert invalid.status_code == 422


def test_match_detail_contains_participants_and_events(client):
    response = client.get("/api/matches/1")

    assert response.status_code == 200
    item = response.json()["item"]
    assert item["home_team"]["name"] == "Northbridge FC"
    assert item["away_team"]["name"] == "Harbor City FC"
    assert len(item["players"]) == 2
    represented_teams = {participant["team"]["name"] for participant in item["players"]}
    assert represented_teams == {"Northbridge FC", "Harbor City FC"}
    assert item["events"][0]["event_type"] == "goal"


def test_match_participant_team_must_be_home_or_away():
    match = Match(home_team_id=1, away_team_id=2)

    validate_match_player_team(match, 1)
    validate_match_player_team(match, 2)

    with pytest.raises(ValueError, match="home or away"):
        validate_match_player_team(match, 3)


def test_availability_statuses_match_the_supported_values():
    from app.schemas import AvailabilityStatus

    assert {status.value for status in AvailabilityStatus} == {
        "active",
        "doubtful",
        "injured",
        "suspended",
    }


def test_missing_records_return_not_found(client):
    assert client.get("/api/teams/999").status_code == 404
    assert client.get("/api/players/999").status_code == 404
    assert client.get("/api/matches/999").status_code == 404
