import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShaderLib } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { GROUND_EDGE, groundEdgeFragment, patchGroundShader } from './wet-ground.ts';

void test('a fading ground layer is cut along noise, so its edge is never a straight line', (): void => {
  const source: string = groundEdgeFragment();
  assert.deepEqual(unsafeGlsl(source), []);
  assert.match(source, /groundCut = mix\( 0\.05, 0\.42, groundFbm\( vGroundXZ \* 1\.3/);
  assert.match(source, /groundEdge = smoothstep\( groundCut - 0\.08, groundCut \+ 0\.08, groundShare \);/);
});

void test('the cut only takes coverage away and leaves a whole surface untouched', (): void => {
  const source: string = groundEdgeFragment();
  assert.match(source, /diffuseColor\.a \*= groundEdge;/);
  assert.doesNotMatch(source, /\//);
  assert.match(source, /if \( vColor\.a < 0\.999 \)/);
  const band: readonly number[] = [0, GROUND_EDGE.low, GROUND_EDGE.high, 1 - GROUND_EDGE.soft];
  assert.deepEqual(band.toSorted((a: number, b: number): number => a - b), band);
});

void test('the cut runs right after the vertex colour is applied, before the glow reads it', (): void => {
  const shader: { vertexShader: string; fragmentShader: string } = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
  patchGroundShader(shader, 0);
  assert.match(shader.fragmentShader, /#include <color_fragment>\nfloat groundShare = 1\.0;/);
  assert.ok(shader.fragmentShader.indexOf('float groundFbm( vec2 p )') < shader.fragmentShader.indexOf('groundCut = mix('));
  assert.ok(shader.fragmentShader.indexOf('groundEdge = smoothstep(') < shader.fragmentShader.indexOf('#include <emissivemap_fragment>'));
});
