import { useMemo, useState } from "react";
import {
  buildTacticalReportRequest,
  isTacticalReportStale,
  requestTacticalReport,
  type ReportScenarioInput,
  type TacticalReportResponse,
} from "../api/tacticalReport";

export default function TacticalReport(props: ReportScenarioInput) {
  const request = useMemo(() => buildTacticalReportRequest(props), [
    props.teams, props.formationBySide, props.squads, props.assignments, props.playerPositions,
  ]);
  const currentKey = JSON.stringify(request);
  const [result, setResult] = useState<{ key: string; report: TacticalReportResponse } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stale = result ? isTacticalReportStale(result.key, currentKey) : false;
  const evidence = new Map(result?.report.evidence_refs.map((item) => [item.id, item]) ?? []);

  const generate = async () => {
    setLoading(true);
    setError(null);
    const submittedKey = currentKey;
    try {
      setResult({ key: submittedKey, report: await requestTacticalReport(request) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the tactical report.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="tactical-report" aria-labelledby="tactical-report-title">
      <header className="tactical-report-heading">
        <div>
          <p className="pitch-kicker">PHASE 5 · TACTICAL REPORT</p>
          <h2 id="tactical-report-title">Evidence-linked board report</h2>
          <p>Generate an evidence-linked report for the current board when ready.</p>
        </div>
        <button className="report-generate-button" type="button" onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Report"}
        </button>
      </header>
      <p className="report-mock-notice">DETERMINISTIC MOCK · Rule-based demonstration, not real AI output.</p>
      {loading && <p className="report-state" role="status">Building the report from current positions and stored demo history…</p>}
      {error && <p className="report-state report-state--error" role="alert">{error}</p>}
      {stale && (
        <p className="report-state report-state--stale" role="status">
          This report is stale because teams, formations, assignments, or positions changed. Generate a new report for the current board.
        </p>
      )}
      {result && !stale && !loading && (
        <div className="report-content">
          <p className="report-data-label">{result.report.data_label}</p>
          <p className="report-summary">{result.report.executive_summary}</p>
          <ReportGroup title="Current scenario observations" scope="current_scenario" report={result.report} evidence={evidence} />
          <ReportGroup title="Historical match context" scope="historical_context" report={result.report} evidence={evidence} />
          <section className="report-subsection">
            <h3>Recommendations for human review</h3>
            {result.report.recommendations.length === 0 ? <p>No evidence-linked recommendations were generated.</p> : result.report.recommendations.map((item) => (
              <article className="report-item" key={item.id}>
                <p>{item.text}</p>
                <EvidenceList ids={item.evidence_ids} evidence={evidence} />
                {item.limitations.map((limitation) => <small className="report-limitation" key={limitation}>{limitation}</small>)}
              </article>
            ))}
          </section>
          <section className="report-subsection">
            <h3>Limitations</h3>
            <ul>{result.report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>
      )}
      {!result && !loading && !error && <p className="report-state">No report has been generated for this board yet.</p>}
    </section>
  );
}

function ReportGroup({
  title, scope, report, evidence,
}: {
  title: string;
  scope: "current_scenario" | "historical_context";
  report: TacticalReportResponse;
  evidence: Map<string, TacticalReportResponse["evidence_refs"][number]>;
}) {
  const items = report.observations.filter((item) => item.scope === scope);
  return (
    <section className="report-subsection">
      <h3>{title}</h3>
      {items.length === 0 ? <p>No observations are available for this section.</p> : items.map((item) => (
        <article className="report-item" key={item.id}>
          <p>{item.text}</p>
          <span className="report-confidence">Evidence strength: {item.confidence}</span>
          <EvidenceList ids={item.evidence_ids} evidence={evidence} />
        </article>
      ))}
    </section>
  );
}

function EvidenceList({
  ids, evidence,
}: {
  ids: string[];
  evidence: Map<string, TacticalReportResponse["evidence_refs"][number]>;
}) {
  return <ul className="report-evidence-list">{ids.map((id) => {
    const item = evidence.get(id);
    return <li key={id}>{item ? `${item.label} · ${item.kind.replaceAll("_", " ")}` : "Evidence reference unavailable"}</li>;
  })}</ul>;
}
