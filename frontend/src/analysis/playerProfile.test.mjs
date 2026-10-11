import assert from "node:assert/strict";
import test from "node:test";
import { summarizePlayerMeasurements } from "./playerProfile.ts";

function match(id, result, players) {
  return {
    id, kickoff_at: "2026-01-01T00:00:00Z", home_team: { id: 1, name: "Home" }, away_team: { id: 2, name: "Away" },
    selected_team: { id: 1, name: "Home" }, opponent: { id: 2, name: "Away" }, venue_context: "home", result,
    goals_for: result ? 1 : null, goals_against: result ? 0 : null, physical_comparison: null, players,
  };
}

test("player averages use measured completed appearances with separate samples per metric", () => {
  const summary = summarizePlayerMeasurements(7, 1, [
    match(1, "win", [{ player_id: 7, player_name: "Player", team_id: 1, distance_covered_meters: 0, sprint_count: 4 }]),
    match(2, "draw", [{ player_id: 7, player_name: "Player", team_id: 1, distance_covered_meters: 9000, sprint_count: null }]),
    match(3, "loss", [{ player_id: 7, player_name: "Player", team_id: 1, distance_covered_meters: null, sprint_count: 8 }]),
    match(4, null, [{ player_id: 7, player_name: "Player", team_id: 1, distance_covered_meters: 9900, sprint_count: 99 }]),
    match(5, "win", [{ player_id: 7, player_name: "Player", team_id: 2, distance_covered_meters: 10000, sprint_count: 100 }]),
  ]);
  assert.deepEqual(summary, {
    distance: { total: 9000, averagePerMeasuredAppearance: 4500, sampleCount: 2 },
    sprints: { total: 12, averagePerMeasuredAppearance: 6, sampleCount: 2 },
  });
});

test("player averages show unavailable when measurements are missing", () => {
  const summary = summarizePlayerMeasurements(7, 1, [
    match(1, "win", [{ player_id: 7, player_name: "Player", team_id: 1, distance_covered_meters: null, sprint_count: null }]),
  ]);
  assert.deepEqual(summary.distance, { total: null, averagePerMeasuredAppearance: null, sampleCount: 0 });
  assert.deepEqual(summary.sprints, { total: null, averagePerMeasuredAppearance: null, sampleCount: 0 });
});
