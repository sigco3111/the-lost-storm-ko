import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneTunnel } from '../../sim/content/tunnel-types.ts';
import type { CutSpring } from './prop-cutaway.ts';
import { springCut } from './prop-cutaway.ts';
import { pathDistance, roofOpacity, TUNNEL_ROOF, underShare } from './tunnel-roofs.ts';

const BENT: ZoneTunnel = { id: 'bent', path: [{ x: 0, z: 0 }, { x: 0, z: 20 }, { x: 10, z: 30 }], width: 6, roof: [{ prop: 'cave_ridge_b', x: 0, z: 10, y: 5, rotationDegrees: 0, size: 1 }] };

void test('the distance to a bent tunnel is measured to its nearest leg', (): void => {
  assert.equal(pathDistance(BENT.path, 4, 10), 4);
  assert.ok(Math.abs(pathDistance(BENT.path, 10, 20) - Math.hypot(5, 5)) < 1e-9);
  assert.equal(pathDistance(BENT.path, 0, -3), 3);
});

void test('a hero inside the tunnel is fully under the roof, and the share eases to nothing past the walls', (): void => {
  assert.equal(underShare(BENT, 0, 10), 1);
  assert.equal(underShare(BENT, 2.9, 10), 1);
  const edge: number = underShare(BENT, 3 + TUNNEL_ROOF.feather / 2, 10);
  assert.ok(edge > 0.4 && edge < 0.6, String(edge));
  assert.equal(underShare(BENT, 3 + TUNNEL_ROOF.feather + 1, 10), 0);
});

void test('the roof fades on a spring to a faint ghost while the hero walks in, and comes back when he leaves', (): void => {
  let spring: CutSpring = { level: 0, velocity: 0 };
  const seen: number[] = [];
  for (let frame: number = 0; frame < 90; frame += 1) {
    spring = springCut(spring, underShare(BENT, 0, 10), 1 / 60);
    seen.push(roofOpacity(spring.level));
  }
  assert.ok(seen.every((opacity: number, index: number): boolean => index === 0 || Math.abs(opacity - (seen[index - 1] ?? 1)) < 0.2), 'no frame jumps');
  assert.ok(Math.abs((seen.at(-1) ?? 1) - TUNNEL_ROOF.ghost) < 0.02);
  for (let frame: number = 0; frame < 120; frame += 1) spring = springCut(spring, underShare(BENT, 30, 10), 1 / 60);
  assert.equal(roofOpacity(spring.level), 1);
});
