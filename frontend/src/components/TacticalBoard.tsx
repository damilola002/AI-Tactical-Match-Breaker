import { useMemo } from "react";
import { calculateTeamMetrics, calculateZoneOccupancy } from "../analysis/tacticalMetrics.ts";
import { calculateTacticalInsights } from "../analysis/tacticalInsights.ts";
import { FORMATIONS } from "../analysis/formations.ts";
import TacticalAnalysis from "./TacticalAnalysis";
import TacticalPitch from "./TacticalPitch";
import { useScenario } from "../state/ScenarioProvider.tsx";
import type { PitchTokenPlayer } from "./TacticalPitch";
import type { Side } from "../types.ts";

export default function TacticalBoard({ onOpenPlayer }: { onOpenPlayer: (playerId: number) => void }) {
  const { state, selectedTeams, playersBySide, dispatch, generateReport } = useScenario();
  const playersForSide = (side: Side): PitchTokenPlayer[] => {
    const roster = new Map(playersBySide[side].map((player) => [player.id, player]));
    return Object.entries(state.assignments[side]).flatMap(([slotText, playerId]) => {
      if (playerId === null) return [];
      const player = roster.get(playerId);
      const slotIndex = Number(slotText);
      const slot = FORMATIONS[state.formationBySide[side]][slotIndex];
      const coordinates = state.freePositions[side][playerId];
      if (!player || !slot || !coordinates) return [];
      return [{
        id: player.id,
        name: player.name,
        position: player.position,
        availability: player.availability?.status ?? "active" as const,
        slotIndex,
        coordinates,
      }];
    });
  };
  const homePlayers = playersForSide("home");
  const awayPlayers = playersForSide("away");
  const analysis = useMemo(() => {
    const homeInput = { side: "home" as const, players: playersBySide.home, positions: state.freePositions.home };
    const awayInput = { side: "away" as const, players: playersBySide.away, positions: state.freePositions.away };
    return {
      metrics: { home: calculateTeamMetrics(homeInput), away: calculateTeamMetrics(awayInput) },
      zones: calculateZoneOccupancy(homeInput, awayInput),
    };
  }, [playersBySide.home, playersBySide.away, state.freePositions.home, state.freePositions.away]);
  const insights = useMemo(() => calculateTacticalInsights({
    metrics: analysis.metrics,
    zones: analysis.zones,
    teams: selectedTeams,
  }), [analysis, selectedTeams]);
  const assigned = {
    home: homePlayers.length,
    away: awayPlayers.length,
  };
  const loading = ["home", "away"].some((side) => {
    const teamId = state.teamIds[side as Side];
    return !state.rostersByTeamId[teamId] && Boolean(state.rosterRequestIds[teamId]);
  });

  return (
    <div className="page-content tactical-board-page">
      <section className="page-intro">
        <p className="eyebrow"><span className="eyebrow-line" /> LIVE TACTICAL SCENARIO</p>
        <h1>Free Tactical <em>Board.</em></h1>
        <p>Move outfield players across the pitch. Goalkeepers stay at their formation starting positions.</p>
      </section>
      {loading && <p className="planner-roster-state" role="status">Loading both team rosters…</p>}
      {(state.rosterErrors[state.teamIds.home] || state.rosterErrors[state.teamIds.away]) && (
        <p className="planner-roster-state planner-roster-state--error" role="alert">
          {state.rosterErrors[state.teamIds.home] || state.rosterErrors[state.teamIds.away]}
        </p>
      )}
      <section className="pitch-section" aria-label="Free tactical board">
        <div className="pitch-heading">
          <div><span className="pitch-kicker">TACTICAL BOARD</span><h2>Live positions</h2><p className="pitch-instructions">OUTFIELD PLAYERS MOVE FREELY · GOALKEEPERS ARE FIXED</p></div>
          <div className="board-actions">
            <button className="reset-formation-button" type="button" onClick={() => dispatch({ type: "FORMATION_RESET" })}>↺ Reset to formations</button>
            <button className="report-generate-button" type="button" onClick={generateReport} disabled={state.reportStatus === "loading" || loading}>
              {state.reportStatus === "loading" ? "Generating…" : "Generate Report"}
            </button>
          </div>
        </div>
        <div className="pitch-key"><span><i className="key-dot key-dot--home" />{selectedTeams.home.name} · {state.formationBySide.home}</span><span><i className="key-dot key-dot--away" />{selectedTeams.away.name} · {state.formationBySide.away}</span></div>
        <TacticalPitch
          teams={selectedTeams}
          formationBySide={state.formationBySide}
          playersBySide={{ home: homePlayers, away: awayPlayers }}
          mode="live"
          onPlayerMove={(side, playerId, position) => dispatch({ type: "PLAYER_MOVED", side, playerId, position })}
          onOpenPlayer={onOpenPlayer}
        />
        <div className="pitch-footnote"><span>{assigned.home} of 11 assigned · {selectedTeams.home.name}</span><span>{selectedTeams.away.name} · {assigned.away} of 11 assigned</span></div>
        {(playersBySide.home.length < 11 || playersBySide.away.length < 11) && (
          <p className="roster-note"><span>i</span> Demo squads have {playersBySide.home.length} and {playersBySide.away.length} players. Empty positions remain open.</p>
        )}
      </section>
      <section className="availability-note" aria-label="Availability legend"><div><span className="note-icon">!</span><p><strong>Availability stays visible.</strong> Assigned players remain on the pitch with their current status, regardless of roster filters.</p></div><span className="availability-note-side">DEMO PLAYER STATUS</span></section>
      {state.reportError && <p className="report-state report-state--error" role="alert">{state.reportError}</p>}
      {state.reportStatus === "loading" && <p className="report-state" role="status">Generating from the captured positions and stored demo history…</p>}
      <TacticalAnalysis teams={selectedTeams} metrics={analysis.metrics} zones={analysis.zones} insights={insights} />
    </div>
  );
}
