import { changeFormationAssignments, initialFormationAssignments } from "../analysis/formationAssignments.ts";
import { mapPlayerRole } from "../analysis/tacticalMetrics.ts";
import { FORMATIONS, positionsForAssignments } from "../analysis/formations.ts";
import type { TacticalReportRequest, TacticalReportResponse } from "../api/tacticalReport.ts";
import type {
  FormationName, PitchPosition, Player, PlayerPositions, Side,
  TacticalScenarioSnapshot, Team,
} from "../types.ts";

export type StoredTacticalReport = {
  request: TacticalReportRequest;
  response: TacticalReportResponse;
  snapshot: TacticalScenarioSnapshot;
};

export type ScenarioState = {
  teams: Team[];
  teamIds: Record<Side, number>;
  formationBySide: Record<Side, FormationName>;
  rostersByTeamId: Record<number, Player[]>;
  rosterRequestIds: Record<number, number>;
  rosterErrors: Record<number, string>;
  assignments: Record<Side, Record<number, number | null>>;
  freePositions: PlayerPositions;
  reportStatus: "idle" | "loading" | "error";
  reportError: string | null;
  latestReport: StoredTacticalReport | null;
  selectedPlayerId: number | null;
  profileReturnHash: string;
};

export type ScenarioAction =
  | { type: "TEAM_SELECTED"; side: Side; teamId: number }
  | { type: "ROSTER_LOAD_STARTED"; teamId: number; requestId: number }
  | { type: "ROSTER_LOADED"; teamId: number; requestId: number; players: Player[] }
  | { type: "ROSTER_LOAD_FAILED"; teamId: number; requestId: number; message: string }
  | { type: "FORMATION_SELECTED"; side: Side; formation: FormationName }
  | { type: "PLAYER_ASSIGNED"; side: Side; playerId: number; slotIndex: number | null }
  | { type: "PLAYER_MOVED"; side: Side; playerId: number; position: PitchPosition }
  | { type: "FORMATION_RESET"; side?: Side }
  | { type: "REPORT_STARTED" }
  | { type: "REPORT_SUCCEEDED"; report: StoredTacticalReport }
  | { type: "REPORT_FAILED"; message: string }
  | { type: "PLAYER_PROFILE_OPENED"; playerId: number; returnHash: string }
  | { type: "PLAYER_PROFILE_CLOSED" };

const emptyAssignments = () => ({ home: {} as Record<number, number | null>, away: {} as Record<number, number | null> });
const emptyPositions = () => ({ home: {}, away: {} });

function rosterFor(state: ScenarioState, side: Side): Player[] {
  return state.rostersByTeamId[state.teamIds[side]] ?? [];
}

function markReportAsPrevious(state: ScenarioState): Pick<ScenarioState, "latestReport"> {
  return { latestReport: state.latestReport };
}

export function createInitialScenarioState(teams: Team[]): ScenarioState {
  const home = teams[0]?.id ?? 0;
  const away = teams.find((team) => team.id !== home)?.id ?? home;
  return {
    teams,
    teamIds: { home, away },
    formationBySide: { home: "4-3-3", away: "4-4-2" },
    rostersByTeamId: {},
    rosterRequestIds: {},
    rosterErrors: {},
    assignments: emptyAssignments(),
    freePositions: emptyPositions(),
    reportStatus: "idle",
    reportError: null,
    latestReport: null,
    selectedPlayerId: null,
    profileReturnHash: "#/planner",
  };
}

