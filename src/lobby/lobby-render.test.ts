import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Material, Object3D, Scene } from 'three';
import { ACESFilmicToneMapping, CustomToneMapping, LinearSRGBColorSpace, Mesh, NoToneMapping, ShaderMaterial, SRGBColorSpace, Texture, Vector2 } from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ditheredOutputPass } from '../render/output-dither.ts';
import { backdropMaterial, bloomMaterials, bloomOutputFragment, LOBBY_RENDER, lobbyPixelRatio, outputDefines, quadScene } from './lobby-render.ts';

void test('the lobby draws at the device ratio up to 2 on desktop and 1.5 on mobile when the canvas has that many pixels', (): void => {
  assert.equal(lobbyPixelRatio('desktop', 3, 3), 2);
  assert.equal(lobbyPixelRatio('desktop', 2, 2), 2);
  assert.equal(lobbyPixelRatio('desktop', 1, 2), 1);
  assert.equal(lobbyPixelRatio('mobile', 3, 3), 1.5);
  assert.equal(lobbyPixelRatio('mobile', 0, 0), 1);
});

void test('the lobby never draws more pixels than the canvas shows, so it does not supersample on the GPU every frame', (): void => {
  assert.equal(lobbyPixelRatio('desktop', 2, 1.5), 1.5);
  assert.equal(lobbyPixelRatio('mobile', 3, 1.25), 1.25);
  for (const name of ['desktop', 'mobile'] as const) {
    for (const device of [1, 1.5, 2, 3]) {
      for (const canvas of [0.75, 1, 1.25, 1.5, 2]) assert.ok(lobbyPixelRatio(name, device, canvas) <= canvas, `${name} at ${device} on a ${canvas} canvas`);
    }
  }
});

void test('every lobby tier keeps multisampling on', (): void => {
  assert.ok(LOBBY_RENDER.tiers.desktop.samples >= 4);
  assert.ok(LOBBY_RENDER.tiers.mobile.samples >= 4);
});

void test('the bloom is added to the scene inside the output pass, before tone mapping and the dither, so the scene target is not drawn a second time', (): void => {
  const fragment: string = bloomOutputFragment(ditheredOutputPass().material.fragmentShader);
  assert.match(fragment, /uniform sampler2D tBloom;/);
  const added: number = fragment.indexOf('gl_FragColor = texture2D( tDiffuse, vUv ) + texture2D( tBloom, vUv );');
  assert.ok(added > 0);
  assert.ok(added < fragment.indexOf('ToneMapping( gl_FragColor.rgb )'));
  assert.ok(added < fragment.indexOf('ditherOutput( gl_FragColor.rgb )'));
});

void test('an output shader with no scene read is refused instead of silently dropping the bloom', (): void => {
  assert.throws((): string => bloomOutputFragment('void main() { gl_FragColor = vec4(1.0); }'));
});

void test('the output pass is compiled with the defines it gives itself on its first frame, so that frame finds its program ready', (): void => {
  assert.deepEqual(outputDefines(SRGBColorSpace, CustomToneMapping), { SRGB_TRANSFER: '', CUSTOM_TONE_MAPPING: '' });
  assert.deepEqual(outputDefines(LinearSRGBColorSpace, NoToneMapping), {});
  assert.deepEqual(outputDefines(SRGBColorSpace, ACESFilmicToneMapping), { SRGB_TRANSFER: '', ACES_FILMIC_TONE_MAPPING: '' });
});

void test('every material the bloom draws with is in the set compiled before the lobby is shown, each on a quad the frame draws it on', (): void => {
  const pass: UnrealBloomPass = new UnrealBloomPass(new Vector2(4, 4), 0.4, 0.7, 0.8);
  const materials: readonly ShaderMaterial[] = bloomMaterials(pass);
  assert.ok(materials.includes(pass.materialHighPassFilter));
  assert.ok(materials.includes(pass.compositeMaterial));
  for (const blur of pass.separableBlurMaterials) assert.ok(materials.includes(blur));
  const scene: Scene = quadScene(materials);
  const drawn: Material[] = [];
  scene.traverse((object: Object3D): void => {
    if (object instanceof Mesh && object.material instanceof ShaderMaterial) drawn.push(object.material);
  });
  assert.deepEqual(drawn, [...materials]);
});

void test('the sky is drawn behind the scene by its own quad, never as a scene background the warm-up cannot compile', (): void => {
  const sky: Texture = new Texture();
  const material: ShaderMaterial = backdropMaterial(sky);
  assert.equal(material.uniforms['tMap']?.value, sky);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
});
