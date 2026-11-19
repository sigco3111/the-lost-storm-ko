import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, MeshStandardMaterial } from 'three';
import { tintProp } from './prop-tint.ts';

void test('a prop tint darkens the material colour by multiplying it', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial({ color: new Color(1, 1, 1) });
  tintProp(material, '#6a625a');
  assert.equal(material.color.getHexString(), '6a625a');
});

void test('no tint leaves the material colour as it was', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial({ color: new Color(0.5, 0.25, 1) });
  const before: string = material.color.getHexString();
  assert.equal(tintProp(material, null), material);
  assert.equal(material.color.getHexString(), before);
});
