import assert from "node:assert/strict";
import test from "node:test";
import {
  attackRelativeProgress,
  calculateOverloads,
  calculateTeamMetrics,
  calculateZoneOccupancy,
  distanceMeters,
  mapPlayerRole,
  toTacticalCoordinate,
} from "./tacticalMetrics.ts";

function player(id, position) {
  return {
    id,
    name: `Player ${id}`,
    position,
    team: { id: id < 100 ? 1 : 2, name: id < 100 ? "Home" : "Away" },
    availability: null,
  };
}

function teamInput(side, squad, coords) {
  return { side, players: squad, positions: coords };
}

test("converts the same normalized coordinates to fixed pitch metres", () => {
  assert.deepEqual(toTacticalCoordinate({ x: 50, y: 50 }), { lengthMeters: 52.5, widthMeters: 34 });
});

test("calculates average position and pitch-width spread from placed players only", () => {
  const squad = [player(1, "Goalkeeper"), player(2, "Defender"), player(3, "Forward")];
  const metrics = calculateTeamMetrics(teamInput("home", squad, {
    1: { x: 20, y: 20 },
    2: { x: 40, y: 80 },
  }));
  assert.deepEqual(metrics.averagePosition, { x: 30, y: 50 });
  assert.equal(metrics.widthMeters, 40.8);
  assert.equal(metrics.placedPlayerCount, 2);
});

test("current-coordinate changes produce updated analysis values", () => {
  const squad = [player(1, "Defender"), player(2, "Forward")];
  const before = calculateTeamMetrics(teamInput("home", squad, {
    1: { x: 20, y: 20 }, 2: { x: 40, y: 40 },
  }));
  const after = calculateTeamMetrics(teamInput("home", squad, {
    1: { x: 70, y: 70 }, 2: { x: 90, y: 90 },
  }));
  assert.notEqual(after.averagePosition?.x, before.averagePosition?.x);
  assert.notEqual(after.lines.defense?.averageDepthMeters, before.lines.defense?.averageDepthMeters);
  assert.notDeepEqual(
    calculateZoneOccupancy(teamInput("home", squad, { 1: { x: 20, y: 20 }, 2: { x: 40, y: 40 } }), teamInput("away", [], {})),
    calculateZoneOccupancy(teamInput("home", squad, { 1: { x: 70, y: 70 }, 2: { x: 90, y: 90 } }), teamInput("away", [], {})),
  );
});

test("uses opposite attack-relative coordinates for Home and Away", () => {
  assert.equal(attackRelativeProgress(25, "home"), 25);
  assert.equal(attackRelativeProgress(25, "away"), 75);
  assert.equal(attackRelativeProgress(100, "away"), 0);
});

test("calculates aspect-corrected player distance", () => {
  assert.equal(distanceMeters({ x: 0, y: 0 }, { x: 100, y: 100 }), Math.hypot(105, 68));
  assert.equal(distanceMeters({ x: 0, y: 0 }, { x: 100, y: 0 }), 105);
});

test("calculates defensive, midfield, forward lines and spacing", () => {
  const squad = [player(1, "Defender"), player(2, "Midfielder"), player(3, "Forward")];
  const metrics = calculateTeamMetrics(teamInput("home", squad, {
    1: { x: 20, y: 20 },
    2: { x: 50, y: 50 },
    3: { x: 80, y: 80 },
  }));
  assert.equal(metrics.lines.defense?.averageDepthMeters, 21);
  assert.equal(metrics.lines.midfield?.averageDepthMeters, 52.5);
  assert.equal(metrics.lines.forward?.averageDepthMeters, 84);
  assert.equal(metrics.lineSpacingMeters.defenseToMidfield, 31.5);
  assert.equal(metrics.lineSpacingMeters.midfieldToForward, 31.5);
});

test("assigns screen-space zones and counts only placed players", () => {
  const home = teamInput("home", [player(1, "Forward"), player(2, "Defender")], {
    1: { x: 10, y: 10 },
    2: { x: 100, y: 100 },
  });
  const away = teamInput("away", [player(101, "Forward"), player(102, "Midfielder")], {
    101: { x: 10, y: 10 },
  });
  const zones = calculateZoneOccupancy(home, away);
  assert.equal(zones.length, 9);
  assert.deepEqual(zones[0], {
    row: 0, column: 0, label: "Top · Left", homeCount: 1, awayCount: 1, homeDifference: 0,
  });
  assert.equal(zones[8].homeCount, 1);
  assert.equal(zones.reduce((sum, zone) => sum + zone.homeCount, 0), 2);
  assert.equal(zones.reduce((sum, zone) => sum + zone.awayCount, 0), 1);
});

test("reports objective numerical overloads", () => {
  const home = teamInput("home", [player(1, "Forward"), player(2, "Defender")], {
    1: { x: 20, y: 20 }, 2: { x: 25, y: 25 },
  });
  const away = teamInput("away", [player(101, "Forward")], { 101: { x: 20, y: 20 } });
  const overload = calculateOverloads(calculateZoneOccupancy(home, away));
  assert.equal(overload.length, 1);
  assert.equal(overload[0].homeDifference, 1);
  assert.equal(overload[0].homeCount, 2);
  assert.equal(overload[0].awayCount, 1);
});

test("handles empty and partial placement without inventing line values", () => {
  const empty = calculateTeamMetrics(teamInput("home", [], {}));
  assert.equal(empty.averagePosition, null);
  assert.equal(empty.widthMeters, null);
  assert.equal(empty.lines.defense, null);
  assert.deepEqual(empty.spatialGaps, []);

  const partial = calculateTeamMetrics(teamInput("away", [player(101, "Goalkeeper")], {
    101: { x: 95, y: 50 },
  }));
  assert.equal(partial.lines.defense, null);
  assert.equal(partial.lineSpacingMeters.defenseToMidfield, null);
  assert.deepEqual(partial.spatialGaps, []);
});

test("safely ignores unknown player positions for role-specific metrics", () => {
  assert.equal(mapPlayerRole("Mystery Role"), null);
  assert.equal(mapPlayerRole(undefined), null);
  const metrics = calculateTeamMetrics(teamInput("home", [player(1, "Mystery Role")], {
    1: { x: 50, y: 50 },
  }));
  assert.equal(metrics.placedPlayerCount, 1);
  assert.equal(metrics.averagePosition?.x, 50);
  assert.equal(metrics.lines.midfield, null);
});

test("flags nearest-player links beyond the documented spatial-gap threshold", () => {
  const metrics = calculateTeamMetrics(teamInput("home", [player(1, "Defender"), player(2, "Forward")], {
    1: { x: 0, y: 0 },
    2: { x: 30, y: 0 },
  }));
  assert.equal(metrics.spatialGaps.length, 1);
  assert.equal(metrics.spatialGaps[0].distanceMeters, 31.5);
});
