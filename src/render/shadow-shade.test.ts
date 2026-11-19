import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillDef } from '../../sim/content/types.ts';
import { isInvulnerable } from '../../sim/world/dash.ts';
import { startSkill } from '../../sim/world/skills.ts';
import { stepWorld } from '../../sim/world/step.ts';
import type { World } from '../../sim/world/types.ts';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { createRigGlow } from './ghost-material.ts';
import type { RigGlow } from './ghost-material.ts';
import type { ShadeMotion } from './shadow-shade.ts';
import { SHADOW_SHADE, shadeFragment, shadeHeld, shadowOf, stepShade } from './shadow-shade.ts';

const content: Content = loadContent();
const STEP: number = 1 / 60;
const LIMITS = { jump: 0.2, settled: 0.5 } as const;

function rolling(): World {
  const world: World = armed(worldIn(content, content.world.start, 5));
  const roll: SkillDef = must(content.skills.get('dodge_roll'), 'dodge_roll');
  startSkill(world, world.player, roll, { x: 1, z: 0 });
  return world;
}

void test('the dodge roll names its shadow in data and a plain skill has none', (): void => {
  const roll: SkillDef = must(content.skills.get('dodge_roll'), 'dodge_roll');
  assert.ok(roll.vfx.shadow !== null);
  assert.ok(roll.vfx.shadow.strength > 0 && roll.vfx.shadow.strength <= 1);
  const cleave: SkillDef = must(content.skills.get('cleave'), 'cleave');
  assert.equal(cleave.vfx.shadow, null);
});

void test('the hero is a shadow only while the roll keeps the hero from harm', (): void => {
  const world: World = rolling();
  assert.ok(isInvulnerable(world.player));
  assert.notEqual(shadowOf(world.player), null);
  for (let tick: number = 0; tick < 60 && isInvulnerable(world.player); tick += 1) stepWorld(world, [], STEP);
  assert.equal(isInvulnerable(world.player), false);
  assert.equal(shadowOf(world.player), null);
});

void test('Shadow Step keeps the hero a shadow through the whole step, and Mist Step casts none', (): void => {
  const world: World = armed(worldIn(content, content.world.start, 5));
  const step: SkillDef = must(content.skills.get('dodge_roll_slip'), 'dodge_roll_slip');
  startSkill(world, world.player, step, { x: 1, z: 0 });
  assert.notEqual(shadowOf(world.player), null);
  let phases: number = 0;
  for (let tick: number = 0; tick < 60 && world.player.action !== null; tick += 1) {
    assert.notEqual(shadowOf(world.player), null);
    phases += 1;
    stepWorld(world, [], STEP);
  }
  assert.ok(phases > 1);
  assert.equal(shadowOf(world.player), null);
  const mist: SkillDef = must(content.skills.get('mist_step'), 'mist_step');
  assert.equal(mist.vfx.shadow, null);
});

void test('the shade eases in and out without a jump and comes to rest', (): void => {
  const motion: ShadeMotion = { value: 0, speed: 0 };
  let last: number = 0;
  for (let tick: number = 0; tick < 15; tick += 1) {
    stepShade(motion, 0.9, STEP);
    assert.ok(motion.value - last < LIMITS.jump, `frame ${String(tick)} jumped ${String(motion.value - last)}`);
    last = motion.value;
  }
  assert.ok(motion.value > LIMITS.settled);
  for (let tick: number = 0; tick < 120; tick += 1) {
    stepShade(motion, 0, STEP);
    assert.ok(last - motion.value < LIMITS.jump);
    assert.ok(motion.value >= 0 && motion.value <= 1);
    last = motion.value;
  }
  assert.equal(motion.value, 0);
  assert.equal(motion.speed, 0);
});

void test('a held piece takes the shadow through its own shader without touching the shared template', (): void => {
  const fragment: string = shadeFragment('void main() {\n#include <emissivemap_fragment>\n#include <lights_fragment_end>\n}');
  assert.ok(fragment.includes('uniform float uShadeMix;'));
  assert.ok(fragment.indexOf('uniform float uShadeMix;') < fragment.indexOf('void main() {'));
  assert.ok(fragment.includes('diffuseColor.a *= 1.0 - uShadeMix'));
  assert.ok(fragment.includes('reflectedLight.directSpecular *= 1.0 - uShadeMix + uShadeWet'));
  assert.ok(fragment.includes('uniform float uShadeWet;'));
  assert.ok(fragment.includes('diffuseColor.rgb *= 1.0 - uShadeWet'));
  const shared: MeshStandardMaterial = new MeshStandardMaterial();
  const template: Group = new Group();
  template.add(new Mesh(new BoxGeometry(), shared));
  const copy: Group = template.clone(true);
  const glow: RigGlow = createRigGlow();
  const sink: MeshStandardMaterial[] = [];
  shadeHeld(copy, glow, sink);
  assert.equal(sink.length, 1);
  const held: unknown = copy.children[0];
  const kept: unknown = template.children[0];
  assert.ok(held instanceof Mesh && kept instanceof Mesh);
  assert.notEqual(held.material, shared);
  assert.equal(kept.material, shared);
  assert.equal(sink[0]?.customProgramCacheKey(), SHADOW_SHADE.programKey);
});
