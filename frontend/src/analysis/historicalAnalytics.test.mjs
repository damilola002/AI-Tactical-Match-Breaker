import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoricalAnalyticsUrls,
  formatHistoricalMeasurement,
  historicalOutcomeLabel,
  historicalOpponentLabel,
  historicalViewState,
  loadHistoricalAnalytics,
} from "../api/historicalAnalytics.ts";

const match = {
  id: 10,
  opponent: { id: 2, name: "Cedar Bay United" },
  result: "win",
};

test("result filter is included in both analytics API URLs", () => {
  assert.deepEqual(buildHistoricalAnalyticsUrls(7, "loss"), {
    matches: "/api/analytics/teams/7/matches?result=loss",
    summary: "/api/analytics/teams/7/summary?result=loss",
  });
});

test("successful API responses are returned from both endpoints", async () => {
  const seen = [];
  const fetcher = async (url) => {
    seen.push(url);
    return {
      ok: true,
      json: async () => url.includes("/matches")
        ? { data_label: "DEMO", count: 1, items: [match] }
        : { match_count: 1, results: { wins: 1, draws: 0, losses: 0 } },
    };
  };
  const data = await loadHistoricalAnalytics(4, "win", fetcher);
  assert.equal(data.matches.items[0].id, 10);
  assert.equal(data.summary.results.wins, 1);
  assert.equal(seen.length, 2);
});

test("API failures are surfaced to the UI", async () => {
  await assert.rejects(
    loadHistoricalAnalytics(4, "all", async () => ({ ok: false, status: 503 })),
    /HTTP 503/,
  );
});

test("loading, error, empty, and ready history states are distinct", () => {
  assert.equal(historicalViewState(true, null, []), "loading");
  assert.equal(historicalViewState(false, "offline", []), "error");
  assert.equal(historicalViewState(false, null, []), "empty");
  assert.equal(historicalViewState(false, null, [match]), "ready");
});

test("missing measurements stay unavailable while measured zero stays zero", () => {
  assert.equal(formatHistoricalMeasurement(null, "m"), "Unavailable");
  assert.equal(formatHistoricalMeasurement(0, "m"), "0 m");
});

test("match labels expose opponent and result", () => {
  assert.equal(historicalOpponentLabel(match), "Cedar Bay United");
  assert.equal(historicalOutcomeLabel(match), "WIN");
  assert.equal(historicalOutcomeLabel({ ...match, result: null }), "PENDING");
});
