import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shake } from './shake.ts';
import { addPunch, addTrauma, combineTrauma, SHAKE, settleShake, shakeStrength, stillShake } from './shake.ts';

const FRAME: number = 1 / 60;

function hitAll(shake: Shake, amounts: readonly number[]): Shake {
  return amounts.reduce((next: Shake, amount: number): Shake => addTrauma(next, amount), shake);
}

function punchSize(shake: Shake): number {
  return Math.hypot(shake.punch.x, shake.punch.z);
}

void test('fifteen hits in the same frame shake exactly as much as the strongest of them alone', (): void => {
  const pack: Shake = hitAll(stillShake(), [0.2, 0.55, 0.3, 0.2, 0.2, 0.55, 0.2, 0.3, 0.2, 0.2, 0.55, 0.2, 0.2, 0.3, 0.2]);
  const one: Shake = addTrauma(stillShake(), 0.55);
  assert.equal(pack.trauma, one.trauma);
});

void test('hits a few frames apart still count as one moment and take the strongest, not the sum', (): void => {
  let shake: Shake = stillShake();
  for (let i: number = 0; i < 6; i += 1) {
    shake = addTrauma(shake, 0.45);
    shake = settleShake(shake, FRAME);
  }
  const one: Shake = settleShake(addTrauma(stillShake(), 0.45), FRAME * 6);
  assert.ok(Math.abs(shake.trauma - one.trauma) < 1e-9);
});

void test('a stronger hit later in the same moment raises the shake to that hit, a weaker one leaves it', (): void => {
  const light: Shake = addTrauma(stillShake(), 0.2);
  assert.equal(addTrauma(light, 0.1), light);
  const heavy: Shake = addTrauma(light, 0.8);
  assert.ok(Math.abs(heavy.trauma - addTrauma(stillShake(), 0.8).trauma) < 1e-9);
});

void test('a second moment adds only a share of the smaller shake on top of the larger', (): void => {
  const first: Shake = settleShake(addTrauma(stillShake(), 0.5), SHAKE.together);
  const second: Shake = addTrauma(first, 0.5);
  assert.ok(Math.abs(second.trauma - combineTrauma(first.trauma, 0.5 * SHAKE.level)) < 1e-9);
  assert.ok(second.trauma < first.trauma + 0.5 * SHAKE.level);
});

void test('casting the heaviest skill as fast as possible never takes the shake past its ceiling', (): void => {
  let shake: Shake = stillShake();
  let highest: number = 0;
  for (let step: number = 0; step < 600; step += 1) {
    if (step % 9 === 0) shake = hitAll(shake, [0.8, 0.8, 0.8, 0.34, 0.34, 0.34]);
    shake = settleShake(shake, FRAME);
    highest = Math.max(highest, shake.trauma);
  }
  assert.ok(highest <= SHAKE.ceiling + 1e-9);
  assert.ok(shakeStrength({ ...shake, trauma: highest }) < 0.5);
});

void test('a single hit shakes between a third and a half less than it used to', (): void => {
  for (const amount of [0.16, 0.35, 0.55, 0.8]) {
    const share: number = shakeStrength(addTrauma(stillShake(), amount)) / (amount * amount);
    assert.ok(share >= 0.5 && share <= 0.67, `${String(amount)} keeps ${String(share)}`);
  }
});

void test('a heavy hit still shakes far more than a light one, and a fallen boss reaches the ceiling', (): void => {
  const light: number = shakeStrength(addTrauma(stillShake(), 0.16));
  const heavy: number = shakeStrength(addTrauma(stillShake(), 0.75));
  assert.ok(heavy > light * 10);
  assert.ok(Math.abs(addTrauma(stillShake(), 0.9).trauma - SHAKE.ceiling) < 1e-9);
});

void test('the shake fades at its decay rate and is gone once the trauma has run out', (): void => {
  let shake: Shake = addTrauma(stillShake(), 0.5);
  const start: number = shake.trauma;
  shake = settleShake(shake, 0.1);
  assert.ok(Math.abs(shake.trauma - (start - SHAKE.decay * 0.1)) < 1e-9);
  shake = settleShake(shake, start / SHAKE.decay);
  assert.equal(shake.trauma, 0);
  assert.equal(shakeStrength(shake), 0);
});

void test('nothing or a negative amount does not shake', (): void => {
  const still: Shake = stillShake();
  assert.equal(addTrauma(still, 0), still);
  assert.equal(addTrauma(still, -1), still);
  assert.equal(addPunch(still, 1, 0, 0), still);
});

void test('ten enemies struck the same way in one swing punch the camera once', (): void => {
  let pack: Shake = stillShake();
  for (let i: number = 0; i < 10; i += 1) pack = addPunch(pack, 1, 0, 0.16);
  const one: Shake = addPunch(stillShake(), 1, 0, 0.16);
  assert.equal(punchSize(pack), punchSize(one));
});

void test('a crit punches harder than a plain hit, and no punch passes the ceiling', (): void => {
  const plain: number = punchSize(addPunch(stillShake(), 0, 1, 0.16));
  const crit: number = punchSize(addPunch(stillShake(), 0, 1, 0.32));
  assert.ok(crit > plain * 1.5);
  let shake: Shake = stillShake();
  for (let step: number = 0; step < 120; step += 1) {
    shake = addPunch(settleShake(shake, SHAKE.together), 1, 0, 0.32);
    assert.ok(punchSize(shake) <= SHAKE.punchCeiling + 1e-9);
  }
});

void test('a stronger punch in the same moment replaces the weaker one instead of adding to it', (): void => {
  const weak: Shake = addPunch(stillShake(), 1, 0, 0.1);
  const strong: Shake = addPunch(weak, 0, 1, 0.3);
  const alone: Shake = addPunch(stillShake(), 0, 1, 0.3);
  assert.ok(Math.abs(strong.punch.x - alone.punch.x) < 1e-9);
  assert.ok(Math.abs(strong.punch.z - alone.punch.z) < 1e-9);
});

void test('the punch springs back toward rest as time passes', (): void => {
  const kicked: Shake = addPunch(stillShake(), 1, 0, 0.3);
  const later: Shake = settleShake(kicked, 0.2);
  assert.ok(punchSize(later) < punchSize(kicked) * 0.1);
});
