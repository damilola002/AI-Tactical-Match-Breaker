import HistoricalAnalytics from "./HistoricalAnalytics";
import TacticalReport from "./TacticalReport";
import { useScenario } from "../state/ScenarioProvider.tsx";
import type { StoredTacticalReport } from "../state/scenarioState.ts";

export default function ReportsPage({ onOpenPlayer }: { onOpenPlayer: (playerId: number, report: StoredTacticalReport, opener?: HTMLElement) => void }) {
  const { state, reportIsPrevious } = useScenario();
  const stored = state.latestReport;
  return (
    <main className="page-content reports-page">
      {state.reportStatus === "loading" && <p className="report-state" role="status">Generating a report from the captured board…</p>}
      {state.reportError && <p className="report-state report-state--error" role="alert">{state.reportError}</p>}
      {stored ? (
        <>
          <TacticalReport report={stored.response} snapshot={stored.snapshot} isPrevious={reportIsPrevious} onOpenPlayer={(playerId, opener) => onOpenPlayer(playerId, stored, opener)} />
          <details className="historical-analytics-group report-detail-section">
            <summary>Historical performance context · stored demo matches</summary>
            <div className="page-section-heading"><h2>Historical team analytics</h2><p>These measurements describe recorded demo matches, not the captured tactical board.</p></div>
            <HistoricalAnalytics team={stored.snapshot.teams.home} />
            <HistoricalAnalytics team={stored.snapshot.teams.away} />
          </details>
        </>
      ) : (
        <section className="reports-empty-state">
          <p className="eyebrow"><span className="eyebrow-line" /> PHASE 5 · TACTICAL REPORTS</p>
          <h1>No report <em>yet.</em></h1>
          <p>Configure a matchup, adjust the live board, then generate an evidence-linked report. The report will open here with an immutable board snapshot.</p>
          <a className="report-generate-button" href="#/board">Open Tactical Board</a>
        </section>
      )}
    </main>
  );
}
