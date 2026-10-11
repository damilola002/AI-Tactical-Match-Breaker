import assert from "node:assert/strict";
import test from "node:test";
import { getPlayerReportInsights, playerReportSnapshotLabel } from "./playerReportInsights.ts";

function item(id, claim, evidenceIds = [claim.evidence_id]) {
  return { id, scope: "current_scenario", text: "Untrusted display text is not used to associate this item.", evidence_ids: evidenceIds, confidence: "moderate", claim };
}

function evidence(id, playerIds, extras = {}) {
  return {
    id,
    kind: "scenario_insight",
    label: "Measured spatial gap",
    source_key: "spatial_gap",
    side: "home",
    team_id: 1,
    match_id: null,
    player_id: null,
    player_ids: playerIds,
    value: {
      category: "spatial_gap",
      teamSide: "home",
      playerIds,
      relatedMetric: { key: "player_distance_meters", value: 19 },
      zone: null,
    },
    ...extras,
  };
}

function spatialGapClaim(evidenceId, playerIds, extras = {}) {
  return {
    claim_type: "scenario_insight",
    evidence_id: evidenceId,
    side: "home",
    team_id: 1,
    category: "spatial_gap",
    player_ids: playerIds,
    metric_key: "player_distance_meters",
    value: 19,
    zone_row: null,
    zone_column: null,
    ...extras,
  };
}

function report(observations, recommendations, evidenceRefs) {
  return { observations, recommendations, evidence_refs: evidenceRefs };
}

test("includes an explicitly identified player in a supported player-pair claim", () => {
  const claim = spatialGapClaim("gap:4:5", [4, 5]);
  const response = report([item("obs-1", claim)], [], [evidence("gap:4:5", [4, 5])]);
  assert.equal(getPlayerReportInsights(response, 4).length, 1);
  assert.equal(getPlayerReportInsights(response, 5).length, 1);
  assert.equal(getPlayerReportInsights(response, 9).length, 0);
});

test("includes a historical player measurement when its evidence has the same player and match", () => {
  const claim = { claim_type: "historical_measurement", evidence_id: "measure:7:4", player_id: 4, match_id: 7, team_id: 1, value: 1234, metric_field: "distance_covered_meters" };
  const ref = evidence("measure:7:4", [], { kind: "historical_measurement", source_key: "distance_covered_meters", player_id: 4, player_ids: [], match_id: 7, value: 1234 });
  const response = report([item("obs-2", claim)], [], [ref]);
  assert.equal(getPlayerReportInsights(response, 4).length, 1);
});

test("does not repeat duplicate historical measurement evidence on the player card", () => {
  const claim = { claim_type: "historical_measurement", evidence_id: "measure:7:4", player_id: 4, match_id: 7, team_id: 1, value: 1234, metric_field: "distance_covered_meters" };
  const ref = evidence("measure:7:4", [], { kind: "historical_measurement", source_key: "distance_covered_meters", player_id: 4, player_ids: [], match_id: 7, value: 1234 });
  const response = report([item("obs-2a", claim), item("obs-2b", claim)], [], [ref]);
  assert.equal(getPlayerReportInsights(response, 4).length, 1);
});

test("excludes team-only claims, text-only player mentions, and claims for another player", () => {
  const claims = [
    item("team", { claim_type: "scenario_metric", evidence_id: "team:1", team_id: 1, side: "home" }),
    item("text", { claim_type: "scenario_metric", evidence_id: "text:1", team_id: 1 }, ["text:1"]),
    item("other", { claim_type: "historical_measurement", evidence_id: "other:1", player_id: 8, match_id: 7 }),
  ];
  const refs = [evidence("team:1", []), evidence("text:1", []), evidence("other:1", [], { kind: "historical_measurement", player_id: 8 })];
  assert.deepEqual(getPlayerReportInsights(report(claims, [], refs), 4), []);
});

test("rejects missing, unrelated, or incomplete supporting evidence", () => {
  const pairClaim = spatialGapClaim("gap:4:5", [4, 5]);
  const missing = report([item("missing", pairClaim)], [], []);
  const mismatched = report([item("wrong", pairClaim)], [], [evidence("gap:4:5", [4, 6])]);
  const unlinked = report([item("unlinked", pairClaim, ["other-ref"])], [], [evidence("gap:4:5", [4, 5]), evidence("other-ref", [4, 5])]);
  assert.equal(getPlayerReportInsights(missing, 4).length, 0);
  assert.equal(getPlayerReportInsights(mismatched, 4).length, 0);
  assert.equal(getPlayerReportInsights(unlinked, 4).length, 0);
});

test("keeps recommendations only when claim, item refs, and evidence agree", () => {
  const claim = spatialGapClaim("gap:4:5", [4, 5]);
  const recommendation = { ...item("rec-1", claim), limitations: ["Visual spacing only."] };
  const response = report([], [recommendation], [evidence("gap:4:5", [4, 5])]);
  assert.equal(getPlayerReportInsights(response, 4)[0].item.id, "rec-1");
});

test("rejects scenario insights when evidence category, metric, value, or zone disagrees", () => {
  const claim = spatialGapClaim("gap:4:5", [4, 5], { zone_row: 1, zone_column: 2 });
  const validValue = {
    category: "spatial_gap",
    teamSide: "home",
    playerIds: [4, 5],
    relatedMetric: { key: "player_distance_meters", value: 19 },
    zone: { row: 1, column: 2 },
  };
  const mismatches = [
    evidence("gap:4:5", [4, 5], { source_key: "line_spacing", value: { ...validValue, category: "line_spacing" } }),
    evidence("gap:4:5", [4, 5], { value: { ...validValue, relatedMetric: { key: "line_spacing_meters", value: 19 } } }),
    evidence("gap:4:5", [4, 5], { value: { ...validValue, relatedMetric: { key: "player_distance_meters", value: 20 } } }),
    evidence("gap:4:5", [4, 5], { value: { ...validValue, zone: { row: 1, column: 3 } } }),
  ];
  for (const ref of mismatches) {
    assert.deepEqual(getPlayerReportInsights(report([item("mismatch", claim)], [], [ref]), 4), []);
  }
});

test("rejects scenario metrics when the evidence source key or value disagrees", () => {
  const claim = {
    claim_type: "scenario_metric",
    evidence_id: "metric:4:5",
    side: "home",
    team_id: 1,
    metric_key: "spatial_gap",
    player_ids: [4, 5],
    value: { firstPlayerId: 4, secondPlayerId: 5, distanceMeters: 19 },
  };
  const base = { kind: "scenario_metric", side: "home", team_id: 1, player_ids: [4, 5] };
  const mismatches = [
    evidence("metric:4:5", [4, 5], { ...base, source_key: "line_spacing", value: claim.value }),
    evidence("metric:4:5", [4, 5], { ...base, source_key: "spatial_gap", value: { ...claim.value, distanceMeters: 20 } }),
  ];
  for (const ref of mismatches) {
    assert.deepEqual(getPlayerReportInsights(report([item("mismatch", claim)], [], [ref]), 4), []);
  }
});

test("labels stale report evidence as belonging to an earlier snapshot", () => {
  assert.equal(playerReportSnapshotLabel(true), "Earlier report snapshot");
  assert.equal(playerReportSnapshotLabel(false), null);
});
