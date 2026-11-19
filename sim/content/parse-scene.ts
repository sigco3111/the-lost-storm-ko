import type { Fields } from './read.ts';
import { byId, choiceList, ContentError, each, fields, flag, nonNegative, numeric, positive, text } from './read.ts';
import { conditions } from './parse-conditions.ts';
import { storyFlags } from './parse-story.ts';
import { conditionProblems } from './road.ts';
import type { SceneDef, SceneLead, SceneWard, WardSide } from './scene-types.ts';
import type { Content, LineDef, NpcDef, TalkDef, ZoneDef } from './types.ts';

const WARD_SIDES: readonly WardSide[] = ['player', 'monster'];

function lead(value: unknown, where: string): SceneLead {
  const source: Fields = fields(value, where);
  const walk: number = positive(source, 'walk', where);
  const run: number = positive(source, 'run', where);
  if (run < walk) throw new ContentError(`${where}.run`, 'a run cannot be slower than a walk');
  return { exit: text(source, 'exit', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), ahead: positive(source, 'ahead', where), walk, run, through: source['through'] === undefined ? null : positive(source, 'through', where), waits: source['waits'] === undefined ? true : flag(source, 'waits', where) };
}

export function wardOf(value: unknown, where: string): SceneWard {
  const source: Fields = fields(value, where);
  const radius: number = positive(source, 'radius', where);
  const rise: number = positive(source, 'rise', where);
  const fall: number = positive(source, 'fall', where);
  const lifetime: number = positive(source, 'lifetime', where);
  if (lifetime <= rise) throw new ContentError(`${where}.lifetime`, 'a ward must stand longer than it takes to rise');
  return { radius, rise, fall, lifetime, admits: choiceList(source, 'admits', WARD_SIDES, where), stopsStrikes: flag(source, 'stopsStrikes', where), grace: nonNegative(source, 'grace', where), leave: positive(source, 'leave', where) };
}

function scene(value: unknown, where: string): SceneDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    npc: text(source, 'npc', where),
    when: conditions(source, 'when', where),
    x: numeric(source, 'x', where),
    z: numeric(source, 'z', where),
    radius: positive(source, 'radius', where),
    moment: text(source, 'moment', where),
    fight: positive(source, 'fight', where),
    arrive: positive(source, 'arrive', where),
    strike: text(source, 'strike', where),
    talk: text(source, 'talk', where),
    ward: wardOf(source['ward'], `${where}.ward`),
    lead: lead(source['lead'], `${where}.lead`),
    owes: storyFlags(source['owes'], `${where}.owes`),
    sets: storyFlags(source['sets'], `${where}.sets`),
  };
}

export function zoneScenes(value: unknown, where: string): SceneDef[] {
  if (value === undefined) return [];
  return [...byId(each(value, where, scene), where).values()];
}

function oneSceneProblems(content: Content, flags: ReadonlySet<string>, zone: ZoneDef, def: SceneDef): string[] {
  const at: string = `zone ${zone.id} scene ${def.id}`;
  const problems: string[] = conditionProblems(content, flags, at, def.when);
  const npc: NpcDef | undefined = content.npcs.get(def.npc);
  if (npc === undefined) problems.push(`${at} names unknown npc ${def.npc}`);
  if (!content.moments.defs.has(def.moment)) problems.push(`${at} brings unknown moment ${def.moment}`);
  if (!content.skills.has(def.strike)) problems.push(`${at} strikes with unknown skill ${def.strike}`);
  if (!zone.exits.some((exit): boolean => exit.id === def.lead.exit)) problems.push(`${at} leads to unknown exit ${def.lead.exit}`);
  const talk: TalkDef | undefined = npc?.talks.find((entry: TalkDef): boolean => entry.id === def.talk);
  if (npc !== undefined && talk === undefined) problems.push(`${at} talks with ${def.talk}, which ${def.npc} does not have`);
  if (talk !== undefined && !talk.once) problems.push(`${at} talks with ${def.talk}, which is not heard once`);
  for (const lineId of talk?.lines ?? []) {
    const spoken: LineDef | undefined = content.lines.get(lineId);
    if (spoken !== undefined && spoken.speaker !== def.npc) problems.push(`${at} uses line ${lineId}, which is spoken by ${spoken.speaker}`);
  }
  return problems;
}

export function sceneProblems(content: Content, flags: ReadonlySet<string>): string[] {
  return [...content.zones.values()].flatMap((zone: ZoneDef): string[] => zone.scenes.flatMap((def: SceneDef): string[] => oneSceneProblems(content, flags, zone, def)));
}
