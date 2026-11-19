import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh } from 'three';
import type { Object3D } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { ItemBaseDef } from '../../sim/content/types.ts';
import type { Keepsake } from './keepsake.ts';
import { KEEPSAKE_MODELS } from './keepsake-models.ts';

void test('every keepsake an item names has a model that builds meshes and lets them go', (): void => {
  const named: string[] = [...loadContent().itemBases.values()].flatMap((base: ItemBaseDef): string[] => (base.keepsake === null ? [] : [base.keepsake]));
  assert.ok(named.includes('thread_ring'));
  for (const model of named) {
    const build: (() => Keepsake) | undefined = KEEPSAKE_MODELS.get(model);
    assert.ok(build !== undefined, `no keepsake model ${model}`);
    const made: Keepsake = build();
    let meshes: number = 0;
    made.group.traverse((object: Object3D): void => {
      if (object instanceof Mesh) meshes += 1;
    });
    assert.ok(meshes > 0);
    made.dispose();
  }
});
