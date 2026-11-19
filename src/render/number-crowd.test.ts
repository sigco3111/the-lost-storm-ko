import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NUMBER_CROWD, planNumber } from './number-crowd.ts';
import type { LiveNumber, NumberKind, NumberPlan } from './number-crowd.ts';

function live(key: number | null, kind: NumberKind, age: number, retiring: boolean = false): LiveNumber {
  return { key, kind, age, retiring };
}

function pack(count: number, kind: NumberKind = 'plain'): LiveNumber[] {
  return Array.from({ length: count }, (_: unknown, index: number): LiveNumber => live(100 + index, kind, 0.9 - index * 0.01));
}

void test('a second hit on the same monster soon after the first grows that number instead of stacking a new one', (): void => {
  const plan: NumberPlan = planNumber([live(7, 'plain', 0.1)], { key: 7, kind: 'plain' });
  assert.deepEqual(plan, { type: 'merge', index: 0 });
});

void test('a hit after the merge window, on another monster, or of another kind makes its own number', (): void => {
  assert.equal(planNumber([live(7, 'plain', NUMBER_CROWD.mergeWindow + 0.01)], { key: 7, kind: 'plain' }).type, 'new');
  assert.equal(planNumber([live(7, 'plain', 0.05)], { key: 8, kind: 'plain' }).type, 'new');
  assert.equal(planNumber([live(7, 'plain', 0.05)], { key: 7, kind: 'burn' }).type, 'new');
  assert.equal(planNumber([live(7, 'plain', 0.05, true)], { key: 7, kind: 'plain' }).type, 'new');
});

void test('crits and gold always stand on their own', (): void => {
  assert.equal(planNumber([live(7, 'crit', 0.05)], { key: 7, kind: 'crit' }).type, 'new');
  assert.equal(planNumber([live(null, 'gold', 0.05)], { key: null, kind: 'gold' }).type, 'new');
});

void test('damage the hero takes from a swarm adds up on one number', (): void => {
  assert.deepEqual(planNumber([live(1, 'hurt', 0.1)], { key: 1, kind: 'hurt' }), { type: 'merge', index: 0 });
});

void test('past the cap a new plain number retires the oldest plain numbers, never a crit or the hero damage', (): void => {
  const numbers: LiveNumber[] = [live(1, 'hurt', 0.99), live(2, 'crit', 0.98), ...pack(NUMBER_CROWD.crowdCap)];
  const plan: NumberPlan = planNumber(numbers, { key: 999, kind: 'plain' });
  if (plan.type !== 'new') assert.fail('a hit on a new monster makes a new number');
  assert.deepEqual(plan.retire, [2]);
  const left: number = numbers.filter((number: LiveNumber, index: number): boolean => number.kind === 'plain' && !plan.retire.includes(index)).length;
  assert.equal(left + 1, NUMBER_CROWD.crowdCap);
});

void test('numbers already retiring do not count toward the cap', (): void => {
  const numbers: LiveNumber[] = Array.from({ length: NUMBER_CROWD.crowdCap }, (_: unknown, index: number): LiveNumber => live(100 + index, 'plain', 0.5, true));
  const plan: NumberPlan = planNumber(numbers, { key: 999, kind: 'plain' });
  assert.deepEqual(plan, { type: 'new', retire: [], quiet: false });
});

void test('a crit past the cap retires nothing and never draws quiet', (): void => {
  assert.deepEqual(planNumber(pack(NUMBER_CROWD.crowdCap + 4), { key: 999, kind: 'crit' }), { type: 'new', retire: [], quiet: false });
});

void test('plain numbers draw quiet once the crowd is busy, and loud while it is thin', (): void => {
  const thin: NumberPlan = planNumber(pack(NUMBER_CROWD.quietFrom - 1), { key: 999, kind: 'plain' });
  const busy: NumberPlan = planNumber(pack(NUMBER_CROWD.quietFrom), { key: 999, kind: 'plain' });
  assert.equal(thin.type === 'new' && thin.quiet, false);
  assert.equal(busy.type === 'new' && busy.quiet, true);
});

void test('a burst of thirty hits on thirty monsters never leaves more than the cap of plain numbers standing', (): void => {
  const numbers: LiveNumber[] = [];
  for (let index: number = 0; index < 30; index += 1) {
    const plan: NumberPlan = planNumber(numbers, { key: index, kind: 'plain' });
    if (plan.type !== 'new') continue;
    for (const at of plan.retire) {
      const old: LiveNumber | undefined = numbers[at];
      if (old !== undefined) numbers[at] = { ...old, retiring: true };
    }
    numbers.push(live(index, 'plain', 0));
  }
  assert.equal(numbers.filter((number: LiveNumber): boolean => !number.retiring).length, NUMBER_CROWD.crowdCap);
});
