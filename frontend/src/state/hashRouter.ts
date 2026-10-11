import { useCallback, useEffect, useState } from "react";
import type { AppPage } from "../types.ts";

export type AppRoute = { page: AppPage; playerId: number | null; hash: string };

export function parseHashRoute(hash: string): AppRoute {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = normalized || "/planner";
  if (path === "/board") return { page: "board", playerId: null, hash: "#/board" };
  if (path === "/reports") return { page: "reports", playerId: null, hash: "#/reports" };
  if (path === "/players") return { page: "players", playerId: null, hash: "#/players" };
  const playerMatch = path.match(/^\/players\/(\d+)$/);
  if (playerMatch) {
    const playerId = Number(playerMatch[1]);
    if (Number.isSafeInteger(playerId) && playerId > 0) {
      return { page: "players", playerId, hash: `#/players/${playerId}` };
    }
  }
  return { page: "planner", playerId: null, hash: "#/planner" };
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#/planner");
    const sync = () => setRoute(parseHashRoute(window.location.hash));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const navigate = useCallback((hash: string) => {
    window.location.hash = parseHashRoute(hash).hash;
  }, []);
  return { route, navigate };
}
