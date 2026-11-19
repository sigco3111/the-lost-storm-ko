import type { Object3D } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, InterleavedBuffer, InterleavedBufferAttribute, Mesh, ShaderMaterial } from 'three';
import type { StrandBuffers, StrandEnds, StrandForm } from './strand-shape.ts';
import { createStrandBuffers, restrikeAge, STRAND_POINTS, strandGrow, strandLight, strandSpan, strandStrips, TRUNK_POINTS, writeStrand } from './strand-shape.ts';

export const STRANDS = {
  width: 0.21,
  coreWidth: 0.17,
  coreAa: 0.9,
  sheathWidth: 0.46,
  sheathAa: 1.6,
  haloSharp: 2.5,
  coreBoost: 1.7,
  sheathBoost: 1.05,
  haloBoost: 0.8,
  hotMix: 0.75,
  leaderSoft: 0.04,
  knot: 0.27,
  knotStart: 1,
  knotEnd: 0.7,
  knotSharp: 5,
  knotHeartSharp: 26,
  knotGlow: 0.9,
  knotHeart: 1.5,
  knotEdgeFrom: 0.45,
  sheathHueFrom: 0.45,
  sheathHueTo: 0.75,
  sheathHue: 0.07,
  sheathSaturation: 0.78,
  sheathLightness: 0.62,
  magenta: 0xff6fd2,
  gold: 0xffd27a,
  crackleMin: 0.55,
  crackleFlash: 0.75,
  crackleChance: 0.14,
  crackleFall: 0.05,
  order: 9,
  fadeShare: 1,
} as const;

const KNOT_VERTICES: number = 8;
const RIBBON_VERTICES: number = STRAND_POINTS * 2;
const VERTICES: number = RIBBON_VERTICES + KNOT_VERTICES;

const LAYOUT = {
  stride: 9,
  position: 0,
  heading: 3,
  weight: 6,
  heat: 7,
  along: 8,
} as const;

const glsl = (value: number): string => value.toFixed(4);

function glslColor(hex: number): string {
  const color: Color = new Color(hex);
  return `vec3(${glsl(color.r)}, ${glsl(color.g)}, ${glsl(color.b)})`;
}

export const STRAND_VERTEX: string = [
  'attribute vec3 heading;',
  'attribute float side;',
  'attribute float weight;',
  'attribute float heat;',
  'attribute float along;',
  'attribute vec2 corner;',
  'uniform float uWidth;',
  'uniform float uKnot;',
  'varying float vSide;',
  'varying float vWeight;',
  'varying float vHeat;',
  'varying float vAlong;',
  'varying vec2 vCorner;',
  'varying float vKnot;',
  'void main() {',
  '  vec4 view = modelViewMatrix * vec4(position, 1.0);',
  '  float knot = step(0.5, abs(corner.x));',
  '  vec3 facing = (modelViewMatrix * vec4(heading, 0.0)).xyz;',
  '  vec2 flat2 = facing.xy;',
  '  float span = length(flat2);',
  '  vec2 across = span > 0.0001 ? vec2(-flat2.y, flat2.x) / span : vec2(0.0, 1.0);',
  '  view.xy += mix(across * side * uWidth, corner * uKnot, knot) * weight;',
  '  vSide = side;',
  '  vWeight = weight;',
  '  vHeat = heat;',
  '  vAlong = along;',
  '  vCorner = corner;',
  '  vKnot = knot;',
  '  gl_Position = projectionMatrix * view;',
  '}',
].join('\n');

