import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillMod, SkillTreeNodeDef } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { computeStats, resolveSkill } from './stats.ts';
import { ANY_WEAPON, groupOfKind, heldGroup, heldPlace, placeBound, placeLive, weaponGroup } from './weapons.ts';
import { addToInventory, equipFromInventory, refreshPlayer } from './world/character.ts';
import { createWorld } from './world/create.ts';
import { stepWorld } from './world/step.ts';
import type { Equipment, ItemInstance, World, WorldEvent } from './world/types.ts';

const content: Content = loadContent();

function holding(base: string): Equipment {
  const item: ItemInstance = { uid: 1, base, rarity: 'common', level: 1, affixes: [], ledger: null };
  return { ...emptyEquipment(), weapon: item };
}

void test('every weapon kind belongs to one group: axes are blades, maces and greatswords are heavy', (): void => {
  assert.equal(groupOfKind(content, 'axe')?.id, 'blade');
  assert.equal(groupOfKind(content, 'blunt')?.id, 'heavy');
  assert.equal(groupOfKind(content, 'greatsword')?.id, 'heavy');
  assert.equal(groupOfKind(content, 'staff')?.id, 'staff');
  assert.equal(weaponGroup(content, 'crossbow')?.name, 'Crossbow');
  assert.equal(weaponGroup(content, 'wand'), null);
});

void test('the held group comes from the weapon in hand, and empty hands hold none', (): void => {
  assert.equal(heldGroup(content, emptyEquipment()), null);
  assert.equal(heldGroup(content, holding('woodsman_hatchet')), 'blade');
  assert.equal(heldGroup(content, holding('iron_maul')), 'heavy');
  assert.equal(heldGroup(content, holding('worn_crossbow')), 'crossbow');
  assert.equal(heldGroup(content, holding('no_such_weapon')), null);
});

void test('a place with no weapon is live with anything, one with a weapon only with that weapon', (): void => {
  const node: SkillTreeNodeDef = must(content.skillTree[0], 'node');
  assert.equal(placeLive({ ...node, weapon: null }, null), true);
  assert.equal(placeLive({ ...node, weapon: 'heavy' }, 'heavy'), true);
  assert.equal(placeLive({ ...node, weapon: 'heavy' }, 'blade'), false);
  assert.equal(placeLive({ ...node, weapon: 'heavy' }, null), false);
  assert.equal(placeLive({ ...node, weapon: 'heavy' }, ANY_WEAPON), true);
});

function tagged(): Content {
  const skills = new Map(content.skills);
  const tree: SkillTreeNodeDef[] = content.skillTree.map((node: SkillTreeNodeDef): SkillTreeNodeDef => {
    if (node.id === 'storm_1' || node.id === 'forked_bolt') return { ...node, weapon: 'staff' };
    if (node.id === 'heavy_hands' || node.id === 'whirling_cleave') return { ...node, weapon: 'blade' };
    return node;
  });
  return { ...content, skills, skillTree: tree };
}

const TAGGED: Content = tagged();

function made(base: string): ItemInstance {
  return must(generateItem(TAGGED, createRng(2), 50, 1, base, 'common'), base);
}

void test('a place off its weapon drops only its weapon damage lines and keeps its skill mods and skill changes', (): void => {
  const node: SkillTreeNodeDef = must(TAGGED.skillTree.find((entry: SkillTreeNodeDef): boolean => entry.id === 'storm_1'), 'storm_1');
  const roll: SkillMod = { target: { type: 'skill', skill: 'dodge_roll' }, field: 'cooldownPercent', value: -0.1 };
  const bolt: SkillMod = { target: { type: 'skill', skill: 'storm_bolt' }, field: 'damagePercent', value: 0.2 };
  const variants = [{ skill: 'cleave', becomes: 'cleave_whirl' }];
  const off: SkillTreeNodeDef = heldPlace({ ...node, statMods: [...node.statMods, { stat: 'critChance', op: 'add', value: 0.05 }], skillMods: [roll, bolt], variants }, 'blade');
  assert.deepEqual(off.statMods, node.statMods);
  assert.deepEqual(off.skillMods, [roll, bolt]);
  assert.deepEqual(off.variants, variants);
  assert.equal(heldPlace(node, 'staff'), node);
  const sword: Equipment = { ...emptyEquipment(), weapon: made('rusted_blade') };
  const staff: Equipment = { ...emptyEquipment(), weapon: made('hexwood_staff') };
  const taken: readonly string[] = ['blade_thunderhead', 'heavy_hands'];
  const withSword = computeStats(TAGGED, 5, sword, taken);
  const withStaff = computeStats(TAGGED, 5, staff, taken);
  assert.ok(withSword.damagePercent > withStaff.damagePercent);
  assert.equal(withStaff.damagePercent, computeStats(TAGGED, 5, staff, ['blade_thunderhead']).damagePercent);
  assert.equal(computeStats(TAGGED, 5, staff, taken, [], 'blade').damagePercent, withSword.damagePercent);
});

