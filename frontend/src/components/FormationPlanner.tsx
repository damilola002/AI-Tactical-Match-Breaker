import { useMemo, useState } from "react";
import { FORMATIONS, FORMATION_NAMES, positionsForAssignments } from "../analysis/formations.ts";
import TacticalPitch from "./TacticalPitch";
import { useScenario } from "../state/ScenarioProvider.tsx";
import type { AvailabilityStatus, FormationName, Player, Side } from "../types.ts";

type Filter = "all" | AvailabilityStatus;
const availabilityFilters: { value: Filter; label: string }[] = [
  { value: "all", label: "All availability" },
  { value: "active", label: "Active" },
  { value: "doubtful", label: "Doubtful" },
  { value: "injured", label: "Injured" },
  { value: "suspended", label: "Suspended" },
];

function TeamPlanner({ side, filter, onFilter, onOpenPlayer }: {
  side: Side;
  filter: Filter;
  onFilter: (value: Filter) => void;
  onOpenPlayer: (playerId: number) => void;
}) {
  const { state, dispatch, selectTeam, selectedTeams, playersBySide } = useScenario();
  const team = selectedTeams[side];
  const roster = playersBySide[side];
  const formation = state.formationBySide[side];
  const assignments = state.assignments[side];
  const selectedChoices = useMemo(
    () => roster.filter((player) => filter === "all" || (player.availability?.status ?? "active") === filter),
    [roster, filter],
  );
  const loading = Boolean(state.rosterRequestIds[team.id]);
  const counts = roster.reduce<Record<AvailabilityStatus, number>>((summary, player) => {
    const status = player.availability?.status ?? "active";
    summary[status] += 1;
    return summary;
  }, { active: 0, doubtful: 0, injured: 0, suspended: 0 });

  return (
    <section className={`planner-team planner-team--${side}`} aria-label={`${side} team planner`}>
      <div className="planner-team-heading">
        <span className="side-label">{side === "home" ? "01 · HOME SIDE" : "02 · AWAY SIDE"}</span>
        <span className="team-count">{roster.length} PLAYERS</span>
      </div>
      <label className="control-label" htmlFor={`${side}-team`}>Team</label>
      <select id={`${side}-team`} className="control-select" value={team.id} onChange={(event) => selectTeam(side, Number(event.target.value))}>
        {state.teams.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
      </select>
      <label className="control-label" htmlFor={`${side}-formation`}>Formation</label>
      <select
        id={`${side}-formation`}
        className="control-select"
        value={formation}
        onChange={(event) => dispatch({ type: "FORMATION_SELECTED", side, formation: event.target.value as FormationName })}
      >
        {FORMATION_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <label className="control-label" htmlFor={`${side}-availability`}>Available player choices</label>
      <select id={`${side}-availability`} className="control-select" value={filter} onChange={(event) => onFilter(event.target.value as Filter)}>
        {availabilityFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <div className="availability-counts" aria-label="Squad status counts">
        {availabilityFilters.slice(1).map(({ value, label }) => value === "all" ? null : <span key={value}>{label} <b>{counts[value]}</b></span>)}
      </div>
      {loading ? <p className="planner-roster-state" role="status">Loading this team’s players…</p> : state.rosterErrors[team.id] ? (
        <p className="planner-roster-state planner-roster-state--error" role="alert">{state.rosterErrors[team.id]}</p>
      ) : (
        <div className="planner-roster" aria-label={`${team.name} player assignments`}>
          {selectedChoices.map((player) => {
            const status = player.availability?.status ?? "active";
            const assignedSlot = Object.entries(assignments).find(([, id]) => id === player.id)?.[0] ?? "";
            return (
              <div className="planner-player-row" key={player.id}>
                <button type="button" className="planner-player-name" onClick={() => onOpenPlayer(player.id)}>
                  <span className={`roster-status-dot status-${status}`} />
                  <span>{player.name}</span>
                  <small>{player.position} · {status}</small>
                </button>
                <select
                  className="placement-select"
                  aria-label={`Formation slot for ${player.name}`}
                  value={assignedSlot}
                  onChange={(event) => dispatch({ type: "PLAYER_ASSIGNED", side, playerId: player.id, slotIndex: event.target.value === "" ? null : Number(event.target.value) })}
                >
                  <option value="">Not assigned</option>
                  {FORMATIONS[formation].map((slot, slotIndex) => {
                    const occupant = assignments[slotIndex];
                    return <option key={slotIndex} value={slotIndex}>{slot.line} · slot {slotIndex + 1}{occupant && occupant !== player.id ? " · replace" : ""}</option>;
                  })}
                </select>
              </div>
            );
          })}
          {selectedChoices.length === 0 && <p className="planner-roster-state">No players match this filter. Assigned players stay on the pitch.</p>}
        </div>
      )}
      <p className="panel-hint">Changing formation preserves compatible assignments and returns unmatched players to this roster.</p>
    </section>
  );
}

export default function FormationPlanner({ onOpenPlayer }: { onOpenPlayer: (playerId: number) => void }) {
  const { state, selectedTeams, playersBySide } = useScenario();
  const [filters, setFilters] = useState<Record<Side, Filter>>({ home: "all", away: "all" });
  const playersForSide = (side: Side) => {
    const roster = new Map(playersBySide[side].map((player) => [player.id, player]));
    return Object.entries(state.assignments[side]).flatMap(([slotText, playerId]) => {
      if (playerId === null) return [];
      const player: Player | undefined = roster.get(playerId);
      const slotIndex = Number(slotText);
      const slot = FORMATIONS[state.formationBySide[side]][slotIndex];
      if (!player || !slot) return [];
      return [{
        id: player.id,
        name: player.name,
        position: player.position,
        availability: player.availability?.status ?? "active" as const,
        slotIndex,
        coordinates: positionsForAssignments(side, state.formationBySide[side], state.assignments[side])[player.id],
      }];
    });
  };
  const homePlayers = playersForSide("home");
  const awayPlayers = playersForSide("away");

  return (
    <div className="page-content formation-planner-page">
      <section className="page-intro">
        <p className="eyebrow"><span className="eyebrow-line" /> BUILD YOUR STARTING SHAPES</p>
        <h1>Formation <em>Planner.</em></h1>
        <p>Choose each side’s formation and assign compatible players. This is the fixed setup used by the Free Tactical Board.</p>
      </section>
      <div className="planner-grid">
        <TeamPlanner side="home" filter={filters.home} onFilter={(value) => setFilters((current) => ({ ...current, home: value }))} onOpenPlayer={onOpenPlayer} />
        <div className="planner-vs" aria-hidden="true">VS</div>
        <TeamPlanner side="away" filter={filters.away} onFilter={(value) => setFilters((current) => ({ ...current, away: value }))} onOpenPlayer={onOpenPlayer} />
      </div>
      <section className="pitch-section" aria-label="Formation planner preview">
        <div className="pitch-heading"><div><span className="pitch-kicker">PLANNER PREVIEW</span><h2>Starting positions</h2><p className="pitch-instructions">PLAYERS STAY IN THEIR ASSIGNED FORMATION SLOTS</p></div></div>
        <TacticalPitch
          teams={selectedTeams}
          formationBySide={state.formationBySide}
          playersBySide={{ home: homePlayers, away: awayPlayers }}
          mode="planner"
          onOpenPlayer={onOpenPlayer}
        />
        <div className="pitch-footnote">
          <span><strong>{state.formationBySide.home}</strong> {selectedTeams.home.name} · {homePlayers.length}/11 assigned</span>
          <span>{awayPlayers.length}/11 assigned · {selectedTeams.away.name} <strong>{state.formationBySide.away}</strong></span>
        </div>
      </section>
    </div>
  );
}
