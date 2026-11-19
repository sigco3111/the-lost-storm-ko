import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHeroGate, holdFor } from './hero-hold.ts';

const GONE: number = 0.01;

void test('a hero who is not showing is held back by his presence, one behind the swap cover by the cover, and one in view is left alone', (): void => {
  assert.equal(holdFor(0, GONE, false), 'presence');
  assert.equal(holdFor(GONE, GONE, false), 'presence');
  assert.equal(holdFor(0.4, GONE, false), 'none');
  assert.equal(holdFor(1, GONE, true), 'cover');
  assert.equal(holdFor(0, GONE, true), 'cover');
});

void test('a changed hero is held until the programs for that change are ready', (): void => {
  const gate = createHeroGate();
  assert.equal(gate.hold, 'none');
  assert.equal(gate.take(), null);
  gate.change('presence');
  assert.equal(gate.hold, 'presence');
  const turn: number | null = gate.take();
  assert.ok(turn !== null);
  assert.equal(gate.take(), null);
  gate.settle(turn);
  assert.equal(gate.hold, 'none');
  assert.equal(gate.take(), null);
});

void test('a second change while the first compiles keeps the hold until the second is ready', (): void => {
  const gate = createHeroGate();
  gate.change('presence');
  const first: number | null = gate.take();
  gate.change('presence');
  assert.ok(first !== null);
  gate.settle(first);
  assert.equal(gate.hold, 'presence');
  const second: number | null = gate.take();
  assert.ok(second !== null && second !== first);
  gate.settle(second);
  assert.equal(gate.hold, 'none');
});

void test('a change to a hero in view never hides him, and never loosens a hold that is on', (): void => {
  const gate = createHeroGate();
  gate.change('none');
  assert.equal(gate.hold, 'none');
  assert.equal(gate.take(), null);
  gate.change('cover');
  const held: number | null = gate.take();
  gate.change('none');
  assert.equal(gate.hold, 'cover');
  assert.ok(held !== null);
  gate.settle(held);
  assert.equal(gate.hold, 'cover');
  const next: number | null = gate.take();
  assert.ok(next !== null);
  gate.settle(next);
  assert.equal(gate.hold, 'none');
});

void test('the cover outranks the presence hold, so a swap behind the cover is not shown by a fade', (): void => {
  const gate = createHeroGate();
  gate.change('presence');
  gate.change('cover');
  assert.equal(gate.hold, 'cover');
  gate.change('presence');
  assert.equal(gate.hold, 'cover');
});
