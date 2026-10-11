import { useEffect, useState } from "react";
import AppNavigation from "./components/AppNavigation";
import FormationPlanner from "./components/FormationPlanner";
import ReportsPage from "./components/ReportsPage";
import TacticalBoard from "./components/TacticalBoard";
import PlayerProfilesPage from "./components/PlayerProfilesPage";
import { ScenarioProvider, useScenario } from "./state/ScenarioProvider.tsx";
import { useHashRoute } from "./state/hashRouter.ts";
import type { Team } from "./types.ts";

type HealthResponse = { status: string; database: string };
type TeamResponse = { data_label: string; count: number; items: Team[] };

function RoutedApplication({ health, dataLabel }: { health: HealthResponse | null; dataLabel: string }) {
  const { route, navigate } = useHashRoute();
  const { state, dispatch } = useScenario();

  useEffect(() => {
    if (route.page === "players" && route.playerId !== null && state.selectedPlayerId !== route.playerId) {
      dispatch({ type: "PLAYER_PROFILE_OPENED", playerId: route.playerId, returnHash: "#/planner" });
    } else if ((route.page !== "players" || route.playerId === null) && state.selectedPlayerId !== null) {
      dispatch({ type: "PLAYER_PROFILE_CLOSED" });
    }
  }, [route, state.selectedPlayerId, dispatch]);

  const openPlayer = (playerId: number) => {
    dispatch({ type: "PLAYER_PROFILE_OPENED", playerId, returnHash: route.page === "players" ? state.profileReturnHash : route.hash });
    navigate(`#/players/${playerId}`);
  };
  const closePlayer = () => {
    const destination = state.profileReturnHash || "#/planner";
    dispatch({ type: "PLAYER_PROFILE_CLOSED" });
    navigate(destination);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/planner" aria-label="Touchline home"><span className="brand-mark" aria-hidden="true">M</span><span>TOUCHLINE<span className="brand-dot">.</span></span></a>
        <div className="topbar-meta"><span className="season-label">TACTICAL LAB <span>·</span> 2026</span><span className={`api-status ${health ? "is-online" : ""}`}><span className="api-status-dot" />{health ? `API ${health.status}` : "CONNECTING"}</span></div>
      </header>
      <AppNavigation activePage={route.page} />
      <div className="global-data-label"><span className="stamp-icon" aria-hidden="true">✳</span>{dataLabel}</div>
      {route.page === "planner" && <FormationPlanner onOpenPlayer={openPlayer} />}
      {route.page === "board" && <TacticalBoard onOpenPlayer={openPlayer} />}
      {route.page === "reports" && <ReportsPage onOpenPlayer={openPlayer} />}
      {route.page === "players" && <PlayerProfilesPage playerId={route.playerId} onClose={closePlayer} />}
      <footer className="page-footer"><span>TOUCHLINE TACTICAL LAB</span><span>DEMO DATA <i>·</i> PHASE 5.5</span></footer>
    </main>
  );
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [teamResponse, setTeamResponse] = useState<TeamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/health").then(async (response) => {
        if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}`);
        return await response.json() as HealthResponse;
      }),
      fetch("/api/teams").then(async (response) => {
        if (!response.ok) throw new Error(`Could not load teams (HTTP ${response.status})`);
        return await response.json() as TeamResponse;
      }),
    ]).then(([healthResult, teamsResult]) => {
      if (!active) return;
      setHealth(healthResult);
      setTeamResponse(teamsResult);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load the application data.");
    });
    return () => { active = false; };
  }, []);

  if (error) return <main className="app-shell"><section className="load-error" role="alert"><strong>We couldn’t load the application data.</strong><span>{error}</span><span>Check that the Phase 2 API is running, then refresh.</span></section></main>;
  if (!teamResponse) return <main className="app-shell"><div className="loading-state" aria-live="polite">Loading demo teams…</div></main>;
  if (!teamResponse.items.length) return <main className="app-shell"><div className="load-error" role="alert">No teams are available in the demo API.</div></main>;

  return <ScenarioProvider teams={teamResponse.items}><RoutedApplication health={health} dataLabel={teamResponse.data_label} /></ScenarioProvider>;
}
