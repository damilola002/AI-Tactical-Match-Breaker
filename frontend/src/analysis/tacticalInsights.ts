import { calculateOverloads, LARGE_GAP_THRESHOLD_METERS } from "./tacticalMetrics.ts";
import type { Side } from "../types.ts";
import type { TeamMetrics, ZoneOccupancy } from "./tacticalMetrics";

export const LINE_SPACING_THRESHOLD_METERS = 18;
export const ZONE_DIFFERENCE_THRESHOLD_PLAYERS = 2;

export type InsightCategory = "line_spacing" | "zone_difference" | "spatial_gap";
export type InsightSeverity = "info" | "notable";
export type LineRelationship = "defenseToMidfield" | "midfieldToForward";

export type RelatedMetric =
  | {
      key: LineRelationship;
      value: number;
      unit: "m";
      threshold: number;
    }
  | {
      key: "zoneDifference";
      value: number;
      unit: "players";
      threshold: number;
    }
  | {
      key: "spatialGapDistance";
      value: number;
      unit: "m";
      threshold: number;
    };

export type TacticalInsight = {
  id: string;
  category: InsightCategory;
  /** Presentation prominence only; it does not judge tactical quality or danger. */
  severity: InsightSeverity;
  teamSide?: Side;
  title: string;
  description: string;
  relatedMetric: RelatedMetric;
  zone?: Pick<ZoneOccupancy, "row" | "column" | "label" | "homeCount" | "awayCount">;
  /** Player names are display-only references, not stable identifiers. */
  players?: string[];
};

export type TacticalInsightsInput = {
  metrics: Partial<Record<Side, TeamMetrics>>;
  zones?: readonly ZoneOccupancy[];
  teams?: Partial<Record<Side, { name: string }>>;
};

const categoryOrder: Record<InsightCategory, number> = {
  line_spacing: 0,
  zone_difference: 1,
  spatial_gap: 2,
};

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function compareNumber(first: number, second: number): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function compareZoneRecords(first: ZoneOccupancy, second: ZoneOccupancy): number {
  return compareNumber(first.row, second.row)
    || compareNumber(first.column, second.column)
    || compareText(first.label, second.label)
    || compareNumber(first.homeCount, second.homeCount)
    || compareNumber(first.awayCount, second.awayCount)
    || compareNumber(first.homeDifference, second.homeDifference);
}

function teamLabel(side: Side, input: TacticalInsightsInput): string {
  const name = input.teams?.[side]?.name;
  return name?.trim() || (side === "home" ? "Home" : "Away");
}

function addLineInsights(insights: TacticalInsight[], input: TacticalInsightsInput): void {
  const relations: { key: LineRelationship; label: string }[] = [
    { key: "defenseToMidfield", label: "defensive-to-midfield" },
    { key: "midfieldToForward", label: "midfield-to-forward" },
  ];

  for (const side of ["home", "away"] as const) {
    const metrics = input.metrics[side];
    if (!metrics) continue;
    for (const relation of relations) {
      const value = metrics.lineSpacingMeters?.[relation.key];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= LINE_SPACING_THRESHOLD_METERS) continue;
      insights.push({
        id: `line_spacing:${side}:${relation.key}`,
        category: "line_spacing",
        severity: "notable",
        teamSide: side,
        title: `${relation.label[0].toUpperCase()}${relation.label.slice(1)} separation`,
        description: `${teamLabel(side, input)} ${relation.label} separation is ${value.toFixed(1)}m.`,
        relatedMetric: {
          key: relation.key,
          value,
          unit: "m",
          threshold: LINE_SPACING_THRESHOLD_METERS,
        },
      });
    }
  }
}

