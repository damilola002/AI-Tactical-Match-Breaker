import { mapPlayerRole } from "./tacticalMetrics.ts";
import { FORMATIONS } from "./formations.ts";
import type { FormationName, FormationSlot, Player } from "../types.ts";

type Assignments = Record<number, number | null>;

function roleForLine(line: FormationSlot["line"]): ReturnType<typeof mapPlayerRole> {
  if (line === "GK") return "goalkeeper";
  if (line === "DEF") return "defender";
  if (line === "MID") return "midfielder";
  return "forward";
}

function playerOrder(first: Player, second: Player): number {
  const firstName = first.name.trim().toLowerCase();
  const secondName = second.name.trim().toLowerCase();
  if (firstName < secondName) return -1;
  if (firstName > secondName) return 1;
  return first.id - second.id;
}

/** Assign a fresh formation deterministically, retaining compatible existing players first. */
export function changeFormationAssignments(
  oldFormation: FormationName,
  newFormation: FormationName,
  oldAssignments: Assignments,
  roster: Player[],
): Assignments {
  const newSlots = FORMATIONS[newFormation];
  const playersById = new Map(roster.map((player) => [player.id, player]));
  const oldEntries = Object.entries(oldAssignments)
    .map(([slot, playerId]) => [Number(slot), playerId] as const)
    .sort(([firstSlot], [secondSlot]) => firstSlot - secondSlot);
  const validOldEntries: { slot: number; player: Player }[] = [];
  const seenPlayers = new Set<number>();
  for (const [slot, playerId] of oldEntries) {
    if (playerId === null || !Number.isInteger(slot) || slot < 0 || seenPlayers.has(playerId)) continue;
    const player = playersById.get(playerId);
    if (!player || !FORMATIONS[oldFormation][slot]) continue;
    seenPlayers.add(playerId);
    validOldEntries.push({ slot, player });
  }

  // A no-op formation selection must not discard an intentional manual placement.
  if (oldFormation === newFormation) {
    const result: Assignments = Object.fromEntries(newSlots.map((_, index) => [index, null]));
    for (const { slot, player } of validOldEntries) {
      if (slot < newSlots.length && result[slot] === null) result[slot] = player.id;
    }
    return result;
  }

  const result: Assignments = Object.fromEntries(newSlots.map((_, index) => [index, null]));
  const used = new Set<number>();
  const oldBySlot = new Map(validOldEntries.map((entry) => [entry.slot, entry.player]));
  const oldGoalkeeper = oldBySlot.get(0);
  if (
    newSlots[0]?.line === "GK" &&
    oldGoalkeeper &&
    mapPlayerRole(oldGoalkeeper.position) === "goalkeeper"
  ) {
    result[0] = oldGoalkeeper.id;
    used.add(oldGoalkeeper.id);
  }

  // Keep compatible assignments in their existing slot index before moving anyone.
  for (let slot = 1; slot < newSlots.length; slot += 1) {
    const oldSlot = FORMATIONS[oldFormation][slot];
    const nextSlot = newSlots[slot];
    const player = oldBySlot.get(slot);
    if (
      player && oldSlot && oldSlot.line === nextSlot.line &&
      mapPlayerRole(player.position) === roleForLine(nextSlot.line) &&
      !used.has(player.id)
    ) {
      result[slot] = player.id;
      used.add(player.id);
    }
  }

  // Retain other compatible former assignments, preferring lower old slot then player ID.
  for (let slot = 0; slot < newSlots.length; slot += 1) {
    if (result[slot] !== null) continue;
    const lineRole = roleForLine(newSlots[slot].line);
    const candidate = validOldEntries.find(({ player }) =>
      !used.has(player.id) && mapPlayerRole(player.position) === lineRole,
    );
    if (candidate) {
      result[slot] = candidate.player.id;
      used.add(candidate.player.id);
    }
  }

  // Fill only from previously unassigned players; unknown and incompatible roles stay available.
  const previouslyAssigned = new Set(validOldEntries.map(({ player }) => player.id));
  const unassignedPlayers = roster
    .filter((player) => !previouslyAssigned.has(player.id) && !used.has(player.id))
    .sort(playerOrder);
  for (let slot = 0; slot < newSlots.length; slot += 1) {
    if (result[slot] !== null) continue;
    const lineRole = roleForLine(newSlots[slot].line);
    const candidateIndex = unassignedPlayers.findIndex((player) => mapPlayerRole(player.position) === lineRole);
    if (candidateIndex < 0) continue;
    const [player] = unassignedPlayers.splice(candidateIndex, 1);
    result[slot] = player.id;
    used.add(player.id);
  }

  return result;
}

export function initialFormationAssignments(formation: FormationName, roster: Player[]): Assignments {
  const assignments: Assignments = Object.fromEntries(FORMATIONS[formation].map((_, index) => [index, null]));
  const available = [...roster].sort(playerOrder);
  for (let slot = 0; slot < FORMATIONS[formation].length; slot += 1) {
    const lineRole = roleForLine(FORMATIONS[formation][slot].line);
    const candidateIndex = available.findIndex((player) => mapPlayerRole(player.position) === lineRole);
    if (candidateIndex < 0) continue;
    const [player] = available.splice(candidateIndex, 1);
    assignments[slot] = player.id;
  }
  return assignments;
}
