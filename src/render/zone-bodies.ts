import type { Content, MonsterDef, ZoneDef, ZonePack } from '../../sim/content/types.ts';
import { modsNamed, withMods } from '../../sim/world/elites.ts';

export const ZONE_BODIES = {
  sparesCap: 16,
} as const;

export interface ZoneBody {
  readonly def: MonsterDef;
  readonly spares: number;
}

export function monsterKey(def: MonsterDef): string {
  return `${def.id}|${def.rig}|${def.tint}|${def.color}|${def.scale}`;
}

function wantBody(bodies: Map<string, ZoneBody>, def: MonsterDef, spares: number): boolean {
  const key: string = monsterKey(def);
  const known: ZoneBody | undefined = bodies.get(key);
  const wanted: number = Math.min(ZONE_BODIES.sparesCap, Math.max(1, spares));
  if (known === undefined) {
    bodies.set(key, { def, spares: wanted });
    return true;
  }
  if (known.spares < wanted) bodies.set(key, { def: known.def, spares: wanted });
  return false;
}

function packBodies(content: Content, zone: ZoneDef, pack: ZonePack, bodies: Map<string, ZoneBody>): void {
  const woken: Map<string, ZoneBody> = new Map<string, ZoneBody>();
  const extra: number = zone.surge?.maxExtraMonsters ?? 0;
  pack.members.forEach((member, index: number): void => {
    const base: MonsterDef | undefined = content.monsters.get(member.monster);
    if (base === undefined) return;
    wantBody(bodies, base, 1);
    const def: MonsterDef = withMods(base, modsNamed(content.monsterMods, member.mods));
    const key: string = monsterKey(def);
    const count: number = member.count + (index === 0 ? extra : 0);
    woken.set(key, { def, spares: (woken.get(key)?.spares ?? 0) + count });
  });
  for (const body of woken.values()) wantBody(bodies, body.def, pack.waits === undefined ? 1 : body.spares);
}

export function zoneBodies(content: Content, zone: ZoneDef): ReadonlyMap<string, ZoneBody> {
  const bodies: Map<string, ZoneBody> = new Map<string, ZoneBody>();
  for (const pack of zone.packs) packBodies(content, zone, pack, bodies);
  const callers: MonsterDef[] = [...bodies.values()].map((body: ZoneBody): MonsterDef => body.def);
  for (let caller: MonsterDef | undefined = callers.pop(); caller !== undefined; caller = callers.pop()) {
    if (caller.summon === null) continue;
    const minion: MonsterDef | undefined = content.monsters.get(caller.summon.monster ?? caller.id);
    if (minion !== undefined && wantBody(bodies, minion, caller.summon.limit)) callers.push(minion);
  }
  return bodies;
}
