import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBot } from '../sim/bot.ts';
import { ITEM_SLOTS } from '../sim/content/types.ts';
import { createWorld } from '../sim/world/create.ts';
import type { World } from '../sim/world/types.ts';
import { must } from '../test/support.ts';
import { CONTENT } from './simulate-run.ts';
import type { TrialAttempt } from './simulate-trial.ts';
import { bestWeapon, gearUp, raiseTo, TRIAL, trialRing, trialRow, trialTable } from './simulate-trial.ts';

function attempt(outcome: TrialAttempt['outcome'], seconds: number, phase: number, flasks: number = 2): TrialAttempt {
  return { outcome, seconds, deaths: outcome === 'lost' ? 1 : 0, flasks, phase, lifeLeft: outcome === 'won' ? 0 : 0.3, heroLife: 1000, bossLife: 30000, hurt: 500, onPieces: seconds / 3 };
}

void test('the trial ring is a zone with its boss, and a zone with no boss or no such zone has none', (): void => {
  const ring = must(trialRing(CONTENT, 'ledger_court'), 'ring');
  assert.equal(ring.boss.id, 'ledger_keeper');
  assert.equal(trialRing(CONTENT, 'hall_of_time'), null);
  assert.equal(trialRing(CONTENT, 'nowhere'), null);
});

void test('a level 30 hero is dressed in rare gear in every slot, holding the chosen weapon', (): void => {
  const world: World = createWorld(CONTENT, { seed: 3, save: null, opening: false });
  const bot = createBot(world);
  raiseTo(world, TRIAL.level);
  assert.equal(world.player.level, TRIAL.level);
  const staff = must(bestWeapon(CONTENT, 'staff', TRIAL.level), 'staff');
  assert.ok(must(bestWeapon(CONTENT, 'crossbow', TRIAL.level), 'crossbow').minLevel <= TRIAL.level);
  gearUp(bot, staff.id, TRIAL.level);
  for (const slot of ITEM_SLOTS) {
    const worn = world.player.equipped[slot];
    assert.ok(worn !== null, `${slot} is worn`);
    assert.equal(worn.rarity, TRIAL.rarity);
  }
  assert.equal(world.player.equipped.weapon?.base, staff.id);
});

void test('a row counts first-try wins, wins within the tries, the tries it took, the time on the bar against the pieces, and where the losses came', (): void => {
  const row = trialRow('caster', 'average', [[attempt('won', 300, 2)], [attempt('lost', 120, 1), attempt('won', 270, 2)], [attempt('lost', 60, 0), attempt('timeout', 600, 2)]]);
  assert.equal(row.firstWin, 1 / 3);
  assert.equal(row.winWithin, 2 / 3);
  assert.equal(row.triesToWin, 1.5);
  assert.equal(row.minutes, 4.8);
  assert.equal(row.barMinutes, 3.2);
  assert.equal(row.pieceMinutes, 1.6);
  assert.equal(row.flasks, 2);
  assert.deepEqual(row.lostInPhase, [1, 1, 1]);
  assert.equal(trialTable([row]).split('\n').length, 3);
});