export const STRAND_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uGlow;',
  'uniform float uCore;',
  'uniform float uGrow;',
  'varying float vSide;',
  'varying float vWeight;',
  'varying float vHeat;',
  'varying float vAlong;',
  'varying vec2 vCorner;',
  'varying float vKnot;',
  'void main() {',
  `  float reach = 1.0 - smoothstep(0.0, ${glsl(STRANDS.leaderSoft)}, vAlong - uGrow);`,
  `  vec3 hot = vHeat > 0.0 ? ${glslColor(STRANDS.gold)} : ${glslColor(STRANDS.magenta)};`,
  `  vec3 sheath = mix(uColor, hot, abs(vHeat) * ${glsl(STRANDS.hotMix)});`,
  '  vec3 light;',
  '  if (vKnot > 0.5) {',
  '    float r = length(vCorner);',
  `    float edge = 1.0 - smoothstep(${glsl(STRANDS.knotEdgeFrom)}, 1.0, r);`,
  `    float body = exp(-r * r * ${glsl(STRANDS.knotSharp)}) * edge;`,
  `    float heart = exp(-r * r * ${glsl(STRANDS.knotHeartSharp)}) * edge;`,
  `    light = uColor * body * ${glsl(STRANDS.knotGlow)} + vec3(1.0) * heart * uCore * ${glsl(STRANDS.knotHeart)};`,
  '  } else {',
  '    float x = abs(vSide);',
  '    float aa = fwidth(vSide);',
  `    float coreWidth = max(${glsl(STRANDS.coreWidth)}, aa * ${glsl(STRANDS.coreAa)});`,
  `    float sheathWidth = max(${glsl(STRANDS.sheathWidth)}, aa * ${glsl(STRANDS.sheathAa)});`,
  '    float core = exp(-(x * x) / (coreWidth * coreWidth));',
  '    float body = exp(-(x * x) / (sheathWidth * sheathWidth));',
  `    float halo = exp(-x * x * ${glsl(STRANDS.haloSharp)}) * (1.0 - x);`,
  `    light = vec3(1.0) * core * uCore * ${glsl(STRANDS.coreBoost)} + sheath * body * ${glsl(STRANDS.sheathBoost)} + uColor * halo * uGlow * ${glsl(STRANDS.haloBoost)};`,
  '  }',
  '  gl_FragColor = vec4(light * uStrength * vWeight * reach, 1.0);',
  '}',
].join('\n');

export type StrandMode = 'free' | 'strike' | 'held' | 'fading';

export interface StrandLook extends StrandForm {
  readonly glow: number;
  readonly afterglow: number;
  readonly width: number;
  readonly core: number;
}

export interface StrandHandle {
  shape(from: StrandEnds, to: StrandEnds, random: () => number): void;
  light(strength: number): void;
  fade(): void;
}

