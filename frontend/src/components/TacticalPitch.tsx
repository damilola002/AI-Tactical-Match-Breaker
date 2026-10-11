import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { buildTeamConnections } from "../analysis/teamConnections.ts";
import { FORMATIONS, formationPosition } from "../analysis/formations.ts";
import { getPitchDragBounds } from "../analysis/positionConstraints.ts";
import { canDragPitchPlayer, canOpenPlayerAfterGesture, shouldOpenPlayerClick, startPitchGesture, updatePitchGesture, type PitchPointerGesture } from "../analysis/pitchActivation.ts";
import { mapPlayerRole } from "../analysis/tacticalMetrics.ts";
import TeamConnectionLines from "./TeamConnectionLines";
import type { FormationName, FormationSlot, PitchPosition, Side, Team } from "../types.ts";

export type PitchTokenPlayer = {
  id: number;
  name: string;
  position: string;
  availability: "active" | "doubtful" | "injured" | "suspended";
  slotIndex: number;
  coordinates: PitchPosition;
};

export type PitchMode = "planner" | "live" | "snapshot";

type Props = {
  teams: Record<Side, Team>;
  formationBySide: Record<Side, FormationName>;
  playersBySide: Record<Side, PitchTokenPlayer[]>;
  mode: PitchMode;
  onPlayerMove?: (side: Side, playerId: number, position: PitchPosition) => void;
  onOpenPlayer?: (playerId: number, opener?: HTMLElement) => void;
};

function lineForSlot(slot: FormationSlot) {
  return slot.line.toLowerCase();
}

export default function TacticalPitch({ teams, formationBySide, playersBySide, mode, onPlayerMove, onOpenPlayer }: Props) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<PitchPointerGesture | null>(null);
  const pointerClickAllowed = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const assignments = useMemo(() => ({
    home: Object.fromEntries(playersBySide.home.map((player) => [player.slotIndex, player.id])),
    away: Object.fromEntries(playersBySide.away.map((player) => [player.slotIndex, player.id])),
  }), [playersBySide]);
  const positions = useMemo(() => ({
    home: Object.fromEntries(playersBySide.home.map((player) => [player.id, player.coordinates])),
    away: Object.fromEntries(playersBySide.away.map((player) => [player.id, player.coordinates])),
  }), [playersBySide]);
  const connections = useMemo(() => mode === "planner" ? [] : buildTeamConnections(
    { home: FORMATIONS[formationBySide.home], away: FORMATIONS[formationBySide.away] },
    assignments,
    positions,
  ), [mode, formationBySide, assignments, positions]);

  const moveAtPointer = (side: Side, player: PitchTokenPlayer, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (mode !== "live" || mapPlayerRole(player.position) === "goalkeeper" || !onPlayerMove) return;
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const bounds = getPitchDragBounds(rect.width, rect.height);
    const x = Math.min(bounds.maxX, Math.max(bounds.minX, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(bounds.maxY, Math.max(bounds.minY, ((event.clientY - rect.top) / rect.height) * 100));
    onPlayerMove(side, player.id, { x, y });
  };

  const beginDrag = (player: PitchTokenPlayer, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    pointerClickAllowed.current = false;
    gestureRef.current = startPitchGesture(event.pointerId, event.clientX, event.clientY);
    if (canDragPitchPlayer(mode, mapPlayerRole(player.position) === "goalkeeper", Boolean(onPlayerMove))) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  return (
    <div className="pitch-wrap">
      <div
        ref={pitchRef}
        className={`pitch pitch--${mode}`}
        role="group"
        aria-label={`${teams.home.name} ${formationBySide.home} versus ${teams.away.name} ${formationBySide.away}`}
      >
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
        {connections.length > 0 && <TeamConnectionLines connections={connections} />}
        {(["home", "away"] as const).flatMap((side) => {
          const slots = FORMATIONS[formationBySide[side]];
          const bySlot = new Map(playersBySide[side].map((player) => [player.slotIndex, player]));
          return slots.flatMap((slot, slotIndex) => {
            const player = bySlot.get(slotIndex);
            if (!player) {
              const position = formationPosition(side, slot);
              return [
                <span
                  aria-label={`${teams[side].name}: empty ${slot.line} position ${slotIndex + 1}`}
                  className="pitch-player pitch-player--empty"
                  key={`${side}-empty-${slotIndex}`}
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                ><span className="player-token" aria-hidden="true">+</span></span>,
              ];
            }
            const fixedGoalkeeper = mapPlayerRole(player.position) === "goalkeeper";
            const tokenKey = `${side}:${player.id}`;
            return [
              <div
                className={`pitch-player pitch-player--${side} pitch-player--${lineForSlot(slot)}${player.availability !== "active" ? ` is-${player.availability}` : ""}${dragging === tokenKey ? " is-dragging" : ""}`}
                key={tokenKey}
                style={{ left: `${player.coordinates.x}%`, top: `${player.coordinates.y}%` }}
              >
                <button
                  type="button"
                  className="player-token"
                  aria-label={`${teams[side].name}: ${player.name}, ${player.position}, ${player.availability}${fixedGoalkeeper && mode === "live" ? ", fixed goalkeeper" : ""}`}
                  title={`${player.name} · ${player.position} · ${player.availability}`}
                  onPointerDown={(event) => beginDrag(player, event)}
                  onPointerMove={(event) => {
                    const gesture = gestureRef.current;
                    if (!gesture || gesture.pointerId !== event.pointerId) return;
                    const updated = updatePitchGesture(gesture, event.clientX, event.clientY);
                    gestureRef.current = updated;
                    if (!updated.moved || updated.cancelled || !canDragPitchPlayer(mode, fixedGoalkeeper, Boolean(onPlayerMove))) return;
                    setDragging(tokenKey);
                    moveAtPointer(side, player, event);
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    const gesture = gestureRef.current;
                    pointerClickAllowed.current = Boolean(gesture && gesture.pointerId === event.pointerId && canOpenPlayerAfterGesture(gesture));
                    gestureRef.current = null;
                    setDragging(null);
                  }}
                  onPointerCancel={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null;
                    pointerClickAllowed.current = false;
                    setDragging(null);
                  }}
                  onClick={(event) => {
                    const shouldOpen = shouldOpenPlayerClick(event.detail, pointerClickAllowed.current);
                    pointerClickAllowed.current = false;
                    if (!shouldOpen) return;
                    onOpenPlayer?.(player.id, event.currentTarget);
                  }}
                >
                  {player.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}
                  {player.availability !== "active" && <span className="token-alert">!</span>}
                </button>
                <div className="pitch-player-card">
                  <span className="player-role">{slot.line} · {player.position}</span>
                  <span className="player-card-meta">{player.name}</span>
                  <span className={`availability-chip status-${player.availability}`}>{player.availability}</span>
                  {fixedGoalkeeper && mode === "live" && <span className="keeper-lock-label">FIXED</span>}
                  {onOpenPlayer && <button className="player-profile-link" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => onOpenPlayer(player.id, event.currentTarget)}>View profile</button>}
                </div>
              </div>,
            ];
          });
        })}
      </div>
    </div>
  );
}
