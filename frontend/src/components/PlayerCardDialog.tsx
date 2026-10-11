import { useEffect, useMemo, useRef } from "react";
import { getPlayerReportInsights, playerReportSnapshotLabel } from "../analysis/playerReportInsights.ts";
import type { TacticalReportResponse } from "../api/tacticalReport.ts";
import { usePlayerProfileData } from "../hooks/usePlayerProfileData.ts";
import type { StoredTacticalReport } from "../state/scenarioState.ts";
import PlayerProfileCard from "./PlayerProfileCard";

type Props = {
  playerId: number;
  source: "planner" | "board" | "report";
  report: StoredTacticalReport | null;
  reportIsPrevious: boolean;
  onClose: () => void;
};

export default function PlayerCardDialog({ playerId, source, report, reportIsPrevious, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const profile = usePlayerProfileData(playerId);
  const linkedInsights = useMemo(
    () => report ? getPlayerReportInsights(report.response, playerId) : [],
    [report, playerId],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
  }, []);

  const tacticalEvidence = linkedInsights.filter(({ item }) => item.claim.claim_type !== "historical_measurement");
  const historicalReportEvidence = linkedInsights.filter(({ item }) => item.claim.claim_type === "historical_measurement");

  return (
    <dialog
      ref={dialogRef}
      className="player-card-dialog"
      aria-labelledby="player-dialog-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
    >
      <div className="player-dialog-frame">
        <header className="player-dialog-topline">
          <span>PLAYER CARD <i>·</i> {source === "report" ? "REPORT SNAPSHOT" : source === "board" ? "FREE TACTICAL BOARD" : "FORMATION PLANNER"}</span>
          <h2 id="player-dialog-title" className="visually-hidden">{profile.player ? `${profile.player.name} player profile` : "Player profile"}</h2>
          <button ref={closeRef} type="button" className="player-dialog-close" aria-label="Close player card" onClick={() => dialogRef.current?.close()}>×</button>
        </header>
        {playerReportSnapshotLabel(reportIsPrevious) && report && <p className="player-dialog-previous" role="status">{playerReportSnapshotLabel(reportIsPrevious)} · insights below belong to the saved board from {new Date(report.snapshot.capturedAt).toLocaleString()}.</p>}
        {profile.loading && <p className="player-dialog-state" role="status">Loading player profile…</p>}
        {profile.error && <p className="player-dialog-state is-error" role="alert">{profile.error}</p>}
        {!profile.loading && !profile.error && !profile.player && <p className="player-dialog-state">Player profile not found.</p>}
        {profile.player && profile.history && profile.summary && <>
          <PlayerProfileCard player={profile.player} matches={profile.history.items} summary={profile.summary} dataLabel={profile.history.data_label} />
          <section className="player-dialog-insights" aria-label="Player-specific report evidence">
            <div className="player-dialog-section-heading"><span className="pitch-kicker">STRUCTURED EVIDENCE</span><h3>Report insights</h3></div>
            {!report && <p>No tactical report has been generated yet.</p>}
            {report && !linkedInsights.length && <p>No report evidence explicitly identifies this player.</p>}
            {tacticalEvidence.length > 0 && <div className="player-insight-group"><h4>Tactical report observations and recommendations</h4>{tacticalEvidence.map(({ item, evidence }) => <InsightItem key={item.id} item={item} evidence={evidence} limitations={"limitations" in item ? item.limitations : report?.response.limitations ?? []} />)}</div>}
            {historicalReportEvidence.length > 0 && <div className="player-insight-group"><h4>Historical report measurements</h4>{historicalReportEvidence.map(({ item, evidence }) => <InsightItem key={item.id} item={item} evidence={evidence} limitations={"limitations" in item ? item.limitations : report?.response.limitations ?? []} />)}</div>}
          </section>
          <p className="player-dialog-demo-note">Fictional demo records · stored measurements are examples, not real player tracking data.</p>
        </>}
      </div>
    </dialog>
  );
}

function InsightItem({ item, evidence, limitations }: {
  item: TacticalReportResponse["observations"][number] | TacticalReportResponse["recommendations"][number];
  evidence: TacticalReportResponse["evidence_refs"];
  limitations: string[];
}) {
  return <article className="player-insight-item">
    <p>{item.text}</p>
    <details><summary>Supporting evidence ({evidence.length})</summary><ul>{evidence.map((ref) => <li key={ref.id}><strong>{ref.label}</strong><span>{ref.kind.replaceAll("_", " ")} · {ref.source_key}</span></li>)}</ul></details>
    {limitations.length > 0 && <details><summary>Limitations ({limitations.length})</summary><ul>{limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>}
  </article>;
}
