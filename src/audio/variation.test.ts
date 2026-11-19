import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VariantBag } from './variation.ts';
import { createVariantBag, delayBetween, pickVariant, pitchRate, VARIATION, volumeScale } from './variation.ts';

const SEED: { readonly start: number; readonly step: number; readonly mask: number } = { start: 12345, step: 1664525, mask: 0x7fffffff };

function seeded(): () => number {
  let state: number = SEED.start;
  return (): number => {
    state = (Math.imul(state, SEED.step) + 1013904223) & SEED.mask;
    return state / (SEED.mask + 1);
  };
}

void test('a single variation is always chosen', (): void => {
  assert.equal(pickVariant(1, [], (): number => 0.9), 0);
  assert.equal(pickVariant(1, [0], (): number => 0.1), 0);
  assert.equal(createVariantBag(seeded()).next('one', 1), 0);
});

void test('two variations alternate and never repeat', (): void => {
  const bag: VariantBag = createVariantBag(seeded());
  let previous: number = bag.next('pair', 2);
  for (let step: number = 0; step < 200; step += 1) {
    const next: number = bag.next('pair', 2);
    assert.notEqual(next, previous);
    previous = next;
  }
});

void test('with three or more variations none comes twice within the last two plays', (): void => {
  for (let count: number = 3; count <= 8; count += 1) {
    const bag: VariantBag = createVariantBag(seeded());
    const plays: number[] = [];
    for (let step: number = 0; step < 500; step += 1) {
      const next: number = bag.next('many', count);
      assert.ok(next >= 0 && next < count);
      assert.ok(!plays.slice(-2).includes(next), `${count} variations repeated ${next} after ${plays.slice(-2).join(',')}`);
      plays.push(next);
    }
  }
});

void test('every variation comes up and each sound keeps its own history', (): void => {
  const bag: VariantBag = createVariantBag(seeded());
  const seen: Set<number> = new Set<number>();
  for (let step: number = 0; step < 200; step += 1) {
    seen.add(bag.next('a', 5));
    bag.next('b', 5);
  }
  assert.equal(seen.size, 5);
  const fresh: VariantBag = createVariantBag((): number => 0);
  assert.equal(fresh.next('x', 4), 0);
  assert.equal(fresh.next('y', 4), 0);
  assert.equal(fresh.next('x', 4), 1);
  assert.equal(fresh.next('x', 4), 2);
  assert.equal(fresh.next('x', 4), 0);
  assert.equal(fresh.next('x', 4), 1);
});

void test('a sound whose file count shrinks still picks inside the new count', (): void => {
  const bag: VariantBag = createVariantBag((): number => 0.99);
  assert.equal(bag.next('s', 6), 5);
  assert.equal(bag.next('s', 3), 2);
  assert.equal(bag.next('s', 3), 1);
});

void test('pitch and volume stay inside their spread and are centred on one', (): void => {
  assert.equal(pitchRate((): number => 0.5), 1);
  assert.equal(volumeScale((): number => 0.5), 1);
  const high: number = pitchRate((): number => 1);
  const low: number = pitchRate((): number => 0);
  assert.ok(Math.abs(high - 2 ** (VARIATION.pitchCents / VARIATION.centsPerOctave)) < 1e-9);
  assert.ok(Math.abs(low - 2 ** (-VARIATION.pitchCents / VARIATION.centsPerOctave)) < 1e-9);
  assert.ok(Math.abs(volumeScale((): number => 1) - (1 + VARIATION.volumeSpread)) < 1e-9);
  assert.ok(Math.abs(volumeScale((): number => 0) - (1 - VARIATION.volumeSpread)) < 1e-9);
});

void test('a cue pitch range replaces the default spread, and a cue jitter replaces the default volume spread', (): void => {
  const range = { min: 0.9, max: 1.1 };
  assert.equal(pitchRate((): number => 0, range), 0.9);
  assert.equal(pitchRate((): number => 1, range), 1.1);
  assert.ok(Math.abs(pitchRate((): number => 0.5, range) - 1) < 1e-9);
  assert.ok(Math.abs(volumeScale((): number => 1, 0.3) - 1.3) < 1e-9);
  assert.ok(Math.abs(volumeScale((): number => 0, 0.3) - 0.7) < 1e-9);
  assert.equal(volumeScale((): number => 0.5, 0.3), 1);
  assert.equal(pitchRate((): number => 1, null), pitchRate((): number => 1));
  assert.equal(volumeScale((): number => 1, null), volumeScale((): number => 1));
});

void test('a delay falls between its bounds', (): void => {
  assert.equal(delayBetween(10, 30, (): number => 0), 10);
  assert.equal(delayBetween(10, 30, (): number => 0.5), 20);
  assert.equal(delayBetween(10, 30, (): number => 1), 30);
});

function referencePick(count: number, recent: readonly number[], random: () => number): number {
  if (count <= 1) return 0;
  const barred: ReadonlySet<number> = new Set<number>(recent.slice(-Math.min(VARIATION.recentBarred, count - 1)));
  const open: number[] = [];
  for (let index: number = 0; index < count; index += 1) {
    if (!barred.has(index)) open.push(index);
  }
  return open[Math.min(open.length - 1, Math.floor(random() * open.length))] ?? 0;
}

void test('the bag picks the same variations, in the same order and with the same draws, as the set-and-filter picker it replaced', (): void => {
  const counts: readonly number[] = [1, 2, 3, 6, 4, 4, 2, 7, 5, 1, 3, 8, 8, 2, 6];
  const ours: () => number = seeded();
  const theirs: () => number = seeded();
  const bag: VariantBag = createVariantBag(ours);
  const history: Map<string, readonly number[]> = new Map<string, readonly number[]>();
  for (let step: number = 0; step < 3000; step += 1) {
    const sound: string = `s${step % 4}`;
    const count: number = counts[(step * 7) % counts.length] ?? 1;
    const before: readonly number[] = (history.get(sound) ?? []).filter((index: number): boolean => index < count);
    const expected: number = referencePick(count, before, theirs);
    history.set(sound, [...before, expected].slice(-VARIATION.recentBarred));
    assert.equal(bag.next(sound, count), expected);
  }
  assert.equal(ours(), theirs());
  for (const recent of [[], [0], [5], [9, 9], [2, 2], [1, 0, 3], [3, 1]]) {
    for (const draw of [0, 0.2, 0.5, 0.99, 1]) {
      for (let count: number = 0; count <= 6; count += 1) assert.equal(pickVariant(count, recent, (): number => draw), referencePick(count, recent, (): number => draw));
    }
  }
});
