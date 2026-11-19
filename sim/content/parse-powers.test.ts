import assert from 'node:assert/strict';
import { test } from 'node:test';
import { powerTrigger } from './parse-powers.ts';
import type { PowerTriggerDef } from './types.ts';

void test('a trigger reads its effect: a cast, a stacking buff, or skill changes held for a while', (): void => {
  assert.deepEqual(powerTrigger({ on: 'use', skill: { group: 'motion' }, effect: { type: 'empower', skillMods: [{ skill: 'quarrel', field: 'pierce', value: 1 }], duration: 2 } }, 'x'), {
    on: 'use',
    skill: { type: 'group', group: 'motion' },
    target: 'any',
    every: 1,
    cooldown: 0,
    effect: { type: 'empower', skillMods: [{ target: { type: 'skill', skill: 'quarrel' }, field: 'pierce', value: 1 }], duration: 2, look: null },
  });
  assert.equal(powerTrigger({ on: 'kill', effect: { type: 'cast', skill: 'forkline', at: 'target' } }, 'x').effect.type, 'cast');
  assert.throws((): unknown => powerTrigger({ on: 'use', effect: { type: 'empower', skillMods: [], duration: 0 } }, 'x'));
  assert.throws((): unknown => powerTrigger({ on: 'use', effect: { type: 'glow' } }, 'x'));
});

void test('a trigger can feed the flasks a whole number of charges for every few strikes', (): void => {
  const fed = powerTrigger({ on: 'hit', skill: { group: 'spin' }, every: 4, cooldown: 0.5, effect: { type: 'flask', charges: 1 } }, 'x');
  assert.deepEqual(fed.effect, { type: 'flask', charges: 1 });
  assert.equal(fed.every, 4);
  assert.equal(fed.cooldown, 0.5);
  assert.throws((): unknown => powerTrigger({ on: 'hit', effect: { type: 'flask', charges: 0 } }, 'x'));
});

void test('a held change may carry its look: a colour and how far the hero is shaded', (): void => {
  const read: PowerTriggerDef = powerTrigger({ on: 'use', effect: { type: 'empower', skillMods: [{ skill: 'quarrel', field: 'pierce', value: 1 }], duration: 2, look: { color: '#5a2fc0', shade: 0.22 } } }, 'x');
  assert.deepEqual(read.effect.type === 'empower' ? read.effect.look : null, { color: '#5a2fc0', shade: 0.22 });
  assert.throws((): unknown => powerTrigger({ on: 'use', effect: { type: 'empower', skillMods: [{ skill: 'quarrel', field: 'pierce', value: 1 }], duration: 2, look: { color: '#5a2fc0', shade: 2 } } }, 'x'));
});
