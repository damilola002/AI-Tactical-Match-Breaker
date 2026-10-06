import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import TacticalAnalysis from "./TacticalAnalysis";
import TeamConnectionLines from "./TeamConnectionLines";
import { calculateTeamMetrics, calculateZoneOccupancy } from "../analysis/tacticalMetrics";
import { calculateTacticalInsights } from "../analysis/tacticalInsights";
import { buildTeamConnections } from "../analysis/teamConnections";
import {
  constrainPlayerPosition,
  getPitchDragBounds,
  NORMALIZED_PITCH_BOUNDS,
} from "../analysis/positionConstraints";
import type { PitchPositionBounds } from "../analysis/positionConstraints";
import type { AvailabilityStatus, FormationName, FormationSlot, PitchPosition, Player, PlayerPositions, Side, Team } from "../types";

type PlayerResponse = { items: Player[]; count: number };
type AvailabilityFilter = "all" | AvailabilityStatus;
type Squad = { home: Player[]; away: Player[] };
type Assignments = Record<Side, Record<number, number | null>>;

const formations: Record<FormationName, FormationSlot[]> = {
  "4-3-3": [
    { line: "GK", x: 7, y: 50 },
    ...[18, 39, 61, 82].map((y) => ({ line: "DEF" as const, x: 20, y })),
    ...[27, 50, 73].map((y) => ({ line: "MID" as const, x: 35, y })),
    ...[24, 50, 76].map((y) => ({ line: "FWD" as const, x: 38, y })),
  ],
  "4-4-2": [
    { line: "GK", x: 7, y: 50 },
    ...[18, 39, 61, 82].map((y) => ({ line: "DEF" as const, x: 20, y })),
    ...[18, 39, 61, 82].map((y) => ({ line: "MID" as const, x: 35, y })),
    ...[37, 63].map((y) => ({ line: "FWD" as const, x: 38, y })),
  ],
  "3-5-2": [
    { line: "GK", x: 7, y: 50 },
    ...[24, 50, 76].map((y) => ({ line: "DEF" as const, x: 20, y })),
    ...[13, 32, 50, 68, 87].map((y) => ({ line: "MID" as const, x: 35, y })),
    ...[37, 63].map((y) => ({ line: "FWD" as const, x: 38, y })),
  ],
};

const formationNames = Object.keys(formations) as FormationName[];
const filters: { value: AvailabilityFilter; label: string }[] = [
  { value: "all", label: "All availability" },
  { value: "active", label: "Active" },
  { value: "doubtful", label: "Doubtful" },
  { value: "injured", label: "Injured" },
  { value: "suspended", label: "Suspended" },
];
const availabilityStatuses: AvailabilityStatus[] = ["active", "doubtful", "injured", "suspended"];

function playerStatus(player: Player): AvailabilityStatus {
  return player.availability?.status ?? "active";
}

