import type { IUniform, Material, WebGLProgramParametersWithUniforms } from 'three';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Euler, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { BatEvent, Colony } from './bat-colony.ts';
import type { LidEvent } from './prop-lid.ts';
import { createColony, settleRoosts, stepColony } from './bat-colony.ts';
import { batGeometry } from './bat-look.ts';
import type { BatKind, LifeForm, LifeGroup, LifeKind, LifeRules } from './life-kinds.ts';
import type { Creature, Hero } from './life-motion.ts';
import { lifeCount, spawnGroup, stepCreature } from './life-motion.ts';

export const LIFE_VIEW = {
  phoneShare: 0.5,
  longestStep: 1 / 20,
  bird: { swing: 0.75, rest: 0.12, roughness: 0.42, pitch: 0.18 },
  crawler: { stride: 0.16, lift: 0.08, roughness: 0.3, ride: 0.07 },
  moth: { swing: 1.1, rest: 0.3, opacity: 0.9 },
  bat: { rest: 0.02, roughness: 0.8, fold: 0.3, hangPitch: Math.PI / 2, pitch: 0.08 },
} as const;

const BIRD_SHAPE = {
  nose: [0, 0.02, 0.5],
  tail: [0, 0, -0.32],
  waist: { z: 0.05, half: 0.08, top: 0.07, belly: -0.05 },
  fan: [[-0.12, 0, -0.52], [0.12, 0, -0.52], [0, 0.01, -0.24]],
  wing: { root: [[0.06, 0.01, 0.16], [0.06, 0.01, -0.1]], mid: [[0.42, 0.02, 0.12], [0.4, 0.02, -0.17]], tip: [0.84, 0, -0.14], outer: 1.45 },
} as const;

const MOTH_SHAPE = {
  body: [[0, 0.02, 0.18], [0.03, 0, -0.14], [-0.03, 0, -0.14]],
  wing: [[0.02, 0.01, 0.14], [0.02, 0.01, -0.08], [0.5, 0.02, 0.22], [0.42, 0.02, -0.26]],
} as const;

const CRAWLER_SHAPE = {
  abdomen: { z: -0.17, x: 0.15, y: 0.11, length: 0.22, lift: 0.1 },
  head: { z: 0.13, x: 0.1, y: 0.07, length: 0.11, lift: 0.08 },
  legRoot: { x: 0.07, y: 0.08 },
  knee: { x: 0.3, y: 0.2, reach: 1.3 },
  tip: { x: 0.46, y: 0, spread: 1.7 },
  span: 0.3,
  width: 0.022,
  knuckle: 0.5,
} as const;

type Triple = readonly [number, number, number];

class ShapeBuilder {
  readonly positions: number[] = [];
  readonly limbs: number[] = [];

  triangle(a: Triple, b: Triple, c: Triple, limbs: Triple = [0, 0, 0]): void {
    this.positions.push(...a, ...b, ...c);
    this.limbs.push(...limbs);
  }

  geometry(): BufferGeometry {
    const geometry: BufferGeometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('limb', new BufferAttribute(new Float32Array(this.limbs), 1));
    geometry.computeVertexNormals();
    return geometry;
  }
}

function mirror(point: Triple, side: number): Triple {
  return [point[0] * side, point[1], point[2]];
}

function blob(shape: ShapeBuilder, z: number, half: number, top: number, length: number, lift: number): void {
  const front: Triple = [0, lift, z + length];
  const back: Triple = [0, lift, z - length];
  const ring: Triple[] = [[half, lift, z], [0, lift + top, z], [-half, lift, z], [0, lift - top * CRAWLER_SHAPE.knuckle, z]];
  ring.forEach((point: Triple, index: number): void => {
    const next: Triple = ring[(index + 1) % ring.length] ?? point;
    shape.triangle(front, next, point);
    shape.triangle(back, point, next);
  });
}

