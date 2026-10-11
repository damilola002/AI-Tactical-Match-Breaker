import assert from "node:assert/strict";
import test from "node:test";
import { canDragPitchPlayer, canOpenPlayerAfterGesture, shouldOpenPlayerClick, startPitchGesture, updatePitchGesture, cancelPitchGesture } from "./pitchActivation.ts";

test("a short pointer gesture remains a player-card click", () => {
  const gesture = updatePitchGesture(startPitchGesture(1, 20, 30), 23, 32);
  assert.equal(canOpenPlayerAfterGesture(gesture), true);
});

test("movement at the drag threshold suppresses player-card activation", () => {
  const gesture = updatePitchGesture(startPitchGesture(1, 20, 30), 26, 30);
  assert.equal(gesture.moved, true);
  assert.equal(canOpenPlayerAfterGesture(gesture), false);
});

test("a canceled pointer gesture never opens a player card", () => {
  const gesture = cancelPitchGesture(startPitchGesture(1, 20, 30));
  assert.equal(canOpenPlayerAfterGesture(gesture), false);
});

test("once a drag begins, returning to the start does not turn it into a click", () => {
  const started = startPitchGesture(1, 20, 30);
  const dragged = updatePitchGesture(started, 30, 30);
  const returned = updatePitchGesture(dragged, 20, 30);
  assert.equal(returned.moved, true);
  assert.equal(canOpenPlayerAfterGesture(returned), false);
});

test("only live outfield players with a move handler can be dragged", () => {
  assert.equal(canDragPitchPlayer("live", false, true), true);
  assert.equal(canDragPitchPlayer("live", true, true), false);
  assert.equal(canDragPitchPlayer("planner", false, true), false);
  assert.equal(canDragPitchPlayer("snapshot", false, true), false);
  assert.equal(canDragPitchPlayer("live", false, false), false);
});

test("keyboard clicks activate independently from pointer gestures", () => {
  assert.equal(shouldOpenPlayerClick(0, false), true);
  assert.equal(shouldOpenPlayerClick(1, true), true);
  assert.equal(shouldOpenPlayerClick(1, false), false);
});
