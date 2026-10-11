import TacticalPitch, { type PitchTokenPlayer } from "./TacticalPitch";
import type { TacticalReportResponse } from "../api/tacticalReport.ts";
import type { TacticalScenarioSnapshot, Side } from "../types.ts";
import { getPlayerReportInsights } from "../analysis/playerReportInsights.ts";

type Props = {
  report: TacticalReportResponse;
  snapshot: TacticalScenarioSnapshot;
  isPrevious: boolean;
  onOpenPlayer: (playerId: number, opener?: HTMLElement) => void;
};

export default function TacticalReport({ report, snapshot, isPrevious, onOpenPlayer }: Props) {
  const playersBySide: Record<Side, PitchTokenPlayer[]> = {
    home: snapshot.playersBySide.home,
    away: snapshot.playersBySide.away,
  };
  const evidence = new Map(report.evidence_refs.map((item) => [item.id, item]));
  const players = [...snapshot.playersBySide.home, ...snapshot.playersBySide.away];
  const explicitlyLinkedPlayerIds = [...new Set([...report.observations, ...report.recommendations].flatMap((item) => {
    const claim = item.claim as Record<string, unknown>;
    const ids = [...(typeof claim.player_id === "number" ? [claim.player_id] : []), ...(Array.isArray(claim.player_ids) ? claim.player_ids.filter((id): id is number => Number.isSafeInteger(id)) : [])];
    return ids;
  }))];
  return (
    <div className="report-page-content">
      <section className="report-dashboard-header">
        <div><p className="eyebrow"><span className="eyebrow-line" /> PHASE 5 · DETERMINISTIC DEMO REPORT</p>
          <h1>{snapshot.teams.home.name} <em>vs</em> {snapshot.teams.away.name}</h1>
          <p>{snapshot.formationBySide.home} · Home <span> / </span> {snapshot.formationBySide.away} · Away</p>
        </div>
        <span className="report-dashboard-label">{report.report_notice} · {report.data_label}</span>
      </section>
      <section className="report-snapshot-panel" aria-label="Captured tactical board snapshot">
        <div className="report-snapshot-heading">
          <div><span className="pitch-kicker">CAPTURED BOARD · {new Date(snapshot.capturedAt).toLocaleString()}</span><h2>{snapshot.teams.home.name} vs {snapshot.teams.away.name}</h2></div>
          <span className={`report-version-badge${isPrevious ? " is-previous" : ""}`} role="status">{isPrevious ? "PREVIOUS BOARD" : "CURRENT BOARD"}</span>
        </div>
        {isPrevious && <p className="report-state report-state--stale">This report describes the saved snapshot below. The live board has changed since it was generated.</p>}
        <div className="pitch-key"><span>{snapshot.teams.home.name} · {snapshot.formationBySide.home}</span><span>{snapshot.teams.away.name} · {snapshot.formationBySide.away}</span></div>
        <TacticalPitch teams={snapshot.teams} formationBySide={snapshot.formationBySide} playersBySide={playersBySide} mode="snapshot" onOpenPlayer={onOpenPlayer} />
        <div className="report-snapshot-rosters">
          {(["home", "away"] as const).map((side) => (
            <div key={side}><h3>{snapshot.teams[side].name} · {snapshot.formationBySide[side]}</h3>
              <ul>{snapshot.playersBySide[side].map((player) => <li key={player.id}><button type="button" onClick={(event) => onOpenPlayer(player.id, event.currentTarget)}>{player.name}</button><span>{player.position} · {player.availability}</span></li>)}</ul>
            </div>
          ))}
        </div>
      </section>
      <section className="tactical-report" aria-label="Generated tactical report">
        <section className="report-executive-summary"><span className="pitch-kicker">EXECUTIVE SUMMARY · FROM REPORT DATA</span><p>{report.executive_summary}</p></section>
        <ReportGroup title="Key tactical observations" scope="current_scenario" report={report} evidence={evidence} collapsible={false} />
        <section className="report-subsection"><h3>Recommendations for human review</h3><p className="report-section-note">Shown in the order returned by the report; no severity ranking is supplied.</p>
          {!report.recommendations.length ? <p>No evidence-linked recommendations were generated.</p> : report.recommendations.map((item) => (
            <article className="report-item" key={item.id}><p>{item.text}</p><EvidenceDetails ids={item.evidence_ids} evidence={evidence} limitations={item.limitations} /></article>
          ))}
        </section>
        <section className="report-subsection report-player-insights"><h3>Player-specific insights</h3>
          {!explicitlyLinkedPlayerIds.length ? <p>No player-specific report claims are available.</p> : explicitlyLinkedPlayerIds.map((playerId) => {
            const player = players.find((item) => item.id === playerId);
            const linked = getPlayerReportInsights(report, playerId);
            if (!player || !linked.length) return null;
            return <article className="report-player-insight" key={playerId}><button type="button" onClick={(event) => onOpenPlayer(playerId, event.currentTarget)}>{player.name} · View player card</button><span>{linked.length} explicitly linked {linked.length === 1 ? "item" : "items"}</span><ul>{linked.map(({ item }) => <li key={item.id}>{item.text}</li>)}</ul></article>;
          })}
          {explicitlyLinkedPlayerIds.length > 0 && !explicitlyLinkedPlayerIds.some((playerId) => getPlayerReportInsights(report, playerId).length > 0) && <p>No claims passed player and evidence matching.</p>}
        </section>
        <details className="report-detail-section"><summary>Historical context observations and supporting detail</summary>
          <ReportGroup title="Historical context observations" scope="historical_context" report={report} evidence={evidence} collapsible={false} />
        </details>
        <details className="report-detail-section"><summary>Report limitations</summary><ul>{report.limitations.map((text) => <li key={text}>{text}</li>)}</ul></details>
      </section>
    </div>
  );
}

function ReportGroup({ title, scope, report, evidence }: {
  title: string;
  scope: "current_scenario" | "historical_context";
  report: TacticalReportResponse;
  evidence: Map<string, TacticalReportResponse["evidence_refs"][number]>;
  collapsible?: boolean;
}) {
  const observations = report.observations.filter((item) => item.scope === scope);
  return <section className="report-subsection"><h3>{title}</h3>
    {!observations.length ? <p>No observations are available for this section.</p> : observations.map((item) => (
      <article className="report-item" key={item.id}><p>{item.text}</p><span className="report-confidence">Evidence strength: {item.confidence}</span><EvidenceDetails ids={item.evidence_ids} evidence={evidence} limitations={[]} /></article>
    ))}
  </section>;
}

function EvidenceDetails({ ids, evidence, limitations }: {
  ids: string[];
  evidence: Map<string, TacticalReportResponse["evidence_refs"][number]>;
  limitations: string[];
}) {
  return <details className="report-evidence-details"><summary>Supporting evidence ({ids.length})</summary><EvidenceList ids={ids} evidence={evidence} />
    {limitations.length > 0 && <ul className="report-limitations-inline">{limitations.map((text) => <li key={text}>{text}</li>)}</ul>}
  </details>;
}

function EvidenceList({ ids, evidence }: {
  ids: string[];
  evidence: Map<string, TacticalReportResponse["evidence_refs"][number]>;
}) {
  return <ul className="report-evidence-list">{ids.map((id) => {
    const item = evidence.get(id);
    return <li key={id}>{item ? `${item.label} · ${item.kind.replaceAll("_", " ")}` : "Evidence reference unavailable"}</li>;
  })}</ul>;
}