function birdGeometry(): BufferGeometry {
  const shape: ShapeBuilder = new ShapeBuilder();
  const waist = BIRD_SHAPE.waist;
  const ring: Triple[] = [[waist.half, 0, waist.z], [0, waist.top, waist.z], [-waist.half, 0, waist.z], [0, waist.belly, waist.z]];
  ring.forEach((point: Triple, index: number): void => {
    const next: Triple = ring[(index + 1) % ring.length] ?? point;
    shape.triangle(BIRD_SHAPE.nose, next, point);
    shape.triangle(BIRD_SHAPE.tail, point, next);
  });
  shape.triangle(BIRD_SHAPE.fan[0], BIRD_SHAPE.fan[1], BIRD_SHAPE.fan[2]);
  for (const side of [-1, 1]) {
    const [rootFront, rootBack] = BIRD_SHAPE.wing.root.map((point: Triple): Triple => mirror(point, side));
    const [midFront, midBack] = BIRD_SHAPE.wing.mid.map((point: Triple): Triple => mirror(point, side));
    const tip: Triple = mirror(BIRD_SHAPE.wing.tip, side);
    if (rootFront === undefined || rootBack === undefined || midFront === undefined || midBack === undefined) continue;
    shape.triangle(rootFront, rootBack, midBack, [1, 1, 1]);
    shape.triangle(rootFront, midBack, midFront, [1, 1, 1]);
    shape.triangle(midFront, midBack, tip, [1, 1, BIRD_SHAPE.wing.outer]);
  }
  return shape.geometry();
}

function mothGeometry(): BufferGeometry {
  const shape: ShapeBuilder = new ShapeBuilder();
  shape.triangle(MOTH_SHAPE.body[0], MOTH_SHAPE.body[1], MOTH_SHAPE.body[2]);
  for (const side of [-1, 1]) {
    const [root, back, front, rear] = MOTH_SHAPE.wing.map((point: Triple): Triple => mirror(point, side));
    if (root === undefined || back === undefined || front === undefined || rear === undefined) continue;
    shape.triangle(root, back, rear, [1, 1, 1]);
    shape.triangle(root, rear, front, [1, 1, 1]);
  }
  return shape.geometry();
}

function crawlerGeometry(legs: number): BufferGeometry {
  const shape: ShapeBuilder = new ShapeBuilder();
  const a = CRAWLER_SHAPE.abdomen;
  const h = CRAWLER_SHAPE.head;
  blob(shape, a.z, a.x, a.y, a.length, a.lift);
  blob(shape, h.z, h.x, h.y, h.length, h.lift);
  const pairs: number = Math.max(1, Math.round(legs / 2));
  for (let index: number = 0; index < pairs; index += 1) {
    const z: number = h.z - (index / Math.max(1, pairs - 1) - CRAWLER_SHAPE.knuckle) * CRAWLER_SHAPE.span;
    for (const side of [-1, 1]) {
      const gait: number = (index + (side > 0 ? 1 : 0)) % 2 === 0 ? 1 : -1;
      const w: number = CRAWLER_SHAPE.width;
      const root: Triple = [side * CRAWLER_SHAPE.legRoot.x, CRAWLER_SHAPE.legRoot.y, z];
      const knee: Triple = [side * CRAWLER_SHAPE.knee.x, CRAWLER_SHAPE.knee.y, z * CRAWLER_SHAPE.knee.reach];
      const tip: Triple = [side * CRAWLER_SHAPE.tip.x, CRAWLER_SHAPE.tip.y, z * CRAWLER_SHAPE.tip.spread];
      const mid: number = gait * CRAWLER_SHAPE.knuckle;
      shape.triangle(root, [root[0], root[1], root[2] + w], knee, [0, 0, mid]);
      shape.triangle([root[0], root[1], root[2] + w], [knee[0], knee[1], knee[2] + w], knee, [0, mid, mid]);
      shape.triangle(knee, [knee[0], knee[1], knee[2] + w], tip, [mid, mid, gait]);
    }
  }
  return shape.geometry();
}

interface LifeUniforms {
  readonly uSwing: IUniform<number>;
  readonly uRest: IUniform<number>;
  readonly uStride: IUniform<number>;
  readonly uLift: IUniform<number>;
  readonly uGlow: IUniform<number>;
}

const WING_VERTEX: string = `
float lifeAngle = limb * (aPose.y * uSwing * sin(aPose.x) + uRest);
float lifeReach = abs(transformed.x);
transformed.x = sign(transformed.x) * lifeReach * cos(lifeAngle);
transformed.y += lifeReach * sin(lifeAngle);
`;

const GLOW_FRAGMENT: string = `
#include <emissivemap_fragment>
totalEmissiveRadiance += vColor.rgb * uGlow;
`;

const LEG_VERTEX: string = `
float lifeWeight = abs(limb);
float lifeStep = aPose.x + (limb < 0.0 ? PI : 0.0);
transformed.z += lifeWeight * sin(lifeStep) * uStride * aPose.y;
transformed.y += lifeWeight * max(0.0, cos(lifeStep)) * uLift * aPose.y;
`;

