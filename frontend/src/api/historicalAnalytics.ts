import type {
  HistoricalMatch,
  HistoricalResultFilter,
  HistoricalSummary,
} from "../types";

export type HistoricalMatchesResponse = {
  data_label: string;
  count: number;
  items: HistoricalMatch[];
};

export type HistoricalAnalyticsData = {
  matches: HistoricalMatchesResponse;
  summary: HistoricalSummary;
};

export function buildHistoricalAnalyticsUrls(
  teamId: number,
  result: HistoricalResultFilter,
) {
  const query = `result=${encodeURIComponent(result)}`;
  return {
    matches: `/api/analytics/teams/${teamId}/matches?${query}`,
    summary: `/api/analytics/teams/${teamId}/summary?${query}`,
  };
}

async function getJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Historical analytics request failed (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

export async function loadHistoricalAnalytics(
  teamId: number,
  result: HistoricalResultFilter,
  fetcher: typeof fetch = fetch,
): Promise<HistoricalAnalyticsData> {
  const urls = buildHistoricalAnalyticsUrls(teamId, result);
  const [matches, summary] = await Promise.all([
    getJson<HistoricalMatchesResponse>(urls.matches, fetcher),
    getJson<HistoricalSummary>(urls.summary, fetcher),
  ]);
  return { matches, summary };
}

export function historicalViewState(
  loading: boolean,
  error: string | null,
  matches: HistoricalMatch[],
): "loading" | "error" | "empty" | "ready" {
  if (loading) return "loading";
  if (error) return "error";
  return matches.length === 0 ? "empty" : "ready";
}

export function formatHistoricalMeasurement(
  value: number | null | undefined,
  unit: string,
): string {
  if (value === null || value === undefined) return "Unavailable";
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

export function historicalOpponentLabel(match: HistoricalMatch): string {
  return match.opponent.name;
}

export function historicalOutcomeLabel(match: HistoricalMatch): string {
  return match.result ? match.result.toUpperCase() : "PENDING";
}
