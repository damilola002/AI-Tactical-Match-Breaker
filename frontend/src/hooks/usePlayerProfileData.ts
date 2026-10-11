import { useEffect, useMemo, useState } from "react";
import { summarizePlayerMeasurements, type PlayerPerformanceSummary } from "../analysis/playerProfile.ts";
import { loadPlayer, loadPlayerMatchHistory, type PlayerMatchHistoryResponse } from "../api/playerProfile.ts";
import type { Player } from "../types.ts";

export function usePlayerProfileData(playerId: number | null) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [history, setHistory] = useState<PlayerMatchHistoryResponse | null>(null);
  const [loading, setLoading] = useState(playerId !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (playerId === null) {
      setPlayer(null);
      setHistory(null);
      setLoading(false);
      setError(null);
      return () => { active = false; };
    }
    setLoading(true);
    setError(null);
    setPlayer(null);
    setHistory(null);
    loadPlayer(playerId).then(async (response) => {
      const matches = await loadPlayerMatchHistory(response.item.team.id);
      if (!active) return;
      setPlayer(response.item);
      setHistory(matches);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load player profile.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [playerId]);

  const summary: PlayerPerformanceSummary | null = useMemo(
    () => player && history ? summarizePlayerMeasurements(player.id, player.team.id, history.items) : null,
    [player, history],
  );
  return { player, history, summary, loading, error };
}
