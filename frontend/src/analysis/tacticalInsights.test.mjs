import assert from "node:assert/strict";
import test from "node:test";
import { calculateTacticalInsights } from "./tacticalInsights.ts";

function teamMetrics(side, overrides = {}) {
  return {
    side,
    placedPlayerCount: 4,
    averagePosition: { x: 50, y: 50 },
    widthMeters: 30,
    lines: { defense: null, midfield: null, forward: null },
    lineSpacingMeters: { defenseToMidfield: null, midfieldToForward: null },
    spatialGaps: [],
    ...overrides,
  };
}

function zone(row, column, homeCount, awayCount) {
  return {
    row,
    column,
    label: `Zone ${row}-${column}`,
    homeCount,
    awayCount,
    homeDifference: homeCount - awayCount,
  };
}

function input({ home, away, zones = [], teams } = {}) {
  return {
    metrics: {
      home: home ?? teamMetrics("home"),
      away: away ?? teamMetrics("away"),
    },
    zones,
    teams: teams ?? { home: { name: "Aster Vale FC" }, away: { name: "Cedar Bay United" } },
  };
}

test("line spacing below 18m produces no insight", () => {
  const insights = calculateTacticalInsights(input({
    home: teamMetrics("home", { lineSpacingMeters: { defenseToMidfield: 17.99, midfieldToForward: null } }),
  }));
  assert.deepEqual(insights, []);
});

test("line spacing exactly 18m does not trigger", () => {
  const insights = calculateTacticalInsights(input({
    home: teamMetrics("home", { lineSpacingMeters: { defenseToMidfield: 18, midfieldToForward: null } }),
  }));
  assert.deepEqual(insights, []);
});

test("line spacing greater than 18m reports the relationship and measured value", () => {
  const insights = calculateTacticalInsights(input({
    home: teamMetrics("home", { lineSpacingMeters: { defenseToMidfield: 21.4, midfieldToForward: null } }),
  }));
  assert.equal(insights.length, 1);
  assert.equal(insights[0].teamSide, "home");
  assert.equal(insights[0].relatedMetric.key, "defenseToMidfield");
  assert.equal(insights[0].relatedMetric.value, 21.4);
  assert.match(insights[0].description, /Aster Vale FC defensive-to-midfield separation is 21\.4m/);
});

test("line insight attributes either Home or Away correctly", () => {
  for (const side of ["home", "away"]) {
    const metrics = teamMetrics(side, {
      lineSpacingMeters: { defenseToMidfield: null, midfieldToForward: 19 },
    });
    const insights = calculateTacticalInsights(input({ [side]: metrics }));
    assert.equal(insights[0].teamSide, side);
    assert.equal(insights[0].relatedMetric.key, "midfieldToForward");
    assert.match(insights[0].description, new RegExp(side === "home" ? "Aster Vale FC" : "Cedar Bay United"));
  }
});

test("zone difference of one player produces no insight", () => {
  assert.deepEqual(calculateTacticalInsights(input({ zones: [zone(0, 0, 2, 1)] })), []);
});

test("zone difference of exactly two produces one Home advantage", () => {
  const [insight] = calculateTacticalInsights(input({ zones: [zone(0, 1, 4, 2)] }));
  assert.equal(insight.teamSide, "home");
  assert.equal(insight.relatedMetric.value, 2);
  assert.equal(insight.zone.homeCount, 4);
  assert.equal(insight.zone.awayCount, 2);
  assert.match(insight.description, /Aster Vale FC has a 4–2 numerical advantage in Zone 0-1/);
});

test("larger zone differences report the advantage side and exact difference", () => {
  const [insight] = calculateTacticalInsights(input({ zones: [zone(2, 2, 1, 4)] }));
  assert.equal(insight.teamSide, "away");
  assert.equal(insight.relatedMetric.value, 3);
  assert.match(insight.description, /Cedar Bay United has a 4–1 numerical advantage/);
});

test("Home and Away zone advantages are both represented without underload duplicates", () => {
  const insights = calculateTacticalInsights(input({
    zones: [zone(0, 0, 3, 1), zone(2, 2, 1, 4)],
  }));
  assert.equal(insights.length, 2);
  assert.deepEqual(insights.map((insight) => insight.teamSide), ["home", "away"]);
  assert.ok(insights.every((insight) => insight.category === "zone_difference"));
  assert.equal(new Set(insights.map((insight) => `${insight.zone.row}:${insight.zone.column}`)).size, 2);
  assert.ok(insights.every((insight) => !insight.description.toLowerCase().includes("underload")));
});

test("duplicate qualifying zone rows still produce one insight for that zone", () => {
  const insights = calculateTacticalInsights(input({ zones: [zone(1, 1, 4, 2), zone(1, 1, 4, 2)] }));
  assert.equal(insights.length, 1);
});

test("conflicting duplicate zones normalize identically in either input order", () => {
  const homeAdvantage = zone(1, 1, 4, 2);
  const awayAdvantage = zone(1, 1, 1, 4);
  const first = calculateTacticalInsights(input({ zones: [homeAdvantage, awayAdvantage] }));
  const reversed = calculateTacticalInsights(input({ zones: [awayAdvantage, homeAdvantage] }));

  assert.deepEqual(first, reversed);
  assert.equal(first.length, 1);
  assert.equal(first[0].teamSide, "away");
  assert.deepEqual(first[0].zone, {
    row: 1,
    column: 1,
    label: "Zone 1-1",
    homeCount: 1,
    awayCount: 4,
  });
});

