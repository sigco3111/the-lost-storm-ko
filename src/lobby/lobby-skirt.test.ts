import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, ShaderLib } from 'three';
import { groundContact } from './lobby-contact.ts';
import type { Rubble, SetPiece, Skirt } from './lobby-sets.ts';
import { SKIRT_FRAGMENT_BODY, skirtRubble, skirtUniforms, withSkirt } from './lobby-skirt.ts';
import type { SkirtShader } from './lobby-skirt.ts';

const SKIRT: Skirt = { height: 0.4, contact: 0.5, darken: 0.45, hue: 0.3, rubble: null };
const RUBBLE: Rubble = { prop: 'rubble_chip', count: 4, sizeMin: 0.5, sizeMax: 0.8, from: 0.9, to: 1.4, minRadius: 0.7 };

function piece(prop: string, x: number, z: number, extra: Partial<SetPiece> = {}): SetPiece {
  return { prop, x, z, y: 0, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, size: 1, sink: 0, mound: false, swayDegrees: 0, skirt: true, ...extra };
}

void test('a piece shader is given the ground skirt after its own colour, with the ground field and the ground surface', (): void => {
  const shader: SkirtShader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} };
  withSkirt(shader, skirtUniforms(SKIRT, { map: null, color: new Color(0.3, 0.3, 0.32), metres: 3.2 }, groundContact([])));
  assert.ok(shader.vertexShader.includes('vSkirtWorld = skirtWorld.xyz;'));
  assert.ok(shader.vertexShader.indexOf('#include <project_vertex>') < shader.vertexShader.indexOf('vSkirtWorld = skirtWorld.xyz;'));
  assert.ok(shader.fragmentShader.indexOf('#include <color_fragment>') < shader.fragmentShader.indexOf(SKIRT_FRAGMENT_BODY));
  for (const name of ['uGroundField', 'uSkirtMap', 'uSkirtColor', 'uSkirtTile', 'uSkirtHeight', 'uSkirtDarken', 'uSkirtHue']) assert.ok(name in shader.uniforms, name);
  assert.equal(shader.uniforms['uSkirtTile']?.value, 1 / 3.2);
  assert.throws((): void => withSkirt({ vertexShader: 'void main() {}', fragmentShader: 'void main() {}', uniforms: {} }, {}));
});

void test('rubble of the ground gathers round the base of every large piece that stands on the ground, and nowhere else', (): void => {
  const pieces: readonly SetPiece[] = [piece('wall', 10, 0), piece('cup', -10, 0), piece('banner', 0, 10, { swayDegrees: 3 }), piece('stalactite', 0, -10, { y: 4 }), piece('kept', 5, 5, { skirt: false })];
  const sizes: Readonly<Record<string, number>> = { wall: 2, cup: 0.2, banner: 2, stalactite: 2, kept: 2 };
  const stones: readonly SetPiece[] = skirtRubble(pieces, RUBBLE, (one: SetPiece): number => sizes[one.prop] ?? 0);
  assert.equal(stones.length, RUBBLE.count);
  for (const stone of stones) {
    const reach: number = Math.hypot(stone.x - 10, stone.z);
    assert.ok(reach >= 2 * RUBBLE.from - 1e-9 && reach <= 2 * RUBBLE.to + 1e-9, `${reach}`);
    assert.ok(stone.size >= RUBBLE.sizeMin && stone.size <= RUBBLE.sizeMax);
    assert.equal(stone.prop, RUBBLE.prop);
  }
  assert.deepEqual(skirtRubble(pieces, RUBBLE, (one: SetPiece): number => sizes[one.prop] ?? 0), stones);
});
