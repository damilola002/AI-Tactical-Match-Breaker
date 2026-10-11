import type { FormationName, FormationSlot, PitchPosition, Side } from "../types.ts";

export const FORMATIONS: Record<FormationName, FormationSlot[]> = {
  "4-3-3": [
    { line: "GK", x: 7, y: 50 },
    ...[18, 39, 61, 82].map((y) => ({ line: "DEF" as const, x: 20, y })),
    ...[27, 50, 73].map((y) => ({ line: "MID" as const, x: 35, y })),
    ...[24, 50, 76].map((y) => ({ line: "FWD" as const, x: 38, y })),
  ],
  "4-4-2": [
    { line: "GK", x: 7, y: 50 },
    ...[18, 39, 61, 82].map((y) => ({ line: "DEF" as const, x: 20, y })),
    ...[18, 39, 61, 82].map((y) => ({ line: "MID" as const, x: 35, y })),
    ...[37, 63].map((y) => ({ line: "FWD" as const, x: 38, y })),
  ],
  "3-5-2": [
    { line: "GK", x: 7, y: 50 },
    ...[24, 50, 76].map((y) => ({ line: "DEF" as const, x: 20, y })),
    ...[13, 32, 50, 68, 87].map((y) => ({ line: "MID" as const, x: 35, y })),
    ...[37, 63].map((y) => ({ line: "FWD" as const, x: 38, y })),
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS) as FormationName[];

export function formationPosition(side: Side, slot: FormationSlot): PitchPosition {
  return { x: side === "home" ? slot.x : 100 - slot.x, y: slot.y };
}

export function positionsForAssignments(
  side: Side,
  formation: FormationName,
  assignments: Record<number, number | null>,
): Record<number, PitchPosition> {
  return Object.fromEntries(
    Object.entries(assignments)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .map(([slot, playerId]) => [playerId, formationPosition(side, FORMATIONS[formation][Number(slot)])]),
  );
}
