import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Group, Mesh, ShaderMaterial } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { strandSpan } from './strand-shape.ts';
import type { StrandHandle, StrandLook } from './strands.ts';
import { createStrands, sheathColor, STRAND_FRAGMENT, STRAND_VERTEX, STRANDS } from './strands.ts';

const LOOK: StrandLook = { forks: 2, glow: 0.5, afterglow: 0.2, jitter: 0.5, width: 1, core: 1 };
const BLUE: Color = new Color(0x9be1ff);
const A = { x: 0, y: 1.3, z: 0 } as const;
const B = { x: 5, y: 1.1, z: 1 } as const;

void test('the strand shaders never take pow of an unclamped value or smoothstep with reversed edges', (): void => {
  assert.deepEqual(unsafeGlsl(STRAND_VERTEX), []);
  assert.deepEqual(unsafeGlsl(STRAND_FRAGMENT), []);
});

void test('the pool never holds more strands than its cap, and a new strike takes the oldest one', (): void => {
  const parent: Group = new Group();
  const strands = createStrands(parent, 4);
  assert.equal(parent.children.length, 4);
  for (let index: number = 0; index < 9; index += 1) {
    assert.ok(strands.strike(A, B, BLUE, LOOK, 0, true));
    strands.update(0.01);
  }
  assert.equal(strands.active, 4);
  assert.equal(parent.children.length, 4);
  assert.equal(parent.children.filter((child): boolean => child.visible).length, 4);
});

void test('a strike frees its slot once its span has passed, and a delayed strike waits before it lights', (): void => {
  const parent: Group = new Group();
  const strands = createStrands(parent, 2);
  strands.strike(A, B, BLUE, LOOK, 0.1, false);
  strands.update(0.05);
  assert.equal(strands.active, 1);
  strands.update(strandSpan(LOOK.afterglow) + 0.06);
  assert.equal(strands.active, 0);
  assert.equal(parent.children.filter((child): boolean => child.visible).length, 0);
});

void test('a held strand is never taken by a strike, and the pool says no when every slot is held', (): void => {
  const parent: Group = new Group();
  const strands = createStrands(parent, 2);
  const first: StrandHandle | null = strands.hold(BLUE, LOOK);
  const second: StrandHandle | null = strands.hold(BLUE, LOOK);
  assert.notEqual(first, null);
  assert.notEqual(second, null);
  assert.equal(strands.hold(BLUE, LOOK), null);
  assert.equal(strands.strike(A, B, BLUE, LOOK, 0, true), false);
  first?.fade();
  strands.update(LOOK.afterglow + 0.01);
  assert.equal(strands.active, 1);
  assert.ok(strands.strike(A, B, BLUE, LOOK, 0, true));
  strands.clear();
  assert.equal(strands.active, 0);
});

void test('a look widens its strand and softens its core through the material', (): void => {
  const parent: Group = new Group();
  const strands = createStrands(parent, 1);
  strands.strike(A, B, BLUE, { ...LOOK, width: 2, core: 0.25 }, 0, false);
  const child: unknown = parent.children[0];
  assert.ok(child instanceof Mesh);
  const material: unknown = child.material;
  assert.ok(material instanceof ShaderMaterial);
  assert.equal(material.uniforms['uWidth']?.value, STRANDS.width * 2);
  assert.equal(material.uniforms['uCore']?.value, 0.25);
});

void test('a blue bolt gets a sheath that leans violet and is more saturated, while a gold one keeps its hue', (): void => {
  const blue: { h: number; s: number; l: number } = { h: 0, s: 0, l: 0 };
  const sheath: { h: number; s: number; l: number } = { h: 0, s: 0, l: 0 };
  BLUE.getHSL(blue);
  sheathColor(BLUE, new Color()).getHSL(sheath);
  assert.ok(sheath.h > blue.h + 0.03);
  assert.ok(sheath.s >= STRANDS.sheathSaturation - 1e-6);
  const gold: Color = new Color(0xf2e08a);
  const goldHsl: { h: number; s: number; l: number } = { h: 0, s: 0, l: 0 };
  const goldSheath: { h: number; s: number; l: number } = { h: 0, s: 0, l: 0 };
  gold.getHSL(goldHsl);
  sheathColor(gold, new Color()).getHSL(goldSheath);
  assert.ok(Math.abs(goldSheath.h - goldHsl.h) < 1e-3);
});

void test('a held strand crackles: its light flickers between reshapes but never goes dark or runs away', (): void => {
  const parent: Group = new Group();
  let roll: number = 0;
  const strands = createStrands(parent, 1, (): number => {
    roll = (roll * 9301 + 49297) % 233280;
    return roll / 233280;
  });
  const handle: StrandHandle | null = strands.hold(BLUE, LOOK);
  assert.ok(handle !== null);
  const child: unknown = parent.children[0];
  assert.ok(child instanceof Mesh);
  const material: unknown = child.material;
  assert.ok(material instanceof ShaderMaterial);
  const seen: number[] = [];
  for (let frame: number = 0; frame < 120; frame += 1) {
    if (frame % 3 === 0) handle.shape(A, B, Math.random);
    handle.light(0.8);
    strands.update(1 / 60);
    const value: unknown = material.uniforms['uStrength']?.value;
    assert.ok(typeof value === 'number');
    seen.push(value);
  }
  assert.ok(Math.min(...seen) >= 0.8 * STRANDS.crackleMin - 1e-9);
  assert.ok(Math.max(...seen) <= 0.8 * (1 + STRANDS.crackleFlash) + 1e-9);
  assert.ok(Math.max(...seen) - Math.min(...seen) > 0.1);
  assert.equal(material.uniforms['uGrow']?.value, 1);
});
