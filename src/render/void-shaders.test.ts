import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIST_FRAGMENT, MIST_LAYER_FRAGMENT, MIST_SKIP } from './void-shaders.ts';

void test('a mist layer skips its noise only where the land hides it whatever the noise says', (): void => {
  const body: number = MIST_SKIP.body * 2;
  assert.ok(MIST_FRAGMENT.includes(`(body - 0.5) * ${body.toFixed(1)}`));
  assert.match(MIST_FRAGMENT, /float ashore = dot\(q - uShore\.xy, uShore\.zw\) \+ \(voidFbm\(q \* 0\.09 \+ 3\.0\) - 0\.5\) \* uShoreLook\.z \+ \(body - 0\.5\) \* /);
  assert.match(MIST_FRAGMENT, /float land = uShoreLook\.y \* smoothstep\(uLand\.x, uLand\.y, ashore\);/);
  assert.match(MIST_FRAGMENT, /if \(uShoreLook\.y >= uLandGone\.x && dot\(q - uShore\.xy, uShore\.zw\) - uLandGone\.y >= uLand\.y\) discard;/);
  const main: string = MIST_FRAGMENT.slice(MIST_FRAGMENT.indexOf('void main()'));
  assert.ok(main.indexOf('discard;') < main.indexOf('voidFbm('));
});

void test('a mist layer drawn into the frame skips the land exactly where its shading skips it', (): void => {
  const skip: RegExp = /if \(uShoreLook\.y >= uLandGone\.x && dot\(q - uShore\.xy, uShore\.zw\) - uLandGone\.y >= uLand\.y\) discard;/;
  assert.match(MIST_LAYER_FRAGMENT, skip);
  const main: string = MIST_LAYER_FRAGMENT.slice(MIST_LAYER_FRAGMENT.indexOf('void main()'));
  assert.ok(main.indexOf('discard;') < main.indexOf('texture2D(uShade'));
  assert.match(main, /vec2 q = toGround\(vWorld\.xz, uHeight\) - uShift;/);
});

void test('the grain is added once, at full resolution, to the colour and the opacity of each layer', (): void => {
  const shading: string = MIST_FRAGMENT.slice(MIST_FRAGMENT.indexOf('void main()'));
  assert.ok(!shading.includes('voidDither('));
  assert.match(shading, /gl_FragColor = vec4\(color, density \* uOpacity \* \(1\.0 \+ veil \* uThickness\.y\) \* eye\);/);
  assert.match(MIST_LAYER_FRAGMENT, /float grain = voidDither\(gl_FragCoord\.xy \+ uSeed \* 7\.0\) \* uDither;/);
  assert.match(MIST_LAYER_FRAGMENT, /gl_FragColor = vec4\(shade\.rgb \+ grain, clamp\(shade\.a \+ grain, 0\.0, 1\.0\)\);/);
  assert.match(MIST_LAYER_FRAGMENT, /texture2D\(uShade, gl_FragCoord\.xy \/ uScreen\)/);
});