function animated<T extends Material>(material: T, form: LifeForm, uniforms: LifeUniforms): T {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float limb;\nattribute vec2 aPose;\nuniform float uSwing;\nuniform float uRest;\nuniform float uStride;\nuniform float uLift;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${form === 'crawler' ? LEG_VERTEX : WING_VERTEX}`);
    if (form === 'bat') shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;').replace('#include <emissivemap_fragment>', GLOW_FRAGMENT);
  };
  material.customProgramCacheKey = (): string => `life-${form}`;
  return material;
}

function uniformsFor(kind: LifeKind): LifeUniforms {
  switch (kind.form) {
    case 'bird':
      return { uSwing: { value: LIFE_VIEW.bird.swing }, uRest: { value: LIFE_VIEW.bird.rest }, uStride: { value: 0 }, uLift: { value: 0 }, uGlow: { value: 0 } };
    case 'crawler':
      return { uSwing: { value: 0 }, uRest: { value: 0 }, uStride: { value: LIFE_VIEW.crawler.stride }, uLift: { value: LIFE_VIEW.crawler.lift }, uGlow: { value: 0 } };
    case 'bat':
      return { uSwing: { value: kind.beat }, uRest: { value: LIFE_VIEW.bat.rest }, uStride: { value: 0 }, uLift: { value: 0 }, uGlow: { value: kind.glow } };
    case 'moth':
      break;
  }
  return { uSwing: { value: LIFE_VIEW.moth.swing }, uRest: { value: LIFE_VIEW.moth.rest }, uStride: { value: 0 }, uLift: { value: 0 }, uGlow: { value: 0 } };
}

function geometryFor(kind: LifeKind): BufferGeometry {
  switch (kind.form) {
    case 'bird':
      return birdGeometry();
    case 'crawler':
      return crawlerGeometry(kind.legs);
    case 'bat':
      return batGeometry(kind);
    case 'moth':
      break;
  }
  return mothGeometry();
}

function materialFor(kind: LifeKind): Material {
  const uniforms: LifeUniforms = uniformsFor(kind);
  const colour: Color = new Color(kind.colour);
  switch (kind.form) {
    case 'bird':
      return animated(new MeshStandardMaterial({ color: colour, roughness: LIFE_VIEW.bird.roughness, metalness: 0, side: DoubleSide }), kind.form, uniforms);
    case 'crawler':
      return animated(new MeshStandardMaterial({ color: colour, roughness: LIFE_VIEW.crawler.roughness, metalness: 0, side: DoubleSide }), kind.form, uniforms);
    case 'bat':
      return animated(new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: LIFE_VIEW.bat.roughness, metalness: 0, side: DoubleSide }), kind.form, uniforms);
    case 'moth':
      break;
  }
  return animated(new MeshBasicMaterial({ color: colour, transparent: true, opacity: LIFE_VIEW.moth.opacity, depthWrite: false, side: DoubleSide }), kind.form, uniforms);
}

interface Herd {
  readonly kind: LifeKind;
  readonly groups: readonly LifeGroup[];
  readonly mesh: InstancedMesh;
  readonly pose: InstancedBufferAttribute;
  creatures: Creature[];
  colony: Colony | null;
}

export type LifeEvent = BatEvent | LidEvent;

export interface LifeView {
  readonly group: Group;
  update(time: number, dt: number, hero: Hero, groundAt: (x: number, z: number) => number, stirs: readonly Hero[]): void;
  takeEvents(): LifeEvent[];
  setDensity(density: number): void;
  dispose(): void;
}

export function lifeDensity(density: number, phone: boolean): number {
  return density * (phone ? LIFE_VIEW.phoneShare : 1);
}

const scratch = { matrix: new Matrix4(), position: new Vector3(), scale: new Vector3(), turn: new Quaternion(), euler: new Euler(0, 0, 0, 'YXZ') };

function place(herd: Herd, creature: Creature, index: number, groundAt: (x: number, z: number) => number): void {
  const kind: LifeKind = creature.kind;
  const ground: number = groundAt(creature.pos.x, creature.pos.z);
  const lift: number = kind.form === 'crawler' ? ground : ground + creature.pos.y;
  const pitch: number = kind.form === 'bird' ? -Math.atan2(creature.velocity.y, Math.max(kind.size, Math.hypot(creature.velocity.x, creature.velocity.z))) * LIFE_VIEW.bird.pitch : 0;
  scratch.position.set(creature.pos.x, lift, creature.pos.z);
  scratch.euler.set(pitch, creature.yaw, 0);
  scratch.turn.setFromEuler(scratch.euler);
  scratch.scale.setScalar(kind.size);
  scratch.matrix.compose(scratch.position, scratch.turn, scratch.scale);
  herd.mesh.setMatrixAt(index, scratch.matrix);
  const amount: number = kind.form === 'crawler' ? Math.min(1, creature.pace / Math.max(kind.amble, kind.size)) : creature.flap;
  herd.pose.setXY(index, creature.phase, amount);
}

function placeColony(herd: Herd, colony: Colony, kind: BatKind): void {
  colony.bats.forEach((bat, index: number): void => {
    const hanging: boolean = bat.mode === 'hanging' || bat.delay > 0;
    const bob: number = hanging ? 0 : -kind.bob * kind.size * Math.cos(bat.phase);
    scratch.position.set(bat.pos.x, (Number.isNaN(bat.pos.y) ? 0 : bat.pos.y) + bob, bat.pos.z);
    scratch.euler.set(hanging ? LIFE_VIEW.bat.hangPitch : LIFE_VIEW.bat.pitch * Math.sin(bat.phase), bat.yaw, 0);
    scratch.turn.setFromEuler(scratch.euler);
    scratch.scale.set(kind.size * (hanging && bat.flap === 0 ? LIFE_VIEW.bat.fold : 1), kind.size, kind.size);
    scratch.matrix.compose(scratch.position, scratch.turn, scratch.scale);
    herd.mesh.setMatrixAt(index, scratch.matrix);
    herd.pose.setXY(index, bat.phase, bat.flap);
  });
}

export function createLifeView(rules: LifeRules, groups: readonly LifeGroup[], density: number): LifeView {
  const group: Group = new Group();
  const byKind: Map<string, LifeGroup[]> = new Map<string, LifeGroup[]>();
  for (const entry of groups) byKind.set(entry.kind, [...(byKind.get(entry.kind) ?? []), entry]);
  const herds: Herd[] = [];
  let salt: number = 0;
  const spawn = (herd: Herd, wanted: number): Creature[] => herd.groups.flatMap((entry: LifeGroup): Creature[] => {
    salt += 1;
    return spawnGroup(herd.kind, entry, wanted, salt);
  });
  for (const [id, list] of byKind) {
    const kind: LifeKind | undefined = rules.kinds.get(id);
    if (kind === undefined) continue;
    const capacity: number = list.reduce((sum: number, entry: LifeGroup): number => sum + lifeCount(entry.count, 1), 0);
    const geometry: BufferGeometry = geometryFor(kind);
    const pose: InstancedBufferAttribute = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    pose.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aPose', pose);
    const mesh: InstancedMesh = new InstancedMesh(geometry, materialFor(kind), capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    group.add(mesh);
    herds.push({ kind, groups: list, mesh, pose, creatures: [], colony: null });
  }
  const populate = (wanted: number): void => {
    salt = 0;
    for (const herd of herds) {
      const kind: LifeKind = herd.kind;
      herd.colony = kind.form === 'bat' ? createColony(kind, herd.groups, wanted) : null;
      herd.creatures = herd.colony === null ? spawn(herd, wanted) : [];
      const count: number = herd.colony === null ? herd.creatures.length : herd.colony.bats.length;
      herd.mesh.count = count;
      herd.mesh.visible = count > 0;
    }
  };
  populate(density);
  let events: LifeEvent[] = [];
  return {
    group,
    update(time: number, dt: number, hero: Hero, groundAt: (x: number, z: number) => number, stirs: readonly Hero[]): void {
      const step: number = Math.min(Math.max(0, dt), LIFE_VIEW.longestStep);
      for (const herd of herds) {
        const colony: Colony | null = herd.colony;
        const kind: LifeKind = herd.kind;
        if (colony !== null && kind.form === 'bat') {
          settleRoosts(colony, groundAt);
          events.push(...stepColony(colony, hero, stirs, time, step));
          placeColony(herd, colony, kind);
          herd.mesh.instanceMatrix.needsUpdate = colony.bats.length > 0;
          herd.pose.needsUpdate = colony.bats.length > 0;
          continue;
        }
        herd.creatures.forEach((creature: Creature, index: number): void => {
          stepCreature(creature, hero, time, step);
          place(herd, creature, index, groundAt);
        });
        if (herd.creatures.length === 0) continue;
        herd.mesh.instanceMatrix.needsUpdate = true;
        herd.pose.needsUpdate = true;
      }
    },
    takeEvents(): LifeEvent[] {
      const taken: LifeEvent[] = events;
      events = [];
      return taken;
    },
    setDensity(next: number): void {
      populate(next);
    },
    dispose(): void {
      group.removeFromParent();
      for (const herd of herds) {
        herd.mesh.geometry.dispose();
        const material: Material | Material[] = herd.mesh.material;
        if (!Array.isArray(material)) material.dispose();
        herd.mesh.dispose();
      }
    },
  };
}
