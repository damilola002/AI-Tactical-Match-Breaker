import { mapPlayerRole } from "./tacticalMetrics.ts";
import type { PitchPosition, Side } from "../types.ts";

export type PitchPositionBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type ConstrainPlayerPositionInput = {
  side: Side;
  role: string | null | undefined;
  position: PitchPosition | null | undefined;
  positionLock: boolean;
  bounds: PitchPositionBounds;
};

export const NORMALIZED_PITCH_BOUNDS: PitchPositionBounds = {
  minX: 0,
  maxX: 100,
  minY: 0,
  maxY: 100,
};

export const PITCH_MARKING_INSET_PERCENT = 2.6;

const ROLE_PROGRESS_BOUNDS = {
  goalkeeper: [0, 16],
  defender: [0, 35],
  midfielder: [28, 72],
  forward: [38, 100],
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Calculate the same responsive token-center inset used by the draggable pitch. */
export function getPitchDragBounds(width: number, height: number): PitchPositionBounds {
  const tokenHalfSize = 16;
  const minX = PITCH_MARKING_INSET_PERCENT + (tokenHalfSize / width) * 100;
  const minY = PITCH_MARKING_INSET_PERCENT + (tokenHalfSize / height) * 100;
  return { minX, maxX: 100 - minX, minY, maxY: 100 - minY };
}

/** Clamp a requested percentage coordinate to pitch bounds and, optionally, the player's role zone. */
export function constrainPlayerPosition(input: ConstrainPlayerPositionInput): PitchPosition | null {
  const { position, side, role, positionLock, bounds } = input;
  if (!position) return null;

  const x = clamp(position.x, bounds.minX, bounds.maxX);
  const y = clamp(position.y, bounds.minY, bounds.maxY);
  if (!positionLock) return { x, y };

  const playerRole = mapPlayerRole(role);
  if (!playerRole) return { x, y };

  const [minimumProgress, maximumProgress] = ROLE_PROGRESS_BOUNDS[playerRole];
  const roleMinimumX = side === "home" ? minimumProgress : 100 - maximumProgress;
  const roleMaximumX = side === "home" ? maximumProgress : 100 - minimumProgress;
  const minimumX = Math.max(bounds.minX, roleMinimumX);
  const maximumX = Math.min(bounds.maxX, roleMaximumX);

  // All supported roles intersect the pitch bounds; retain ordinary pitch clamping if given invalid bounds.
  if (minimumX > maximumX) return { x, y };
  return { x: clamp(x, minimumX, maximumX), y };
}
