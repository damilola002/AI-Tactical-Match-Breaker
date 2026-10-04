import type { PitchPosition, Player, Side } from "../types.ts";

/**
 * Tactical calculations use a fixed 105 m × 68 m pitch, independent of the
 * browser's rendered pitch size. Existing board coordinates remain screen
 * percentages: x is left-to-right pitch length and y is top-to-bottom pitch
 * width. Distances scale each axis separately into metres before comparison.
 */
export const PITCH_LENGTH_METERS = 105;
export const PITCH_WIDTH_METERS = 68;
export const LARGE_GAP_THRESHOLD_METERS = 25;
const ZONE_COUNT = 3;

export type PlayerRole = "goalkeeper" | "defender" | "midfielder" | "forward";
export type TacticalLine = "defense" | "midfield" | "forward";

export type TacticalPlayer = {
  player: Pick<Player, "id" | "name" | "position">;
  position: PitchPosition;
};

export type TeamAnalysisInput = {
  side: Side;
  players: readonly Player[];
  positions: Readonly<Record<number, PitchPosition>>;
};

export type LineMetric = {
  averageDepthMeters: number;
  playerCount: number;
};

export type SpatialGap = {
  firstPlayer: string;
  secondPlayer: string;
  distanceMeters: number;
};

export type TeamMetrics = {
  side: Side;
  placedPlayerCount: number;
  averagePosition: PitchPosition | null;
  widthMeters: number | null;
  lines: Record<TacticalLine, LineMetric | null>;
  lineSpacingMeters: {
    defenseToMidfield: number | null;
    midfieldToForward: number | null;
  };
  spatialGaps: SpatialGap[];
};

export type ZoneOccupancy = {
  row: number;
  column: number;
  label: string;
  homeCount: number;
  awayCount: number;
  homeDifference: number;
};

export function mapPlayerRole(position: string | null | undefined): PlayerRole | null {
  if (typeof position !== "string") return null;
  const normalized = position.trim().toLowerCase().replace(/[._-]+/g, " ");
  if (["gk", "keeper", "goalkeeper", "goal keeper"].includes(normalized)) return "goalkeeper";
  if (["def", "defender", "defence", "defense", "centre back", "center back", "cb", "lb", "rb", "lwb", "rwb"]
    .includes(normalized)) return "defender";
  if (["mid", "midfielder", "midfield", "cm", "cdm", "cam", "lm", "rm", "dm", "am"]
    .includes(normalized)) return "midfielder";
  if (["fwd", "forward", "striker", "attacker", "winger", "st", "cf", "lw", "rw"]
    .includes(normalized)) return "forward";
  return null;
}

export function toTacticalCoordinate(position: PitchPosition): { lengthMeters: number; widthMeters: number } {
  return {
    lengthMeters: (position.x / 100) * PITCH_LENGTH_METERS,
    widthMeters: (position.y / 100) * PITCH_WIDTH_METERS,
  };
}

/** Attack progress is 0 at a team's own end and 100 at the opponent's end. */
export function attackRelativeProgress(xPercent: number, side: Side): number {
  return side === "home" ? xPercent : 100 - xPercent;
}

export function distanceMeters(first: PitchPosition, second: PitchPosition): number {
  const a = toTacticalCoordinate(first);
  const b = toTacticalCoordinate(second);
  return Math.hypot(a.lengthMeters - b.lengthMeters, a.widthMeters - b.widthMeters);
}

