import { useEffect, useState } from "react";
import { summarizePlayerMeasurements } from "../analysis/playerProfile.ts";
import { loadPlayer, loadPlayerMatchHistory, loadPlayers, type PlayerMatchHistoryResponse } from "../api/playerProfile.ts";
import type { Player } from "../types.ts";
import PlayerProfileCard from "./PlayerProfileCard";

export default function PlayerProfilesPage({ playerId, onClose }: { playerId: number | null; onClose: () => void }) {
  const [directory, setDirectory] = useState<Player[]>([]);
  const [directoryLabel, setDirectoryLabel] = useState("DEMO DATA");
  const [player, setPlayer] = useState<Player | null>(null);
  const [history, setHistory] = useState<PlayerMatchHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (playerId === null) {
      loadPlayers().then((response) => {
        if (!active) return;
        setDirectory(response.items);
        setDirectoryLabel(response.data_label);
      }).catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load players.");
      }).finally(() => { if (active) setLoading(false); });
    } else {
      setPlayer(null);
      setHistory(null);
      loadPlayer(playerId).then(async (response) => {
        const matches = await loadPlayerMatchHistory(response.item.team.id);
        if (!active) return;
        setPlayer(response.item);
        setHistory(matches);
        setDirectoryLabel(response.data_label);
      }).catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load player profile.");
      }).finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [playerId]);

  const summary = player && history
    ? summarizePlayerMeasurements(player.id, player.team.id, history.items)
    : null;

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
      {player && history && summary && <>
        <button className="profile-back-button" type="button" onClick={onClose}>← Back to previous page</button>
        <PlayerProfileCard player={player} matches={history.items} summary={summary} dataLabel={history.data_label || directoryLabel} />
      </>}
      {!loading && !error && playerId !== null && !player && <p className="history-state">Player not found.</p>}
    </main>
  );
}
