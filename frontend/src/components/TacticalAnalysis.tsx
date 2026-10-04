import type { TeamMetrics, ZoneOccupancy } from "../analysis/tacticalMetrics.ts";
import type { Team } from "../types.ts";

type Props = {
  teams: Record<"home" | "away", Team>;
  metrics: Record<"home" | "away", TeamMetrics>;
  zones: ZoneOccupancy[];
};

const lineLabels = [
  ["defense", "Defensive line"],
  ["midfield", "Midfield line"],
  ["forward", "Forward line"],
] as const;

function meters(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} m`;
}

function TeamMetricsCard({ name, metrics }: { name: string; metrics: TeamMetrics }) {
  return (
    <article className="analysis-team-card">
      <header className="analysis-team-heading">
        <h3>{name}</h3>
        <span>{metrics.placedPlayerCount} placed</span>
      </header>
      <dl className="analysis-metric-list">
        <div><dt>Average position</dt><dd>{metrics.averagePosition
          ? `${metrics.averagePosition.x.toFixed(1)}% length · ${metrics.averagePosition.y.toFixed(1)}% width`
          : "—"}</dd></div>
        <div><dt>Team width</dt><dd>{meters(metrics.widthMeters)}</dd></div>
        {lineLabels.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{meters(metrics.lines[key]?.averageDepthMeters ?? null)}
              {metrics.lines[key] ? <small> · {metrics.lines[key].playerCount} players</small> : null}
            </dd>
          </div>
        ))}
        <div><dt>Defense ↔ midfield</dt><dd>{meters(metrics.lineSpacingMeters.defenseToMidfield)}</dd></div>
        <div><dt>Midfield ↔ forward</dt><dd>{meters(metrics.lineSpacingMeters.midfieldToForward)}</dd></div>
      </dl>
      <div className="analysis-gaps">
        <h4>Large nearest-player gaps <small>over 25 m</small></h4>
        {metrics.spatialGaps.length ? (
          <ul>{metrics.spatialGaps.map((gap) => (
            <li key={`${gap.firstPlayer}-${gap.secondPlayer}`}>
              {gap.firstPlayer} ↔ {gap.secondPlayer}<strong>{gap.distanceMeters.toFixed(1)} m</strong>
            </li>
          ))}</ul>
        ) : <p>No nearest-player links exceed 25 m.</p>}
      </div>
    </article>
  );
}

export default function TacticalAnalysis({ teams, metrics, zones }: Props) {
  const overloads = zones.filter((zone) => zone.homeDifference !== 0);
  return (
    <section className="analysis-panel" aria-labelledby="analysis-title">
      <div className="analysis-panel-heading">
        <div>
          <span className="pitch-kicker">LIVE CALCULATIONS · CURRENT PLACEMENTS</span>
          <h2 id="analysis-title">Tactical analysis</h2>
          <p>Objective position metrics from the players currently placed on the board.</p>
        </div>
        <span className="analysis-scale">Pitch scale: 105 m × 68 m</span>
      </div>
      <div className="analysis-team-grid">
        <TeamMetricsCard name={teams.home.name} metrics={metrics.home} />
        <TeamMetricsCard name={teams.away.name} metrics={metrics.away} />
      </div>
      <div className="analysis-spatial-grid">
        <section className="zone-section" aria-label="3 by 3 zone occupancy">
          <div className="analysis-subheading">
            <h3>Zone occupancy</h3>
            <span>Shared screen-space grid · left → right, top → bottom</span>
          </div>
          <div className="zone-grid">
            {zones.map((zone) => (
              <div className="zone-cell" key={`${zone.row}-${zone.column}`}>
                <span>{zone.label}</span>
                <strong><i className="zone-home-dot" /> {zone.homeCount}
                  <b> · </b><i className="zone-away-dot" /> {zone.awayCount}
                </strong>
                <small>{zone.homeDifference > 0 ? `Home +${zone.homeDifference}`
                  : zone.homeDifference < 0 ? `Away +${Math.abs(zone.homeDifference)}` : "Even"}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="overload-section" aria-label="Numerical differences by zone">
          <div className="analysis-subheading">
            <h3>Numerical differences</h3>
            <span>Counts only; no positive or negative judgment</span>
          </div>
          {overloads.length ? (
            <ul>{overloads.map((zone) => (
              <li key={`${zone.row}-${zone.column}`}>
                <span>{zone.label}</span>
                <strong>Home {zone.homeCount} · Away {zone.awayCount} · Δ {zone.homeDifference > 0 ? "+" : ""}{zone.homeDifference}</strong>
              </li>
            ))}</ul>
          ) : <p>Every occupied zone has equal counts.</p>}
        </section>
      </div>
      <p className="analysis-footnote">
        Line depth is measured from each team’s own end toward attack. Zones use shared screen coordinates.
        Unknown player positions are included in spatial metrics but omitted from line metrics.
      </p>
    </section>
  );
}