export function scenarioReducer(state: ScenarioState, action: ScenarioAction): ScenarioState {
  switch (action.type) {
    case "TEAM_SELECTED": {
      if (!state.teams.some((team) => team.id === action.teamId)) return state;
      if (state.teamIds[action.side] === action.teamId) return state;
      const other: Side = action.side === "home" ? "away" : "home";
      const nextTeamIds = action.teamId === state.teamIds[other]
        ? { ...state.teamIds, [action.side]: state.teamIds[other], [other]: state.teamIds[action.side] }
        : { ...state.teamIds, [action.side]: action.teamId };
      const changedSides = (Object.keys(nextTeamIds) as Side[]).filter((side) => nextTeamIds[side] !== state.teamIds[side]);
      const nextAssignments = { ...state.assignments };
      const nextPositions = { ...state.freePositions };
      for (const side of changedSides) {
        const players = state.rostersByTeamId[nextTeamIds[side]];
        nextAssignments[side] = players
          ? initialFormationAssignments(state.formationBySide[side], players)
          : {};
        nextPositions[side] = players
          ? positionsForAssignments(side, state.formationBySide[side], nextAssignments[side])
          : {};
      }
      const invalidatedRequests = { ...state.rosterRequestIds };
      for (const id of new Set(Object.values(state.teamIds))) delete invalidatedRequests[id];
      return {
        ...state,
        teamIds: nextTeamIds,
        assignments: nextAssignments,
        freePositions: nextPositions,
        rosterRequestIds: invalidatedRequests,
        rosterErrors: {},
        reportStatus: "idle",
        reportError: null,
        ...markReportAsPrevious(state),
      };
    }
    case "ROSTER_LOAD_STARTED":
      return {
        ...state,
        rosterRequestIds: { ...state.rosterRequestIds, [action.teamId]: action.requestId },
        rosterErrors: { ...state.rosterErrors, [action.teamId]: "" },
      };
    case "ROSTER_LOADED": {
      if (state.rosterRequestIds[action.teamId] !== action.requestId) return state;
      if (!Object.values(state.teamIds).includes(action.teamId)) return state;
      const rostersByTeamId = { ...state.rostersByTeamId, [action.teamId]: action.players };
      const assignments = { ...state.assignments };
      const freePositions = { ...state.freePositions };
      for (const side of ["home", "away"] as const) {
        if (state.teamIds[side] !== action.teamId || state.rostersByTeamId[action.teamId]) continue;
        assignments[side] = initialFormationAssignments(state.formationBySide[side], action.players);
        freePositions[side] = positionsForAssignments(side, state.formationBySide[side], assignments[side]);
      }
      const rosterRequestIds = { ...state.rosterRequestIds };
      delete rosterRequestIds[action.teamId];
      const rosterErrors = { ...state.rosterErrors };
      delete rosterErrors[action.teamId];
      return { ...state, rostersByTeamId, assignments, freePositions, rosterRequestIds, rosterErrors };
    }
    case "ROSTER_LOAD_FAILED": {
      if (state.rosterRequestIds[action.teamId] !== action.requestId) return state;
      const rosterRequestIds = { ...state.rosterRequestIds };
      delete rosterRequestIds[action.teamId];
      return {
        ...state,
        rosterRequestIds,
        rosterErrors: { ...state.rosterErrors, [action.teamId]: action.message },
      };
    }
    case "FORMATION_SELECTED": {
      const oldFormation = state.formationBySide[action.side];
      if (oldFormation === action.formation) return state;
      const formationBySide = { ...state.formationBySide, [action.side]: action.formation };
      const assignments = {
        ...state.assignments,
        [action.side]: changeFormationAssignments(
          oldFormation,
          action.formation,
          state.assignments[action.side],
          rosterFor(state, action.side),
        ),
      };
      const freePositions = {
        ...state.freePositions,
        [action.side]: positionsForAssignments(action.side, action.formation, assignments[action.side]),
      };
      return { ...state, formationBySide, assignments, freePositions, ...markReportAsPrevious(state) };
    }
    case "PLAYER_ASSIGNED": {
      const roster = rosterFor(state, action.side);
      if (!roster.some((player) => player.id === action.playerId)) return state;
      const slots = FORMATIONS[state.formationBySide[action.side]];
      if (action.slotIndex !== null && (!Number.isInteger(action.slotIndex) || !slots[action.slotIndex])) return state;
      const nextSide = Object.fromEntries(
        Object.entries(state.assignments[action.side]).filter(([, assignedId]) => assignedId !== action.playerId),
      ) as Record<number, number | null>;
      if (action.slotIndex !== null) nextSide[action.slotIndex] = action.playerId;
      const assignments = { ...state.assignments, [action.side]: nextSide };
      const freePositions = {
        ...state.freePositions,
        [action.side]: positionsForAssignments(action.side, state.formationBySide[action.side], nextSide),
      };
      return { ...state, assignments, freePositions, ...markReportAsPrevious(state) };
    }
    case "PLAYER_MOVED": {
      const player = rosterFor(state, action.side).find((candidate) => candidate.id === action.playerId);
      if (!player || mapPlayerRole(player.position) === "goalkeeper") return state;
      const { x, y } = action.position;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return state;
      return {
        ...state,
        freePositions: {
          ...state.freePositions,
          [action.side]: { ...state.freePositions[action.side], [action.playerId]: { x, y } },
        },
      };
    }
    case "FORMATION_RESET": {
      const sides = action.side ? [action.side] : ["home", "away"] as Side[];
      const freePositions = { ...state.freePositions };
      for (const side of sides) freePositions[side] = positionsForAssignments(side, state.formationBySide[side], state.assignments[side]);
      return { ...state, freePositions, ...markReportAsPrevious(state) };
    }
    case "REPORT_STARTED":
      return { ...state, reportStatus: "loading", reportError: null };
    case "REPORT_SUCCEEDED":
      return { ...state, reportStatus: "idle", reportError: null, latestReport: action.report };
    case "REPORT_FAILED":
      return { ...state, reportStatus: "error", reportError: action.message };
    case "PLAYER_PROFILE_OPENED":
      return { ...state, selectedPlayerId: action.playerId, profileReturnHash: action.returnHash };
    case "PLAYER_PROFILE_CLOSED":
      return { ...state, selectedPlayerId: null };
    default:
      return state;
  }
}
