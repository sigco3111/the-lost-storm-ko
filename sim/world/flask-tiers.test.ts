import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { FlaskDef, FlaskTier } from '../content/flasks.ts';
import type { Content } from '../content/types.ts';
import { anyUpgradeReady, baseFlask, clampTier, flaskOffer, flaskTiers, offerFor, setFlaskTier, tieredFlask, upgradeReady } from './flask-tiers.ts';
import type { FlaskOffer } from './flask-tiers.ts';
import { createFlasks, flaskRestores } from './flasks.ts';
import { meetNpc } from './trade.ts';
import { stepWorld } from './step.ts';
import type { FlaskState, NpcState, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const LIFE_ID: string = 'life_flask';
const MANA_ID: string = 'mana_flask';

function base(id: string): FlaskDef {
  return must(baseFlask(content, id), id);
}

function tierOf(id: string, tier: number): FlaskTier {
  return must(base(id).tiers[tier - 1], `${id} tier ${tier}`);
}

function flaskIn(world: World, id: string): FlaskState {
  return must(
    world.player.flasks.find((flask: FlaskState): boolean => flask.def.id === id),
    id,
  );
}

function atTrader(level: number, gold: number): World {
  const world: World = worldIn(content, content.world.town, 3);
  const npc: NpcState = must(
    world.npcs.find((candidate: NpcState): boolean => candidate.def.service === 'vendor'),
    'trader',
  );
  for (const talk of npc.def.talks) if (talk.once) world.heard.push(talk.id);
  world.player.pos = { x: npc.pos.x + 1, z: npc.pos.z };
  world.player.path = [];
  stepWorld(world, [], DT);
  meetNpc(world, npc);
  world.player.level = level;
  world.player.gold = gold;
  world.events = [];
  return world;
}

function upgrade(world: World, id: string): WorldEvent[] {
  return stepWorld(world, [{ type: 'trade', action: { type: 'upgrade_flask', flask: id } }], DT);
}

function notices(events: readonly WorldEvent[]): string[] {
  return events.flatMap((event: WorldEvent): string[] => (event.type === 'notice' ? [event.reason] : []));
}

void test('each shipped flask climbs four tiers, at levels 8, 14, 19 and 25', (): void => {
  for (const def of content.flasks) assert.deepEqual(def.tiers.map((tier: FlaskTier): number => tier.level), [8, 14, 19, 25], def.id);
});

void test('every tier restores more, at least as fast, and the late tiers hold more charges', (): void => {
  for (const def of content.flasks) {
    let before: FlaskDef = tieredFlask(def, 0);
    for (let tier: number = 1; tier <= def.tiers.length; tier += 1) {
      const next: FlaskDef = tieredFlask(def, tier);
      assert.ok(flaskRestores(next, 1000) > flaskRestores(before, 1000), `${def.id} ${tier} share`);
      assert.ok(flaskRestores(next, 1) > flaskRestores(before, 1), `${def.id} ${tier} flat`);
      assert.ok(next.duration <= before.duration, `${def.id} ${tier} duration`);
      before = next;
    }
    const top: FlaskDef = tieredFlask(def, def.tiers.length);
    assert.ok(top.maxCharges > def.maxCharges || top.chargesPerKill > def.chargesPerKill, def.id);
    assert.equal(top.chargesPerUse, def.chargesPerUse);
    assert.equal(top.cooldown, def.cooldown);
  }
});

void test('a tier out of range or not whole means the base flask or the top tier', (): void => {
  const life: FlaskDef = base(LIFE_ID);
  assert.equal(clampTier(life, -1), 0);
  assert.equal(clampTier(life, 99), life.tiers.length);
  assert.equal(clampTier(life, 1.5), 0);
  assert.equal(tieredFlask(life, 0), life);
  assert.equal(tieredFlask(life, 2).amount, tierOf(LIFE_ID, 2).amount);
});

void test('the next tier is locked below its level, short without its price, and ready with both', (): void => {
  const life: FlaskDef = base(LIFE_ID);
  const first: FlaskTier = tierOf(LIFE_ID, 1);
  assert.deepEqual(flaskOffer(life, 0, first.level - 1, first.price * 10), { kind: 'locked', tier: 0, next: first });
  assert.deepEqual(flaskOffer(life, 0, first.level, first.price - 30), { kind: 'short', tier: 0, next: first, missing: 30 });
  assert.deepEqual(flaskOffer(life, 0, first.level, first.price), { kind: 'ready', tier: 0, next: first });
  assert.deepEqual(flaskOffer(life, life.tiers.length, 99, 1e9), { kind: 'top', tier: life.tiers.length });
});

void test('the reminder shows only for an upgrade that is unlocked and affordable, and clears at the top', (): void => {
  const world: World = worldIn(content, content.world.town, 1);
  const life: FlaskState = flaskIn(world, LIFE_ID);
  const first: FlaskTier = tierOf(LIFE_ID, 1);
  world.player.level = first.level - 1;
  world.player.gold = 1e6;
  assert.equal(anyUpgradeReady(content, world.player), false);
  world.player.level = first.level;
  world.player.gold = 0;
  assert.equal(anyUpgradeReady(content, world.player), false);
  world.player.gold = first.price;
  assert.equal(upgradeReady(content, world.player, life), true);
  assert.equal(upgradeReady(content, world.player, flaskIn(world, MANA_ID)), world.player.gold >= tierOf(MANA_ID, 1).price);
  setFlaskTier(base(LIFE_ID), life, base(LIFE_ID).tiers.length);
  setFlaskTier(base(MANA_ID), flaskIn(world, MANA_ID), base(MANA_ID).tiers.length);
  world.player.level = 99;
  assert.equal(anyUpgradeReady(content, world.player), false);
  assert.equal(offerFor(content, world.player, life).kind, 'top');
});

void test('buying a tier at the trader takes its price, raises the flask and fills it', (): void => {
  const first: FlaskTier = tierOf(LIFE_ID, 1);
  const world: World = atTrader(first.level, first.price + 5);
  const life: FlaskState = flaskIn(world, LIFE_ID);
  life.charges = 0;
  const events: WorldEvent[] = upgrade(world, LIFE_ID);
  assert.equal(world.player.gold, 5);
  assert.equal(life.tier, 1);
  assert.equal(life.def.amount, first.amount);
  assert.equal(life.def.share, first.share);
  assert.equal(life.def.duration, first.duration);
  assert.equal(life.charges, first.maxCharges);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'flask_upgraded' && event.flask === LIFE_ID && event.tier === 1));
  assert.equal(flaskIn(world, MANA_ID).tier, 0);
});

