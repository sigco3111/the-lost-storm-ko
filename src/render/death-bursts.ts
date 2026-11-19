import type { Color } from 'three';
import type { Vec2 } from '../../sim/math.ts';
import type { MonsterState, World, WorldEvent } from '../../sim/world/types.ts';
import type { Fallen, Later } from './hit-hold.ts';
import { createLater, rippleDelays } from './hit-hold.ts';
import type { BurstOptions } from './particles.ts';

export const FALL = {
  bigFrom: 1.5,
  bigFull: 4,
  bigSparks: 34,
  bigLight: 26,
  bigHeight: 1.5,
  bigRing: 1.2,
  ringRadius: 2.2,
  ringTime: 0.3,
  playerShake: 0.6,
} as const;

export interface DeathBurstDeps {
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
  readonly colorOf: (hex: string) => Color;
  readonly trauma: (amount: number) => void;
  readonly bone: Color;
  readonly blood: Color;
}

export interface DeathBursts {
  handle(events: readonly WorldEvent[], world: World): void;
  update(dt: number): void;
  clear(): void;
}

interface Fall {
  readonly pos: Vec2;
  readonly direction: Vec2;
  readonly tint: Color;
  readonly big: number;
}

export function blowShare(amount: number, maxLife: number): number {
  return maxLife > 0 ? Math.max(0, amount) / maxLife : 0;
}

export function bigBurst(share: number): number {
  return Math.min(1, Math.max(0, (share - FALL.bigFrom) / (FALL.bigFull - FALL.bigFrom)));
}

export function createDeathBursts(deps: DeathBurstDeps): DeathBursts {
  const falls: Later<Fall> = createLater<Fall>();
  const { spray, ring, flashLight, bone } = deps;

  const draw = (fall: Fall): void => {
    const { pos, direction, tint, big } = fall;
    spray(pos.x, 1.1, pos.z, bone, 26, { dirX: direction.x, dirZ: direction.z, spread: 2.4, speed: { min: 3, max: 12 }, lift: { min: 2, max: 9 }, life: { min: 0.4, max: 0.95 }, size: { min: 0.3, max: 0.7 } });
    spray(pos.x, 1.4, pos.z, tint, 18, { speed: { min: 0.5, max: 3 }, lift: { min: 2, max: 7 }, life: { min: 0.5, max: 1.1 }, gravity: -2, size: { min: 0.35, max: 0.9 } });
    ring(pos.x, pos.z, FALL.ringRadius * (1 + FALL.bigRing * big), tint, FALL.ringTime);
    if (big <= 0) return;
    spray(pos.x, FALL.bigHeight, pos.z, bone, Math.round(FALL.bigSparks * big), { dirX: direction.x, dirZ: direction.z, spread: 1.2, speed: { min: 6, max: 18 }, lift: { min: 1, max: 7 }, life: { min: 0.3, max: 0.8 }, size: { min: 0.25, max: 0.6 } });
    flashLight(pos.x, FALL.bigHeight, pos.z, tint, FALL.bigLight * big);
  };

  return {
    handle(events: readonly WorldEvent[], world: World): void {
      const shares: Map<number, number> = new Map<number, number>();
      const fallen: Fallen[] = [];
      for (const event of events) {
        if (event.type === 'damage' && event.killed && event.targetTeam === 'monster') {
          const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.targetId);
          shares.set(event.targetId, Math.max(shares.get(event.targetId) ?? 0, blowShare(event.amount, monster?.maxLife ?? 0)));
        }
        if (event.type !== 'death') continue;
        if (event.team === 'player') {
          if (event.actorId === world.player.id) deps.trauma(FALL.playerShake);
          spray(event.pos.x, 1.2, event.pos.z, deps.blood, 50, { speed: { min: 2, max: 9 }, lift: { min: 2, max: 9 }, life: { min: 0.4, max: 1 } });
          continue;
        }
        fallen.push({ id: event.actorId, pos: event.pos });
      }
      const delays: ReadonlyMap<number, number> = rippleDelays(fallen, world.player.pos);
      for (const event of events) {
        if (event.type !== 'death' || event.team === 'player') continue;
        const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
        const tint: Color = monster === undefined ? bone : deps.colorOf(monster.def.color);
        falls.add(delays.get(event.actorId) ?? 0, { pos: event.pos, direction: event.direction, tint, big: bigBurst(shares.get(event.actorId) ?? 0) });
      }
      for (const fall of falls.take(0)) draw(fall);
    },
    update(dt: number): void {
      for (const fall of falls.take(dt)) draw(fall);
    },
    clear(): void {
      falls.clear();
    },
  };
}
