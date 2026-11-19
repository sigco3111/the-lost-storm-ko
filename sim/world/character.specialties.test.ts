import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, SkillTreeNodeDef } from '../content/types.ts';
import { placeLinks } from '../progression.ts';
import { heldSpecialty, specialtyPlaces } from '../specialty.ts';
import { stepWorld } from './step.ts';
import type { Command, World } from './types.ts';

const content: Content = loadContent();

function send(world: World, command: Command): void {
  stepWorld(world, [command], 1 / 60);
}

function routeTo(target: string, start: string): string[] {
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const came: Map<string, string | null> = new Map<string, string | null>([[start, null]]);
  const queue: string[] = [start];
  for (let index: number = 0; index < queue.length; index += 1) {
    const at: string | undefined = queue[index];
    if (at === undefined || at === target) break;
    for (const next of links.get(at) ?? []) {
      if (came.has(next)) continue;
      came.set(next, at);
      queue.push(next);
    }
  }
  const route: string[] = [];
  let step: string | null = target;
  while (step !== null) {
    route.unshift(step);
    step = came.get(step) ?? null;
  }
  return route;
}

function entryOf(id: string): string {
  const own: readonly SkillTreeNodeDef[] = specialtyPlaces(content, id);
  const entry: SkillTreeNodeDef | undefined = own.find((node: SkillTreeNodeDef): boolean => !node.requires.some((other: string): boolean => own.some((place: SkillTreeNodeDef): boolean => place.id === other)));
  if (entry === undefined) throw new Error(`no entry for ${id}`);
  return entry.id;
}

void test('a hero who takes one specialty cannot take a second, and starting over opens all of them again', (): void => {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  const route: readonly string[] = routeTo(entryOf('maelstrom'), 'blade_thunderhead');
  world.player.skillPoints = route.length + 2;
  for (const node of route) send(world, { type: 'allocate', node });
  assert.deepEqual(world.player.allocated, route);
  assert.equal(heldSpecialty(content, world.player.allocated), 'maelstrom');
  send(world, { type: 'allocate', node: entryOf('tidal_bore') });
  assert.equal(world.player.allocated.includes(entryOf('tidal_bore')), false);
  assert.equal(world.player.skillPoints, 2);
  world.player.freeReset = true;
  send(world, { type: 'respec' });
  assert.deepEqual(world.player.allocated, []);
  const again: readonly string[] = routeTo(entryOf('tidal_bore'), 'blade_thunderhead');
  for (const node of again) send(world, { type: 'allocate', node });
  assert.equal(heldSpecialty(content, world.player.allocated), 'tidal_bore');
});