function statusLabel(status: AvailabilityStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function positionMatchesLine(position: string, line: FormationSlot["line"]): boolean {
  const normalized = position.toLowerCase();
  if (line === "GK") return normalized.includes("goalkeeper") || normalized === "gk";
  if (line === "DEF") return normalized.includes("defend") || normalized === "def";
  if (line === "MID") return normalized.includes("midfield") || normalized === "mid";
  return normalized.includes("forward") || normalized.includes("striker") || normalized === "fwd";
}

function defaultAssignments(slots: FormationSlot[], players: Player[]): Record<number, number | null> {
  const remaining = [...players];
  const assignments: Record<number, number | null> = {};
  slots.forEach((slot, index) => {
    const playerIndex = remaining.findIndex((player) => positionMatchesLine(player.position, slot.line));
    if (playerIndex < 0) {
      assignments[index] = null;
      return;
    }
    const [player] = remaining.splice(playerIndex, 1);
    assignments[index] = player.id;
  });
  return assignments;
}

function pitchPosition(side: Side, slot: FormationSlot): PitchPosition {
  return { x: side === "home" ? slot.x : 100 - slot.x, y: slot.y };
}

function defaultPositions(
  side: Side,
  slots: FormationSlot[],
  assignments: Record<number, number | null>,
): Record<number, PitchPosition> {
  return Object.fromEntries(
    Object.entries(assignments)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .map(([slotIndex, playerId]) => [playerId, pitchPosition(side, slots[Number(slotIndex)])]),
  );
}

function constrainPositionsForSide(
  side: Side,
  positions: Record<number, PitchPosition>,
  players: Player[],
  positionLock: boolean,
  bounds: PitchPositionBounds,
): Record<number, PitchPosition> {
  if (!positionLock) return positions;
  const playersById = new Map(players.map((player) => [player.id, player]));
  return Object.fromEntries(Object.entries(positions).map(([playerIdText, position]) => {
    const playerId = Number(playerIdText);
    const player = playersById.get(playerId);
    const constrained = constrainPlayerPosition({
      side,
      role: player?.position,
      position,
      positionLock: true,
      bounds,
    });
    return [playerId, constrained ?? position];
  }));
}

function assignedPositions(
  side: Side,
  slots: FormationSlot[],
  assignments: Record<number, number | null>,
  players: Player[],
  positionLock: boolean,
  bounds: PitchPositionBounds,
): Record<number, PitchPosition> {
  return constrainPositionsForSide(side, defaultPositions(side, slots, assignments), players, positionLock, bounds);
}

function Pitch({
  squads,
  teams,
  formationBySide,
  assignments,
  playerPositions,
  onPlayerMove,
  onPitchBoundsChange,
}: {
  squads: Squad;
  teams: Record<Side, Team>;
  formationBySide: Record<Side, FormationName>;
  assignments: Assignments;
  playerPositions: PlayerPositions;
  onPlayerMove: (side: Side, playerId: number, position: PitchPosition, bounds: ReturnType<typeof getPitchDragBounds>) => void;
  onPitchBoundsChange: (bounds: PitchPositionBounds) => void;
}) {
  const sides: Side[] = ["home", "away"];
  const pitchRef = useRef<HTMLDivElement>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);
  const playerMap: Record<Side, Map<number, Player>> = {
    home: new Map(squads.home.map((player) => [player.id, player])),
    away: new Map(squads.away.map((player) => [player.id, player])),
  };

  useLayoutEffect(() => {
    const pitch = pitchRef.current;
    if (!pitch) return;
    const updateBounds = () => {
      const rect = pitch.getBoundingClientRect();
      onPitchBoundsChange(getPitchDragBounds(rect.width, rect.height));
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(pitch);
    return () => observer.disconnect();
  }, [onPitchBoundsChange]);

  const movePlayer = (side: Side, playerId: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    const pitch = pitchRef.current;
    if (!pitch) return;
    const bounds = pitch.getBoundingClientRect();
    const positionBounds = getPitchDragBounds(bounds.width, bounds.height);
    const x = Math.min(positionBounds.maxX, Math.max(positionBounds.minX, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.min(positionBounds.maxY, Math.max(positionBounds.minY, ((event.clientY - bounds.top) / bounds.height) * 100));
    onPlayerMove(side, playerId, { x, y }, positionBounds);
  };

  const beginDrag = (side: Side, playerId: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDraggingPlayerId(playerId);
    event.currentTarget.setPointerCapture(event.pointerId);
    movePlayer(side, playerId, event);
  };

  return (
    <div className="pitch-wrap">
      <div ref={pitchRef} className="pitch" role="group" aria-label={`${teams.home.name} ${formationBySide.home} versus ${teams.away.name} ${formationBySide.away}`}>
        <div className="pitch-lines" aria-hidden="true">
          <span className="pitch-boundary" />
          <span className="pitch-halfway" />
          <span className="pitch-center-circle" />
          <span className="pitch-center-spot" />
          <span className="pitch-box pitch-box--left" />
          <span className="pitch-box pitch-box--right" />
          <span className="pitch-six pitch-six--left" />
          <span className="pitch-six pitch-six--right" />
          <span className="pitch-spot pitch-spot--left" />
          <span className="pitch-spot pitch-spot--right" />
          <span className="pitch-arc pitch-arc--left" />
          <span className="pitch-arc pitch-arc--right" />
          <span className="pitch-corner pitch-corner--tl" />
          <span className="pitch-corner pitch-corner--tr" />
          <span className="pitch-corner pitch-corner--bl" />
          <span className="pitch-corner pitch-corner--br" />
        </div>
        <TeamConnectionLines connections={buildTeamConnections(
          { home: formations[formationBySide.home], away: formations[formationBySide.away] },
          assignments,
          playerPositions,
        )} />
        {sides.flatMap((side) => {
          const slots = formations[formationBySide[side]];
          const occupiedSlots = assignments[side];
          const assignedIds = Object.values(occupiedSlots).filter((id): id is number => id !== null);
          const emptySlots = slots.flatMap((slot, slotIndex) =>
            occupiedSlots[slotIndex] !== null && occupiedSlots[slotIndex] !== undefined
              ? []
              : [
                  <span
                    aria-hidden="true"
                    className="pitch-player pitch-player--empty"
                    key={`${side}-empty-${slotIndex}`}
                    style={{
                      left: `${pitchPosition(side, slot).x}%`,
                      top: `${slot.y}%`,
                    }}
                  >
                    <span className="player-token">+</span>
                  </span>,
                ],
          );
          const players = assignedIds.flatMap((playerId) => {
            const player = playerMap[side].get(playerId);
            const position = playerPositions[side][playerId];
            if (!player || !position) return [];
            const status = playerStatus(player);
            const playerLabel = `${teams[side].name}: ${player.name}, ${player.position}, ${statusLabel(status)}. Drag to move.`;
            return [
              <div
                className={`pitch-player pitch-player--${side}${status !== "active" ? ` is-${status}` : ""}${draggingPlayerId === playerId ? " is-dragging" : ""}`}
                key={`${side}-player-${player.id}`}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              >
                <button
                  type="button"
                  className="player-token"
                  aria-label={playerLabel}
                  title={playerLabel}
                  onPointerDown={(event) => beginDrag(side, player.id, event)}
                  onPointerMove={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) movePlayer(side, player.id, event);
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    setDraggingPlayerId(null);
                  }}
                  onPointerCancel={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    setDraggingPlayerId(null);
                  }}
                >
                  {player.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}
                  {status !== "active" && <span className="token-alert">!</span>}
                </button>
                <div className="pitch-player-card">
                  <span className="player-role">{player.position}</span>
                  <span className="player-card-meta">{player.name}</span>
                  <span className={`availability-chip status-${status}`}>{statusLabel(status)}</span>
                </div>
              </div>,
            ];
          });
          return [...emptySlots, ...players];
        })}
      </div>
    </div>
  );
}

