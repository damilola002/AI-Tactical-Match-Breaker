import { useEffect, useRef, useState } from "react";
import AppNavigation from "./components/AppNavigation";
import FormationPlanner from "./components/FormationPlanner";
import ReportsPage from "./components/ReportsPage";
import TacticalBoard from "./components/TacticalBoard";
import PlayerProfilesPage from "./components/PlayerProfilesPage";
import PlayerCardDialog from "./components/PlayerCardDialog";
import { ScenarioProvider, useScenario } from "./state/ScenarioProvider.tsx";
import type { StoredTacticalReport } from "./state/scenarioState.ts";
import { useHashRoute } from "./state/hashRouter.ts";
import type { Team } from "./types.ts";

type HealthResponse = { status: string; database: string };
type TeamResponse = { data_label: string; count: number; items: Team[] };

function RoutedApplication({ health, dataLabel }: { health: HealthResponse | null; dataLabel: string }) {
  const { route, navigate } = useHashRoute();
  const { state, dispatch, currentSnapshot } = useScenario();
  const [popup, setPopup] = useState<{ playerId: number; source: "planner" | "board" | "report"; report: StoredTacticalReport | null } | null>(null);
  const popupOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (route.page === "players" && route.playerId !== null && state.selectedPlayerId !== route.playerId) {
      dispatch({ type: "PLAYER_PROFILE_OPENED", playerId: route.playerId, returnHash: "#/planner" });
    } else if ((route.page !== "players" || route.playerId === null) && state.selectedPlayerId !== null) {
      dispatch({ type: "PLAYER_PROFILE_CLOSED" });
    }
  }, [route, state.selectedPlayerId, dispatch]);

  const openPlayer = (playerId: number, source: "planner" | "board" | "report", report = state.latestReport, opener?: HTMLElement) => {
    popupOpener.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPopup({ playerId, source, report });
  };
  const closePopup = () => {
    setPopup(null);
    requestAnimationFrame(() => popupOpener.current?.focus({ preventScroll: true }));
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
      {route.page === "planner" && <FormationPlanner onOpenPlayer={(id, opener) => openPlayer(id, "planner", state.latestReport, opener)} />}
      {route.page === "board" && <TacticalBoard onOpenPlayer={(id, opener) => openPlayer(id, "board", state.latestReport, opener)} />}
      {route.page === "reports" && <ReportsPage onOpenPlayer={(id, report, opener) => openPlayer(id, "report", report, opener)} />}
      {route.page === "players" && <PlayerProfilesPage playerId={route.playerId} onClose={closePlayer} />}
      {popup && <PlayerCardDialog
        playerId={popup.playerId}
        source={popup.source}
        report={popup.report}
        reportIsPrevious={Boolean(popup.report && popup.report.snapshot.scenarioKey !== currentSnapshot.scenarioKey)}
        onClose={closePopup}
      />}
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
