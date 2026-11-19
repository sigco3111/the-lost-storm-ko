import type { Camera, Scene, WebGLRenderer } from 'three';
import { DepthTexture, HalfFloatType, WebGLRenderTarget } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { frameGuardPass } from './frame-guard.ts';
import type { GroundDecalPass } from './ground-decal.ts';
import { groundDecalPass } from './ground-decal.ts';

export interface ScenePass {
  readonly pass: ShaderPass;
  readonly target: WebGLRenderTarget;
}

export function postBufferTarget(depthBuffer: boolean): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer });
}

export function scenePass(scene: Scene, camera: Camera, samples: number, guarded: boolean): ScenePass {
  const target: WebGLRenderTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples, depthTexture: new DepthTexture(1, 1) });
  const decals: GroundDecalPass = groundDecalPass();
  const pass: ShaderPass = guarded ? frameGuardPass() : new ShaderPass(CopyShader);
  const resolve = pass.render.bind(pass);
  const resize = pass.setSize.bind(pass);
  const release = pass.dispose.bind(pass);
  pass.setSize = (width: number, height: number): void => {
    resize(width, height);
    target.setSize(width, height);
  };
  pass.render = (renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, _readBuffer: WebGLRenderTarget, deltaTime: number, maskActive: boolean): void => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    resolve(renderer, writeBuffer, target, deltaTime, maskActive);
    if (target.depthTexture !== null) decals.draw(renderer, scene, camera, writeBuffer, target.depthTexture);
  };
  pass.dispose = (): void => {
    release();
    target.depthTexture?.dispose();
    target.dispose();
  };
  return { pass, target };
}