void test('a skill change and a skill mod from another weapon\'s arm work with any weapon in hand', (): void => {
  const cleave = must(TAGGED.skills.get('cleave'), 'cleave');
  const bolt = must(TAGGED.skills.get('storm_bolt'), 'storm_bolt');
  const whirl: readonly string[] = ['heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave'];
  assert.equal(resolveSkill(TAGGED, cleave, whirl, [], [], 'blade').name, must(TAGGED.skills.get('cleave_whirl'), 'whirl').name);
  assert.equal(resolveSkill(TAGGED, cleave, whirl, [], [], 'heavy').name, must(TAGGED.skills.get('cleave_whirl'), 'whirl').name);
  const forked: readonly string[] = ['stormcallers_focus', 'storm_1', 'forked_bolt'];
  const count = (held: string | null, taken: readonly string[] = forked): number => {
    const delivery = resolveSkill(TAGGED, bolt, taken, [], [], held).delivery;
    return delivery.type === 'projectile' ? delivery.count : 0;
  };
  assert.equal(count('staff'), count('blade'));
  assert.equal(count(null), count('crossbow'));
  assert.ok(count('blade') > count('blade', []));
});

function armedWith(base: string): World {
  const world: World = createWorld(TAGGED, { seed: 3, save: null });
  world.player.inventory.fill(null);
  addToInventory(world, made(base));
  equipFromInventory(world, 0);
  world.player.bar = ['cleave', 'storm_bolt', null, null, null, null];
  world.player.cooldowns = {};
  world.player.mana = world.player.stats.maxMana;
  refreshPlayer(world);
  world.events.length = 0;
  return world;
}

function bolted(world: World): readonly WorldEvent[] {
  stepWorld(world, [{ type: 'skill', slot: 1, aim: { x: world.player.pos.x + 4, z: world.player.pos.z }, targetId: null }], 1 / 60);
  return world.events;
}

void test('a skill from another weapon\'s arm casts with any weapon, and costs its mana', (): void => {
  const blade: World = armedWith('rusted_blade');
  assert.equal(blade.player.wielding, 'blade');
  const mana: number = blade.player.mana;
  assert.ok(!bolted(blade).some((event: WorldEvent): boolean => event.type === 'notice'));
  assert.equal(blade.player.action?.skill.id, 'storm_bolt');
  assert.ok(blade.player.mana < mana);
  const staff: World = armedWith('hexwood_staff');
  assert.equal(staff.player.wielding, 'staff');
  assert.ok(!bolted(staff).some((event: WorldEvent): boolean => event.type === 'notice'));
  assert.equal(staff.player.action?.skill.id, 'storm_bolt');
});

function place(id: string): SkillTreeNodeDef {
  return must(content.skillTree.find((entry: SkillTreeNodeDef): boolean => entry.id === id), id);
}

void test('a place is bound to its weapon only when it has a weapon damage line that turns off without that weapon', (): void => {
  assert.equal(placeBound(place('heavy_hands')), true);
  assert.equal(placeBound(place('endless_turn')), false);
  assert.equal(placeBound(place('twice_told_bolt')), false);
  assert.equal(placeBound(place('forked_bolt')), false);
  assert.equal(placeBound({ ...place('heavy_hands'), weapon: null }), false);
  for (const node of content.skillTree) {
    const off: SkillTreeNodeDef = heldPlace(node, null);
    assert.deepEqual([off.skillMods, off.variants, off.triggers], [node.skillMods, node.variants, node.triggers], node.id);
    assert.equal(placeBound(node), off.statMods.length < node.statMods.length, node.id);
  }
});
