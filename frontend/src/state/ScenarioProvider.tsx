import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { captureScenarioSnapshot } from "../analysis/tacticalSnapshot.ts";
import { requestTacticalReport } from "../api/tacticalReport.ts";
import type { Player, Side, TacticalScenarioSnapshot, Team } from "../types.ts";
import {
  createInitialScenarioState,
  scenarioReducer,
  type ScenarioAction,
  type ScenarioState,
} from "./scenarioState.ts";

type ScenarioContextValue = {
  state: ScenarioState;
  dispatch: React.Dispatch<ScenarioAction>;
  selectedTeams: Record<Side, Team>;
  playersBySide: Record<Side, Player[]>;
  currentSnapshot: TacticalScenarioSnapshot;
  reportIsPrevious: boolean;
  selectTeam: (side: Side, teamId: number) => void;
  generateReport: () => Promise<void>;
};

const ScenarioContext = createContext<ScenarioContextValue | null>(null);
async function loadRoster(teamId: number): Promise<Player[]> {
  const response = await fetch(`/api/players?team_id=${teamId}`);
  if (!response.ok) throw new Error(`Could not load squad (HTTP ${response.status})`);
  const payload = await response.json() as { items: Player[] };
  return payload.items;
}

export function ScenarioProvider({ teams, children }: { teams: Team[]; children: ReactNode }) {
  const [state, dispatch] = useReducer(scenarioReducer, teams, createInitialScenarioState);
  const requestSequence = useRef(0);
  const selectedTeamIds = [...new Set([state.teamIds.home, state.teamIds.away])];

  useEffect(() => {
    for (const teamId of selectedTeamIds) {
      if (!teamId || state.rostersByTeamId[teamId] || state.rosterRequestIds[teamId]) continue;
      const requestId = ++requestSequence.current;
      dispatch({ type: "ROSTER_LOAD_STARTED", teamId, requestId });
      loadRoster(teamId)
        .then((players) => dispatch({ type: "ROSTER_LOADED", teamId, requestId, players }))
        .catch((error: unknown) => dispatch({
          type: "ROSTER_LOAD_FAILED",
          teamId,
          requestId,
          message: error instanceof Error ? error.message : "Could not load player data.",
        }));
    }
  }, [state.teamIds.home, state.teamIds.away, state.rostersByTeamId, state.rosterRequestIds]);

  const selectedTeams = useMemo(() => ({
    home: state.teams.find((team) => team.id === state.teamIds.home) ?? state.teams[0],
    away: state.teams.find((team) => team.id === state.teamIds.away) ?? state.teams[1] ?? state.teams[0],
  }), [state.teams, state.teamIds]);
  const playersBySide = useMemo(() => ({
    home: state.rostersByTeamId[state.teamIds.home] ?? [],
    away: state.rostersByTeamId[state.teamIds.away] ?? [],
  }), [state.rostersByTeamId, state.teamIds]);
  const currentSnapshot = useMemo(() => captureScenarioSnapshot(state).snapshot, [state]);
  const reportIsPrevious = Boolean(
    state.latestReport && state.latestReport.snapshot.scenarioKey !== currentSnapshot.scenarioKey,
  );

  const selectTeam = useCallback((side: Side, teamId: number) => {
    dispatch({ type: "TEAM_SELECTED", side, teamId });
  }, []);

  const generateReport = useCallback(async () => {
    const captured = captureScenarioSnapshot(state);
    dispatch({ type: "REPORT_STARTED" });
    try {
      const response = await requestTacticalReport(captured.request);
      dispatch({ type: "REPORT_SUCCEEDED", report: { ...captured, response } });
      window.location.hash = "#/reports";
    } catch (error) {
      dispatch({
        type: "REPORT_FAILED",
        message: error instanceof Error ? error.message : "Could not generate the tactical report.",
      });
    }
  }, [state]);

  const value = useMemo(() => ({
    state,
    dispatch,
    selectedTeams,
    playersBySide,
    currentSnapshot,
    reportIsPrevious,
    selectTeam,
    generateReport,
  }), [state, selectedTeams, playersBySide, currentSnapshot, reportIsPrevious, selectTeam, generateReport]);

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario(): ScenarioContextValue {
  const context = useContext(ScenarioContext);
  if (!context) throw new Error("useScenario must be used inside ScenarioProvider");
  return context;
}
