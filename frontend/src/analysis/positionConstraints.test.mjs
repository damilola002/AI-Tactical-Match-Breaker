import assert from "node:assert/strict";
import test from "node:test";
import {
  constrainPlayerPosition,
  getPitchDragBounds,
  NORMALIZED_PITCH_BOUNDS,
} from "./positionConstraints.ts";

function constrain(role, x, side = "home", options = {}) {
  return constrainPlayerPosition({
    side,
    role,
    position: { x, y: options.y ?? 50 },
    positionLock: options.positionLock ?? true,
    bounds: options.bounds ?? NORMALIZED_PITCH_BOUNDS,
  });
}

test("Position Lock OFF preserves free movement within pitch bounds", () => {
  assert.deepEqual(constrain("Defender", 88, "home", {
    positionLock: false,
    bounds: { minX: 5, maxX: 95, minY: 4, maxY: 96 },
  }), { x: 88, y: 50 });
  assert.deepEqual(constrain("Defender", 101, "home", {
    positionLock: false,
    bounds: { minX: 5, maxX: 95, minY: 4, maxY: 96 },
  }), { x: 95, y: 50 });
});

test("goalkeepers remain inside their role zone and clamp at its edge", () => {
  assert.deepEqual(constrain("GK", 12), { x: 12, y: 50 });
  assert.deepEqual(constrain("Goalkeeper", 24), { x: 16, y: 50 });
});

test("defenders remain inside their role zone and clamp at its edge", () => {
  assert.deepEqual(constrain("CB", 30), { x: 30, y: 50 });
  assert.deepEqual(constrain("LB", 44), { x: 35, y: 50 });
});

test("midfielders remain inside their role zone and clamp at either edge", () => {
  assert.deepEqual(constrain("CM", 50), { x: 50, y: 50 });
  assert.deepEqual(constrain("CDM", 10), { x: 28, y: 50 });
  assert.deepEqual(constrain("CAM", 90), { x: 72, y: 50 });
});

test("forwards remain inside their role zone and clamp at its edge", () => {
  assert.deepEqual(constrain("ST", 65), { x: 65, y: 50 });
  assert.deepEqual(constrain("RW", 25), { x: 38, y: 50 });
});

test("exact role-zone boundaries are inclusive", () => {
  assert.deepEqual(constrain("GK", 16), { x: 16, y: 50 });
  assert.deepEqual(constrain("DEF", 35), { x: 35, y: 50 });
  assert.deepEqual(constrain("MID", 28), { x: 28, y: 50 });
  assert.deepEqual(constrain("MID", 72), { x: 72, y: 50 });
  assert.deepEqual(constrain("FWD", 38), { x: 38, y: 50 });
  assert.deepEqual(constrain("FWD", 100), { x: 100, y: 50 });
});

test("Away role zones mirror Home's attack-relative constraints", () => {
  assert.deepEqual(constrain("GK", 80, "away"), { x: 84, y: 50 });
  assert.deepEqual(constrain("DEF", 55, "away"), { x: 65, y: 50 });
  assert.deepEqual(constrain("LM", 90, "away"), { x: 72, y: 50 });
  assert.deepEqual(constrain("LW", 75, "away"), { x: 62, y: 50 });
});

test("role zones intersect with responsive pitch bounds and y remains pitch-clamped only", () => {
  assert.deepEqual(constrain("GK", 1, "home", {
    y: 110,
    bounds: { minX: 6, maxX: 94, minY: 3, maxY: 97 },
  }), { x: 6, y: 97 });
  assert.deepEqual(constrain("GK", 100, "away", {
    bounds: { minX: 6, maxX: 94, minY: 3, maxY: 97 },
  }), { x: 94, y: 50 });
});

test("responsive pitch bounds retain the existing token-size inset calculation", () => {
  assert.deepEqual(getPitchDragBounds(254, 650), {
    minX: 2.6 + (16 / 254) * 100,
    maxX: 100 - (2.6 + (16 / 254) * 100),
    minY: 2.6 + (16 / 650) * 100,
    maxY: 100 - (2.6 + (16 / 650) * 100),
  });
});

test("enabling Position Lock clamps existing Home and Away defender positions", () => {
  const bounds = getPitchDragBounds(254, 650);
  const homeBeforeLock = { x: 90, y: 50 };
  const awayBeforeLock = { x: 10, y: 50 };

  assert.ok(homeBeforeLock.x >= bounds.minX && homeBeforeLock.x <= bounds.maxX);
  assert.ok(awayBeforeLock.x >= bounds.minX && awayBeforeLock.x <= bounds.maxX);

  const homeAfterLock = constrainPlayerPosition({
    side: "home",
    role: "Defender",
    position: homeBeforeLock,
    positionLock: true,
    bounds,
  });
  const awayAfterLock = constrainPlayerPosition({
    side: "away",
    role: "Defender",
    position: awayBeforeLock,
    positionLock: true,
    bounds,
  });

  assert.deepEqual(homeAfterLock, { x: 35, y: 50 });
  assert.deepEqual(awayAfterLock, { x: 65, y: 50 });
});

test("disabling Position Lock preserves clamped positions and permits later movement outside role zones", () => {
  const bounds = getPitchDragBounds(254, 650);
  const positionWhileLocked = constrainPlayerPosition({
    side: "home",
    role: "Defender",
    position: { x: 90, y: 50 },
    positionLock: true,
    bounds,
  });

  const positionAfterUnlock = constrainPlayerPosition({
    side: "home",
    role: "Defender",
    position: positionWhileLocked,
    positionLock: false,
    bounds,
  });
  const positionAfterUnlockedMove = constrainPlayerPosition({
    side: "home",
    role: "Defender",
    position: { x: 80, y: 50 },
    positionLock: false,
    bounds,
  });

  assert.deepEqual(positionAfterUnlock, positionWhileLocked);
  assert.deepEqual(positionAfterUnlockedMove, { x: 80, y: 50 });
});

test("unknown roles and unassigned players remain safe and unrestricted", () => {
  assert.deepEqual(constrain("Mystery Role", 88), { x: 88, y: 50 });
  assert.deepEqual(constrain(null, -5, "away", {
    bounds: { minX: 5, maxX: 95, minY: 5, maxY: 95 },
  }), { x: 5, y: 50 });
  assert.equal(constrainPlayerPosition({
    side: "home",
    role: "Forward",
    position: null,
    positionLock: true,
    bounds: NORMALIZED_PITCH_BOUNDS,
  }), null);
});

test("formation and reset coordinates remain locked, including role-incompatible assignments", () => {
  const formationCoordinates = [
    ["Goalkeeper", 7],
    ["Defender", 20],
    ["Midfielder", 35],
    ["Forward", 38],
  ];
  const initial = formationCoordinates.map(([role, x]) => constrain(role, x));
  assert.deepEqual(initial.map(({ x }) => x), [7, 20, 35, 38]);
  assert.deepEqual(formationCoordinates.map(([role, x]) => constrain(role, x)), initial);
  assert.deepEqual(constrain("Forward", 7), { x: 38, y: 50 });
});

test("identical inputs produce identical constrained coordinates", () => {
  const request = {
    side: "away",
    role: "CDM",
    position: { x: 91, y: 43 },
    positionLock: true,
    bounds: NORMALIZED_PITCH_BOUNDS,
  };
  assert.deepEqual(constrainPlayerPosition(request), constrainPlayerPosition(request));
});