function TeamPanel({
  side,
  team,
  teams,
  formation,
  squad,
  formationSlots,
  assignments,
  filter,
  onTeam,
  onFormation,
  onResetFormation,
  onFilter,
  onPlace,
}: {
  side: Side;
  team: Team;
  teams: Team[];
  formation: FormationName;
  squad: Player[];
  formationSlots: FormationSlot[];
  assignments: Record<number, number | null>;
  filter: AvailabilityFilter;
  onTeam: (teamId: number) => void;
  onFormation: (formation: FormationName) => void;
  onResetFormation: () => void;
  onFilter: (filter: AvailabilityFilter) => void;
  onPlace: (playerId: number, slotIndex: number | null) => void;
}) {
  const matchingPlayers = squad.filter((player) => filter === "all" || playerStatus(player) === filter);
  const counts = squad.reduce<Record<AvailabilityStatus, number>>(
    (result, player) => ({ ...result, [playerStatus(player)]: result[playerStatus(player)] + 1 }),
    { active: 0, doubtful: 0, injured: 0, suspended: 0 },
  );
  const label = side === "home" ? "01 · HOME SIDE" : "02 · AWAY SIDE";

  return (
    <section className={`team-panel team-panel--${side}`} aria-label={`${team.name} controls`}>
      <div className="team-panel-heading">
        <span className="side-label">{label}</span>
        <span className="team-count">{squad.length} PLAYERS</span>
      </div>
      <label className="control-label" htmlFor={`${side}-team`}>Team</label>
      <select id={`${side}-team`} className="control-select team-select" value={team.id} onChange={(event) => onTeam(Number(event.target.value))}>
        {teams.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      <div className="control-grid">
        <label>
          <span className="control-label">Formation</span>
          <select className="control-select" value={formation} onChange={(event) => onFormation(event.target.value as FormationName)}>
            {formationNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>
          <span className="control-label">Availability</span>
          <select className="control-select" value={filter} onChange={(event) => onFilter(event.target.value as AvailabilityFilter)}>
            {filters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <button className="reset-formation-button" type="button" onClick={onResetFormation}>
        ↺ Reset {side === "home" ? "Home" : "Away"} Formation
      </button>
      <div className="squad-summary" aria-live="polite">
        <span>PLAYER CHOICES</span>
        <strong>{matchingPlayers.length} <small>/ {squad.length}</small></strong>
      </div>
      <div className="status-legend" aria-label="Squad availability summary">
        {availabilityStatuses.map((value) => (
          <span key={value} className={`legend-item status-${value}`}>
            <i />{statusLabel(value)} <b>{counts[value]}</b>
          </span>
        ))}
      </div>
      {squad.length > 0 && matchingPlayers.length === 0 && (
        <p className="filter-empty">No players match this filter. Board placements are kept; choose “All availability” to see every squad option.</p>
      )}
      {matchingPlayers.length > 0 && (
        <div className="squad-picker" aria-label={`${team.name} player placement choices`}>
          {matchingPlayers.map((player) => {
            const placedSlot = Object.entries(assignments).find(([, playerId]) => playerId === player.id)?.[0];
            const status = playerStatus(player);
            return (
              <div className="squad-player-row" key={player.id}>
                <div className="squad-player-info">
                  <span className={`roster-status-dot status-${status}`} />
                  <span className="squad-player-name">{player.name}</span>
                  <span className="squad-player-position">{player.position}</span>
                  <span className={`roster-status status-${status}`}>{statusLabel(status)}</span>
                </div>
                <select
                  className="placement-select"
                  aria-label={`Place ${player.name} on the pitch`}
                  value={placedSlot ?? ""}
                  onChange={(event) => onPlace(player.id, event.target.value === "" ? null : Number(event.target.value))}
                >
                  <option value="">Not placed</option>
                  {formationSlots.map((slot, index) => {
                    const occupant = assignments[index];
                    return (
                      <option key={index} value={index}>
                        {slot.line} · position {index + 1}{occupant && occupant !== player.id ? " · replace player" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
      )}
      <p className="panel-hint">Choose a starting position here, then drag the player marker to create a custom shape.</p>
    </section>
  );
}

export default function TacticalBoard({ teams }: { teams: Team[] }) {
  const initialHome = teams[0];
  const initialAway = teams.find((team) => team.id !== initialHome.id) ?? teams[0];
  const [teamIds, setTeamIds] = useState<Record<Side, number>>({ home: initialHome.id, away: initialAway.id });
  const [formationBySide, setFormationBySide] = useState<Record<Side, FormationName>>({ home: "4-3-3", away: "4-4-2" });
  const [filterBySide, setFilterBySide] = useState<Record<Side, AvailabilityFilter>>({ home: "all", away: "all" });
  const [squads, setSquads] = useState<Squad>({ home: [], away: [] });
  const [assignments, setAssignments] = useState<Assignments>({ home: {}, away: {} });
  const [playerPositions, setPlayerPositions] = useState<PlayerPositions>({ home: {}, away: {} });
  const [positionLock, setPositionLock] = useState(false);
  const [pitchBounds, setPitchBounds] = useState<PitchPositionBounds>(NORMALIZED_PITCH_BOUNDS);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const formationRef = useRef(formationBySide);
  formationRef.current = formationBySide;
  const positionLockRef = useRef(positionLock);
  positionLockRef.current = positionLock;
  const pitchBoundsRef = useRef(pitchBounds);
  pitchBoundsRef.current = pitchBounds;

  const selectedTeams = useMemo(() => ({
    home: teams.find((team) => team.id === teamIds.home) ?? teams[0],
    away: teams.find((team) => team.id === teamIds.away) ?? teams[1] ?? teams[0],
  }), [teams, teamIds]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    const loadSquad = async (teamId: number) => {
      const response = await fetch(`/api/players?team_id=${teamId}`);
      if (!response.ok) throw new Error(`Could not load squad (HTTP ${response.status})`);
      return (await response.json()) as PlayerResponse;
    };
    Promise.all([loadSquad(teamIds.home), loadSquad(teamIds.away)])
      .then(([homeResponse, awayResponse]) => {
        if (!active) return;
        const nextSquads = { home: homeResponse.items, away: awayResponse.items };
        setSquads(nextSquads);
        const activeFormations = formationRef.current;
        const nextAssignments: Assignments = {
          home: defaultAssignments(formations[activeFormations.home], nextSquads.home),
          away: defaultAssignments(formations[activeFormations.away], nextSquads.away),
        };
        setAssignments(nextAssignments);
        setPlayerPositions({
          home: assignedPositions("home", formations[activeFormations.home], nextAssignments.home, nextSquads.home, positionLockRef.current, pitchBoundsRef.current),
          away: assignedPositions("away", formations[activeFormations.away], nextAssignments.away, nextSquads.away, positionLockRef.current, pitchBoundsRef.current),
        });
      })
      .catch((requestError: unknown) => {
        if (active) setLoadError(requestError instanceof Error ? requestError.message : "Could not load player data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [teamIds.home, teamIds.away]);

  const changeFormation = (side: Side, formation: FormationName) => {
    setFormationBySide((current) => ({ ...current, [side]: formation }));
    const nextAssignments = defaultAssignments(formations[formation], squads[side]);
    setAssignments((current) => ({
      ...current,
      [side]: nextAssignments,
    }));
    setPlayerPositions((current) => ({
      ...current,
      [side]: assignedPositions(side, formations[formation], nextAssignments, squads[side], positionLock, pitchBounds),
    }));
  };

  const resetFormation = (side: Side) => {
    const slots = formations[formationBySide[side]];
    const nextAssignments = defaultAssignments(slots, squads[side]);
    setAssignments((current) => ({ ...current, [side]: nextAssignments }));
    setPlayerPositions((current) => ({
      ...current,
      [side]: assignedPositions(side, slots, nextAssignments, squads[side], positionLock, pitchBounds),
    }));
  };

  const changeTeam = (side: Side, teamId: number) => {
    const other: Side = side === "home" ? "away" : "home";
    const previousId = teamIds[side];
    const otherId = teamIds[other];
    if (teamId === otherId) {
      setTeamIds((current) => ({ ...current, [side]: teamId, [other]: previousId }));
    } else {
      setTeamIds((current) => ({ ...current, [side]: teamId }));
    }
  };

  const placePlayer = (side: Side, playerId: number, slotIndex: number | null) => {
    const replacedPlayerId = slotIndex === null ? null : assignments[side][slotIndex];
    setAssignments((current) => {
      const nextSide = Object.fromEntries(
        Object.entries(current[side]).filter(([, assignedId]) => assignedId !== playerId),
      ) as Record<number, number | null>;
      if (slotIndex !== null) nextSide[slotIndex] = playerId;
      return { ...current, [side]: nextSide };
    });
    setPlayerPositions((current) => {
      const nextSide = { ...current[side] };
      delete nextSide[playerId];
      if (replacedPlayerId !== null) delete nextSide[replacedPlayerId];
      if (slotIndex !== null) {
        const player = squads[side].find((candidate) => candidate.id === playerId);
        const position = pitchPosition(side, formations[formationBySide[side]][slotIndex]);
        nextSide[playerId] = constrainPlayerPosition({
          side,
          role: player?.position,
          position,
          positionLock,
          bounds: pitchBounds,
        }) ?? position;
      }
      return { ...current, [side]: nextSide };
    });
  };

  const movePlayer = (
    side: Side,
    playerId: number,
    position: PitchPosition,
    bounds: ReturnType<typeof getPitchDragBounds>,
  ) => {
    const player = squads[side].find((candidate) => candidate.id === playerId);
    const constrained = constrainPlayerPosition({
      side,
      role: player?.position,
      position,
      positionLock,
      bounds,
    });
    if (!constrained) return;
    setPlayerPositions((current) => ({
      ...current,
      [side]: { ...current[side], [playerId]: constrained },
    }));
  };

  const togglePositionLock = () => {
    if (positionLock) {
      setPositionLock(false);
      return;
    }
    setPlayerPositions((current) => ({
      home: constrainPositionsForSide("home", current.home, squads.home, true, pitchBounds),
      away: constrainPositionsForSide("away", current.away, squads.away, true, pitchBounds),
    }));
    setPositionLock(true);
  };

  useEffect(() => {
    if (!positionLock) return;
    setPlayerPositions((current) => ({
      home: constrainPositionsForSide("home", current.home, squads.home, true, pitchBounds),
      away: constrainPositionsForSide("away", current.away, squads.away, true, pitchBounds),
    }));
  }, [pitchBounds, positionLock, squads.home, squads.away]);

  const sides: Side[] = ["home", "away"];
  const placedCounts = sides.map((side) => Object.values(assignments[side]).filter((id) => id !== null).length);
  const analysis = useMemo(() => {
    const homeInput = { side: "home" as const, players: squads.home, positions: playerPositions.home };
    const awayInput = { side: "away" as const, players: squads.away, positions: playerPositions.away };
    return {
      metrics: {
        home: calculateTeamMetrics(homeInput),
        away: calculateTeamMetrics(awayInput),
      },
      zones: calculateZoneOccupancy(homeInput, awayInput),
    };
  }, [squads.home, squads.away, playerPositions.home, playerPositions.away]);
  const insights = useMemo(() => calculateTacticalInsights({
    metrics: analysis.metrics,
    zones: analysis.zones,
    teams: { home: selectedTeams.home, away: selectedTeams.away },
  }), [analysis, selectedTeams.home, selectedTeams.away]);

  return (
    <>
      <section className="board-controls" aria-label="Matchup controls">
        <TeamPanel
          side="home" team={selectedTeams.home} teams={teams} formation={formationBySide.home}
          squad={squads.home} formationSlots={formations[formationBySide.home]} assignments={assignments.home} filter={filterBySide.home}
          onTeam={(id) => changeTeam("home", id)}
          onFormation={(formation) => changeFormation("home", formation)}
          onResetFormation={() => resetFormation("home")}
          onFilter={(filter) => setFilterBySide((current) => ({ ...current, home: filter }))}
          onPlace={(playerId, slotIndex) => placePlayer("home", playerId, slotIndex)}
        />
        <div className="versus-block">
          <span className="versus-kicker">THE MATCHUP</span>
          <span className="versus-mark">VS</span>
          <span className="versus-caption">FORMATION<br />COMPARISON</span>
        </div>
        <TeamPanel
          side="away" team={selectedTeams.away} teams={teams} formation={formationBySide.away}
          squad={squads.away} formationSlots={formations[formationBySide.away]} assignments={assignments.away} filter={filterBySide.away}
          onTeam={(id) => changeTeam("away", id)}
          onFormation={(formation) => changeFormation("away", formation)}
          onResetFormation={() => resetFormation("away")}
          onFilter={(filter) => setFilterBySide((current) => ({ ...current, away: filter }))}
          onPlace={(playerId, slotIndex) => placePlayer("away", playerId, slotIndex)}
        />
      </section>

      {loadError ? <div className="board-error" role="alert">{loadError}</div> : loading ? (
        <div className="board-loading" aria-live="polite">Loading both squads from the demo API…</div>
      ) : (
        <>
          <section className="pitch-section" aria-label="Tactical formation board">
            <div className="pitch-heading">
              <div>
                <span className="pitch-kicker">TACTICAL BOARD</span>
                <h2>Starting shapes</h2>
                <p className="pitch-instructions">DRAG PLAYER MARKERS TO CUSTOMIZE · RESET EACH SIDE INDEPENDENTLY</p>
              </div>
              <div className="pitch-tools">
                <div className="pitch-key">
                  <span><i className="key-dot key-dot--home" />{selectedTeams.home.name}</span>
                  <span><i className="key-dot key-dot--away" />{selectedTeams.away.name}</span>
                </div>
                <button
                  className={`position-lock-toggle${positionLock ? " is-locked" : ""}`}
                  type="button"
                  aria-pressed={positionLock}
                  onClick={togglePositionLock}
                >
                  <span>Position Lock</span>
                  <strong>{positionLock ? "ON" : "OFF"}</strong>
                  <small>{positionLock ? "Role-constrained movement" : "Free movement"}</small>
                </button>
              </div>
            </div>
            <Pitch
              squads={squads}
              teams={selectedTeams}
              formationBySide={formationBySide}
              assignments={assignments}
              playerPositions={playerPositions}
              onPlayerMove={movePlayer}
              onPitchBoundsChange={setPitchBounds}
            />
            <div className="pitch-footnote">
              <span><strong>{formationBySide.home}</strong> {selectedTeams.home.name} <i>·</i> {placedCounts[0]} of 11 assigned</span>
              <span>{placedCounts[1]} of 11 assigned <i>·</i> {selectedTeams.away.name} <strong>{formationBySide.away}</strong></span>
            </div>
            {(squads.home.length < 11 || squads.away.length < 11) && (
              <p className="roster-note"><span>i</span> Demo squads have {squads.home.length} and {squads.away.length} players. Unfilled positions remain open; players are never silently substituted.</p>
            )}
          </section>
          <section className="availability-note" aria-label="Availability legend">
            <div>
              <span className="note-icon">!</span>
              <p><strong>Availability stays visible.</strong> Filtered players remain on the pitch if assigned. Status badges flag doubtful, injured, or suspended players.</p>
            </div>
            <span className="availability-note-side">PLAYER STATUS IS CURRENT DEMO DATA</span>
          </section>
          <div className="analysis-toggle-row">
            <button
              className="analysis-toggle"
              type="button"
              aria-pressed={analysisEnabled}
              onClick={() => setAnalysisEnabled((enabled) => !enabled)}
            >
              <span>Tactical Analysis</span>
              <strong>{analysisEnabled ? "ON" : "OFF"}</strong>
            </button>
          </div>
          {analysisEnabled && (
            <TacticalAnalysis teams={selectedTeams} metrics={analysis.metrics} zones={analysis.zones} insights={insights} />
          )}
        </>
      )}
    </>
  );
}
