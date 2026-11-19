import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dragTurn, FIGURE_TURN, isTurning, pressTurn, releaseSpeed, releaseTurn, RESTING_TURN, settleRate, settleTurn, turnAngle, turnSpeed } from './figure-turn.ts';
import type { FigureTurn } from './figure-turn.ts';

const WIDTH: number = 200;
const SETTLE_MS: number = 520;
const FRAME_MS: number = 1000 / 60;

interface Clock {
  now: number;
}

function drag(clock: Clock, turn: FigureTurn, fromX: number, stepPx: number, steps: number): FigureTurn {
  let next: FigureTurn = pressTurn(turn, fromX, clock.now);
  for (let step: number = 1; step <= steps; step += 1) {
    clock.now += FRAME_MS;
    next = dragTurn(next, fromX + stepPx * step, clock.now, WIDTH);
  }
  return next;
}

function settle(clock: Clock, turn: FigureTurn): FigureTurn {
  let next: FigureTurn = turn;
  for (let frame: number = 0; frame < 600 && isTurning(next); frame += 1) {
    clock.now += FRAME_MS;
    next = settleTurn(next, clock.now);
  }
  return next;
}

void test('a resting figure faces the way it always has', (): void => {
  assert.equal(turnAngle(RESTING_TURN, 0), 0);
  assert.equal(isTurning(RESTING_TURN), false);
});

void test('the turn follows the pointer one to one: the figure width is half a turn either way', (): void => {
  const clock: Clock = { now: 1000 };
  const right: FigureTurn = drag(clock, RESTING_TURN, 50, WIDTH / 10, 10);
  assert.ok(Math.abs(turnAngle(right, clock.now) - FIGURE_TURN.radiansPerWidth) < 1e-9);
  const left: FigureTurn = drag(clock, RESTING_TURN, 50, -WIDTH / 20, 10);
  assert.ok(Math.abs(turnAngle(left, clock.now) + FIGURE_TURN.radiansPerWidth / 2) < 1e-9);
});

void test('a plain click leaves the figure exactly where it was', (): void => {
  const clock: Clock = { now: 1000 };
  const pressed: FigureTurn = pressTurn(RESTING_TURN, 80, clock.now);
  clock.now += 120;
  const released: FigureTurn = releaseTurn(pressed, clock.now, SETTLE_MS);
  assert.deepEqual(released, { kind: 'rest', angle: 0 });
});

void test('a drag held still before letting go stops where it was let go', (): void => {
  const clock: Clock = { now: 1000 };
  const held: FigureTurn = drag(clock, RESTING_TURN, 0, 6, 10);
  const angle: number = turnAngle(held, clock.now);
  clock.now += FIGURE_TURN.velocityWindowMs + FRAME_MS;
  const released: FigureTurn = releaseTurn(held, clock.now, SETTLE_MS);
  assert.deepEqual(released, { kind: 'rest', angle });
});

void test('a fling keeps its speed on release, so the turn runs on without a jump in angle or speed', (): void => {
  const clock: Clock = { now: 1000 };
  const held: FigureTurn = drag(clock, RESTING_TURN, 0, 4, 12);
  const angle: number = turnAngle(held, clock.now);
  const dragSpeed: number = ((4 / WIDTH) * FIGURE_TURN.radiansPerWidth) / (FRAME_MS / 1000);
  const released: FigureTurn = releaseTurn(held, clock.now, SETTLE_MS);
  assert.equal(released.kind, 'coast');
  assert.ok(Math.abs(turnAngle(released, clock.now) - angle) < 1e-9);
  assert.ok(Math.abs(turnSpeed(released, clock.now) - dragSpeed) < 1e-6);
});

void test('the coast eases out with no overshoot and comes to rest within the spring duration', (): void => {
  const clock: Clock = { now: 1000 };
  const released: FigureTurn = releaseTurn(drag(clock, RESTING_TURN, 0, 5, 12), clock.now, SETTLE_MS);
  const start: number = clock.now;
  let previous: number = turnAngle(released, clock.now);
  let previousStep: number = Infinity;
  let turn: FigureTurn = released;
  while (isTurning(turn)) {
    clock.now += FRAME_MS;
    const angle: number = turnAngle(turn, clock.now);
    const step: number = angle - previous;
    assert.ok(step >= 0);
    assert.ok(step <= previousStep + 1e-12);
    previous = angle;
    previousStep = step;
    turn = settleTurn(turn, clock.now);
  }
  assert.equal(turn.kind, 'rest');
  assert.ok(Math.abs(turnAngle(turn, clock.now) - previous) <= FIGURE_TURN.settledWithin);
  assert.ok(clock.now - start <= SETTLE_MS * 1.6);
});

