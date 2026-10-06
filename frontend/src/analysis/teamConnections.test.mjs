import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamConnections } from "./teamConnections.ts";

const slots = [
  { line: "GK", x: 7, y: 50 },
  { line: "DEF", x: 20, y: 20 },
  { line: "DEF", x: 20, y: 50 },
  { line: "DEF", x: 20, y: 80 },
  { line: "MID", x: 35, y: 30 },
  { line: "MID", x: 35, y: 70 },
  { line: "FWD", x: 38, y: 50 },
];

function input({ homeAssignments = {}, awayAssignments = {}, homePositions = {}, awayPositions = {} } = {}) {
  return {
    slots: { home: slots, away: slots },
    assignments: { home: homeAssignments, away: awayAssignments },
    positions: { home: homePositions, away: awayPositions },
  };
}

function connections(data) {
  return buildTeamConnections(data.slots, data.assignments, data.positions);
}

test("connections support Home only and ignore empty or singly occupied lines", () => {
  const result = connections(input({
    homeAssignments: { 0: 10, 1: null, 2: 12, 3: null, 4: 14, 5: null, 6: 16 },
    homePositions: {
      10: { x: 7, y: 50 }, 12: { x: 20, y: 50 },
      14: { x: 35, y: 30 }, 16: { x: 38, y: 50 },
    },
  }));
  assert.deepEqual(result, []);
});

test("connections support Away without requiring Home players", () => {
  const result = connections(input({
    awayAssignments: { 1: 101, 2: 102 },
    awayPositions: { 101: { x: 80, y: 20 }, 102: { x: 80, y: 80 } },
  }));
  assert.deepEqual(result.map(({ side, line, firstPlayerId, secondPlayerId }) => [side, line, firstPlayerId, secondPlayerId]), [
    ["away", "DEF", 101, 102],
  ]);
});

test("two, three, and four occupied line slots create adjacent links only", () => {
  const result = connections(input({
    homeAssignments: { 1: 11, 2: 12, 3: 13, 4: 14, 5: 15 },
    homePositions: {
      11: { x: 20, y: 70 }, 12: { x: 20, y: 10 }, 13: { x: 20, y: 40 },
      14: { x: 35, y: 30 }, 15: { x: 35, y: 70 },
    },
  }));
  assert.deepEqual(result.map(({ line, firstPlayerId, secondPlayerId }) => [line, firstPlayerId, secondPlayerId]), [
    ["DEF", 12, 13], ["DEF", 13, 11], ["MID", 14, 15],
  ]);
});

test("four players in one line create three adjacent links", () => {
  const fourDefenders = [0, 1, 2, 3].map((index) => ({ line: "DEF", x: 20, y: index * 25 }));
  const result = buildTeamConnections(
    { home: fourDefenders, away: [] },
    { home: { 0: 11, 1: 12, 2: 13, 3: 14 }, away: {} },
    {
      home: {
        11: { x: 20, y: 0 }, 12: { x: 20, y: 25 },
        13: { x: 20, y: 50 }, 14: { x: 20, y: 75 },
      },
      away: {},
    },
  );
  assert.deepEqual(result.map(({ firstPlayerId, secondPlayerId }) => [firstPlayerId, secondPlayerId]), [
    [11, 12], [12, 13], [13, 14],
  ]);
});

test("equal width coordinates use player ID as a deterministic tie-break without duplicate connections", () => {
  const lineSlots = [0, 1, 2].map(() => ({ line: "DEF", x: 20, y: 50 }));
  const positions = {
    home: {
      30: { x: 25, y: 50 },
      10: { x: 15, y: 50 },
      20: { x: 20, y: 50 },
    },
    away: {},
  };

  const firstOrder = buildTeamConnections(
    { home: lineSlots, away: [] },
    { home: { 0: 30, 1: 10, 2: 20 }, away: {} },
    positions,
  );
  const rearrangedOrder = buildTeamConnections(
    { home: lineSlots, away: [] },
    { home: { 2: 20, 0: 30, 1: 10 }, away: {} },
    positions,
  );

  assert.deepEqual(firstOrder, rearrangedOrder);
  assert.deepEqual(firstOrder.map(({ firstPlayerId, secondPlayerId }) => [firstPlayerId, secondPlayerId]), [
    [10, 20],
    [20, 30],
  ]);
  assert.equal(new Set(firstOrder.map(({ id }) => id)).size, firstOrder.length);
});

test("Away lines are built independently and never connect across teams", () => {
  const result = connections(input({
    homeAssignments: { 1: 1, 2: 2 },
    awayAssignments: { 1: 101, 2: 102 },
    homePositions: { 1: { x: 20, y: 20 }, 2: { x: 20, y: 80 } },
    awayPositions: { 101: { x: 80, y: 20 }, 102: { x: 80, y: 80 } },
  }));
  assert.deepEqual(result.map(({ side, firstPlayerId, secondPlayerId }) => [side, firstPlayerId, secondPlayerId]), [
    ["home", 1, 2], ["away", 101, 102],
  ]);
  assert.ok(result.every((connection) => (connection.firstPlayerId < 100) === (connection.secondPlayerId < 100)));
});

test("line groups remain separate and missing positions are ignored", () => {
  const result = connections(input({
    homeAssignments: { 0: 1, 1: 2, 2: 3, 4: 4, 5: 5 },
    homePositions: {
      1: { x: 7, y: 50 }, 2: { x: 20, y: 20 }, 3: { x: 20, y: 80 },
      4: { x: 35, y: 30 },
    },
  }));
  assert.deepEqual(result.map(({ line, firstPlayerId, secondPlayerId }) => [line, firstPlayerId, secondPlayerId]), [
    ["DEF", 2, 3],
  ]);
});

test("connections use current coordinates after movement and reset", () => {
  const assigned = { home: { 1: 2, 2: 3 }, away: {} };
  const moved = buildTeamConnections(
    { home: slots, away: slots },
    assigned,
    { home: { 2: { x: 25, y: 25 }, 3: { x: 30, y: 75 } }, away: {} },
  );
  const reset = buildTeamConnections(
    { home: slots, away: slots },
    assigned,
    { home: { 2: { x: 20, y: 20 }, 3: { x: 20, y: 80 } }, away: {} },
  );
  assert.deepEqual(moved[0].start, { x: 25, y: 25 });
  assert.deepEqual(moved[0].end, { x: 30, y: 75 });
  assert.deepEqual(reset[0].start, { x: 20, y: 20 });
  assert.deepEqual(reset[0].end, { x: 20, y: 80 });
});

test("reassignment changes line membership and output is deterministic", () => {
  const positions = { home: { 9: { x: 20, y: 20 }, 8: { x: 35, y: 80 }, 7: { x: 20, y: 50 } }, away: {} };
  const before = buildTeamConnections(
    { home: slots, away: slots },
    { home: { 1: 9, 2: 7 }, away: {} },
    positions,
  );
  const after = buildTeamConnections(
    { home: slots, away: slots },
    { home: { 1: 9, 4: 8, 5: 7 }, away: {} },
    positions,
  );
  assert.deepEqual(before.map((connection) => connection.line), ["DEF"]);
  assert.deepEqual(after.map((connection) => connection.line), ["MID"]);
  assert.notDeepEqual(before, after);
  assert.deepEqual(after, buildTeamConnections(
    { home: slots, away: slots },
    { home: { 5: 7, 4: 8, 1: 9 }, away: {} },
    positions,
  ));
  const unassigned = buildTeamConnections(
    { home: slots, away: slots },
    { home: { 1: 9, 2: null }, away: {} },
    positions,
  );
  assert.deepEqual(unassigned, []);
});
