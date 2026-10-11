import assert from "node:assert/strict";
import test from "node:test";
import { changeFormationAssignments, initialFormationAssignments } from "./formationAssignments.ts";
import { FORMATIONS } from "./formations.ts";

function roster(entries) {
  return entries.map(([id, position, name = `Player ${id}`]) => ({
    id, name, position, team: { id: 1, name: "Demo FC" }, availability: { player_id: id, status: "active", updated_at: "2026-01-01" },
  }));
}

const fullRoster = () => roster([
  [1, "Goalkeeper", "Zed Keeper"], [2, "Defender", "Defender B"], [3, "Defender", "Defender C"],
  [4, "Defender", "Defender D"], [5, "Defender", "Defender E"], [6, "Midfielder", "Mid A"],
  [7, "Midfielder", "Mid B"], [8, "Midfielder", "Mid C"], [9, "Forward", "Forward A"],
  [10, "Forward", "Forward B"], [11, "Forward", "Forward C"], [12, "Midfielder", "Mid D"],
]);

test("formation changes preserve goalkeeper and compatible same-slot players before filling", () => {
  const players = fullRoster();
  const old = initialFormationAssignments("4-3-3", players);
  const changed = changeFormationAssignments("4-3-3", "4-4-2", old, players);
  assert.equal(changed[0], old[0], "compatible goalkeeper remains assigned");
  for (let slot = 1; slot <= 7; slot += 1) assert.equal(changed[slot], old[slot], `same-role slot ${slot} remains assigned`);
  assert.deepEqual(Object.values(changed).filter((id) => id !== null).length, 11);
  assert.equal(new Set(Object.values(changed).filter((id) => id !== null)).size, 11);
  assert.equal(FORMATIONS["4-4-2"].length, 11);
});

test("formation-preserving tie breaks keep lower old slots and then player ID", () => {
  const players = roster([
    [90, "Goalkeeper"], [31, "Defender"], [12, "Defender"], [44, "Defender"], [7, "Defender"],
    [20, "Midfielder"], [21, "Midfielder"], [22, "Midfielder"], [23, "Midfielder"], [24, "Midfielder"],
    [50, "Forward"], [51, "Forward"],
  ]);
  const old = { 0: 90, 1: 31, 2: 12, 3: 44, 4: 7, 5: 20, 6: 21, 7: 22, 8: 50, 9: 51 };
  const changed = changeFormationAssignments("4-4-2", "3-5-2", old, players);
  assert.equal(changed[0], 90);
  assert.deepEqual([changed[1], changed[2], changed[3]], [31, 12, 44]);
  assert.deepEqual([changed[4], changed[5], changed[6], changed[7], changed[8]], [23, 20, 21, 22, 24]);
  assert.equal(new Set(Object.values(changed).filter((id) => id !== null)).size, Object.values(changed).filter((id) => id !== null).length);
});

test("role aliases use shared normalization and unknown or incomplete players remain unassigned", () => {
  const players = roster([[1, "Keeper"], [2, "CB"], [3, "CM"], [4, "ST"], [5, "Mystery Role"], [6, "Forward"]]);
  const initial = initialFormationAssignments("4-4-2", players);
  assert.equal(initial[0], 1);
  assert.equal(initial[1], 2);
  assert.equal(initial[5], 3);
  assert.equal(initial[9], 4);
  assert.equal(Object.values(initial).filter((id) => id !== null).length, 5);
  const changed = changeFormationAssignments("4-4-2", "3-5-2", { ...initial, 8: 5 }, players);
  assert.equal(Object.values(changed).includes(5), false, "unknown role is left in the roster");
  assert.equal(new Set(Object.values(changed).filter((id) => id !== null)).size, Object.values(changed).filter((id) => id !== null).length);
});

test("manual out-of-position assignment survives a no-op selection but not an incompatible new formation", () => {
  const players = roster([[1, "Goalkeeper"], [2, "Forward"], [3, "Defender"]]);
  const manual = { 0: 1, 1: 2, 2: 3 };
  assert.deepEqual(changeFormationAssignments("4-3-3", "4-3-3", manual, players), { ...manual, ...Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 3, null])) });
  const changed = changeFormationAssignments("4-3-3", "4-4-2", manual, players);
  assert.equal(Object.values(changed).includes(2), true, "player is retained in a compatible forward slot");
  assert.equal(Object.values(changed).includes(3), true, "defender remains available to a compatible slot");
});
