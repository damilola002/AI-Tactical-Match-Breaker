import { useEffect, useState } from "react";
import {
  formatHistoricalMeasurement,
  historicalViewState,
  historicalOpponentLabel,
  historicalOutcomeLabel,
  loadHistoricalAnalytics,
  type HistoricalAnalyticsData,
} from "../api/historicalAnalytics";
import type { HistoricalMatch, HistoricalResultFilter, Team } from "../types";

const resultFilters: { value: HistoricalResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "win", label: "Wins" },
  { value: "draw", label: "Draws" },
  { value: "loss", label: "Losses" },
];

function measurement(value: number | null, unit: string) {
  return formatHistoricalMeasurement(value, unit);
}

function MatchCard({ match }: { match: HistoricalMatch }) {
  const comparison = match.physical_comparison;
  const resultLabel = historicalOutcomeLabel(match);
  const hasAnyMeasurement = match.players.some(
    (player) => player.distance_covered_meters !== null || player.sprint_count !== null,
  );

  return (
    <article className="history-match-card">
      <div className="history-match-heading">
        <div>
          <p className="history-match-date">
            {new Date(match.kickoff_at).toLocaleDateString(undefined, {
              year: "numeric", month: "short", day: "numeric",
            })} <span>· {match.venue_context.toUpperCase()}</span>
          </p>
          <h3>{match.selected_team.name} <span>vs</span> {historicalOpponentLabel(match)}</h3>
        </div>
        <div className={`history-result history-result--${match.result ?? "pending"}`}>
          <span>{resultLabel}</span>
          <strong>{match.goals_for === null ? "—" : `${match.goals_for}–${match.goals_against}`}</strong>
        </div>
      </div>

      {comparison ? (
        <div className="history-stat-grid">
          {(["distance", "sprints"] as const).map((key) => {
            const isDistance = key === "distance";
            const unit = isDistance ? "m" : "sprints";
            const label = isDistance ? "Distance covered" : "Sprint count";
            const selected = comparison.selected_team[key];
            const opponent = comparison.opponent[key];
            const delta = isDistance
              ? comparison.selected_minus_opponent.distance_total
              : comparison.selected_minus_opponent.sprint_total;
            return (
              <section className="history-stat-card" key={key}>
                <h4>{label}</h4>
                <div className="history-stat-sides">
                  <p><span>{match.selected_team.name}</span><strong>{measurement(selected.total, unit)}</strong><small>{selected.measured_player_count} measured · mean {measurement(selected.mean_per_measured_player, unit)}</small></p>
                  <p><span>{match.opponent.name}</span><strong>{measurement(opponent.total, unit)}</strong><small>{opponent.measured_player_count} measured · mean {measurement(opponent.mean_per_measured_player, unit)}</small></p>
                </div>
                <div className="history-delta"><span>Selected team − opponent</span><strong>{measurement(delta, unit)}</strong></div>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="history-no-measurements">Pending match: result and match-level physical comparison are not available yet.</p>
      )}

      {!hasAnyMeasurement && match.result && (
        <p className="history-no-measurements">No physical measurements are available for this match.</p>
      )}
      {match.players.length > 0 && (
        <details className="history-player-details">
          <summary>Player measurements ({match.players.length})</summary>
          <div className="history-player-table" role="table" aria-label={`Player measurements for ${match.opponent.name}`}>
            <div className="history-player-row history-player-row--head" role="row">
              <span role="columnheader">Player</span><span role="columnheader">Distance</span><span role="columnheader">Sprints</span>
            </div>
            {match.players.map((player) => (
              <div className="history-player-row" role="row" key={player.player_id}>
                <span role="cell">{player.player_name}</span>
                <span role="cell">{measurement(player.distance_covered_meters, "m")}</span>
                <span role="cell">{measurement(player.sprint_count, "sprints")}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

export default function HistoricalAnalytics({ team }: { team: Team }) {
  const [result, setResult] = useState<HistoricalResultFilter>("all");
  const [data, setData] = useState<HistoricalAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadHistoricalAnalytics(team.id, result)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Could not load historical analytics.");
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [team.id, result]);

  const state = historicalViewState(loading, error, data?.matches.items ?? []);
  const summary = data?.summary;

  return (
    <section className="historical-panel" aria-labelledby="historical-title">
      <header className="historical-heading">
        <div>
          <p className="pitch-kicker">HISTORICAL MATCH DATA</p>
          <h2 id="historical-title">Results & physical output</h2>
          <p>Stored fictional match measurements for <strong>{team.name}</strong>. These figures are separate from the live tactical board.</p>
        </div>
        <span className="history-data-label">{data?.matches.data_label ?? "DEMO DATA"}</span>
      </header>

      <div className="history-controls">
        <span>Filter results</span>
        <div className="history-filter-group" role="group" aria-label="Filter historical results">
          {resultFilters.map((filter) => (
            <button
              type="button"
              key={filter.value}
              aria-pressed={result === filter.value}
              onClick={() => setResult(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {state === "loading" && <p className="history-state" role="status">Loading historical matches…</p>}
      {state === "error" && <p className="history-state history-state--error" role="alert">{error}</p>}
      {state === "empty" && <p className="history-state">No historical matches in this result group.</p>}

      {state === "ready" && summary && (
        <>
          <div className="history-summary">
            <div className="history-summary-count"><strong>{summary.match_count}</strong><span>completed matches</span></div>
            <div className="history-results-counts">
              <span><b>{summary.results.wins}</b> Wins</span>
              <span><b>{summary.results.draws}</b> Draws</span>
              <span><b>{summary.results.losses}</b> Losses</span>
            </div>
            <div className="history-coverage">
              <span>Measurement coverage</span>
              {(["distance", "sprints"] as const).map((key) => {
                const coverage = summary.measurement_coverage[key];
                return (
                  <p key={key}><b>{key === "distance" ? "Distance" : "Sprints"}</b>
                    <strong>{coverage.selected_team.percentage === null ? "Unavailable" : `${coverage.selected_team.percentage.toFixed(0)}%`}</strong>
                    <small>{team.name}: {coverage.selected_team.measured_player_appearances}/{coverage.selected_team.player_appearances} · opponent: {coverage.opponent.percentage === null ? "Unavailable" : `${coverage.opponent.percentage.toFixed(0)}%`} ({coverage.opponent.measured_player_appearances}/{coverage.opponent.player_appearances})</small>
                  </p>
                );
              })}
            </div>
          </div>

          <div className="history-summary-averages">
            {(["distance", "sprints"] as const).map((key) => {
              const item = summary.physical_averages[key];
              const unit = key === "distance" ? "m" : "sprints";
              return (
                <div key={key}>
                  <span>Average {key === "distance" ? "distance" : "sprints"} per completed match</span>
                  <strong>{measurement(item.selected_team_average_total, unit)}</strong>
                  <small>{team.name} · mean of available match totals</small>
                  <b>Δ {measurement(item.selected_minus_opponent_average_delta, unit)}</b>
                </div>
              );
            })}
          </div>

          <div className="history-match-list">
            {data?.matches.items.map((match) => <MatchCard key={match.id} match={match} />)}
          </div>
        </>
      )}
    </section>
  );
}
