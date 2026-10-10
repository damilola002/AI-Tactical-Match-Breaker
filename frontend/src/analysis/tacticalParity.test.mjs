import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateTacticalInsights } from "./tacticalInsights.ts";
import { calculateTeamMetrics, calculateZoneOccupancy } from "./tacticalMetrics.ts";

const fixture = JSON.parse(readFileSync(new URL("../../../tests/fixtures/tactical_report_parity.json", import.meta.url), "utf8"));

function buildInput(entry, side) {
  const players = entry[side].map((item) => ({
    id: item.player_id,
    name: item.name,
    position: item.position_role,
    team: { id: side === "home" ? 1 : 2, name: entry.teams[side] },
    availability: null,
  }));
  return {
    side,
    players,
    positions: Object.fromEntries(entry[side].map((item) => [item.player_id, item.position])),
  };
}

test("shared scenarios keep a checked frontend golden result", () => {
  for (const entry of fixture.cases) {
    const home = buildInput(entry, "home");
    const away = buildInput(entry, "away");
    const metrics = { home: calculateTeamMetrics(home), away: calculateTeamMetrics(away) };
    const zones = calculateZoneOccupancy(home, away);
    const insights = calculateTacticalInsights({ metrics, zones, teams: {
      home: { name: entry.teams.home }, away: { name: entry.teams.away },
    } });
    assert.deepEqual({ metrics, zones, insights }, entry.frontend_expected, entry.name);
  }
});

test("insight fixtures cover strict thresholds, duplicate records, and display ordering", () => {
  for (const entry of fixture.insight_cases) {
    const actual = calculateTacticalInsights({
      metrics: entry.metrics,
      zones: entry.zones,
      teams: { home: { name: entry.teams.home }, away: { name: entry.teams.away } },
    });
    assert.deepEqual(actual, entry.frontend_expected, entry.name);
  }
  const strict = fixture.insight_cases.find((item) => item.name === "strict-thresholds-near-boundaries").frontend_expected;
  assert.equal(strict.some((item) => item.id === "line_spacing:home:defenseToMidfield"), false);
  assert.equal(strict.some((item) => item.id === "line_spacing:home:midfieldToForward"), true);
  assert.equal(strict.some((item) => item.relatedMetric.key === "spatialGapDistance" && item.relatedMetric.value === 25), false);
});

test("exact and just-above gap fixtures preserve the strict >25m decision", () => {
  const exact = fixture.cases.find((item) => item.name === "exact-gap-threshold").frontend_expected;
  const above = fixture.cases.find((item) => item.name === "just-above-gap-threshold").frontend_expected;
  assert.equal(exact.metrics.home.spatialGaps.length, 0);
  assert.equal(above.metrics.home.spatialGaps.length, 1);
  assert.equal(above.insights.some((item) => item.category === "spatial_gap"), true);
});
