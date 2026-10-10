import assert from "node:assert/strict";
import test from "node:test";
import { buildTacticalReportRequest, isTacticalReportStale } from "../api/tacticalReport.ts";

const base = {
  teams: { home: { id: 1, name: "Home" }, away: { id: 2, name: "Away" } },
  formationBySide: { home: "4-3-3", away: "3-5-2" },
  squads: { home: [{ id: 4 }, { id: 3 }], away: [{ id: 8 }] },
  assignments: { home: { 2: 3, 0: 4 }, away: { 1: 8 } },
  playerPositions: {
    home: { 3: { x: 44, y: 22 }, 4: { x: 7, y: 50 } },
    away: { 8: { x: 63, y: 70 } },
  },
};

test("report request takes live assigned positions in squad order", () => {
  assert.deepEqual(buildTacticalReportRequest(base), {
    home_team_id: 1,
    away_team_id: 2,
    formation_by_side: { home: "4-3-3", away: "3-5-2" },
    players: [
      { player_id: 4, side: "home", formation_slot: 0, position: { x: 7, y: 50 } },
      { player_id: 3, side: "home", formation_slot: 2, position: { x: 44, y: 22 } },
      { player_id: 8, side: "away", formation_slot: 1, position: { x: 63, y: 70 } },
    ],
  });
});

test("unassigned and unpositioned players are omitted", () => {
  const request = buildTacticalReportRequest({
    ...base,
    assignments: { home: { 2: 3 }, away: {} },
  });
  assert.deepEqual(request.players.map((player) => player.player_id), [3]);
});

test("scenario changes make a generated report stale", () => {
  const oldKey = JSON.stringify(buildTacticalReportRequest(base));
  assert.equal(isTacticalReportStale(oldKey, oldKey), false);
  const changes = [
    { ...base, teams: { ...base.teams, home: { ...base.teams.home, id: 9 } } },
    { ...base, formationBySide: { ...base.formationBySide, home: "4-4-2" } },
    { ...base, assignments: { ...base.assignments, home: { 3: 4 } } },
    { ...base, playerPositions: { ...base.playerPositions, home: { ...base.playerPositions.home, 3: { x: 45, y: 22 } } } },
  ];
  for (const changed of changes) {
    assert.equal(isTacticalReportStale(oldKey, JSON.stringify(buildTacticalReportRequest(changed))), true);
  }
});
