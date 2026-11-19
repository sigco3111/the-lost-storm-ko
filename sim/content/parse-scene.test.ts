import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { sceneProblems, zoneScenes } from './parse-scene.ts';
import { ContentError } from './read.ts';
import type { SceneDef } from './scene-types.ts';
import { storyFlagNames } from './story.ts';
import type { Content, ZoneDef } from './types.ts';

const RAW = {
  id: 'meeting',
  npc: 'warden_guide',
  when: [{ type: 'visited', zone: 'hideout', not: true }],
  x: 10,
  z: 12,
  radius: 6,
  moment: 'campfire',
  fight: 2,
  arrive: 1.5,
  strike: 'warden_sweep',
  talk: 'warden_guide_first',
  ward: { radius: 4, rise: 0.5, fall: 0.5, lifetime: 30, admits: ['player'], stopsStrikes: true, grace: 2, leave: 2 },
  lead: { exit: 'east', x: 20, z: 12, ahead: 6, walk: 3, run: 6 },
  owes: { met: 'owed' },
  sets: { met: 'yes' },
} as const;

void test('a scene reads who comes, where it begins, the moment it brings, the strike, its talk, its ward, the walk and the flags it sets', (): void => {
  const scenes: SceneDef[] = zoneScenes([RAW], 'zone.scenes');
  assert.deepEqual(scenes, [{ ...RAW, when: [{ type: 'visited', zone: 'hideout', not: true }], ward: { ...RAW.ward, admits: [...RAW.ward.admits] }, lead: { ...RAW.lead, through: null, waits: true }, owes: { ...RAW.owes }, sets: { ...RAW.sets } }]);
  const through: SceneDef = must(zoneScenes([{ ...RAW, lead: { ...RAW.lead, through: 0.7, waits: false } }], 'zone.scenes')[0], 'a scene that ends through its exit');
  assert.equal(through.lead.through, 0.7);
  assert.equal(through.lead.waits, false);
  assert.deepEqual(zoneScenes(undefined, 'zone.scenes'), []);
});

void test('a scene with no ward, a ward that lets anyone else in or ends before it rises, a run slower than its walk, a missing field or a doubled id is refused', (): void => {
  assert.throws((): unknown => zoneScenes([{ ...RAW, ward: undefined }], 'zone.scenes'), ContentError);
  assert.throws((): unknown => zoneScenes([{ ...RAW, ward: { ...RAW.ward, admits: ['npc'] } }], 'zone.scenes'), ContentError);
  assert.throws((): unknown => zoneScenes([{ ...RAW, ward: { ...RAW.ward, lifetime: 0.4 } }], 'zone.scenes'), ContentError);
  assert.throws((): unknown => zoneScenes([{ ...RAW, ward: { ...RAW.ward, radius: 0 } }], 'zone.scenes'), ContentError);
  assert.throws((): unknown => zoneScenes([{ ...RAW, lead: { ...RAW.lead, run: 1 } }], 'zone.scenes'), ContentError);
  assert.throws((): unknown => zoneScenes([{ ...RAW, fight: 0 }], 'zone.scenes'), ContentError);
  assert.throws((): unknown => zoneScenes([{ ...RAW, lead: { ...RAW.lead, through: 0 } }], 'zone.scenes'), ContentError);
  assert.throws((): unknown => zoneScenes([RAW, RAW], 'zone.scenes'), ContentError);
});

void test('a scene naming someone, a moment, a strike, an exit or a talk the content does not have, or a talk heard more than once, is reported', (): void => {
  const shipped: Content = loadContent();
  const hall: ZoneDef = must(shipped.zones.get('hall_of_time'), 'the Hall');
  const flags: ReadonlySet<string> = storyFlagNames(shipped);
  assert.deepEqual(sceneProblems(shipped, flags), []);
  const scene: SceneDef = must(hall.scenes[0], 'the meeting');
  const broken: SceneDef = { ...scene, npc: 'nobody', moment: 'nothing', strike: 'no_skill', lead: { ...scene.lead, exit: 'nowhere' }, when: [{ type: 'visited', zone: 'no_zone', not: false }] };
  const content: Content = { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [hall.id, { ...hall, scenes: [broken] }]]) };
  const problems: string[] = sceneProblems(content, flags);
  for (const part of ['unknown npc nobody', 'unknown moment nothing', 'unknown skill no_skill', 'unknown exit nowhere', 'unknown zone no_zone']) {
    assert.ok(problems.some((problem: string): boolean => problem.includes(part)), part);
  }
  const talks = (talk: string): string[] => sceneProblems({ ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [hall.id, { ...hall, scenes: [{ ...scene, talk }] }]]) }, flags);
  assert.ok(talks('no_talk').some((problem: string): boolean => problem.includes('which warden_guide does not have')));
  assert.ok(talks('warden_guide_talk').some((problem: string): boolean => problem.includes('not heard once')));
});
