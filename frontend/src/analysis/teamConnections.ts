import type { FormationSlot, PitchPosition, PlayerPositions, Side } from "../types.ts";

export type TeamConnectionInput = {
  formationSlots: readonly FormationSlot[];
  assignments: Readonly<Record<number, number | null>>;
  playerPositions: Readonly<Record<number, PitchPosition>>;
};

export type TeamConnection = {
  id: string;
  side: Side;
  line: FormationSlot["line"];
  firstPlayerId: number;
  secondPlayerId: number;
  start: PitchPosition;
  end: PitchPosition;
};

const lineOrder: FormationSlot["line"][] = ["GK", "DEF", "MID", "FWD"];

/** Connect adjacent currently placed players within each side's assigned formation lines. */
export function buildTeamConnections(
  formationSlots: Record<Side, readonly FormationSlot[]>,
  assignments: Record<Side, Readonly<Record<number, number | null>>>,
  playerPositions: PlayerPositions,
): TeamConnection[] {
  const connections: TeamConnection[] = [];

  for (const side of ["home", "away"] as const) {
    const playersByLine = new Map<FormationSlot["line"], { playerId: number; position: PitchPosition }[]>();
    for (const [slotIndexText, playerId] of Object.entries(assignments[side])) {
      if (playerId === null) continue;
      const slot = formationSlots[side][Number(slotIndexText)];
      const position = playerPositions[side][playerId];
      if (!slot || !position) continue;
      const linePlayers = playersByLine.get(slot.line) ?? [];
      linePlayers.push({ playerId, position });
      playersByLine.set(slot.line, linePlayers);
    }

    for (const line of lineOrder) {
      const linePlayers = playersByLine.get(line) ?? [];
      linePlayers.sort((first, second) => first.position.y - second.position.y || first.playerId - second.playerId);
      for (let index = 0; index < linePlayers.length - 1; index += 1) {
        const first = linePlayers[index];
        const second = linePlayers[index + 1];
        connections.push({
          id: `${side}:${line}:${first.playerId}:${second.playerId}`,
          side,
          line,
          firstPlayerId: first.playerId,
          secondPlayerId: second.playerId,
          start: first.position,
          end: second.position,
        });
      }
    }
  }

  return connections;
}
