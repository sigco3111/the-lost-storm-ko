import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef, SpecialtyDef } from './content/types.ts';
import { canAllocate, placeLinks, reachablePlaces } from './progression.ts';
import { earnedPoints } from './save.ts';
import { armPlaces, armTip, closingSpecialty, farthestPlace, heldSpecialty, opensSpecialty, specialtyClosed, specialtyOf, specialtyPlaces, withOneSpecialty } from './specialty.ts';

const content: Content = loadContent();

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

function first(id: string): string {
  const own: readonly SkillTreeNodeDef[] = specialtyPlaces(content, id);
  const entry: SkillTreeNodeDef | undefined = own.find((node: SkillTreeNodeDef): boolean => node.requires.every((other: string): boolean => !own.some((place: SkillTreeNodeDef): boolean => place.id === other)));
  assert.ok(entry !== undefined, id);
  return entry.id;
}

void test('every weapon arm splits into three specialties, each a deep branch with notables and one keystone', (): void => {
  for (const arm of ['stone', 'storm', 'blade', 'wind']) {
    const own: readonly SpecialtyDef[] = content.chart.specialties.filter((entry: SpecialtyDef): boolean => entry.path === arm);
    assert.equal(own.length, 3, arm);
    for (const specialty of own) {
      const places: readonly SkillTreeNodeDef[] = specialtyPlaces(content, specialty.id);
      assert.ok(places.length >= 10 && places.length <= 14, `${specialty.id} has ${places.length} places`);
      const notables: number = places.filter((node: SkillTreeNodeDef): boolean => node.kind === 'notable').length;
      assert.ok(notables >= 2 && notables <= 3, `${specialty.id} notables`);
      const keystones: readonly SkillTreeNodeDef[] = places.filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone');
      assert.equal(keystones.length, 1, specialty.id);
      const keystone: SkillTreeNodeDef | undefined = keystones[0];
      assert.ok(keystone !== undefined && (keystone.triggers.length > 0 || keystone.skillMods.some((mod): boolean => mod.field === 'pull')), `${specialty.id} keystone changes how the build plays`);
    }
  }
});

void test('a specialty grows from the end of its own arm', (): void => {
  for (const specialty of content.chart.specialties) {
    const entry: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === first(specialty.id));
    assert.ok(entry !== undefined);
    for (const before of entry.requires) {
      const gate: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === before);
      assert.ok(gate !== undefined && gate.path === specialty.path && gate.specialty === null && gate.common === null, `${specialty.id} grows from ${before}`);
    }
    const end: SkillTreeNodeDef | null = farthestPlace(armPlaces(content, specialty.path));
    assert.ok(end !== null);
    assert.ok(Math.hypot(entry.column, entry.row) > Math.hypot(end.column, end.row) - 1, `${specialty.id} lies past its arm`);
  }
});

void test('the place an arm is named at is the end of the arm, short of the place its specialties open from', (): void => {
  for (const path of new Set<string>(content.chart.specialties.map((entry: SpecialtyDef): string => entry.path))) {
    const tip: SkillTreeNodeDef | null = armTip(content, path);
    assert.ok(tip !== null);
    assert.equal(opensSpecialty(content, tip), false);
    const gates: readonly SkillTreeNodeDef[] = armPlaces(content, path).filter((node: SkillTreeNodeDef): boolean => opensSpecialty(content, node));
    assert.ok(gates.length > 0, `${path} opens a specialty`);
    for (const gate of gates) assert.ok(Math.hypot(gate.column, gate.row) > Math.hypot(tip.column, tip.row), `${gate.id} lies past ${tip.id}`);
  }
});

void test('taking the first place of one specialty closes the other eleven and leaves its own open', (): void => {
  const route: readonly string[] = routeTo(first('maelstrom'), 'blade_thunderhead');
  assert.equal(heldSpecialty(content, route.slice(0, -1)), null);
  assert.equal(heldSpecialty(content, route), 'maelstrom');
  const closed: readonly string[] = content.chart.specialties.filter((entry: SpecialtyDef): boolean => specialtyPlaces(content, entry.id).some((node: SkillTreeNodeDef): boolean => specialtyClosed(content, route, node))).map((entry: SpecialtyDef): string => entry.id);
  assert.equal(closed.length, 11);
  assert.ok(!closed.includes('maelstrom'));
  const other: SkillTreeNodeDef | undefined = specialtyPlaces(content, 'spring_tide')[0];
  assert.ok(other !== undefined);
  assert.equal(closingSpecialty(content, route, other)?.name, specialtyOf(content, 'maelstrom')?.name);
  assert.equal(canAllocate(content, route, 5, first('spring_tide')), false);
  assert.equal(canAllocate(content, route.slice(0, -1), 5, first('spring_tide')), true);
});

void test('places outside the specialties never close', (): void => {
  const route: readonly string[] = routeTo(first('hailfall'), 'stone_thunderclap');
  for (const node of content.skillTree) if (node.specialty === null) assert.equal(specialtyClosed(content, route, node), false, node.id);
});

void test('giving back every place of the chosen specialty opens the others again', (): void => {
  const route: readonly string[] = routeTo(first('kiln'), 'stone_thunderclap');
  assert.equal(canAllocate(content, route, 3, first('hearth')), false);
  assert.equal(canAllocate(content, route.slice(0, -1), 3, first('hearth')), true);
});

void test('a save that somehow holds two specialties keeps the one taken first', (): void => {
  const kiln: readonly string[] = routeTo(first('kiln'), 'stone_thunderclap');
  const both: readonly string[] = [...kiln, first('hearth')];
  assert.deepEqual(withOneSpecialty(content, both), kiln);
  assert.equal(reachablePlaces(content, both).includes(first('hearth')), false);
  assert.equal(heldSpecialty(content, reachablePlaces(content, both)), 'kiln');
});

void test('a hero who has taken every place of a weapon arm still has the points to finish a specialty by the top level', (): void => {
  const top: number = earnedPoints(content, content.player.xp.maxLevel, content.chart.grants.map((grant): string => grant.id));
  const atTwenty: number = earnedPoints(content, 20, content.chart.grants.map((grant): string => grant.id));
  for (const specialty of content.chart.specialties) {
    const arm: number = armPlaces(content, specialty.path).length;
    assert.ok(arm + specialtyPlaces(content, specialty.id).length <= top, `${specialty.id}: ${arm} arm places and the specialty need more than ${top} points`);
  }
  assert.ok(top - atTwenty >= specialtyPlaces(content, 'maelstrom').length + 5, 'from level 20 to the top there are points for a specialty and some common places');
});
