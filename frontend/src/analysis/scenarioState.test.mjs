import assert from "node:assert/strict";
import test from "node:test";
import { createInitialScenarioState, scenarioReducer } from "../state/scenarioState.ts";
import { captureScenarioSnapshot } from "./tacticalSnapshot.ts";

const teams = [{ id: 1, name: "Aster" }, { id: 2, name: "Cedar" }, { id: 3, name: "Morrow" }];
function players(teamId, offset = 0) {
  return ["Goalkeeper", "Defender", "Defender", "Defender", "Defender", "Midfielder", "Midfielder", "Midfielder", "Forward", "Forward", "Forward"]
    .map((position, index) => ({ id: offset + index + 1, name: `Player ${index + 1}`, position, team: teams[teamId - 1], availability: { player_id: offset + index + 1, status: index === 8 ? "injured" : "active", updated_at: "2026-01-01" } }));
}
function load(state, teamId, requestId, roster) {
  state = scenarioReducer(state, { type: "ROSTER_LOAD_STARTED", teamId, requestId });
  return scenarioReducer(state, { type: "ROSTER_LOADED", teamId, requestId, players: roster });
}

test("team changes and swaps do not keep stale player IDs", () => {
  let state = createInitialScenarioState(teams);
  state = load(state, 1, 1, players(1));
  state = load(state, 2, 2, players(2, 20));
  state = scenarioReducer(state, { type: "TEAM_SELECTED", side: "home", teamId: 2 });
  assert.deepEqual(state.teamIds, { home: 2, away: 1 });
  assert.ok(Object.values(state.assignments.home).every((id) => id === null || id > 20));
  assert.ok(Object.values(state.assignments.away).every((id) => id === null || id <= 11));
});

test("out-of-order roster responses are ignored after their request identity is invalidated", () => {
  let state = createInitialScenarioState(teams);
  state = scenarioReducer(state, { type: "ROSTER_LOAD_STARTED", teamId: 1, requestId: 1 });
  state = scenarioReducer(state, { type: "TEAM_SELECTED", side: "home", teamId: 3 });
  const before = state;
  state = scenarioReducer(state, { type: "ROSTER_LOADED", teamId: 1, requestId: 1, players: players(1) });
  assert.equal(state, before);
});

test("formation changes isolate sides and preserve compatible assignments", () => {
  let state = createInitialScenarioState(teams);
  state = load(state, 1, 1, players(1));
  state = load(state, 2, 2, players(2, 20));
  const awayAssignments = state.assignments.away;
  const awayPositions = state.freePositions.away;
  const keeperId = state.assignments.home[0];
  const defenderId = state.assignments.home[1];
  state = scenarioReducer(state, { type: "PLAYER_MOVED", side: "home", playerId: defenderId, position: { x: 81, y: 15 } });
  state = scenarioReducer(state, { type: "FORMATION_SELECTED", side: "home", formation: "3-5-2" });
  assert.equal(state.assignments.home[0], keeperId);
  assert.deepEqual(state.freePositions.home[defenderId], { x: 20, y: 24 }, "changed side resets to formation start positions");
  assert.equal(state.assignments.away, awayAssignments);
  assert.equal(state.freePositions.away, awayPositions);
});

test("goalkeepers cannot move, outfield players can, and reset restores current slots", () => {
  let state = createInitialScenarioState(teams);
  state = load(state, 1, 1, players(1));
  state = load(state, 2, 2, players(2, 20));
  const keeperId = state.assignments.home[0];
  const defenderId = state.assignments.home[1];
  const keeperStart = state.freePositions.home[keeperId];
  state = scenarioReducer(state, { type: "PLAYER_MOVED", side: "home", playerId: keeperId, position: { x: 82, y: 12 } });
  assert.deepEqual(state.freePositions.home[keeperId], keeperStart);
  state = scenarioReducer(state, { type: "PLAYER_MOVED", side: "home", playerId: defenderId, position: { x: 85, y: 13 } });
  assert.deepEqual(state.freePositions.home[defenderId], { x: 85, y: 13 });
  state = scenarioReducer(state, { type: "FORMATION_RESET", side: "home" });
  assert.deepEqual(state.freePositions.home[defenderId], { x: 20, y: 18 });
});

test("report request and immutable snapshot capture the same positions and later edits are stale", () => {
  let state = createInitialScenarioState(teams);
  state = load(state, 1, 1, players(1));
  state = load(state, 2, 2, players(2, 20));
  const playerId = state.assignments.home[1];
  state = scenarioReducer(state, { type: "PLAYER_MOVED", side: "home", playerId, position: { x: 77, y: 33 } });
  const captured = captureScenarioSnapshot(state);
  const requestPlayer = captured.request.players.find((player) => player.player_id === playerId);
  const snapshotPlayer = captured.snapshot.playersBySide.home.find((player) => player.id === playerId);
  assert.deepEqual(requestPlayer.position, snapshotPlayer.coordinates);
  assert.deepEqual(requestPlayer.position, { x: 77, y: 33 });
  assert.equal(Object.isFrozen(captured.snapshot.playersBySide.home[0].coordinates), true);
  state = scenarioReducer(state, { type: "PLAYER_MOVED", side: "home", playerId, position: { x: 88, y: 44 } });
  const current = captureScenarioSnapshot(state);
  assert.notEqual(current.snapshot.scenarioKey, captured.snapshot.scenarioKey);
  assert.deepEqual(captured.snapshot.playersBySide.home.find((player) => player.id === playerId).coordinates, { x: 77, y: 33 });
});
