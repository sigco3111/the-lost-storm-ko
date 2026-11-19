import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferAttribute, InterleavedBufferAttribute } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { PropDef } from '../../sim/content/prop-types.ts';
import { isClutter, pathAlpha, pathGeometry, pathStones, pathWidth, SHORE_PATH, SHORE_PHONE } from './shore-props.ts';

void test('the worn path is solid down its middle, fades to nothing at its sides and both ends', (): void => {
  assert.equal(pathAlpha(0, 20, 58), 0);
  assert.equal(pathAlpha(1, 20, 58), 0);
  assert.ok(pathAlpha(0.5, 20, 58) > 0);
  assert.ok(pathAlpha(0.5, 44, 58) > pathAlpha(0.5, 8, 58));
  assert.equal(pathAlpha(0.5, 0, 58), 0);
  assert.equal(pathAlpha(0.5, 58, 58), 0);
});

void test('the worn path lies flat on the ground, starts just past the line and runs its length ashore', (): void => {
  const geometry = pathGeometry({ surface: 'crag_ground', width: 2.6, length: 58, sway: 1.4, rubble: [] });
  const positions: BufferAttribute | InterleavedBufferAttribute = geometry.getAttribute('position');
  let least: number = Infinity;
  let most: number = -Infinity;
  for (let index: number = 0; index < positions.count; index += 1) {
    assert.equal(positions.getY(index), 0);
    least = Math.min(least, positions.getZ(index));
    most = Math.max(most, positions.getZ(index));
  }
  assert.equal(least, SHORE_PATH.start);
  assert.equal(most, SHORE_PATH.start + 58);
  const up = geometry.getAttribute('normal');
  assert.ok(up.getY(0) > 0.99);
  geometry.dispose();
});

void test('loose stones lie along both edges of the worn path, never down its middle', (): void => {
  const path = { surface: 'crag_ground', width: 2.6, length: 58, sway: 1.4, rubble: ['a', 'b'] };
  const stones = pathStones(path);
  assert.ok(stones.length > 40);
  assert.ok(stones.some((stone): boolean => stone.prop === 'a') && stones.some((stone): boolean => stone.prop === 'b'));
  for (const stone of stones) {
    const along: number = stone.z - SHORE_PATH.start;
    const centre: number = path.sway * Math.sin(along * SHORE_PATH.wave);
    assert.ok(Math.abs(stone.x - centre) > (pathWidth(path, along) * SHORE_PATH.edge) / 2 - 0.2);
  }
  assert.deepEqual(pathStones({ ...path, rubble: [] }), []);
});

void test('a phone leaves out only the low ground clutter of the shore that blocks nothing, and keeps every tall shape', (): void => {
  const content = loadContent();
  const used: readonly PropDef[] = [...new Set<string>([...content.zones.values()].flatMap((zone): readonly string[] => (zone.void?.shore?.props ?? []).map((placed): string => placed.prop)))].flatMap((id: string): readonly PropDef[] => {
    const def: PropDef | undefined = content.props.get(id);
    return def === undefined ? [] : [def];
  });
  const left: readonly PropDef[] = used.filter(isClutter);
  assert.ok(left.length > 0);
  assert.ok(left.length < used.length / 2);
  for (const def of left) {
    assert.deepEqual(def.footprints, [], def.id);
    assert.equal(def.blockRadius, 0, def.id);
    assert.ok(def.height < SHORE_PHONE.clutterBelow, def.id);
  }
  assert.ok(used.filter((def: PropDef): boolean => def.height > SHORE_PHONE.clutterBelow * 3).every((def: PropDef): boolean => !isClutter(def)));
});
