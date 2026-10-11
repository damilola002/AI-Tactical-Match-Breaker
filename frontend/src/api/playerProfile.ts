import type { HistoricalMatch, Player } from "../types.ts";

export type PlayerReadResponse = { data_label: string; item: Player };
export type PlayersReadResponse = { data_label: string; items: Player[]; count: number };
export type PlayerMatchHistoryResponse = { data_label: string; items: HistoricalMatch[]; count: number };

async function getJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Player profile request failed (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

export function loadPlayer(playerId: number, fetcher: typeof fetch = fetch) {
  return getJson<PlayerReadResponse>(`/api/players/${playerId}`, fetcher);
}

export function loadPlayers(fetcher: typeof fetch = fetch) {
  return getJson<PlayersReadResponse>("/api/players", fetcher);
}

export function loadPlayerMatchHistory(teamId: number, fetcher: typeof fetch = fetch) {
  return getJson<PlayerMatchHistoryResponse>(`/api/analytics/teams/${teamId}/matches?result=all`, fetcher);
}