void test('a tier above the hero level cannot be bought, and a short purse says so', (): void => {
  const first: FlaskTier = tierOf(LIFE_ID, 1);
  const young: World = atTrader(first.level - 1, 1e6);
  upgrade(young, LIFE_ID);
  assert.equal(flaskIn(young, LIFE_ID).tier, 0);
  assert.equal(young.player.gold, 1e6);
  const poor: World = atTrader(first.level, first.price - 1);
  const events: WorldEvent[] = upgrade(poor, LIFE_ID);
  assert.deepEqual(notices(events), ['no_gold']);
  assert.equal(flaskIn(poor, LIFE_ID).tier, 0);
  assert.equal(poor.player.gold, first.price - 1);
});

void test('tiers are bought one at a time, in order', (): void => {
  const world: World = atTrader(30, 1e6);
  upgrade(world, MANA_ID);
  upgrade(world, MANA_ID);
  const mana: FlaskState = flaskIn(world, MANA_ID);
  assert.equal(mana.tier, 2);
  assert.equal(world.player.gold, 1e6 - tierOf(MANA_ID, 1).price - tierOf(MANA_ID, 2).price);
});

void test('a flask cannot be upgraded away from the trader', (): void => {
  const world: World = worldIn(content, content.world.town, 2);
  world.player.level = 30;
  world.player.gold = 1e6;
  upgrade(world, LIFE_ID);
  assert.equal(flaskIn(world, LIFE_ID).tier, 0);
});

void test('a drink from an upgraded flask restores the upgraded amount', (): void => {
  const world: World = atTrader(30, 1e6);
  for (let tier: number = 0; tier < 4; tier += 1) upgrade(world, LIFE_ID);
  const life: FlaskState = flaskIn(world, LIFE_ID);
  const top: FlaskTier = tierOf(LIFE_ID, 4);
  stepWorld(world, [{ type: 'trade', action: { type: 'close' } }], DT);
  world.player.stats.lifeRegen = 0;
  world.player.life = 1;
  const restores: number = Math.max(top.amount, top.share * world.player.maxLife);
  stepWorld(world, [{ type: 'flask', slot: 0 }], DT);
  for (let step: number = 0; step < Math.round((top.duration + 0.1) / DT); step += 1) stepWorld(world, [], DT);
  assert.ok(Math.abs(world.player.life - Math.min(world.player.maxLife, 1 + restores)) < 0.5, `${world.player.life} vs ${1 + restores}`);
  assert.equal(life.def.maxCharges, top.maxCharges);
});

void test('flasks made from saved tiers carry the tier numbers, and only raised tiers are saved', (): void => {
  const flasks: FlaskState[] = createFlasks(content, { [LIFE_ID]: 35 }, { [LIFE_ID]: 3 });
  const life: FlaskState = must(flasks[0], 'life');
  assert.equal(life.tier, 3);
  assert.equal(life.def.maxCharges, tierOf(LIFE_ID, 3).maxCharges);
  assert.equal(life.charges, 35);
  assert.deepEqual(flaskTiers(flasks), { [LIFE_ID]: 3 });
  const offer: FlaskOffer = flaskOffer(base(LIFE_ID), life.tier, 1, 0);
  assert.equal(offer.kind, 'locked');
});