function placedPlayers(input: TeamAnalysisInput): TacticalPlayer[] {
  return input.players.flatMap((player) => {
    const position = input.positions[player.id];
    return position ? [{ player, position }] : [];
  });
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function lineMetric(players: readonly TacticalPlayer[], side: Side, role: PlayerRole): LineMetric | null {
  const members = players.filter((item) => mapPlayerRole(item.player.position) === role);
  const meanProgress = mean(members.map(({ position }) => attackRelativeProgress(position.x, side)));
  if (meanProgress === null) return null;
  return {
    averageDepthMeters: (meanProgress / 100) * PITCH_LENGTH_METERS,
    playerCount: members.length,
  };
}

function findSpatialGaps(players: readonly TacticalPlayer[]): SpatialGap[] {
  if (players.length < 2) return [];
  const gaps = new Map<string, SpatialGap>();
  for (const player of players) {
    let nearest: TacticalPlayer | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of players) {
      if (candidate.player.id === player.player.id) continue;
      const distance = distanceMeters(player.position, candidate.position);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance > LARGE_GAP_THRESHOLD_METERS) {
      const pair = [player, nearest].sort((a, b) => a.player.id - b.player.id);
      const key = `${pair[0].player.id}:${pair[1].player.id}`;
      gaps.set(key, {
        firstPlayer: pair[0].player.name,
        secondPlayer: pair[1].player.name,
        distanceMeters: nearestDistance,
      });
    }
  }
  return [...gaps.values()].sort((a, b) => b.distanceMeters - a.distanceMeters);
}

export function calculateTeamMetrics(input: TeamAnalysisInput): TeamMetrics {
  const placed = placedPlayers(input);
  const averageX = mean(placed.map(({ position }) => position.x));
  const averageY = mean(placed.map(({ position }) => position.y));
  const widthCoordinates = placed.map(({ position }) => position.y);
  const widthMeters = widthCoordinates.length
    ? ((Math.max(...widthCoordinates) - Math.min(...widthCoordinates)) / 100) * PITCH_WIDTH_METERS
    : null;
  const lines: TeamMetrics["lines"] = {
    defense: lineMetric(placed, input.side, "defender"),
    midfield: lineMetric(placed, input.side, "midfielder"),
    forward: lineMetric(placed, input.side, "forward"),
  };
  const spacing = (first: LineMetric | null, second: LineMetric | null) =>
    first && second ? Math.abs(first.averageDepthMeters - second.averageDepthMeters) : null;

  return {
    side: input.side,
    placedPlayerCount: placed.length,
    averagePosition: averageX === null || averageY === null ? null : { x: averageX, y: averageY },
    widthMeters,
    lines,
    lineSpacingMeters: {
      defenseToMidfield: spacing(lines.defense, lines.midfield),
      midfieldToForward: spacing(lines.midfield, lines.forward),
    },
    spatialGaps: findSpatialGaps(placed),
  };
}

function zoneIndex(percent: number): number {
  return Math.min(ZONE_COUNT - 1, Math.max(0, Math.floor((percent / 100) * ZONE_COUNT)));
}

/** Zones use shared screen-space coordinates so both teams occupy the same physical grid. */
export function calculateZoneOccupancy(
  home: TeamAnalysisInput,
  away: TeamAnalysisInput,
): ZoneOccupancy[] {
  const counts = Array.from({ length: ZONE_COUNT }, () => Array.from(
    { length: ZONE_COUNT }, () => ({ homeCount: 0, awayCount: 0 }),
  ));
  for (const { position } of placedPlayers(home)) counts[zoneIndex(position.y)][zoneIndex(position.x)].homeCount += 1;
  for (const { position } of placedPlayers(away)) counts[zoneIndex(position.y)][zoneIndex(position.x)].awayCount += 1;

  return counts.flatMap((row, rowIndex) => row.map((zone, columnIndex) => ({
    row: rowIndex,
    column: columnIndex,
    label: `${["Top", "Middle", "Bottom"][rowIndex]} · ${["Left", "Center", "Right"][columnIndex]}`,
    homeCount: zone.homeCount,
    awayCount: zone.awayCount,
    homeDifference: zone.homeCount - zone.awayCount,
  })));
}

/** Positive difference means more Home players; negative means more Away players. */
export function calculateOverloads(zones: readonly ZoneOccupancy[]): ZoneOccupancy[] {
  return zones.filter((zone) => zone.homeDifference !== 0);
}
