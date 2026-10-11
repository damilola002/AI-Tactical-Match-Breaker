import { buildTacticalReportRequest } from "../api/tacticalReport.ts";
import { FORMATIONS, formationPosition, positionsForAssignments } from "./formations.ts";
import type { ScenarioState } from "../state/scenarioState.ts";
import type { Side, TacticalScenarioSnapshot, Team } from "../types.ts";

function freezeRecursively<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeRecursively(child);
  }
  return value;
}

export function captureScenarioSnapshot(state: ScenarioState): {
  request: ReturnType<typeof buildTacticalReportRequest>;
  snapshot: TacticalScenarioSnapshot;
} {
  const selectedTeams: Record<Side, Team> = {
    home: state.teams.find((team) => team.id === state.teamIds.home) ?? state.teams[0],
    away: state.teams.find((team) => team.id === state.teamIds.away) ?? state.teams[1] ?? state.teams[0],
  };
  const playersBySide = { home: [] as TacticalScenarioSnapshot["playersBySide"]["home"], away: [] as TacticalScenarioSnapshot["playersBySide"]["away"] };
  for (const side of ["home", "away"] as const) {
    const roster = state.rostersByTeamId[state.teamIds[side]] ?? [];
    const rosterById = new Map(roster.map((player) => [player.id, player]));
    const slots = FORMATIONS[state.formationBySide[side]];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const playerId = state.assignments[side][slotIndex];
      if (playerId === null || playerId === undefined) continue;
      const player = rosterById.get(playerId);
      if (!player) continue;
      playersBySide[side].push({
        id: player.id,
        name: player.name,
        position: player.position,
        availability: player.availability?.status ?? "active",
        slotIndex,
        slot: { ...slots[slotIndex] },
        coordinates: { ...(state.freePositions[side][player.id] ?? formationPosition(side, slots[slotIndex])) },
      });
    }
  }
  const scenarioKey = JSON.stringify({
    teams: { home: selectedTeams.home.id, away: selectedTeams.away.id },
    formations: state.formationBySide,
    players: {
      home: playersBySide.home.map(({ id, availability, slotIndex, coordinates }) => ({ id, availability, slotIndex, coordinates })),
      away: playersBySide.away.map(({ id, availability, slotIndex, coordinates }) => ({ id, availability, slotIndex, coordinates })),
    },
  });
  const snapshot: TacticalScenarioSnapshot = {
    scenarioKey,
    capturedAt: new Date().toISOString(),
    teams: { home: { ...selectedTeams.home }, away: { ...selectedTeams.away } },
    formationBySide: { ...state.formationBySide },
    slotsBySide: {
      home: FORMATIONS[state.formationBySide.home].map((slot) => ({ ...slot })),
      away: FORMATIONS[state.formationBySide.away].map((slot) => ({ ...slot })),
    },
    playersBySide: {
      home: playersBySide.home.map((player) => ({ ...player, slot: { ...player.slot }, coordinates: { ...player.coordinates } })),
      away: playersBySide.away.map((player) => ({ ...player, slot: { ...player.slot }, coordinates: { ...player.coordinates } })),
    },
  };
  const squads = {
    home: state.rostersByTeamId[state.teamIds.home] ?? [],
    away: state.rostersByTeamId[state.teamIds.away] ?? [],
  };
  const playerPositions = {
    home: { ...positionsForAssignments("home", state.formationBySide.home, state.assignments.home), ...state.freePositions.home },
    away: { ...positionsForAssignments("away", state.formationBySide.away, state.assignments.away), ...state.freePositions.away },
  };
  const request = buildTacticalReportRequest({
    teams: selectedTeams,
    formationBySide: state.formationBySide,
    squads,
    assignments: state.assignments,
    playerPositions,
  });
  return freezeRecursively({ request, snapshot });
}
