import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';
import type { IUniform } from 'three';

export const EMBERS = {
  most: 180,
  span: 34,
  height: 9,
  rise: 0.55,
  sway: 0.45,
  swayRate: 0.7,
  edgeFade: 0.16,
  size: 0.09,
  pointScale: 520,
  flickerRate: 5.5,
  color: '#ff7a2a',
  glow: 2.4,
} as const;

export interface Embers {
  readonly points: Points | null;
  update(time: number, x: number, y: number, z: number): void;
  dispose(): void;
}

export function emberCount(density: number): number {
  return Math.round(Math.min(1, Math.max(0, density)) * EMBERS.most);
}

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

const VERTEX: string = `
attribute vec4 seed;
uniform float uTime;
uniform vec3 uFocus;
uniform float uScale;
varying float vAlpha;
float wrapAround(float home, float focus) {
  return focus + (fract((home - focus) / ${glsl(EMBERS.span)} + 0.5) - 0.5) * ${glsl(EMBERS.span)};
}
void main() {
  float rise = fract(seed.y + uTime * ${glsl(EMBERS.rise)} * (0.6 + seed.w * 0.8) / ${glsl(EMBERS.height)});
  float sway = sin(uTime * ${glsl(EMBERS.swayRate)} * (0.5 + seed.w) + seed.z * 6.2832) * ${glsl(EMBERS.sway)};
  vec3 at = vec3(wrapAround(seed.x * ${glsl(EMBERS.span)} + sway, uFocus.x), uFocus.y + rise * ${glsl(EMBERS.height)}, wrapAround(seed.z * ${glsl(EMBERS.span)} - sway * 0.6, uFocus.z));
  vec2 reach = abs(at.xz - uFocus.xz) / (${glsl(EMBERS.span)} * 0.5);
  float edge = 1.0 - smoothstep(1.0 - ${glsl(EMBERS.edgeFade * 2)}, 1.0, max(reach.x, reach.y));
  float life = smoothstep(0.0, 0.12, rise) * (1.0 - smoothstep(0.55, 1.0, rise));
  float flicker = 0.65 + 0.35 * sin(uTime * ${glsl(EMBERS.flickerRate)} * (0.7 + seed.w) + seed.x * 40.0);
  vAlpha = edge * life * flicker;
  vec4 view = modelViewMatrix * vec4(at, 1.0);
  gl_PointSize = ${glsl(EMBERS.size)} * (0.6 + seed.w * 0.8) * uScale / max(0.1, -view.z);
  gl_Position = projectionMatrix * view;
}
`;

function fragment(color: Color): string {
  return `
varying float vAlpha;
void main() {
  float falloff = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - vec2(0.5)));
  gl_FragColor = vec4(vec3(${glsl(color.r)}, ${glsl(color.g)}, ${glsl(color.b)}) * ${glsl(EMBERS.glow)} * falloff * vAlpha, falloff * vAlpha);
}
`;
}

export function emberSeeds(count: number, random: () => number): Float32Array {
  const seeds: Float32Array = new Float32Array(count * 4);
  for (let index: number = 0; index < seeds.length; index += 1) seeds[index] = random();
  return seeds;
}

export function createEmbers(density: number, random: () => number = Math.random): Embers {
  const count: number = emberCount(density);
  if (count === 0) return { points: null, update(): void {}, dispose(): void {} };
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('seed', new BufferAttribute(emberSeeds(count, random), 4));
  const time: IUniform<number> = { value: 0 };
  const focus: IUniform<Vector3> = { value: new Vector3() };
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: fragment(new Color(EMBERS.color)),
    uniforms: { uTime: time, uFocus: focus, uScale: { value: EMBERS.pointScale } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points: Points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 9;
  return {
    points,
    update(now: number, x: number, y: number, z: number): void {
      time.value = now;
      focus.value.set(x, y, z);
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
