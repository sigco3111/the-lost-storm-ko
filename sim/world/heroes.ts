import type { Actor, Command, Offence, PlayerState, Team, World } from './types.ts';

export function actorsOf(world: World): Actor[] {
  return [...world.heroes, ...world.monsters];
}

export function findHero(world: World, id: number): PlayerState | null {
  return world.heroes.find((hero: PlayerState): boolean => hero.id === id) ?? null;
}

export function isPrimary(world: World, actor: Actor): boolean {
  return actor === world.player;
}

export function heroFor(world: World, command: Command): PlayerState | null {
  return command.by === undefined ? world.player : findHero(world, command.by);
}

export function partyOf(world: World, sourceId: number): number | null {
  return findHero(world, sourceId)?.party ?? null;
}

export function hostileFrom(world: World, hero: PlayerState, team: Team, ownerId: number): boolean {
  if (team === 'monster') return true;
  const party: number | null = partyOf(world, ownerId);
  return party !== null && party !== hero.party;
}

export function sameSide(world: World, offence: Offence, actor: Actor): boolean {
  if (offence.team !== actor.kind) return false;
  if (actor.kind !== 'player') return true;
  const party: number | null = partyOf(world, offence.sourceId);
  return party === null || party === actor.party;
}
