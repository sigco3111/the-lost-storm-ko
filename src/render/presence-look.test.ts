import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, ShaderMaterial } from 'three';
import type { Object3D } from 'three';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { BossPresence, Content, MonsterDef } from '../../sim/content/types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { createPresenceLook, presenceOf } from './presence-look.ts';

const STEP: number = 1 / 60;
const gate: MonsterDef = must(ARENA_CONTENT.monsters.get('timekeeper_gatekeeper'), 'gatekeeper');
const PRESENCE: BossPresence = { color: '#e8c46a', radius: 2.4, glow: 0.3 };

const CONTENT: Content = {
  ...ARENA_CONTENT,
  monsters: new Map<string, MonsterDef>([
    ...ARENA_CONTENT.monsters,
    ['p_boss', { ...gate, id: 'p_boss', boss: { ...must(gate.boss, 'gate boss'), presence: PRESENCE } }],
    ['p_plain', { ...gate, id: 'p_plain', boss: { ...must(gate.boss, 'gate boss'), presence: null } }],
  ]),
};

function lit(parent: Object3D): { readonly strength: number; readonly x: number }[] {
  const found: { readonly strength: number; readonly x: number }[] = [];
  parent.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const material: unknown = object.material;
    if (!(material instanceof ShaderMaterial)) return;
    const strength: unknown = material.uniforms['uStrength']?.value;
    if (typeof strength === 'number') found.push({ strength, x: object.position.x });
  });
  return found;
}

void test('a boss with a presence stands in a ground light that eases in, follows him, and fades out after he falls; a boss without one has none', (): void => {
  const world: World = arena(5, CONTENT);
  const boss: MonsterState = place(world, 'p_boss', ARENA_CENTRE);
  const plain: MonsterState = place(world, 'p_plain', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  assert.deepEqual(presenceOf(boss), PRESENCE);
  assert.equal(presenceOf(plain), null);
  const parent: Group = new Group();
  const look = createPresenceLook(parent);
  look.update(STEP, world);
  const first = lit(parent);
  assert.equal(first.length, 1);
  assert.ok(must(first[0], 'light').strength < PRESENCE.glow * 0.5, 'eases in');
  for (let frame: number = 0; frame < 90; frame += 1) look.update(STEP, world);
  assert.ok(Math.abs(must(lit(parent)[0], 'light').strength - PRESENCE.glow) < 0.02);
  boss.pos = { x: ARENA_CENTRE.x - 3, z: ARENA_CENTRE.z };
  look.update(STEP, world);
  assert.equal(must(lit(parent)[0], 'light').x, ARENA_CENTRE.x - 3);
  boss.alive = false;
  look.update(STEP, world);
  assert.ok(must(lit(parent)[0], 'light').strength > PRESENCE.glow * 0.5, 'still there the frame after he falls');
  for (let frame: number = 0; frame < 120; frame += 1) look.update(STEP, world);
  assert.deepEqual(lit(parent), []);
});
