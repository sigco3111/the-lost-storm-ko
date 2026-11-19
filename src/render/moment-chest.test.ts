import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { BufferGeometry } from 'three';
import type { PropLid } from '../../sim/content/types.ts';
import { chestParts } from './moment-chest.ts';

const LID: PropLid = { seam: 0.2, hinge: -0.3, degrees: 100 };

function chestModel(): Group {
  const model: Group = new Group();
  const body: Mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  body.position.y = 0;
  model.add(body);
  model.add(new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial()));
  return model;
}

function heights(geometry: BufferGeometry): number[] {
  const position: unknown = geometry.getAttribute('position');
  assert.ok(position instanceof BufferAttribute);
  const found: number[] = [];
  for (let index: number = 0; index < position.count; index += 1) found.push(position.getY(index));
  return found;
}

void test('a chest model is split at its seam once, and every later chest of that model reuses the same parts', (): void => {
  const model: Group = chestModel();
  const first: readonly unknown[] = chestParts(model, LID);
  const again: readonly unknown[] = chestParts(model, LID);
  assert.equal(again, first);
  assert.notEqual(chestParts(chestModel(), LID), first);
  assert.notEqual(chestParts(model, { ...LID, seam: 0.1 }), first);
});

void test('only standard-material meshes become chest parts, each cut into a base below the seam and a lid above it', (): void => {
  const parts = chestParts(chestModel(), LID);
  assert.equal(parts.length, 1);
  const [part] = parts;
  assert.ok(part !== undefined);
  assert.ok(heights(part.base).length > 0 && heights(part.top).length > 0);
  for (let corner: number = 0; corner + 2 < heights(part.base).length; corner += 3) {
    const middle: number = ((heights(part.base)[corner] ?? 0) + (heights(part.base)[corner + 1] ?? 0) + (heights(part.base)[corner + 2] ?? 0)) / 3;
    assert.ok(middle <= LID.seam, `base triangle centred at ${middle}`);
  }
  for (let corner: number = 0; corner + 2 < heights(part.top).length; corner += 3) {
    const middle: number = ((heights(part.top)[corner] ?? 0) + (heights(part.top)[corner + 1] ?? 0) + (heights(part.top)[corner + 2] ?? 0)) / 3;
    assert.ok(middle >= -1e-6, `lid triangle centred at ${middle} below its hinge`);
  }
  assert.ok(part.base.boundingSphere !== null && part.top.boundingSphere !== null);
});
