import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import type { Envelope, ShellLevel, ShellPlan, Triangle } from './headgear-shapes.ts';
import { addTriangle, anglesOf, buildLathe, buildShell, buildTube, direction, envelopeOf, innerRadius, smoothParts, smoothstep, triangleCount, wrapDegrees } from './headgear-shapes.ts';

const SPHERE = {
  radius: 0.1,
  step: 4,
  clearance: 0.005,
  thickness: 0.004,
  close: 1e-3,
} as const;

function sphere(centre: Vector3): Vector3[] {
  const points: Vector3[] = [];
  for (let phi: number = -88; phi <= 88; phi += SPHERE.step) for (let theta: number = -180; theta < 180; theta += SPHERE.step) points.push(direction(theta, phi).multiplyScalar(SPHERE.radius).add(centre));
  return points;
}

function flat(phi: number, material: string): ShellLevel {
  return { phi: (): number => phi, lift: (): number => 0, material: (): string => material };
}

function plan(envelope: Envelope, closed: boolean): ShellPlan {
  return {
    envelope,
    clearance: SPHERE.clearance,
    thickness: SPHERE.thickness,
    thetaFrom: closed ? -180 : -60,
    thetaTo: closed ? 180 : 60,
    columns: 24,
    closed,
    pole: false,
    liftInner: false,
    levels: [flat(-20, 'plate'), flat(0, 'plate'), flat(20, 'plate')],
    inside: 'lining',
    rim: 'trim',
  };
}

function outwardShare(soup: readonly Triangle[], centre: Vector3, material: string): number {
  const own: Triangle[] = soup.filter((triangle: Triangle): boolean => triangle.material === material);
  const outward: number = own.filter((triangle: Triangle): boolean => {
    const [a, b, c] = triangle.corners;
    const normal: Vector3 = b.clone().sub(a).cross(c.clone().sub(a));
    const middle: Vector3 = a.clone().add(b).add(c).divideScalar(3).sub(centre);
    return normal.dot(middle) > 0;
  }).length;
  return outward / own.length;
}

void test('a direction and its angles turn back into each other, with the face at zero and the left side positive', (): void => {
  for (const [theta, phi] of [[0, 0], [45, 10], [-120, -30], [170, 60]] as const) {
    const back = anglesOf(direction(theta, phi));
    assert.ok(Math.abs(back.theta - theta) < 1e-6 && Math.abs(back.phi - phi) < 1e-6, `${theta} ${phi}`);
  }
  assert.ok(direction(0, 0).z > 0.999);
  assert.ok(direction(90, 0).x > 0.999);
  assert.equal(wrapDegrees(190), -170);
  assert.equal(wrapDegrees(-190), 170);
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});

void test('the envelope of a sphere sits on the sphere and never inside it', (): void => {
  const centre: Vector3 = new Vector3(0, 1.6, 0);
  const envelope: Envelope = envelopeOf(sphere(centre), centre, { cone: 4, spread: 1, blur: 2 });
  for (const [theta, phi] of [[0, 0], [90, 30], [-150, -40], [33, 70]] as const) {
    const radius: number = envelope.radius(theta, phi);
    assert.ok(radius >= SPHERE.radius - SPHERE.close && radius < SPHERE.radius + SPHERE.close * 8, `${theta} ${phi} ${radius}`);
  }
});

void test('a shell faces out on its outer side and in on its lining, and stands its clearance off the envelope only where it covers', (): void => {
  const centre: Vector3 = new Vector3();
  const envelope: Envelope = { centre, radius: (): number => SPHERE.radius };
  for (const closed of [true, false]) {
    const soup: Triangle[] = [];
    buildShell(soup, plan(envelope, closed));
    assert.equal(outwardShare(soup, centre, 'plate'), 1, `${closed}`);
    assert.equal(outwardShare(soup, centre, 'lining'), 0, `${closed}`);
    assert.ok(soup.some((triangle: Triangle): boolean => triangle.material === 'trim'));
  }
  const open: ShellPlan = plan(envelope, false);
  assert.equal(innerRadius(open, 0, 0), SPHERE.radius + SPHERE.clearance);
  assert.equal(innerRadius(open, 90, 0), null);
  assert.equal(innerRadius(open, 0, 40), null);
});

void test('a lathe and a tube close into outward-facing solids, and smoothing keeps every triangle', (): void => {
  const soup: Triangle[] = [];
  const origin: Vector3 = new Vector3(0, 0, 0.2);
  buildLathe(soup, { origin, normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), segments: 16, turn: 0, profile: [{ radius: 0, height: 0.01 }, { radius: 0.02, height: 0.01 }, { radius: 0.02, height: 0 }], materials: ['lens'] });
  assert.equal(outwardShare(soup, origin.clone().add(new Vector3(0, 0, 0.005)), 'lens'), 1);
  const path: Vector3[] = Array.from({ length: 9 }, (_: unknown, index: number): Vector3 => new Vector3(index * 0.01, Math.sin(index / 3) * 0.01, 0));
  const tube: Triangle[] = [];
  buildTube(tube, path, 0.002, 6, 'trim');
  assert.equal(tube.length, 8 * 6 * 2 + 2 * 4);
  const parts = smoothParts([...soup, ...tube], 40, new Vector3());
  assert.equal(triangleCount(parts), soup.length + tube.length);
  assert.deepEqual(parts.map((part): string => part.material).toSorted(), ['lens', 'trim']);
});

void test('a triangle a fraction of a millimetre across is kept, and one with no area is dropped', (): void => {
  const soup: Triangle[] = [];
  addTriangle(soup, new Vector3(), new Vector3(0.0003, 0, 0), new Vector3(0, 0.0003, 0), 'tiny', null);
  addTriangle(soup, new Vector3(), new Vector3(0.001, 0, 0), new Vector3(0.002, 0, 0), 'flat', null);
  assert.deepEqual(soup.map((triangle: Triangle): string => triangle.material), ['tiny']);
});
