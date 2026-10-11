import HistoricalAnalytics from "./HistoricalAnalytics";
import TacticalReport from "./TacticalReport";
import { useScenario } from "../state/ScenarioProvider.tsx";

export default function ReportsPage({ onOpenPlayer }: { onOpenPlayer: (playerId: number) => void }) {
  const { state, reportIsPrevious } = useScenario();
  const stored = state.latestReport;
  return (
    <main className="page-content reports-page">
      {state.reportStatus === "loading" && <p className="report-state" role="status">Generating a report from the captured board…</p>}
      {state.reportError && <p className="report-state report-state--error" role="alert">{state.reportError}</p>}
      {stored ? (
        <>
          <TacticalReport report={stored.response} snapshot={stored.snapshot} isPrevious={reportIsPrevious} onOpenPlayer={onOpenPlayer} />
          <section className="historical-analytics-group" aria-label="Historical team analytics">
            <div className="page-section-heading"><span className="pitch-kicker">PHASE 4 · STORED MATCHES</span><h2>Historical team analytics</h2><p>These measurements describe recorded demo matches, not the captured tactical board.</p></div>
            <HistoricalAnalytics team={stored.snapshot.teams.home} />
            <HistoricalAnalytics team={stored.snapshot.teams.away} />
          </section>
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
