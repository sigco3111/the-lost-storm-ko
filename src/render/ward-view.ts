import type { IUniform, Scene } from 'three';
import { AdditiveBlending, Color, Group, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { distance } from '../../sim/math.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import type { WardState } from '../../sim/world/wards.ts';
import { wardStrength } from '../../sim/world/wards.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';
import type { Press } from './membrane.ts';
import { MEMBRANE, pressAngle, SLACK, stepPress } from './membrane.ts';
import { DOME_FRAGMENT, DOME_VERTEX } from './moment-shaders.ts';
import { floorUp } from './terrain-lift.ts';

export const WARD_VIEW = {
  tint: 0xf2c879,
  edge: 0xffd98f,
  domeSegments: 40,
  domeRings: 14,
  phoneDomeSegments: 36,
  phoneDomeRings: 12,
  domeAlpha: 0.5,
  phoneDomeAlpha: 0.45,
  growFrom: 0.55,
  shimmerSpeed: 1.1,
  pressReach: 0.8,
  pressGlow: 0.55,
  fill: 0.12,
  band: 1,
  bandWidth: 0.35,
  wobble: 0.35,
  groundLift: 0.05,
  groundPeak: 0.42,
  fillPeak: 0.22,
  fillWidth: 1.6,
} as const;

interface DomeUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uTint: IUniform<Color>;
  readonly uStrength: IUniform<number>;
  readonly uTime: IUniform<number>;
  readonly uPress: IUniform<number>;
  readonly uAngle: IUniform<number>;
  readonly uPressGlow: IUniform<number>;
  readonly uPressWidth: IUniform<number>;
}

interface WardEntry {
  readonly group: Group;
  readonly dome: Mesh<SphereGeometry, ShaderMaterial>;
  readonly uniforms: DomeUniforms;
  readonly edge: GroundLight;
  readonly floor: GroundLight;
  press: Press;
}

export interface WardView {
  update(dt: number, world: World): void;
  clear(): void;
}

function domeUniforms(): DomeUniforms {
  return { uTint: { value: new Color(WARD_VIEW.tint) }, uStrength: { value: 0 }, uTime: { value: 0 }, uPress: { value: 0 }, uAngle: { value: 0 }, uPressGlow: { value: WARD_VIEW.pressGlow }, uPressWidth: { value: MEMBRANE.width } };
}

function nearestOutside(world: World, ward: WardState): MonsterState | null {
  let best: MonsterState | null = null;
  let bestGap: number = Infinity;
  for (const monster of world.monsters) {
    if (!monster.alive || ward.def.admits.includes('monster')) continue;
    const gap: number = distance(monster.pos, ward.pos) - ward.def.radius - monster.radius;
    if (gap < bestGap) {
      best = monster;
      bestGap = gap;
    }
  }
  return best !== null && bestGap <= WARD_VIEW.pressReach ? best : null;
}

export function createWardView(scene: Scene, phone: boolean): WardView {
  const geometry: SphereGeometry = new SphereGeometry(1, phone ? WARD_VIEW.phoneDomeSegments : WARD_VIEW.domeSegments, phone ? WARD_VIEW.phoneDomeRings : WARD_VIEW.domeRings, 0, Math.PI * 2, 0, Math.PI / 2);
  const entries: Map<number, WardEntry> = new Map<number, WardEntry>();
  let clock: number = 0;

  const build = (ward: WardState): WardEntry => {
    const uniforms: DomeUniforms = domeUniforms();
    const dome: Mesh<SphereGeometry, ShaderMaterial> = new Mesh(geometry, new ShaderMaterial({ vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    dome.renderOrder = 6;
    dome.frustumCulled = false;
    const round = { kind: 'round', radius: ward.def.radius, inner: 0, arc: Math.PI * 2 } as const;
    const edge: GroundLight = createGroundLight(new Color(WARD_VIEW.edge), round, { fill: 0, band: WARD_VIEW.band, width: WARD_VIEW.bandWidth, wobble: WARD_VIEW.wobble });
    const floor: GroundLight = createGroundLight(new Color(WARD_VIEW.tint), round, { fill: WARD_VIEW.fill, band: 0, width: WARD_VIEW.fillWidth, wobble: WARD_VIEW.wobble });
    edge.mesh.position.y = WARD_VIEW.groundLift;
    floor.mesh.position.y = WARD_VIEW.groundLift;
    const group: Group = new Group();
    group.position.set(ward.pos.x, floorUp(ward.pos.x, 0, ward.pos.z), ward.pos.z);
    group.add(dome, edge.mesh, floor.mesh);
    scene.add(group);
    return { group, dome, uniforms, edge, floor, press: SLACK };
  };

  const drop = (entry: WardEntry): void => {
    entry.edge.dispose();
    entry.floor.dispose();
    entry.dome.material.dispose();
    entry.group.removeFromParent();
  };

  return {
    update(dt: number, world: World): void {
      clock += dt;
      const live: Set<number> = new Set<number>();
      for (const ward of world.wards) {
        live.add(ward.id);
        const entry: WardEntry = entries.get(ward.id) ?? build(ward);
        entries.set(ward.id, entry);
        const strength: number = wardStrength(ward);
        const eased: number = strength * strength * (3 - 2 * strength);
        const pressing: MonsterState | null = nearestOutside(world, ward);
        entry.press = stepPress(entry.press, pressing === null ? 0 : 1, dt);
        if (pressing !== null) entry.uniforms.uAngle.value = pressAngle(pressing.pos, ward.pos);
        entry.uniforms.uPress.value = entry.press.level * eased;
        entry.uniforms.uStrength.value = (phone ? WARD_VIEW.phoneDomeAlpha : WARD_VIEW.domeAlpha) * eased;
        entry.uniforms.uTime.value = clock * WARD_VIEW.shimmerSpeed;
        entry.dome.scale.setScalar(ward.def.radius * (WARD_VIEW.growFrom + (1 - WARD_VIEW.growFrom) * eased));
        entry.edge.front(WARD_VIEW.growFrom + (1 - WARD_VIEW.growFrom) * eased);
        entry.edge.pose(WARD_VIEW.groundPeak * eased, clock);
        entry.floor.pose(WARD_VIEW.fillPeak * eased, clock);
      }
      for (const [id, entry] of entries) {
        if (live.has(id)) continue;
        drop(entry);
        entries.delete(id);
      }
    },
    clear(): void {
      for (const entry of entries.values()) drop(entry);
      entries.clear();
    },
  };
}
