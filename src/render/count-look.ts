import type { Object3D } from 'three';
import { Color } from 'three';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import { heldAtLine, holdersOf } from '../../sim/world/count.ts';
import type { MonsterState, World, WorldEvent } from '../../sim/world/types.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';
import { floorUp } from './terrain-lift.ts';

export const COUNT_LOOK = {
  held: 0xe8c46a,
  sealed: 0x6a7f9a,
  heldMix: 0.32,
  sealedMix: 0.18,
  threadHalf: 0.22,
  threadFill: 0.7,
  threadWidth: 0.3,
  threadWobble: 0.2,
  threadGlow: 0.34,
  threadHeight: 0.07,
  threadReach: 26,
  threadGone: 0.004,
  flashRadius: 2.4,
  flashFill: 0.8,
  flashWidth: 0.9,
  flashWobble: 0.5,
  flashGlow: 0.9,
  flashTime: 0.7,
  flashRise: 6,
  flashHeight: 0.08,
} as const;

export const HELD_COLOR: Color = new Color(COUNT_LOOK.held);
export const SEALED_COLOR: Color = new Color(COUNT_LOOK.sealed);

export interface Thread {
  readonly holder: number;
  readonly from: ReadonlyVec2;
  readonly to: ReadonlyVec2;
}

export interface CountShade {
  readonly color: Color;
  readonly mix: number;
}

export function threadsOf(world: World): Thread[] {
  const threads: Thread[] = [];
  for (const monster of world.monsters) {
    if (monster.def.boss === null || !heldAtLine(world, monster)) continue;
    for (const holder of holdersOf(world, monster)) threads.push({ holder: holder.id, from: holder.pos, to: monster.pos });
  }
  return threads;
}

export function countShadeOf(world: World, monster: MonsterState): CountShade | null {
  if (monster.sealed) return { color: SEALED_COLOR, mix: COUNT_LOOK.sealedMix };
  if (monster.def.boss !== null && heldAtLine(world, monster)) return { color: HELD_COLOR, mix: COUNT_LOOK.heldMix };
  return null;
}

export function flashLevel(age: number): number {
  const t: number = Math.min(1, Math.max(0, age / COUNT_LOOK.flashTime));
  const rise: number = Math.min(1, t * COUNT_LOOK.flashRise);
  return COUNT_LOOK.flashGlow * rise * (1 - t) * (1 - t);
}

function lay(light: GroundLight, from: ReadonlyVec2, to: ReadonlyVec2): void {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  light.mesh.position.set(from.x, floorUp(from.x, COUNT_LOOK.threadHeight, from.z), from.z);
  light.mesh.rotation.z = Math.atan2(-dx, -dz);
  const span = light.mesh.material.uniforms['uLaneSpan'];
  if (span !== undefined) span.value = Math.min(COUNT_LOOK.threadReach, Math.hypot(dx, dz));
}

interface ThreadLight {
  readonly light: GroundLight;
  holder: number | null;
}

interface Flash {
  readonly light: GroundLight;
  age: number;
}

export interface CountLook {
  handle(events: readonly WorldEvent[]): void;
  update(dt: number, world: World): void;
}

export function createCountLook(parent: Object3D): CountLook {
  const threads: ThreadLight[] = [];
  const flashes: Flash[] = [];
  let clock: number = 0;

  const threadFor = (holder: number): ThreadLight => {
    const owned: ThreadLight | undefined = threads.find((entry: ThreadLight): boolean => entry.holder === holder) ?? threads.find((entry: ThreadLight): boolean => entry.holder === null && entry.light.strength < COUNT_LOOK.threadGone);
    if (owned !== undefined) {
      owned.holder = holder;
      return owned;
    }
    const light: GroundLight = createGroundLight(HELD_COLOR, { kind: 'lane', halfWidth: COUNT_LOOK.threadHalf, start: 0, length: COUNT_LOOK.threadReach }, { fill: COUNT_LOOK.threadFill, band: 0, width: COUNT_LOOK.threadWidth, wobble: COUNT_LOOK.threadWobble });
    parent.add(light.mesh);
    const made: ThreadLight = { light, holder };
    threads.push(made);
    return made;
  };

  return {
    handle(events: readonly WorldEvent[]): void {
      for (const event of events) {
        if (event.type !== 'count_broken') continue;
        const light: GroundLight = createGroundLight(HELD_COLOR, { kind: 'round', radius: COUNT_LOOK.flashRadius, inner: 0, arc: Math.PI * 2 }, { fill: COUNT_LOOK.flashFill, band: 0, width: COUNT_LOOK.flashWidth, wobble: COUNT_LOOK.flashWobble });
        light.mesh.position.set(event.pos.x, floorUp(event.pos.x, COUNT_LOOK.flashHeight, event.pos.z), event.pos.z);
        light.pose(0, clock);
        parent.add(light.mesh);
        flashes.push({ light, age: 0 });
      }
    },
    update(dt: number, world: World): void {
      clock += dt;
      const live: Thread[] = threadsOf(world);
      for (const entry of threads) if (entry.holder !== null && !live.some((thread: Thread): boolean => thread.holder === entry.holder)) entry.holder = null;
      for (const thread of live) lay(threadFor(thread.holder).light, thread.from, thread.to);
      for (const entry of threads) {
        entry.light.show(entry.holder === null ? 0 : COUNT_LOOK.threadGlow);
        entry.light.step(dt, clock);
        entry.light.mesh.visible = entry.light.strength >= COUNT_LOOK.threadGone;
      }
      for (let index: number = flashes.length - 1; index >= 0; index -= 1) {
        const flash: Flash | undefined = flashes[index];
        if (flash === undefined) continue;
        flash.age += dt;
        flash.light.pose(flashLevel(flash.age), clock);
        if (flash.age < COUNT_LOOK.flashTime) continue;
        flash.light.dispose();
        flashes.splice(index, 1);
      }
    },
  };
}
