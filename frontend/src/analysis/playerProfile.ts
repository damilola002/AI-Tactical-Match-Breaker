import type { HistoricalMatch } from "../types.ts";

export type PlayerMetricAggregate = {
  total: number | null;
  averagePerMeasuredAppearance: number | null;
  sampleCount: number;
};

export type PlayerPerformanceSummary = {
  distance: PlayerMetricAggregate;
  sprints: PlayerMetricAggregate;
};

export function summarizePlayerMeasurements(
  playerId: number,
  teamId: number,
  matches: HistoricalMatch[],
): PlayerPerformanceSummary {
  const distances: number[] = [];
  const sprints: number[] = [];
  for (const match of matches) {
    if (match.result === null) continue;
    for (const player of match.players) {
      if (player.player_id !== playerId || player.team_id !== teamId) continue;
      if (player.distance_covered_meters !== null) distances.push(player.distance_covered_meters);
      if (player.sprint_count !== null) sprints.push(player.sprint_count);
    }
  }
  const aggregate = (values: number[]): PlayerMetricAggregate => ({
    total: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
    averagePerMeasuredAppearance: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    sampleCount: values.length,
  });
  return { distance: aggregate(distances), sprints: aggregate(sprints) };
}
