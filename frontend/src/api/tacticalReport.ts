import type { FormationName, PitchPosition, PlayerPositions, Side, Team } from "../types";

export type ReportRequestPlayer = {
  player_id: number;
  side: Side;
  formation_slot: number;
  position: PitchPosition;
};

export type TacticalReportRequest = {
  home_team_id: number;
  away_team_id: number;
  formation_by_side: Record<Side, FormationName>;
  players: ReportRequestPlayer[];
};

export type TacticalReportResponse = {
  report_mode: "deterministic_mock";
  data_label: string;
  report_notice: string;
  scenario: {
    home_team: Team;
    away_team: Team;
    formation_by_side: Record<Side, FormationName>;
    placed_player_count: Record<Side, number>;
  };
  executive_summary: string;
  observations: {
    id: string;
    scope: "current_scenario" | "historical_context";
    text: string;
    evidence_ids: string[];
    confidence: "high" | "moderate" | "limited";
    claim: { claim_type: string; evidence_id: string; [key: string]: unknown };
  }[];
  recommendations: {
    id: string;
    text: string;
    evidence_ids: string[];
    limitations: string[];
    claim: { claim_type: string; evidence_id: string; [key: string]: unknown };
  }[];
  evidence_refs: {
    id: string;
    kind: "scenario_metric" | "scenario_insight" | "historical_match" | "historical_measurement";
    label: string;
    source_key: string;
    side?: Side | null;
    team_id?: number | null;
    match_id?: number | null;
    player_id?: number | null;
    player_ids: number[];
    value?: unknown;
  }[];
  relevant_player_ids: number[];
  historical_context: Record<string, unknown>;
  limitations: string[];
};

export type ReportScenarioInput = {
  teams: Record<Side, Team>;
  formationBySide: Record<Side, FormationName>;
  squads: Record<Side, { id: number }[]>;
  assignments: Record<Side, Record<number, number | null>>;
  playerPositions: PlayerPositions;
};

/** Keep squad order because the board uses it to resolve exact nearest-player ties. */
export function buildTacticalReportRequest(input: ReportScenarioInput): TacticalReportRequest {
  const players: ReportRequestPlayer[] = [];
  for (const side of ["home", "away"] as const) {
    for (const player of input.squads[side]) {
      const slot = Object.entries(input.assignments[side]).find(([, id]) => id === player.id)?.[0];
      const position = input.playerPositions[side][player.id];
      if (slot === undefined || !position) continue;
      players.push({
        player_id: player.id,
        side,
        formation_slot: Number(slot),
        position: { x: position.x, y: position.y },
      });
    }
  }
  return {
    home_team_id: input.teams.home.id,
    away_team_id: input.teams.away.id,
    formation_by_side: { ...input.formationBySide },
    players,
  };
}

export function isTacticalReportStale(reportKey: string, currentKey: string): boolean {
  return reportKey !== currentKey;
}

export async function requestTacticalReport(
  request: TacticalReportRequest,
  fetcher: typeof fetch = fetch,
): Promise<TacticalReportResponse> {
  const response = await fetcher("/api/analysis/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    let message = `Report request failed (HTTP ${response.status})`;
    try {
      const payload = await response.json() as { detail?: unknown };
      if (typeof payload.detail === "string") message = payload.detail;
    } catch {
      // Keep the status message for non-JSON error responses.
    }
    throw new Error(message);
  }
  return await response.json() as TacticalReportResponse;
}