export interface Strands {
  strike(from: StrandEnds, to: StrandEnds, color: Color, look: StrandLook, delay: number, restrike: boolean): boolean;
  hold(color: Color, look: StrandLook): StrandHandle | null;
  update(dt: number): void;
  clear(): void;
  readonly active: number;
  readonly capacity: number;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

interface Slot {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly buffers: StrandBuffers;
  readonly vertices: InterleavedBuffer;
  readonly data: Float32Array;
  readonly color: Color;
  readonly strength: { value: number };
  readonly glow: { value: number };
  readonly width: { value: number };
  readonly core: { value: number };
  readonly grow: { value: number };
  readonly from: Point;
  readonly to: Point;
  mode: StrandMode;
  age: number;
  delay: number;
  afterglow: number;
  restrike: boolean;
  restruck: boolean;
  held: number;
  flicker: number;
  flash: number;
  form: StrandForm;
}

const STRIPS: readonly (readonly [number, number])[] = strandStrips();

function stripIndices(): number[] {
  const indices: number[] = [];
  for (const [start, count] of STRIPS) {
    for (let point: number = start; point < start + count - 1; point += 1) {
      const a: number = point * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  for (let knot: number = 0; knot < 2; knot += 1) {
    const a: number = RIBBON_VERTICES + knot * 4;
    indices.push(a, a + 1, a + 2, a, a + 2, a + 3);
  }
  return indices;
}

const SHEATH_HSL: { h: number; s: number; l: number } = { h: 0, s: 0, l: 0 };

export function sheathColor(color: Color, out: Color): Color {
  color.getHSL(SHEATH_HSL);
  const cool: boolean = SHEATH_HSL.h >= STRANDS.sheathHueFrom && SHEATH_HSL.h <= STRANDS.sheathHueTo;
  const hue: number = cool ? SHEATH_HSL.h + STRANDS.sheathHue : SHEATH_HSL.h;
  return out.setHSL(hue, Math.max(SHEATH_HSL.s, STRANDS.sheathSaturation), Math.min(SHEATH_HSL.l, STRANDS.sheathLightness));
}

function knotAt(slot: Slot, knot: number, point: number, weight: number, along: number): void {
  const points: Float32Array = slot.buffers.points;
  for (let corner: number = 0; corner < 4; corner += 1) {
    const vertex: number = (RIBBON_VERTICES + knot * 4 + corner) * LAYOUT.stride;
    for (let axis: number = 0; axis < 3; axis += 1) slot.data[vertex + LAYOUT.position + axis] = points[point * 3 + axis] ?? 0;
    slot.data[vertex + LAYOUT.weight] = weight;
    slot.data[vertex + LAYOUT.along] = along;
  }
}

function edgeAt(slot: Slot, vertex: number, point: number): void {
  slot.data[vertex + LAYOUT.weight] = slot.buffers.weights[point] ?? 0;
  slot.data[vertex + LAYOUT.heat] = slot.buffers.heats[point] ?? 0;
  slot.data[vertex + LAYOUT.along] = slot.buffers.alongs[point] ?? 0;
}

function expand(slot: Slot): void {
  const points: Float32Array = slot.buffers.points;
  const data: Float32Array = slot.data;
  for (const [start, count] of STRIPS) {
    for (let point: number = start; point < start + count; point += 1) {
      const before: number = Math.max(start, point - 1);
      const after: number = Math.min(start + count - 1, point + 1);
      const left: number = point * 2 * LAYOUT.stride;
      const right: number = left + LAYOUT.stride;
      for (let axis: number = 0; axis < 3; axis += 1) {
        const at: number = points[point * 3 + axis] ?? 0;
        const toward: number = (points[after * 3 + axis] ?? 0) - (points[before * 3 + axis] ?? 0);
        data[left + LAYOUT.position + axis] = at;
        data[right + LAYOUT.position + axis] = at;
        data[left + LAYOUT.heading + axis] = toward;
        data[right + LAYOUT.heading + axis] = toward;
      }
      edgeAt(slot, left, point);
      edgeAt(slot, right, point);
    }
  }
  knotAt(slot, 0, 0, STRANDS.knotStart, 0);
  knotAt(slot, 1, TRUNK_POINTS - 1, STRANDS.knotEnd, 1);
  slot.vertices.needsUpdate = true;
}

const CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

function createSlot(indices: readonly number[]): Slot {
  const geometry: BufferGeometry = new BufferGeometry();
  const data: Float32Array = new Float32Array(VERTICES * LAYOUT.stride);
  const vertices: InterleavedBuffer = new InterleavedBuffer(data, LAYOUT.stride).setUsage(DynamicDrawUsage);
  const sides: Float32Array = new Float32Array(VERTICES);
  const corners: Float32Array = new Float32Array(VERTICES * 2);
  for (let point: number = 0; point < STRAND_POINTS; point += 1) {
    sides[point * 2] = -1;
    sides[point * 2 + 1] = 1;
  }
  for (let vertex: number = 0; vertex < KNOT_VERTICES; vertex += 1) {
    const corner: readonly [number, number] = CORNERS[vertex % 4] ?? [0, 0];
    corners[(RIBBON_VERTICES + vertex) * 2] = corner[0];
    corners[(RIBBON_VERTICES + vertex) * 2 + 1] = corner[1];
  }
  geometry.setAttribute('position', new InterleavedBufferAttribute(vertices, 3, LAYOUT.position));
  geometry.setAttribute('heading', new InterleavedBufferAttribute(vertices, 3, LAYOUT.heading));
  geometry.setAttribute('weight', new InterleavedBufferAttribute(vertices, 1, LAYOUT.weight));
  geometry.setAttribute('heat', new InterleavedBufferAttribute(vertices, 1, LAYOUT.heat));
  geometry.setAttribute('along', new InterleavedBufferAttribute(vertices, 1, LAYOUT.along));
  geometry.setAttribute('side', new BufferAttribute(sides, 1));
  geometry.setAttribute('corner', new BufferAttribute(corners, 2));
  geometry.setIndex([...indices]);
  const color: Color = new Color();
  const strength: { value: number } = { value: 0 };
  const glow: { value: number } = { value: 0 };
  const width: { value: number } = { value: STRANDS.width };
  const core: { value: number } = { value: 1 };
  const grow: { value: number } = { value: 1 };
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: STRAND_VERTEX,
    fragmentShader: STRAND_FRAGMENT,
    uniforms: { uColor: { value: color }, uStrength: strength, uGlow: glow, uWidth: width, uCore: core, uGrow: grow, uKnot: { value: STRANDS.knot } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    blending: AdditiveBlending,
  });
  const mesh: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = STRANDS.order;
  mesh.visible = false;
  return {
    mesh,
    buffers: createStrandBuffers(),
    vertices,
    data,
    color,
    strength,
    glow,
    width,
    core,
    grow,
    from: { x: 0, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
    mode: 'free',
    age: 0,
    delay: 0,
    afterglow: 0,
    restrike: false,
    restruck: false,
    held: 0,
    flicker: 1,
    flash: 0,
    form: { forks: 0, jitter: 0 },
  };
}

function keep(target: Point, from: StrandEnds): void {
  target.x = from.x;
  target.y = from.y;
  target.z = from.z;
}

export function createStrands(parent: Object3D, capacity: number, random: () => number = Math.random): Strands {
  const indices: number[] = stripIndices();
  const slots: Slot[] = [];
  for (let index: number = 0; index < Math.max(1, Math.floor(capacity)); index += 1) {
    const slot: Slot = createSlot(indices);
    parent.add(slot.mesh);
    slots.push(slot);
  }

  const free = (slot: Slot): void => {
    slot.mode = 'free';
    slot.strength.value = 0;
    slot.mesh.visible = false;
  };

  const claim = (): Slot | null => {
    let oldest: Slot | null = null;
    for (const slot of slots) {
      if (slot.mode === 'free') return slot;
      if (slot.mode !== 'held' && (oldest === null || slot.age - slot.delay > oldest.age - oldest.delay)) oldest = slot;
    }
    return oldest;
  };

  const dress = (slot: Slot, color: Color, look: StrandLook): void => {
    sheathColor(color, slot.color);
    slot.glow.value = look.glow;
    slot.width.value = STRANDS.width * look.width;
    slot.core.value = look.core;
    slot.afterglow = look.afterglow;
    slot.form = look;
    slot.age = 0;
    slot.delay = 0;
    slot.flicker = 1;
    slot.flash = 0;
  };

  const heldLight = (slot: Slot): number => slot.held * (slot.flicker + slot.flash);

  return {
    get capacity(): number {
      return slots.length;
    },
    get active(): number {
      let count: number = 0;
      for (const slot of slots) if (slot.mode !== 'free') count += 1;
      return count;
    },
    strike(from: StrandEnds, to: StrandEnds, color: Color, look: StrandLook, delay: number, restrike: boolean): boolean {
      const slot: Slot | null = claim();
      if (slot === null) return false;
      dress(slot, color, look);
      slot.mode = 'strike';
      slot.delay = Math.max(0, delay);
      slot.restrike = restrike;
      slot.restruck = false;
      slot.strength.value = 0;
      slot.grow.value = 0;
      keep(slot.from, from);
      keep(slot.to, to);
      writeStrand(from, to, look, random, slot.buffers);
      expand(slot);
      slot.mesh.visible = true;
      return true;
    },
    hold(color: Color, look: StrandLook): StrandHandle | null {
      const slot: Slot | null = claim();
      if (slot === null) return null;
      dress(slot, color, look);
      slot.mode = 'held';
      slot.held = 0;
      slot.strength.value = 0;
      slot.grow.value = 0;
      return {
        shape(from: StrandEnds, to: StrandEnds, pick: () => number): void {
          if (slot.mode !== 'held') return;
          writeStrand(from, to, slot.form, pick, slot.buffers);
          expand(slot);
          slot.flicker = STRANDS.crackleMin + (1 - STRANDS.crackleMin) * random();
          if (random() < STRANDS.crackleChance) slot.flash = STRANDS.crackleFlash;
          slot.strength.value = heldLight(slot);
          slot.mesh.visible = true;
        },
        light(strength: number): void {
          if (slot.mode !== 'held') return;
          slot.held = Math.max(0, strength);
          slot.strength.value = heldLight(slot);
        },
        fade(): void {
          if (slot.mode !== 'held') return;
          slot.held = heldLight(slot);
          slot.mode = 'fading';
          slot.age = 0;
        },
      };
    },
    update(dt: number): void {
      for (const slot of slots) {
        if (slot.mode === 'strike') {
          slot.age += dt;
          const age: number = slot.age - slot.delay;
          if (slot.restrike && !slot.restruck && age >= restrikeAge(slot.afterglow)) {
            slot.restruck = true;
            writeStrand(slot.from, slot.to, slot.form, random, slot.buffers);
            expand(slot);
          }
          slot.grow.value = strandGrow(age);
          slot.strength.value = strandLight(age, slot.afterglow, slot.restrike);
          if (age >= strandSpan(slot.afterglow)) free(slot);
        } else if (slot.mode === 'held') {
          slot.age += dt;
          slot.grow.value = strandGrow(slot.age);
          slot.flash *= Math.exp(-dt / STRANDS.crackleFall);
          slot.strength.value = heldLight(slot);
        } else if (slot.mode === 'fading') {
          slot.age += dt;
          const share: number = Math.min(1, slot.age / (slot.afterglow * STRANDS.fadeShare));
          slot.strength.value = slot.held * (1 - share) * (1 - share);
          if (share >= 1) free(slot);
        }
      }
    },
    clear(): void {
      for (const slot of slots) free(slot);
    },
  };
}
