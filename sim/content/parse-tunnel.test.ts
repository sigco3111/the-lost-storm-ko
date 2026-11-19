import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoneTunnels } from './parse-tunnel.ts';
import { ContentError } from './read.ts';

const ROOF = { prop: 'cave_ridge_b', x: 4, z: 6, y: 4.5, rotationDegrees: 90 };

void test('a zone with no tunnels has none, and a tunnel reads its path, width and roof with a default size', (): void => {
  assert.deepEqual(zoneTunnels(undefined, 'zone.tunnels'), []);
  const read = zoneTunnels([{ id: 'deep', path: [{ x: 0, z: 0 }, { x: 0, z: 12 }], width: 6, roof: [ROOF, { ...ROOF, size: 0.8 }] }], 'zone.tunnels');
  assert.deepEqual(read, [{ id: 'deep', path: [{ x: 0, z: 0 }, { x: 0, z: 12 }], width: 6, roof: [{ ...ROOF, size: 1 }, { ...ROOF, size: 0.8 }] }]);
});

void test('a tunnel needs two points, a roof, a width and its own id', (): void => {
  assert.throws((): unknown => zoneTunnels([{ id: 'deep', path: [{ x: 0, z: 0 }], width: 6, roof: [ROOF] }], 'zone.tunnels'), ContentError);
  assert.throws((): unknown => zoneTunnels([{ id: 'deep', path: [{ x: 0, z: 0 }, { x: 0, z: 9 }], width: 6, roof: [] }], 'zone.tunnels'), ContentError);
  assert.throws((): unknown => zoneTunnels([{ id: 'deep', path: [{ x: 0, z: 0 }, { x: 0, z: 9 }], width: 0, roof: [ROOF] }], 'zone.tunnels'), ContentError);
  const one = { id: 'deep', path: [{ x: 0, z: 0 }, { x: 0, z: 9 }], width: 6, roof: [ROOF] };
  assert.throws((): unknown => zoneTunnels([one, one], 'zone.tunnels'), ContentError);
});
