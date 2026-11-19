import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { directionOf, normalize } from '../math.ts';
import type { Offence } from './combat.ts';
import { applyHit, offenceOf, setTempo, targetsWhere } from './combat.ts';
import { timeScaleAt } from './areas.ts';
import { launchPoint } from './wards.ts';
import type { Actor, HazardState, MonsterState, World, WorldEvent } from './types.ts';
import { sameFloor } from './floors.ts';

export const HAZARDS = {
  fieldGrip: 0.2,
} as const;

export function placeHazard(world: World, offence: Offence, skill: SkillDef, at: ReadonlyVec2, later: number = 0): HazardState | null {
  const delivery = skill.delivery;
  if (delivery.type !== 'mark' && delivery.type !== 'field') return null;
  const delay: number = (delivery.type === 'mark' ? delivery.delay : delivery.duration) + later;
  const hazard: HazardState = {
    id: world.nextId,
    ownerId: offence.sourceId,
    from: launchPoint(world, offence.sourceId, { x: at.x, z: at.z }),
    team: offence.team,
    faction: offence.faction,
    skill,
    pos: { x: at.x, z: at.z },
    radius: delivery.radius,
    delay,
    damageMin: offence.damageMin,
    damageMax: offence.damageMax,
    damagePercent: offence.damagePercent,
    critChance: offence.critChance,
    critMultiplier: offence.critMultiplier,
    timeLeft: delay,
  };
  world.nextId += 1;
  world.hazards.push(hazard);
  world.events.push({ type: 'hazard', hazard, burst: false, hits: 0 });
  return hazard;
}

export function markRow(at: ReadonlyVec2, direction: ReadonlyVec2, count: number, spacing: number): Vec2[] {
  const along: Vec2 = normalize(direction, { x: 0, z: 1 });
  const spots: Vec2[] = [];
  for (let index: number = 0; index < count; index += 1) {
    const offset: number = (index - (count - 1) / 2) * spacing;
    spots.push({ x: at.x + along.x * offset, z: at.z + along.z * offset });
  }
  return spots;
}

export function placeMarks(world: World, offence: Offence, skill: SkillDef, at: ReadonlyVec2, direction: ReadonlyVec2): number {
  const delivery = skill.delivery;
  if (delivery.type !== 'mark') return placeHazard(world, offence, skill, at) === null ? 0 : 1;
  const spots: Vec2[] = markRow(at, direction, delivery.count, delivery.spacing);
  spots.forEach((spot: Vec2, index: number): void => {
    placeHazard(world, offence, skill, spot, index * delivery.step);
  });
  return spots.length;
}

function inside(world: World, hazard: HazardState): Actor[] {
  return targetsWhere(world, { sourceId: hazard.ownerId, faction: hazard.faction, from: hazard.from }, (target: Actor): boolean => Math.hypot(target.pos.x - hazard.pos.x, target.pos.z - hazard.pos.z) <= hazard.radius + target.radius && sameFloor(world, hazard.pos, target.pos));
}

function slowInside(world: World, hazard: HazardState): void {
  const delivery = hazard.skill.delivery;
  if (delivery.type !== 'field') return;
  for (const target of inside(world, hazard)) setTempo(target, 1 - delivery.slow, HAZARDS.fieldGrip);
}

function burst(world: World, hazard: HazardState): void {
  let hits: number = 0;
  if (hazard.skill.delivery.type === 'field') {
    world.events.push({ type: 'hazard', hazard, burst: true, hits });
    return;
  }
  for (const target of inside(world, hazard)) {
    const offset: Vec2 = { x: target.pos.x - hazard.pos.x, z: target.pos.z - hazard.pos.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    const away: Vec2 = gap > 0 ? { x: offset.x / gap, z: offset.z / gap } : { x: 0, z: 1 };
    if (applyHit(world, { sourceId: hazard.ownerId, ...hazard }, target, hazard.skill, away)) hits += 1;
  }
  world.events.push({ type: 'hazard', hazard, burst: true, hits });
}

function deathBursts(world: World, events: readonly WorldEvent[]): void {
  for (const event of events) {
    if (event.type !== 'death' || event.team !== 'monster') continue;
    const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === event.actorId);
    const skillId: string | null = monster?.def.deathSkill ?? null;
    const skill: SkillDef | undefined = skillId === null ? undefined : world.content.skills.get(skillId);
    if (monster !== undefined && skill !== undefined) placeMarks(world, offenceOf(monster), skill, monster.pos, directionOf(monster.facing));
  }
}

export function stepHazards(world: World, dt: number): void {
  const due: HazardState[] = [];
  world.hazards = world.hazards.filter((hazard: HazardState): boolean => {
    hazard.timeLeft -= dt * timeScaleAt(world, hazard.team, hazard.pos, hazard.radius);
    slowInside(world, hazard);
    if (hazard.timeLeft > 0) return true;
    due.push(hazard);
    return false;
  });
  for (const hazard of due) burst(world, hazard);
  deathBursts(world, [...world.events]);
}

export function clearHazards(world: World): void {
  world.hazards = [];
  world.echoes = [];
}
