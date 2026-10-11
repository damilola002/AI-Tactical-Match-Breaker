import { formatHistoricalMeasurement } from "../api/historicalAnalytics.ts";
import type { Player, HistoricalMatch } from "../types.ts";
import type { PlayerPerformanceSummary } from "../analysis/playerProfile.ts";

function metric(value: number | null, unit: string) {
  return formatHistoricalMeasurement(value, unit);
}

export default function PlayerProfileCard({ player, matches, summary, dataLabel }: {
  player: Player;
  matches: HistoricalMatch[];
  summary: PlayerPerformanceSummary;
  dataLabel: string;
}) {
  const status = player.availability?.status ?? "active";
  return (
    <article className="player-profile-card">
      <header className="player-profile-card-header">
        <div className="player-monogram" aria-hidden="true">{player.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</div>
        <div><p className="pitch-kicker">{dataLabel}</p><h2>{player.name}</h2><p>{player.team.name}</p></div>
        <span className={`profile-availability status-${status}`}>{status}</span>
      </header>
      <div className="player-profile-identity"><span><small>POSITION</small><strong>{player.position}</strong></span><span><small>TEAM</small><strong>{player.team.name}</strong></span><span><small>AVAILABILITY</small><strong>{status}</strong></span></div>
      <section className="player-profile-aggregates"><h3>Measured historical averages</h3><p>Averages use completed matches with recorded values; the sample count is shown separately for each metric.</p>
        <div className="profile-metric-grid">
          <Metric label="Average distance" aggregate={summary.distance} unit="m" />
          <Metric label="Average sprints" aggregate={summary.sprints} unit="sprints" />
        </div>
      </section>
      <section className="player-profile-matches"><h3>Individual match measurements</h3>
        {!matches.length ? <p>No match measurements are available.</p> : <div className="profile-match-list">{matches.map((match) => {
          const value = match.players.find((item) => item.player_id === player.id && item.team_id === player.team.id);
          if (!value) return null;
          return <article className="profile-match-row" key={match.id}>
            <div><strong>{match.selected_team.name} vs {match.opponent.name}</strong><small>{new Date(match.kickoff_at).toLocaleDateString()} · {match.result?.toUpperCase() ?? "PENDING"}</small></div>
            <span><small>DISTANCE</small><b>{metric(value.distance_covered_meters, "m")}</b></span>
            <span><small>SPRINTS</small><b>{metric(value.sprint_count, "sprints")}</b></span>
          </article>;
        })}</div>}
      </section>
      <p className="profile-data-note">Only stored demo measurements are shown. No pace, speed, or game rating is estimated.</p>
    </article>
  );
}

function Metric({ label, aggregate, unit }: {
  label: string;
  aggregate: PlayerPerformanceSummary["distance"];
  unit: string;
}) {
  return <div className="profile-metric"><span>{label}</span><strong>{metric(aggregate.averagePerMeasuredAppearance, unit)}</strong><small>{aggregate.sampleCount} measured appearances</small></div>;
}
