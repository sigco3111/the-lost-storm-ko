import type { Object3D } from 'three';
import { Color } from 'three';
import type { BossPresence } from '../../sim/content/types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';
import { floorUp } from './terrain-lift.ts';

export const PRESENCE_LOOK = {
  fill: 0.85,
  width: 0.95,
  wobble: 0.35,
  height: 0.05,
  gone: 0.004,
} as const;

interface Presence {
  readonly light: GroundLight;
  readonly glow: number;
}

export interface PresenceLook {
  update(dt: number, world: World): void;
}

export function presenceOf(monster: MonsterState): BossPresence | null {
  return monster.def.boss?.presence ?? null;
}

export function createPresenceLook(parent: Object3D): PresenceLook {
  const lights: Map<number, Presence> = new Map<number, Presence>();
  let clock: number = 0;
  return {
    update(dt: number, world: World): void {
      clock += dt;
      for (const monster of world.monsters) {
        const presence: BossPresence | null = presenceOf(monster);
        if (presence === null || !monster.alive || lights.has(monster.id)) continue;
        const light: GroundLight = createGroundLight(new Color(presence.color), { kind: 'round', radius: presence.radius, inner: 0, arc: Math.PI * 2 }, { fill: PRESENCE_LOOK.fill, band: 0, width: PRESENCE_LOOK.width, wobble: PRESENCE_LOOK.wobble });
        parent.add(light.mesh);
        lights.set(monster.id, { light, glow: presence.glow });
      }
      for (const [id, entry] of lights) {
        const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === id);
        const standing: boolean = monster !== undefined && monster.alive;
        if (monster !== undefined) entry.light.mesh.position.set(monster.pos.x, floorUp(monster.pos.x, PRESENCE_LOOK.height, monster.pos.z), monster.pos.z);
        entry.light.show(standing ? entry.glow : 0);
        entry.light.step(dt, clock);
        if (standing || entry.light.strength >= PRESENCE_LOOK.gone) continue;
        entry.light.dispose();
        lights.delete(id);
      }
    },
  };
}
