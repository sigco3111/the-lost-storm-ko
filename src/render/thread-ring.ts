import type { BufferGeometry, Material } from 'three';
import { CatmullRomCurve3, Color, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, TubeGeometry, Vector3 } from 'three';
import type { Keepsake } from './keepsake.ts';

export const THREAD_RING = {
  strand: 0xb8a8ff,
  strandGlow: 0x7a62f0,
  strandGlowStrength: 0.7,
  strandRoughness: 0.5,
  glow: 0x9a86ff,
  radius: 0.18,
  wobble: 0.008,
  wobbleWaves: 3,
  twists: 14,
  twistReach: 0.008,
  thickness: 0.0065,
  steps: 160,
  tubeSteps: 320,
  sides: 8,
  glowSize: 0.56,
  glowWidth: 0.17,
  glowPeak: 0.85,
  glowGrain: 7,
  knotRadius: 0.02,
  knotThickness: 0.01,
  secondKnotRadius: 0.018,
  knotRings: 10,
  knotSegments: 24,
  crossingTilt: { x: 0.5, y: Math.PI / 2, z: 1.2 },
  tailSteps: 32,
  tails: [
    [[-0.03, 0.03, 0.01], [-0.07, 0.02, 0.02], [-0.1, 0.05, 0]],
    [[0.03, 0.035, -0.01], [0.05, 0.08, 0], [0.09, 0.1, 0.01]],
  ],
  tilt: { x: 0.3, y: -0.5, z: 0.15 },
} as const;

const GLOW_VERTEX: string = ['varying vec2 vUv;', 'void main() {', '  vUv = uv;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

const GLOW_FRAGMENT: string = [
  'uniform float uRadius;',
  'uniform float uWidth;',
  'uniform float uPeak;',
  'uniform float uGrain;',
  'uniform vec3 uColor;',
  'varying vec2 vUv;',
  'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
  'float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'void main() {',
  '  vec2 p = (vUv - 0.5) * 2.0;',
  '  float d = (length(p) - uRadius) / uWidth;',
  '  float alpha = exp(-d * d) * (0.6 + 0.4 * noise(p * uGrain)) * uPeak;',
  '  gl_FragColor = vec4(uColor, alpha);',
  '}',
].join('\n');

function strandPoints(phase: number): Vector3[] {
  const points: Vector3[] = [];
  for (let index: number = 0; index < THREAD_RING.steps; index += 1) {
    const angle: number = (index / THREAD_RING.steps) * Math.PI * 2;
    const twist: number = angle * THREAD_RING.twists + phase;
    const reach: number = THREAD_RING.radius + Math.sin(angle * THREAD_RING.wobbleWaves) * THREAD_RING.wobble + Math.cos(twist) * THREAD_RING.twistReach;
    points.push(new Vector3(Math.cos(angle) * reach, Math.sin(angle) * reach, Math.sin(twist) * THREAD_RING.twistReach));
  }
  return points;
}

function loopPoints(radius: number): Vector3[] {
  const points: Vector3[] = [];
  for (let index: number = 0; index < THREAD_RING.knotSegments; index += 1) {
    const angle: number = (index / THREAD_RING.knotSegments) * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  return points;
}

export function createThreadRing(): Keepsake {
  const group: Group = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const part = (geometry: BufferGeometry, material: Material): Mesh => {
    geometries.push(geometry);
    if (!materials.includes(material)) materials.push(material);
    return new Mesh(geometry, material);
  };
  const strand: MeshStandardMaterial = new MeshStandardMaterial({ color: new Color(THREAD_RING.strand), roughness: THREAD_RING.strandRoughness, emissive: new Color(THREAD_RING.strandGlow), emissiveIntensity: THREAD_RING.strandGlowStrength });
  const glow: ShaderMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: { uRadius: { value: (THREAD_RING.radius * 2) / THREAD_RING.glowSize }, uWidth: { value: THREAD_RING.glowWidth }, uPeak: { value: THREAD_RING.glowPeak }, uGrain: { value: THREAD_RING.glowGrain }, uColor: { value: new Color(THREAD_RING.glow) } },
  });
  const ring: Group = new Group();
  for (const phase of [0, Math.PI]) ring.add(part(new TubeGeometry(new CatmullRomCurve3(strandPoints(phase), true), THREAD_RING.tubeSteps, THREAD_RING.thickness, THREAD_RING.sides, true), strand));
  const halo: Mesh = part(new PlaneGeometry(THREAD_RING.glowSize, THREAD_RING.glowSize), glow);
  halo.renderOrder = -1;
  ring.add(halo);
  const top: Vector3 = new Vector3(0, THREAD_RING.radius, 0);
  const knot: Mesh = part(new TubeGeometry(new CatmullRomCurve3(loopPoints(THREAD_RING.knotRadius), true), THREAD_RING.knotSegments * 2, THREAD_RING.knotThickness, THREAD_RING.knotRings, true), strand);
  knot.position.copy(top);
  knot.rotation.y = Math.PI / 2;
  const crossing: Mesh = part(new TubeGeometry(new CatmullRomCurve3(loopPoints(THREAD_RING.secondKnotRadius), true), THREAD_RING.knotSegments * 2, THREAD_RING.knotThickness, THREAD_RING.knotRings, true), strand);
  crossing.position.copy(top);
  crossing.rotation.set(THREAD_RING.crossingTilt.x, THREAD_RING.crossingTilt.y, THREAD_RING.crossingTilt.z);
  ring.add(knot, crossing);
  for (const tail of THREAD_RING.tails) {
    const points: Vector3[] = [top.clone(), ...tail.map(([x, y, z]: readonly [number, number, number]): Vector3 => new Vector3(x, top.y + y, z))];
    ring.add(part(new TubeGeometry(new CatmullRomCurve3(points), THREAD_RING.tailSteps, THREAD_RING.thickness, THREAD_RING.sides, false), strand));
  }
  ring.rotation.set(THREAD_RING.tilt.x, THREAD_RING.tilt.y, THREAD_RING.tilt.z);
  group.add(ring);
  return {
    group,
    dispose(): void {
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
