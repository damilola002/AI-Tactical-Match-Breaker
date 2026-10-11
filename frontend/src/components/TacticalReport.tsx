import TacticalPitch, { type PitchTokenPlayer } from "./TacticalPitch";
import type { TacticalReportResponse } from "../api/tacticalReport.ts";
import type { TacticalScenarioSnapshot, Side } from "../types.ts";

type Props = {
  report: TacticalReportResponse;
  snapshot: TacticalScenarioSnapshot;
  isPrevious: boolean;
  onOpenPlayer: (playerId: number) => void;
};

export default function TacticalReport({ report, snapshot, isPrevious, onOpenPlayer }: Props) {
  const playersBySide: Record<Side, PitchTokenPlayer[]> = {
    home: snapshot.playersBySide.home,
    away: snapshot.playersBySide.away,
  };
  const evidence = new Map(report.evidence_refs.map((item) => [item.id, item]));
  return (
    <div className="report-page-content">
      <section className="page-intro report-page-intro">
        <p className="eyebrow"><span className="eyebrow-line" /> PHASE 5 · TACTICAL REPORT</p>
        <h1>Evidence, then <em>explanation.</em></h1>
        <p>A report and board snapshot captured together. Historical match data remains separate from the current scenario.</p>
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
              <ul>{snapshot.playersBySide[side].map((player) => <li key={player.id}><button type="button" onClick={() => onOpenPlayer(player.id)}>{player.name}</button><span>{player.position} · {player.availability}</span></li>)}</ul>
            </div>
          ))}
        </div>
      </section>
      <section className="tactical-report" aria-label="Generated tactical report">
        <p className="report-mock-notice">{report.report_notice} · {report.data_label}</p>
        <p className="report-summary">{report.executive_summary}</p>
        <ReportGroup title="Scenario observations" scope="current_scenario" report={report} evidence={evidence} />
        <ReportGroup title="Historical context observations" scope="historical_context" report={report} evidence={evidence} />
        <section className="report-subsection"><h3>Recommendations for human review</h3>
          {!report.recommendations.length ? <p>No evidence-linked recommendations were generated.</p> : report.recommendations.map((item) => (
            <article className="report-item" key={item.id}><p>{item.text}</p><EvidenceList ids={item.evidence_ids} evidence={evidence} />{item.limitations.map((text) => <small className="report-limitation" key={text}>{text}</small>)}</article>
          ))}
        </section>
        <section className="report-subsection"><h3>Limitations</h3><ul>{report.limitations.map((text) => <li key={text}>{text}</li>)}</ul></section>
      </section>
    </div>
  );
}

function ReportGroup({ title, scope, report, evidence }: {
  title: string;
  scope: "current_scenario" | "historical_context";
  report: TacticalReportResponse;
  evidence: Map<string, TacticalReportResponse["evidence_refs"][number]>;
}) {
  const observations = report.observations.filter((item) => item.scope === scope);
  return <section className="report-subsection"><h3>{title}</h3>
    {!observations.length ? <p>No observations are available for this section.</p> : observations.map((item) => (
      <article className="report-item" key={item.id}><p>{item.text}</p><span className="report-confidence">Evidence strength: {item.confidence}</span><EvidenceList ids={item.evidence_ids} evidence={evidence} /></article>
    ))}
  </section>;
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
