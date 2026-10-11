export type PitchPointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  cancelled: boolean;
};

export const PLAYER_DRAG_THRESHOLD_PX = 6;

export function startPitchGesture(pointerId: number, x: number, y: number): PitchPointerGesture {
  return { pointerId, startX: x, startY: y, moved: false, cancelled: false };
}

export function updatePitchGesture(gesture: PitchPointerGesture, x: number, y: number): PitchPointerGesture {
  if (gesture.moved || gesture.cancelled) return gesture;
  const distance = Math.hypot(x - gesture.startX, y - gesture.startY);
  return distance >= PLAYER_DRAG_THRESHOLD_PX ? { ...gesture, moved: true } : gesture;
}

export function cancelPitchGesture(gesture: PitchPointerGesture): PitchPointerGesture {
  return { ...gesture, cancelled: true };
}

export function canOpenPlayerAfterGesture(gesture: PitchPointerGesture): boolean {
  return !gesture.moved && !gesture.cancelled;
}

export function canDragPitchPlayer(mode: "planner" | "live" | "snapshot", isGoalkeeper: boolean, hasMoveHandler: boolean): boolean {
  return mode === "live" && !isGoalkeeper && hasMoveHandler;
}

export function shouldOpenPlayerClick(clickDetail: number, pointerGestureAllowed: boolean): boolean {
  return clickDetail === 0 || pointerGestureAllowed;
}
