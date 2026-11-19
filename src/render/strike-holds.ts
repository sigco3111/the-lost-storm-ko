import type { World, WorldEvent } from '../../sim/world/types.ts';
import type { Fallen, Holds, Later } from './hit-hold.ts';
import { createHolds, createLater, heroHolds, holdSpan, rippleDelays } from './hit-hold.ts';

export interface StrikeHolds {
  handle(events: readonly WorldEvent[], world: World): void;
  step(dt: number): number[];
  rate(id: number): number;
  forget(id: number): void;
  clear(): void;
}

export function strikeHolds(): StrikeHolds {
  const holds: Holds = createHolds();
  const dying: Later<number> = createLater<number>();
  return {
    handle(events: readonly WorldEvent[], world: World): void {
      const fallen: Fallen[] = [];
      let heroSpan: number = 0;
      for (const event of events) {
        if (event.type === 'death' && event.team === 'monster') fallen.push({ id: event.actorId, pos: event.pos });
        if (event.type !== 'damage' || event.burn || event.targetTeam === 'player') continue;
        const span: number = holdSpan(event.skill.hitStop, event.crit, event.killed);
        holds.hold(event.targetId, span);
        if (event.sourceId === world.player.id && heroHolds(event.skill)) heroSpan = Math.max(heroSpan, span);
      }
      if (heroSpan > 0) holds.hold(world.player.id, heroSpan);
      const delays: ReadonlyMap<number, number> = rippleDelays(fallen, world.player.pos);
      for (const one of fallen) dying.add(delays.get(one.id) ?? 0, one.id);
    },
    step(dt: number): number[] {
      holds.step(dt);
      return dying.take(dt);
    },
    rate(id: number): number {
      return holds.rate(id);
    },
    forget(id: number): void {
      holds.forget(id);
      dying.drop((waiting: number): boolean => waiting !== id);
    },
    clear(): void {
      holds.clear();
      dying.clear();
    },
  };
}