function addZoneInsights(insights: TacticalInsight[], input: TacticalInsightsInput): void {
  if (!input.zones) return;
  const zonesByKey = new Map<string, ZoneOccupancy[]>();
  for (const zone of input.zones) {
    const key = `${zone.row}:${zone.column}`;
    const duplicates = zonesByKey.get(key);
    if (duplicates) duplicates.push(zone);
    else zonesByKey.set(key, [zone]);
  }
  const normalizedZones = [...zonesByKey.values()].map((duplicates) =>
    duplicates.length === 1 ? duplicates[0] : [...duplicates].sort(compareZoneRecords)[0],
  );
  for (const zone of calculateOverloads(normalizedZones)) {
    if (Math.abs(zone.homeDifference) < ZONE_DIFFERENCE_THRESHOLD_PLAYERS) continue;
    const advantageSide: Side = zone.homeDifference > 0 ? "home" : "away";
    const advantageCount = advantageSide === "home" ? zone.homeCount : zone.awayCount;
    const otherCount = advantageSide === "home" ? zone.awayCount : zone.homeCount;
    const advantageName = teamLabel(advantageSide, input);
    insights.push({
      id: `zone_difference:${zone.row}:${zone.column}`,
      category: "zone_difference",
      severity: "notable",
      teamSide: advantageSide,
      title: `Numerical difference · ${zone.label}`,
      description: `${advantageName} has a ${advantageCount}–${otherCount} numerical advantage in ${zone.label}.`,
      relatedMetric: {
        key: "zoneDifference",
        value: Math.abs(zone.homeDifference),
        unit: "players",
        threshold: ZONE_DIFFERENCE_THRESHOLD_PLAYERS,
      },
      zone: {
        row: zone.row,
        column: zone.column,
        label: zone.label,
        homeCount: zone.homeCount,
        awayCount: zone.awayCount,
      },
    });
  }
}

function addSpatialGapInsights(insights: TacticalInsight[], input: TacticalInsightsInput): void {
  for (const side of ["home", "away"] as const) {
    const gaps = input.metrics[side]?.spatialGaps ?? [];
    const canonicalGaps = gaps
      .filter((gap) => Number.isFinite(gap.distanceMeters) && gap.distanceMeters > LARGE_GAP_THRESHOLD_METERS)
      .map((gap) => {
        const players = [gap.firstPlayer, gap.secondPlayer].sort(compareText);
        const recordKey = JSON.stringify([players[0], players[1], gap.distanceMeters]);
        return { gap, players, recordKey };
      })
      .sort((first, second) =>
        compareText(first.players[0], second.players[0])
          || compareText(first.players[1], second.players[1])
          || compareNumber(first.gap.distanceMeters, second.gap.distanceMeters),
      );
    const seenRecords = new Set<string>();
    for (const { gap, players, recordKey } of canonicalGaps) {
      if (seenRecords.has(recordKey)) continue;
      seenRecords.add(recordKey);
      const [firstPlayer, secondPlayer] = players;
      insights.push({
        id: `spatial_gap:${side}:${encodeURIComponent(recordKey)}`,
        category: "spatial_gap",
        severity: "notable",
        teamSide: side,
        title: "Nearest-player spatial gap",
        description: `${teamLabel(side, input)} spatial gap: ${firstPlayer} ↔ ${secondPlayer} — ${gap.distanceMeters.toFixed(1)}m.`,
        relatedMetric: {
          key: "spatialGapDistance",
          value: gap.distanceMeters,
          unit: "m",
          threshold: LARGE_GAP_THRESHOLD_METERS,
        },
        players,
      });
    }
  }
}

/** Convert Phase 4 measurements into deterministic, observational insights. */
export function calculateTacticalInsights(input: TacticalInsightsInput): TacticalInsight[] {
  const insights: TacticalInsight[] = [];
  addLineInsights(insights, input);
  addZoneInsights(insights, input);
  addSpatialGapInsights(insights, input);

  return insights.sort((first, second) =>
    categoryOrder[first.category] - categoryOrder[second.category]
      || (first.teamSide === second.teamSide ? 0 : first.teamSide === "home" ? -1 : 1)
      || compareText(first.id, second.id),
  );
}
