import assert from "node:assert/strict";
import test from "node:test";
import { parseHashRoute } from "../state/hashRouter.ts";

test("hash route parser supports direct links for all four page views", () => {
  assert.equal(parseHashRoute("#/planner").page, "planner");
  assert.equal(parseHashRoute("#/board").page, "board");
  assert.equal(parseHashRoute("#/reports").page, "reports");
  assert.deepEqual(parseHashRoute("#/players/42"), { page: "players", playerId: 42, hash: "#/players/42" });
  assert.deepEqual(parseHashRoute("#/players"), { page: "players", playerId: null, hash: "#/players" });
});

test("unknown and malformed hashes resolve safely to the planner", () => {
  assert.equal(parseHashRoute("#/videos").hash, "#/planner");
  assert.equal(parseHashRoute("#/players/not-an-id").playerId, null);
  assert.equal(parseHashRoute("").page, "planner");
});
