import type { WardDef, WardSide } from '../content/scene-types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import type { Side } from './factions.ts';
import { findHero } from './heroes.ts';
import type { Actor, MonsterState, NpcState, PlayerState, World } from './types.ts';

export const WARDS = {
  rest: 1e-6,
} as const;

export interface WardState {
  readonly id: number;
  readonly def: WardDef;
  readonly ownerId: number;
  readonly pos: Vec2;
  age: number;
  lowering: number | null;
  calmed: readonly number[] | null;
}

export function raiseWard(world: World, def: WardDef, owner: NpcState, pos: Vec2): WardState {
  const ward: WardState = { id: world.nextId, def, ownerId: owner.id, pos: { x: pos.x, z: pos.z }, age: 0, lowering: null, calmed: null };
  world.nextId += 1;
  world.wards = [...world.wards, ward];
  return ward;
}

export function lowerWard(ward: WardState): void {
  ward.lowering ??= 0;
}

export function wardStrength(ward: WardState): number {
  const risen: number = Math.min(1, ward.age / ward.def.rise);
  const left: number = ward.lowering === null ? 1 : Math.max(0, 1 - ward.lowering / ward.def.fall);
  return Math.min(risen, left);
}

export function findWard(world: World, id: number | null): WardState | null {
  return world.wards.find((ward: WardState): boolean => ward.id === id) ?? null;
}

export function standing(ward: WardState): boolean {
  return ward.lowering === null || ward.lowering < ward.def.fall;
}

export function inside(ward: WardState, at: Vec2): boolean {
  return standing(ward) && distance(at, ward.pos) < ward.def.radius;
}

function sideOf(actor: Actor): WardSide {
  return actor.kind;
}

function admits(ward: WardState, actor: Actor): boolean {
  return ward.def.admits.includes(sideOf(actor));
}

export function strikeCrosses(world: World, from: Vec2, to: Vec2): boolean {
  return world.wards.some((ward: WardState): boolean => ward.def.stopsStrikes && inside(ward, from) !== inside(ward, to));
}

export function wardedFrom(world: World, monster: MonsterState, target: Actor): boolean {
  return strikeCrosses(world, monster.pos, target.pos);
}

function sourceAt(world: World, sourceId: number): Vec2 | null {
  const hero: PlayerState | null = findHero(world, sourceId);
  if (hero !== null) return hero.pos;
  return world.monsters.find((monster: MonsterState): boolean => monster.id === sourceId)?.pos ?? null;
}

function calms(ward: WardState, monster: MonsterState, target: Actor): boolean {
  return ward.calmed !== null && ward.lowering !== null && ward.calmed.includes(monster.id) && admits(ward, target) && monster.calm >= ward.lowering;
}

function calmedFrom(world: World, sourceId: number, target: Actor): boolean {
  const monster: MonsterState | undefined = world.monsters.find((each: MonsterState): boolean => each.id === sourceId);
  return monster !== undefined && world.wards.some((ward: WardState): boolean => calms(ward, monster, target));
}

function strikerSide(world: World, sourceId: number, faction: string | null): WardSide {
  if (sourceId === world.player.id) return 'player';
  if (world.monsters.some((monster: MonsterState): boolean => monster.id === sourceId)) return 'monster';
  return faction === null ? 'player' : 'monster';
}

function shelters(ward: WardState, target: Actor, striker: WardSide): boolean {
  return ward.def.stopsStrikes && admits(ward, target) && !ward.def.admits.includes(striker) && inside(ward, target.pos);
}

export function launchPoint(world: World, sourceId: number, fallback: Vec2): Vec2 {
  const at: Vec2 = sourceAt(world, sourceId) ?? fallback;
  return { x: at.x, z: at.z };
}

export function wardStops(world: World, side: Side, target: Actor): boolean {
  if (world.wards.length === 0) return false;
  const striker: WardSide = strikerSide(world, side.sourceId, side.faction);
  if (world.wards.some((ward: WardState): boolean => shelters(ward, target, striker))) return true;
  const from: Vec2 | null = side.from ?? sourceAt(world, side.sourceId);
  return from !== null && (strikeCrosses(world, from, target.pos) || calmedFrom(world, side.sourceId, target));
}

function heldOut(world: World, ward: WardState): number[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && !admits(ward, monster) && distance(monster.pos, ward.pos) - ward.def.radius <= monster.def.aggroRadius).map((monster: MonsterState): number => monster.id);
}

function pushOut(ward: WardState, body: Actor): void {
  const shell: number = ward.def.radius + body.radius;
  const dx: number = body.pos.x - ward.pos.x;
  const dz: number = body.pos.z - ward.pos.z;
  const reach: number = Math.hypot(dx, dz);
  if (reach >= shell) return;
  const out: Vec2 = reach < WARDS.rest ? { x: 1, z: 0 } : { x: dx / reach, z: dz / reach };
  body.pos.x = ward.pos.x + out.x * shell;
  body.pos.z = ward.pos.z + out.z * shell;
  const inward: number = -(body.knock.x * out.x + body.knock.z * out.z);
  if (inward <= 0) return;
  body.knock.x += out.x * inward;
  body.knock.z += out.z * inward;
}

export function keepOutOfWards(world: World): void {
  for (const ward of world.wards.filter(standing)) {
    for (const body of [...world.heroes, ...world.monsters]) {
      if (body.alive && !admits(ward, body)) pushOut(ward, body);
    }
  }
}

export function stepWards(world: World, dt: number): void {
  if (world.wards.length === 0) return;
  for (const ward of world.wards) {
    ward.age += dt;
    const owned: boolean = world.npcs.some((npc: NpcState): boolean => npc.id === ward.ownerId);
    if (!owned || ward.age >= ward.def.lifetime) lowerWard(ward);
    if (ward.lowering === null) continue;
    ward.calmed ??= heldOut(world, ward);
    ward.lowering += dt;
  }
  world.wards = world.wards.filter((ward: WardState): boolean => ward.lowering === null || ward.lowering < ward.def.fall + ward.def.grace);
}
