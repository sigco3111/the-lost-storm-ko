import type { BufferGeometry, Camera, IUniform, Object3D, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
import { BoxGeometry, Mesh, PerspectiveCamera, Scene, ShaderMaterial } from 'three';
import { TERRAIN } from '../../sim/nav/terrain.ts';
import type { LiftUniforms } from './terrain-lift.ts';
import { LIFT_SAMPLER, LIFT_UNIFORMS, liftHere } from './terrain-lift.ts';

export const GROUND_DECAL = {
  layer: 31,
  walkSlope: TERRAIN.slope,
  headroom: 0.6,
  hugAbove: 0.07,
  hugBelow: 0.1,
  stairSlack: 0.4,
  feather: 0.08,
  feel: 0.4,
  cliffFrom: 1.0,
  cliffTo: 1.5,
  faceFrom: 0.55,
  faceTo: 0.8,
  ledgeTaps: 6,
  shortestGap: 0.05,
  breakScale: 0.9,
  breakDepth: 0.3,
} as const;

export interface DepthUniforms {
  readonly uSceneDepth: IUniform<Texture | null>;
  readonly uDepthNear: IUniform<number>;
  readonly uDepthFar: IUniform<number>;
}

export const DEPTH_UNIFORMS: DepthUniforms = {
  uSceneDepth: { value: null },
  uDepthNear: { value: 1 },
  uDepthFar: { value: 2 },
};

export interface GroundDecalUniforms extends LiftUniforms, DepthUniforms {
  readonly [name: string]: IUniform<unknown>;
  readonly uDecalHalf: IUniform<number>;
  readonly uDecalLevel: IUniform<number>;
}

export function groundDecalUniforms(half: number): GroundDecalUniforms {
  return {
    uLiftMap: LIFT_UNIFORMS.uLiftMap,
    uLiftArea: LIFT_UNIFORMS.uLiftArea,
    uLiftOn: LIFT_UNIFORMS.uLiftOn,
    uSceneDepth: DEPTH_UNIFORMS.uSceneDepth,
    uDepthNear: DEPTH_UNIFORMS.uDepthNear,
    uDepthFar: DEPTH_UNIFORMS.uDepthFar,
    uDecalHalf: { value: half },
    uDecalLevel: { value: 0 },
  };
}

const glsl = (value: number): string => value.toFixed(4);

const DECAL_COMMON: readonly string[] = [
  ...LIFT_SAMPLER,
  'uniform float uDecalHalf;',
  'uniform float uDecalLevel;',
  'varying vec3 vDecalWorld;',
  'varying float vDecalDepth;',
  'varying vec4 vDecalAxes;',
  'varying vec2 vDecalCentre;',
  'float groundLevel(vec2 xz) { return uLiftOn > 0.5 ? liftOf(xz) : 0.0; }',
];

export const GROUND_DECAL_VERTEX: string = [
  ...DECAL_COMMON,
  'void main() {',
  '  vec3 centre = modelMatrix[3].xyz;',
  '  vec2 across = modelMatrix[0].xz;',
  '  vec2 along = modelMatrix[1].xz;',
  `  float tall = uDecalHalf * max(length(across), length(along)) * ${glsl(GROUND_DECAL.walkSlope)} + ${glsl(GROUND_DECAL.headroom)};`,
  '  vec3 world = vec3(centre.x, uDecalLevel + sign(position.z) * tall, centre.z) + vec3(across.x, 0.0, across.y) * position.x + vec3(along.x, 0.0, along.y) * position.y;',
  '  vDecalAxes = vec4(across, along);',
  '  vDecalCentre = centre.xz;',
  '  vDecalWorld = world;',
  '  vec4 seen = viewMatrix * vec4(world, 1.0);',
  '  vDecalDepth = seen.z;',
  '  gl_Position = projectionMatrix * seen;',
  '}',
].join('\n');

export const GROUND_DECAL_FRAGMENT: readonly string[] = [
  ...DECAL_COMMON,
  'uniform sampler2D uSceneDepth;',
  'uniform float uDepthNear;',
  'uniform float uDepthFar;',
  'float decalHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float decalNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(decalHash(i), decalHash(i + vec2(1.0, 0.0)), u.x), mix(decalHash(i + vec2(0.0, 1.0)), decalHash(i + vec2(1.0, 1.0)), u.x), u.y); }',
  'float onGround(out vec2 local) {',
  '  float depth = texture2D(uSceneDepth, gl_FragCoord.xy / vec2(textureSize(uSceneDepth, 0))).r;',
  '  if (depth >= 1.0) discard;',
  '  float viewZ = (uDepthNear * uDepthFar) / ((uDepthFar - uDepthNear) * depth - uDepthFar);',
  '  vec3 p = cameraPosition + (vDecalWorld - cameraPosition) * (viewZ / vDecalDepth);',
  '  vec2 rel = p.xz - vDecalCentre;',
  '  local = vec2(dot(rel, vDecalAxes.xy) / dot(vDecalAxes.xy, vDecalAxes.xy), dot(rel, vDecalAxes.zw) / dot(vDecalAxes.zw, vDecalAxes.zw));',
  '  if (abs(local.x) > uDecalHalf || abs(local.y) > uDecalHalf) discard;',
  `  float s = ${glsl(GROUND_DECAL.feel)};`,
  '  float here = groundLevel(p.xz);',
  '  vec2 tilt = vec2(groundLevel(p.xz + vec2(s, 0.0)) - groundLevel(p.xz - vec2(s, 0.0)), groundLevel(p.xz + vec2(0.0, s)) - groundLevel(p.xz - vec2(0.0, s))) / (2.0 * s);',
  '  float slope = length(tilt);',
  `  float stair = min(slope, ${glsl(GROUND_DECAL.walkSlope)}) * ${glsl(GROUND_DECAL.stairSlack)};`,
  '  float rise = p.y - here;',
  `  float above = ${glsl(GROUND_DECAL.hugAbove)} + stair;`,
  `  float below = ${glsl(GROUND_DECAL.hugBelow)} + stair;`,
  `  float hug = (1.0 - smoothstep(above, above + ${glsl(GROUND_DECAL.feather)}, rise)) * (1.0 - smoothstep(below, below + ${glsl(GROUND_DECAL.feather)}, -rise));`,
  '  vec3 facing = normalize(cross(dFdx(p), dFdy(p)));',
  `  float steep = smoothstep(${glsl(GROUND_DECAL.cliffFrom)}, ${glsl(GROUND_DECAL.cliffTo)}, slope);`,
  `  hug *= mix(1.0, smoothstep(${glsl(GROUND_DECAL.faceFrom)}, ${glsl(GROUND_DECAL.faceTo)}, abs(facing.y)), steep);`,
  '  float last = uDecalLevel;',
  '  float jump = 0.0;',
  `  for (int tap = 1; tap <= ${GROUND_DECAL.ledgeTaps}; tap++) {`,
  `    float next = groundLevel(mix(vDecalCentre, p.xz, float(tap) / ${glsl(GROUND_DECAL.ledgeTaps)}));`,
  '    jump = max(jump, abs(next - last));',
  '    last = next;',
  '  }',
  `  float gap = max(length(rel) / ${glsl(GROUND_DECAL.ledgeTaps)}, ${glsl(GROUND_DECAL.shortestGap)});`,
  `  float broken = 1.0 + (decalNoise(p.xz * ${glsl(GROUND_DECAL.breakScale)}) - 0.5) * ${glsl(GROUND_DECAL.breakDepth * 2)};`,
  `  return hug * (1.0 - smoothstep(${glsl(GROUND_DECAL.cliffFrom)}, ${glsl(GROUND_DECAL.cliffTo)}, jump / gap * broken));`,
  '}',
];

export function groundDecalBox(half: number): BoxGeometry {
  return new BoxGeometry(half * 2, half * 2, 1);
}

const sharedGeometries: WeakSet<object> = new WeakSet<object>();

export function sharedGeometry<T extends BufferGeometry>(geometry: T): T {
  sharedGeometries.add(geometry);
  return geometry;
}

export function isSharedGeometry(geometry: object): boolean {
  return sharedGeometries.has(geometry);
}

const anchors: Set<WeakRef<Mesh>> = new Set<WeakRef<Mesh>>();
const handles: WeakMap<Object3D, WeakRef<Mesh>> = new WeakMap<Object3D, WeakRef<Mesh>>();
const drawn: WeakSet<Mesh> = new WeakSet<Mesh>();

export function layOnGround(mesh: Mesh): void {
  mesh.layers.set(GROUND_DECAL.layer);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  if (handles.has(mesh)) return;
  const handle: WeakRef<Mesh> = new WeakRef(mesh);
  handles.set(mesh, handle);
  anchors.add(handle);
}

export function liftOffGround(mesh: Object3D): void {
  const handle: WeakRef<Mesh> | undefined = handles.get(mesh);
  if (handle === undefined) return;
  anchors.delete(handle);
  handles.delete(mesh);
}

export function awaitsDecalDraw(mesh: Mesh): boolean {
  return handles.has(mesh) && !drawn.has(mesh);
}

export function shownIn(object: Object3D, scene: Object3D): boolean {
  let at: Object3D | null = object;
  while (at !== null) {
    if (!at.visible) return false;
    if (at === scene) return true;
    at = at.parent;
  }
  return false;
}

export function groundDecalsIn(scene: Object3D): readonly Mesh[] {
  const shown: Mesh[] = [];
  for (const handle of anchors) {
    const mesh: Mesh | undefined = handle.deref();
    if (mesh === undefined) anchors.delete(handle);
    else if (shownIn(mesh, scene)) shown.push(mesh);
  }
  return shown;
}

export function setLevel(mesh: Mesh): void {
  const material: unknown = mesh.material;
  if (!(material instanceof ShaderMaterial)) return;
  const level: IUniform<unknown> | undefined = material.uniforms['uDecalLevel'];
  if (level !== undefined) level.value = liftHere(mesh.matrixWorld.elements[12], mesh.matrixWorld.elements[14]);
}

export interface GroundDecalPass {
  draw(renderer: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget, depth: Texture): number;
}

function proxyOf(geometry: BufferGeometry): Mesh {
  const proxy: Mesh = new Mesh(geometry);
  proxy.matrixAutoUpdate = false;
  proxy.matrixWorldAutoUpdate = false;
  proxy.frustumCulled = false;
  return proxy;
}

export function groundDecalPass(): GroundDecalPass {
  const stage: Scene = new Scene();
  stage.matrixWorldAutoUpdate = false;
  const proxies: Mesh[] = [];
  return {
    draw(renderer: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget, depth: Texture): number {
      const shown: readonly Mesh[] = camera instanceof PerspectiveCamera ? groundDecalsIn(scene) : [];
      shown.forEach((anchor: Mesh, index: number): void => {
        const proxy: Mesh = proxies[index] ?? proxyOf(anchor.geometry);
        if (proxies[index] === undefined) {
          proxies.push(proxy);
          stage.add(proxy);
        }
        setLevel(anchor);
        proxy.geometry = anchor.geometry;
        proxy.material = anchor.material;
        proxy.renderOrder = anchor.renderOrder;
        proxy.matrixWorld.copy(anchor.matrixWorld);
        proxy.visible = true;
        drawn.add(anchor);
      });
      for (let index: number = shown.length; index < proxies.length; index += 1) {
        const spare: Mesh | undefined = proxies[index];
        if (spare !== undefined) spare.visible = false;
      }
      if (shown.length === 0 || !(camera instanceof PerspectiveCamera)) return 0;
      DEPTH_UNIFORMS.uSceneDepth.value = depth;
      DEPTH_UNIFORMS.uDepthNear.value = camera.near;
      DEPTH_UNIFORMS.uDepthFar.value = camera.far;
      const clears: boolean = renderer.autoClear;
      const resets: boolean = renderer.info.autoReset;
      renderer.autoClear = false;
      renderer.info.autoReset = false;
      renderer.setRenderTarget(target);
      renderer.render(stage, camera);
      renderer.autoClear = clears;
      renderer.info.autoReset = resets;
      return shown.length;
    },
  };
}