void test('the settle rate brings the remaining coast to one percent in the spring duration', (): void => {
  const rate: number = settleRate(SETTLE_MS);
  assert.ok(Math.abs(Math.exp((-rate * SETTLE_MS) / 1000) - FIGURE_TURN.settleFraction) < 1e-9);
});

void test('a wild fling is capped, and a press during the coast catches the figure where it is', (): void => {
  const clock: Clock = { now: 1000 };
  const pressed: FigureTurn = pressTurn(RESTING_TURN, 0, clock.now);
  clock.now += 1;
  const flung: FigureTurn = dragTurn(pressed, WIDTH * 4, clock.now, WIDTH);
  const released: FigureTurn = releaseTurn(flung, clock.now, SETTLE_MS);
  assert.equal(turnSpeed(released, clock.now), FIGURE_TURN.maxSpeed);
  clock.now += 100;
  const caught: FigureTurn = pressTurn(released, 30, clock.now);
  assert.equal(caught.kind, 'held');
  assert.ok(Math.abs(turnAngle(caught, clock.now) - turnAngle(released, clock.now)) < 1e-12);
  assert.equal(isTurning(caught), false);
});

void test('the release speed reads only the last moments of the drag', (): void => {
  assert.equal(releaseSpeed([], 0), 0);
  assert.equal(releaseSpeed([{ at: 0, angle: 0 }], 0), 0);
  assert.equal(releaseSpeed([{ at: 0, angle: 0 }, { at: 10, angle: 0.1 }], 10 + FIGURE_TURN.velocityWindowMs + 1), 0);
  assert.ok(Math.abs(releaseSpeed([{ at: 0, angle: 0 }, { at: 50, angle: 0.5 }], 60) - 10) < 1e-9);
  assert.ok(Math.abs(releaseSpeed([{ at: -200, angle: 9 }, { at: 0, angle: 0 }, { at: 50, angle: 0.5 }], 60) - 10) < 1e-9);
});

void test('on a slow device whose moves come further apart than the window, a fling still keeps its speed', (): void => {
  const samples: readonly { readonly at: number; readonly angle: number }[] = [{ at: 0, angle: 0 }, { at: 100, angle: 0.3 }, { at: 200, angle: 0.6 }];
  assert.ok(Math.abs(releaseSpeed(samples, 260) - 3) < 1e-9);
  const clock: Clock = { now: 1000 };
  let turn: FigureTurn = pressTurn(RESTING_TURN, 0, clock.now);
  for (let step: number = 1; step <= 3; step += 1) {
    clock.now += 120;
    turn = dragTurn(turn, step * 20, clock.now, WIDTH);
  }
  clock.now += 60;
  const released: FigureTurn = releaseTurn(turn, clock.now, SETTLE_MS);
  assert.equal(released.kind, 'coast');
  assert.ok(Math.abs(turnSpeed(released, clock.now) - ((20 / WIDTH) * FIGURE_TURN.radiansPerWidth) / 0.12) < 1e-6);
});

void test('a drag that ends turned settles there, and nothing turns on its own after', (): void => {
  const clock: Clock = { now: 1000 };
  const rested: FigureTurn = settle(clock, releaseTurn(drag(clock, RESTING_TURN, 0, -3, 8), clock.now, SETTLE_MS));
  const angle: number = turnAngle(rested, clock.now);
  assert.ok(angle < 0);
  clock.now += 5000;
  assert.equal(turnAngle(settleTurn(rested, clock.now), clock.now), angle);
});

void test('moves that come without a press, or with no width to measure, change nothing', (): void => {
  assert.equal(dragTurn(RESTING_TURN, 40, 10, WIDTH), RESTING_TURN);
  const pressed: FigureTurn = pressTurn(RESTING_TURN, 0, 0);
  assert.equal(dragTurn(pressed, 40, 10, 0), pressed);
  assert.equal(releaseTurn(RESTING_TURN, 10, SETTLE_MS), RESTING_TURN);
});
