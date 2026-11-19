import type { IUniform, Scene } from 'three';
import { AdditiveBlending, Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import type { Spring } from '../hud/character-spring.ts';
import { springTo, stepSpring } from '../hud/character-spring.ts';
import type { Vec2 } from '../../sim/math.ts';
import { portalEndHere } from '../../sim/world/portal.ts';
import type { PortalEnd } from '../../sim/world/portal-types.ts';
import type { World } from '../../sim/world/types.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';
import { CAMERA } from './iso-camera.ts';
import type { ParticleSystem } from './particles.ts';
import { floorUp } from './terrain-lift.ts';

export const PORTAL_VIEW = {
  edge: 0x9a86ff,
  core: 0xe4ddff,
  fill: 0x5b4bb8,
  ringShare: 0.72,
  band: 1,
  bandWidth: 0.32,
  wobble: 0.5,
  hollow: 0.45,
  ringPeak: 0.55,
  floorFill: 0.3,
  floorWidth: 1.5,
  floorPeak: 0.3,
  lift: 0.05,
  seamHeight: 2.7,
  seamWidth: 1.1,
  seamOrder: 7,
  gone: 0.01,
  moteEvery: 0.07,
  moteLift: { min: 0.6, max: 1.6 },
  moteLife: { min: 1.1, max: 2 },
  moteSize: { min: 0.08, max: 0.17 },
  moteSpeed: { min: 0.05, max: 0.3 },
  moteGravity: -0.5,
  moteDrag: 1.4,
  channelRadius: 1.15,
  channelPeak: 0.5,
  channelWidth: 0.28,
  channelWobble: 0.4,
} as const;

const SEAM_VERTEX: string = ['varying vec2 vUv;', 'void main() {', '  vUv = uv;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

const SEAM_FRAGMENT: string = [
  'uniform float uTime;',
  'uniform float uStrength;',
  'uniform float uSeed;',
  'uniform vec3 uCore;',
  'uniform vec3 uEdge;',
  'varying vec2 vUv;',
  'float hash(float n) { return fract(sin(n) * 43758.5453); }',
  'float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }',
  'void main() {',
  '  float y = vUv.y;',
  '  float taper = smoothstep(0.0, 0.2, y) * smoothstep(1.0, 0.68, y);',
  '  float jag = noise(y * 14.0 + uSeed + uTime * 1.3) * 0.6 + noise(y * 41.0 - uTime * 2.1 + uSeed) * 0.4;',
  '  float width = (0.04 + 0.16 * jag) * taper;',
  '  float drift = (noise(y * 5.0 + uTime * 0.4 + uSeed) - 0.5) * 0.12;',
  '  float d = abs(vUv.x - 0.5 - drift);',
  '  float core = 1.0 - smoothstep(width * 0.2, width * 0.65, d);',
  '  float glow = 1.0 - smoothstep(width * 0.65, width * 2.8 + 0.05, d);',
  '  float flicker = 0.85 + 0.15 * noise(uTime * 9.0 + uSeed);',
  '  float alpha = (core * 0.9 + glow * 0.42) * taper * flicker * uStrength;',
  '  gl_FragColor = vec4(mix(uEdge, uCore, core) * alpha, alpha);',
  '}',
].join('\n');

interface SeamUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uTime: IUniform<number>;
  readonly uStrength: IUniform<number>;
  readonly uSeed: IUniform<number>;
  readonly uCore: IUniform<Color>;
  readonly uEdge: IUniform<Color>;
}

interface PortalEntry {
  readonly zone: string;
  readonly pos: Vec2;
  readonly group: Group;
  readonly ring: GroundLight;
  readonly floor: GroundLight;
  readonly seam: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly uniforms: SeamUniforms;
  readonly level: Spring;
  moteIn: number;
}

interface ChannelGlow {
  readonly light: GroundLight;
  total: number;
}

export interface PortalView {
  update(dt: number, world: World): void;
  clear(): void;
}

export function channelShare(left: number, total: number): number {
  return total <= 0 ? 0 : Math.min(1, Math.max(0, 1 - left / total));
}

export function samePortal(entry: { readonly zone: string; readonly pos: Vec2 }, end: PortalEnd | null): boolean {
  return end !== null && end.zone === entry.zone && end.pos.x === entry.pos.x && end.pos.z === entry.pos.z;
}

export function createPortalView(scene: Scene, particles: ParticleSystem): PortalView {
  const seamGeometry: PlaneGeometry = new PlaneGeometry(PORTAL_VIEW.seamWidth, PORTAL_VIEW.seamHeight);
  seamGeometry.translate(0, PORTAL_VIEW.seamHeight / 2, 0);
  const moteColor: Color = new Color(PORTAL_VIEW.core);
  let shown: PortalEntry | null = null;
  const fading: PortalEntry[] = [];
  let channel: ChannelGlow | null = null;
  let clock: number = 0;

  const build = (end: PortalEnd): PortalEntry => {
    const round = { kind: 'round', radius: end.reach * PORTAL_VIEW.ringShare, inner: 0, arc: Math.PI * 2 } as const;
    const ring: GroundLight = createGroundLight(new Color(PORTAL_VIEW.edge), round, { fill: 0, band: PORTAL_VIEW.band, width: PORTAL_VIEW.bandWidth, wobble: PORTAL_VIEW.wobble, hollow: PORTAL_VIEW.hollow });
    const floor: GroundLight = createGroundLight(new Color(PORTAL_VIEW.fill), round, { fill: PORTAL_VIEW.floorFill, band: 0, width: PORTAL_VIEW.floorWidth, wobble: PORTAL_VIEW.wobble });
    ring.mesh.position.y = PORTAL_VIEW.lift;
    floor.mesh.position.y = PORTAL_VIEW.lift;
    const uniforms: SeamUniforms = { uTime: { value: 0 }, uStrength: { value: 0 }, uSeed: { value: Math.random() * 40 }, uCore: { value: new Color(PORTAL_VIEW.core) }, uEdge: { value: new Color(PORTAL_VIEW.edge) } };
    const seam: Mesh<PlaneGeometry, ShaderMaterial> = new Mesh(seamGeometry, new ShaderMaterial({ vertexShader: SEAM_VERTEX, fragmentShader: SEAM_FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
    seam.rotation.y = (CAMERA.yawDegrees * Math.PI) / 180;
    seam.renderOrder = PORTAL_VIEW.seamOrder;
    seam.frustumCulled = false;
    const group: Group = new Group();
    group.position.set(end.pos.x, floorUp(end.pos.x, 0, end.pos.z), end.pos.z);
    group.add(floor.mesh, ring.mesh, seam);
    scene.add(group);
    return { zone: end.zone, pos: { x: end.pos.x, z: end.pos.z }, group, ring, floor, seam, uniforms, level: { value: 0, velocity: 0, target: 1 }, moteIn: 0 };
  };

  const drop = (entry: PortalEntry): void => {
    entry.ring.dispose();
    entry.floor.dispose();
    entry.seam.material.dispose();
    entry.group.removeFromParent();
  };

  const mote = (entry: PortalEntry, strength: number): void => {
    const angle: number = Math.random() * Math.PI * 2;
    const reach: number = entry.ring.mesh.scale.x * 0.25 * Math.random();
    particles.burst({ x: entry.pos.x + Math.sin(angle) * reach, y: entry.group.position.y + PORTAL_VIEW.lift, z: entry.pos.z + Math.cos(angle) * reach, count: 1, color: moteColor.clone().multiplyScalar(strength), speed: PORTAL_VIEW.moteSpeed, lift: PORTAL_VIEW.moteLift, life: PORTAL_VIEW.moteLife, size: PORTAL_VIEW.moteSize, gravity: PORTAL_VIEW.moteGravity, drag: PORTAL_VIEW.moteDrag, dirX: 0, dirZ: 1, spread: Math.PI * 2, jitter: 0.2 });
  };

  const pose = (entry: PortalEntry, dt: number): boolean => {
    stepSpring(entry.level, dt);
    const strength: number = Math.min(1, Math.max(0, entry.level.value));
    entry.ring.pose(PORTAL_VIEW.ringPeak * strength, clock);
    entry.ring.front(strength);
    entry.floor.pose(PORTAL_VIEW.floorPeak * strength, clock);
    entry.uniforms.uStrength.value = strength;
    entry.uniforms.uTime.value = clock;
    entry.moteIn -= dt;
    if (entry.moteIn <= 0 && strength > PORTAL_VIEW.gone) {
      entry.moteIn = PORTAL_VIEW.moteEvery;
      mote(entry, strength);
    }
    return entry.level.target === 0 && strength <= PORTAL_VIEW.gone && entry.level.velocity <= 0;
  };

  const stepChannel = (dt: number, world: World): void => {
    const intent = world.player.intent;
    if (intent.type === 'portal_channel') {
      if (channel === null) {
        const round = { kind: 'round', radius: PORTAL_VIEW.channelRadius, inner: 0, arc: Math.PI * 2 } as const;
        const light: GroundLight = createGroundLight(new Color(PORTAL_VIEW.edge), round, { fill: 0, band: PORTAL_VIEW.band, width: PORTAL_VIEW.channelWidth, wobble: PORTAL_VIEW.channelWobble });
        scene.add(light.mesh);
        channel = { light, total: intent.left };
      }
      channel.total = Math.max(channel.total, intent.left);
      channel.light.show(PORTAL_VIEW.channelPeak * channelShare(intent.left, channel.total));
    } else channel?.light.show(0);
    if (channel === null) return;
    const pos: Vec2 = world.player.pos;
    channel.light.mesh.position.set(pos.x, floorUp(pos.x, 0, pos.z) + PORTAL_VIEW.lift, pos.z);
    channel.light.step(dt, clock);
    if (intent.type !== 'portal_channel' && channel.light.strength <= PORTAL_VIEW.gone) {
      channel.light.dispose();
      channel = null;
    }
  };

  return {
    update(dt: number, world: World): void {
      clock += dt;
      const end: PortalEnd | null = portalEndHere(world);
      if (shown !== null && !samePortal(shown, end)) {
        springTo(shown.level, 0);
        fading.push(shown);
        shown = null;
      }
      if (shown === null && end !== null) shown = build(end);
      if (shown !== null) pose(shown, dt);
      for (let index: number = fading.length - 1; index >= 0; index -= 1) {
        const entry: PortalEntry | undefined = fading[index];
        if (entry === undefined || !pose(entry, dt)) continue;
        drop(entry);
        fading.splice(index, 1);
      }
      stepChannel(dt, world);
    },
    clear(): void {
      if (shown !== null) drop(shown);
      shown = null;
      for (const entry of fading.splice(0, fading.length)) drop(entry);
      channel?.light.dispose();
      channel = null;
    },
  };
}