test("spatial gaps at or below 25m do not produce Phase 5 insights", () => {
  const insights = calculateTacticalInsights(input({
    home: teamMetrics("home", {
      spatialGaps: [
        { firstPlayer: "Player A", secondPlayer: "Player B", distanceMeters: 25 },
        { firstPlayer: "Player C", secondPlayer: "Player D", distanceMeters: 24.99 },
      ],
    }),
  }));
  assert.deepEqual(insights, []);
});

test("spatial gap above 25m reports team, display names, and measured distance", () => {
  const [insight] = calculateTacticalInsights(input({
    away: teamMetrics("away", {
      spatialGaps: [{ firstPlayer: "Player B", secondPlayer: "Player A", distanceMeters: 27.3 }],
    }),
  }));
  assert.equal(insight.teamSide, "away");
  assert.equal(insight.relatedMetric.value, 27.3);
  assert.deepEqual(insight.players, ["Player A", "Player B"]);
  assert.match(insight.description, /Cedar Bay United spatial gap: Player A ↔ Player B — 27\.3m/);
  assert.equal("playerIds" in insight, false);
});

test("repeated spatial-gap records normalize regardless of record or name order", () => {
  const record = { firstPlayer: "Player B", secondPlayer: "Player A", distanceMeters: 27.3 };
  const repeated = { firstPlayer: "Player A", secondPlayer: "Player B", distanceMeters: 27.3 };
  const first = calculateTacticalInsights(input({
    home: teamMetrics("home", { spatialGaps: [record, repeated, record] }),
  }));
  const reordered = calculateTacticalInsights(input({
    home: teamMetrics("home", { spatialGaps: [record, record, repeated] }),
  }));

  assert.deepEqual(first, reordered);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].players, ["Player A", "Player B"]);
});

test("same-name spatial-gap records with different distances stay distinct and order-independent", () => {
  const shorter = { firstPlayer: "Player A", secondPlayer: "Player B", distanceMeters: 26 };
  const longer = { firstPlayer: "Player B", secondPlayer: "Player A", distanceMeters: 29 };
  const first = calculateTacticalInsights(input({
    home: teamMetrics("home", { spatialGaps: [shorter, longer] }),
  }));
  const reversed = calculateTacticalInsights(input({
    home: teamMetrics("home", { spatialGaps: [longer, shorter] }),
  }));

  assert.deepEqual(first, reversed);
  assert.equal(first.length, 2);
  assert.deepEqual(first.map((insight) => insight.relatedMetric.value), [26, 29]);
  assert.equal(new Set(first.map((insight) => insight.id)).size, 2);
});

test("returns multiple simultaneous observations", () => {
  const insights = calculateTacticalInsights(input({
    home: teamMetrics("home", {
      lineSpacingMeters: { defenseToMidfield: 22, midfieldToForward: null },
      spatialGaps: [{ firstPlayer: "A", secondPlayer: "B", distanceMeters: 26 }],
    }),
    zones: [zone(0, 1, 3, 1)],
  }));
  assert.deepEqual(insights.map((insight) => insight.category), ["line_spacing", "zone_difference", "spatial_gap"]);
});

test("empty and partial board data does not crash or invent observations", () => {
  assert.deepEqual(calculateTacticalInsights({ metrics: {}, zones: [] }), []);
  const partial = calculateTacticalInsights({
    metrics: { home: teamMetrics("home", { lineSpacingMeters: { defenseToMidfield: null, midfieldToForward: null } }) },
  });
  assert.deepEqual(partial, []);
});

test("missing line fields and unknown metrics are ignored safely", () => {
  const malformedMetrics = { side: "home", spatialGaps: [] };
  assert.deepEqual(calculateTacticalInsights({ metrics: { home: malformedMetrics } }), []);
});

test("IDs are deterministic and ordering does not depend on input array order", () => {
  const first = input({
    home: teamMetrics("home", {
      lineSpacingMeters: { defenseToMidfield: 23, midfieldToForward: 20 },
      spatialGaps: [
        { firstPlayer: "Zed", secondPlayer: "Amy", distanceMeters: 29 },
        { firstPlayer: "Bo", secondPlayer: "Cal", distanceMeters: 26 },
      ],
    }),
    zones: [zone(2, 2, 1, 3), zone(0, 0, 3, 1)],
  });
  const reordered = {
    ...first,
    zones: [...first.zones].reverse(),
    metrics: {
      ...first.metrics,
      home: { ...first.metrics.home, spatialGaps: [...first.metrics.home.spatialGaps].reverse() },
    },
  };
  const insights = calculateTacticalInsights(first);
  const repeated = calculateTacticalInsights(first);
  const reorderedInsights = calculateTacticalInsights(reordered);
  assert.deepEqual(insights.map((insight) => insight.id), repeated.map((insight) => insight.id));
  assert.deepEqual(insights.map((insight) => insight.id), reorderedInsights.map((insight) => insight.id));
});

test("player names remain display references and insight severity is nonjudgmental", () => {
  const [insight] = calculateTacticalInsights(input({
    home: teamMetrics("home", {
      spatialGaps: [{ firstPlayer: "A Name", secondPlayer: "B Name", distanceMeters: 26 }],
    }),
  }));
  assert.deepEqual(insight.players, ["A Name", "B Name"]);
  assert.equal(insight.severity, "notable");
  assert.equal("playerIds" in insight, false);
});
