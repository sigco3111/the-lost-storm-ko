import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MonsterRank } from '../../sim/content/rank-types.ts';
import type { Moment } from './time-moment.ts';
import { MOMENT, momentousKill, momentScale, NO_MOMENT, startMoment } from './time-moment.ts';

const FRAME: number = 1 / 60;
const LEADER: MonsterRank = { id: 'rare', name: 'Rare', color: '#fff', aura: null, leader: true, title: null, xp: 1, items: 1, floor: null, size: 1, look: null };
const MEMBER: MonsterRank = { ...LEADER, leader: false };

void test('with no moment the world runs at full speed', (): void => {
  assert.equal(momentScale(NO_MOMENT, 0), 1);
  assert.equal(momentScale(NO_MOMENT, 1000), 1);
});

void test('a moment dips to a quarter speed, never to zero, and eases back with no jump between frames', (): void => {
  const moment: Moment = startMoment(NO_MOMENT, 10);
  let lowest: number = 1;
  let previous: number = 1;
  for (let now: number = 10 - FRAME; now < 11; now += FRAME / 2) {
    const scale: number = momentScale(moment, now);
    lowest = Math.min(lowest, scale);
    assert.ok(scale > 0);
    assert.ok(Math.abs(scale - previous) < 0.35, `jump ${previous} to ${scale}`);
    previous = scale;
  }
  assert.equal(lowest, MOMENT.low);
  assert.equal(momentScale(moment, 10 + MOMENT.dip + MOMENT.hold + MOMENT.back), 1);
  assert.ok(MOMENT.dip + MOMENT.hold + MOMENT.back <= 0.3);
});

void test('a moment cannot start again within its cooldown, so it never chains', (): void => {
  const first: Moment = startMoment(NO_MOMENT, 5);
  assert.equal(startMoment(first, 5.5), first);
  assert.equal(startMoment(first, 5 + MOMENT.cooldown - 0.01), first);
  assert.deepEqual(startMoment(first, 5 + MOMENT.cooldown), { at: 5 + MOMENT.cooldown });
  assert.deepEqual(startMoment(first, 7), { at: 7 });
});

void test('only a boss, a pack leader or one very big crit on a ranked monster is momentous', (): void => {
  const blow = { crit: false, amount: 10, maxLife: 100 };
  assert.equal(momentousKill({ boss: null, rank: null }, blow), false);
  assert.equal(momentousKill({ boss: null, rank: null }, { crit: true, amount: 100000, maxLife: 100 }), false);
  assert.equal(momentousKill({ boss: null, rank: LEADER }, blow), true);
  assert.equal(momentousKill({ boss: null, rank: MEMBER }, blow), false);
  assert.equal(momentousKill({ boss: null, rank: MEMBER }, { crit: true, amount: 100 * MOMENT.bigCrit, maxLife: 100 }), true);
  assert.equal(momentousKill({ boss: null, rank: MEMBER }, { crit: false, amount: 100 * MOMENT.bigCrit, maxLife: 100 }), false);
});
