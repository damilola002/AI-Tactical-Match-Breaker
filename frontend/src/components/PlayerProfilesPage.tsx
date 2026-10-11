import { useEffect, useState } from "react";
import { usePlayerProfileData } from "../hooks/usePlayerProfileData.ts";
import { loadPlayers } from "../api/playerProfile.ts";
import type { Player } from "../types.ts";
import PlayerProfileCard from "./PlayerProfileCard";

export default function PlayerProfilesPage({ playerId, onClose }: { playerId: number | null; onClose: () => void }) {
  const [directory, setDirectory] = useState<Player[]>([]);
  const [directoryLabel, setDirectoryLabel] = useState("DEMO DATA");
  const profile = usePlayerProfileData(playerId);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (playerId === null) {
      loadPlayers().then((response) => {
        if (!active) return;
        setDirectory(response.items);
        setDirectoryLabel(response.data_label);
      }).catch((cause: unknown) => {
        if (active) setDirectoryError(cause instanceof Error ? cause.message : "Could not load players.");
      }).finally(() => { if (active) setDirectoryLoading(false); });
    }
    return () => { active = false; };
  }, [playerId]);

  const loading = playerId === null ? directoryLoading : profile.loading;
  const error = playerId === null ? directoryError : profile.error;

  return (
    <main className="page-content player-profiles-page">
      <section className="page-intro"><p className="eyebrow"><span className="eyebrow-line" /> PLAYER PERFORMANCE · DEMO DATA</p><h1>Player <em>profiles.</em></h1><p>Profiles show measured match data only. Missing measurements remain unavailable.</p></section>
      {loading && <p className="history-state" role="status">Loading player data…</p>}
      {error && <p className="history-state history-state--error" role="alert">{error}</p>}
      {playerId === null && !loading && !error && (
        <section className="player-directory"><h2>Choose a player</h2><p>{directoryLabel}</p>
          {directory.map((item) => <a className="player-directory-link" key={item.id} href={`#/players/${item.id}`}><span>{item.name}</span><small>{item.team.name} · {item.position} · {item.availability?.status ?? "active"}</small></a>)}
        </section>
      )}
      {profile.player && profile.history && profile.summary && <>
        <button className="profile-back-button" type="button" onClick={onClose}>← Back to previous page</button>
        <PlayerProfileCard player={profile.player} matches={profile.history.items} summary={profile.summary} dataLabel={profile.history.data_label || directoryLabel} />
      </>}
      {!loading && !error && playerId !== null && !profile.player && <p className="history-state">Player not found.</p>}
    </main>
  );
}
