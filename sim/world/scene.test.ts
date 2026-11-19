import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, withoutGlitches, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { SceneDef } from '../content/scene-types.ts';
import type { Content, MonsterDef, NpcDef, SkillDef, TalkDef, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance, facingOf } from '../math.ts';
import { isWalkable, lineWalkable } from '../nav/grid.ts';
import { parseSaveText, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { echoMonsters, forceStrike, wakeMoment } from './moments.ts';
import { nextTalk, replayable } from './dialogue.ts';
import { questPins } from './quest-pins.ts';
import { SCENE } from './scene.ts';
import { monsterLevel, spawnMonster } from './spawn.ts';
import { stepWorld } from './step.ts';
import type { Command, MomentState, MonsterState, NpcState, World, WorldEvent } from './types.ts';
import { questState } from './conditions.ts';
import { findWard, wardStrength } from './wards.ts';
import type { WardState } from './wards.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const DT: number = 1 / 30;
const HALL: string = 'hall_of_time';
const APPROACH: Vec2 = { x: 50, z: 30 };
const LAGGING: Vec2 = { x: 58, z: 30 };
const LIMIT = { reach: 20, meeting: 40, walk: 60 } as const;
const QUIET: number = 1e9;
const ADJACENT: number = 1.2;
const DOORSTEP: number = 1;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function meeting(): SceneDef {
  return must(zoneOf(content, HALL).scenes[0], 'the Hall scene');
}

function exitOf(world: World, id: string): ZoneExit {
  return must(world.zone.exits.find((exit: ZoneExit): boolean => exit.id === id), `exit ${id}`);
}

function quiet(world: World): World {
  for (const monster of world.monsters) world.events.push({ type: 'monster_remove', monsterId: monster.id });
  world.monsters = [];
  world.flags['first_moment'] = 'cleared';
  world.strikeTimer = QUIET;
  world.events = [];
  return world;
}

function hall(seed: number = 1): World {
  const world: World = quiet(withoutGlitches(worldIn(content, HALL, seed)));
  world.player.pos = { ...APPROACH };
  return world;
}

function run(world: World, seconds: number, commands: () => Command[] = (): Command[] => [], until: () => boolean = (): boolean => false): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let elapsed: number = 0; elapsed < seconds && !until(); elapsed += DT) events.push(...stepWorld(world, commands(), DT));
  return events;
}

function towardExit(world: World): () => Command[] {
  const exit: ZoneExit = exitOf(world, meeting().lead.exit);
  return (): Command[] => [{ type: 'move', held: true, dest: { x: exit.x, z: exit.z } }];
}

function phaseOf(world: World): string | null {
  return world.scene?.phase ?? null;
}

function momentIdOf(world: World): number | null {
  return world.scene?.momentId ?? null;
}

function warden(world: World): NpcState {
  return must(world.npcs.find((npc: NpcState): boolean => npc.id === world.scene?.npcId), 'the Warden in the scene');
}

function patient(world: World): World {
  const def: SceneDef = meeting();
  world.zone = { ...world.zone, scenes: [{ ...def, lead: { ...def.lead, waits: true } }] };
  return world;
}

function wardOf(world: World): WardState {
  return must(findWard(world, world.scene?.wardId ?? null), 'the ward');
}

function firstTalk(): TalkDef {
  const guide: NpcDef = must(content.npcs.get(meeting().npc), 'the Guide');
  return must(guide.talks.find((talk: TalkDef): boolean => talk.id === meeting().talk), 'the first talk');
}

function talkTo(world: World, npc: NpcState): WorldEvent[] {
  const events: WorldEvent[] = run(world, LIMIT.reach, (): Command[] => [{ type: 'talk', npcId: npc.id }], (): boolean => world.dialogue !== null);
  for (let line: number = 0; line < LIMIT.reach && world.dialogue !== null; line += 1) events.push(...stepWorld(world, [{ type: 'advance' }], DT));
  return events;
}

function heard(world: World): WorldEvent[] {
  const events: WorldEvent[] = untilPhase(world, 'ward', towardExit(world));
  events.push(...talkTo(world, warden(world)));
  events.push(...run(world, LIMIT.meeting, (): Command[] => [], (): boolean => world.scene?.phase !== 'ward'));
  return events;
}

function untilPhase(world: World, phase: string, commands: () => Command[] = (): Command[] => []): WorldEvent[] {
  const events: WorldEvent[] = run(world, LIMIT.meeting, commands, (): boolean => world.scene?.phase === phase);
  assert.equal(world.scene?.phase, phase, `the scene reaches ${phase}`);
  return events;
}

void test('the shipped meeting stands on open ground away from the exit it leads to, and its Warden strikes with a hit that shows', (): void => {
  const world: World = hall();
  const def: SceneDef = meeting();
  const exit: ZoneExit = exitOf(world, def.lead.exit);
  assert.ok(isWalkable(world.grid, def.x, def.z));
  assert.ok(isWalkable(world.grid, def.lead.x, def.lead.z));
  assert.ok(distance(def.lead, exit) > exit.radius + 1, 'he waits beside the way out, not on it');
  assert.ok(lineWalkable(world.grid, def.lead, exit));
  assert.ok(distance(exit, def) + exit.radius <= def.radius, 'every way to the exit passes through the meeting');
  const skill: SkillDef = must(content.skills.get(def.strike), 'the strike');
  assert.ok(skill.knockback > 0 && skill.stagger > 0 && skill.shake > 0 && skill.hitStop > 0 && skill.vfx.impact !== null);
  assert.deepEqual(firstTalk().lines, ['warden_guide_fell', 'warden_guide_counted', 'warden_guide_road']);
  assert.ok(firstTalk().once);
  assert.deepEqual(def.ward.admits, ['player']);
  assert.ok(def.ward.stopsStrikes);
  assert.equal(def.lead.waits, false, 'once he has spoken he goes in without waiting');
});

void test('the first time the hero nears the far end a moment is brought down on the path, wakes around the hero and holds the fight', (): void => {
  const world: World = hall();
  assert.equal(world.moments.length, 0);
  run(world, LIMIT.reach, towardExit(world), (): boolean => world.scene !== null);
  assert.ok(world.scene !== null && distance(world.player.pos, meeting()) <= meeting().radius);
  untilPhase(world, 'fight', towardExit(world));
  run(world, LIMIT.reach, towardExit(world), (): boolean => world.moments.some((moment: MomentState): boolean => moment.phase === 'awake'));
  const moment: MomentState = must(world.moments.find((entry: MomentState): boolean => entry.id === world.scene?.momentId), 'the brought moment');
  assert.equal(moment.def.id, meeting().moment);
  assert.equal(moment.phase, 'awake');
  assert.ok(distance(world.player.pos, moment.pos) <= moment.def.radius);
  assert.ok(echoMonsters(world, moment).some((monster: MonsterState): boolean => monster.alive));
  assert.ok(distance(moment.pos, exitOf(world, meeting().lead.exit)) > moment.def.radius + exitOf(world, meeting().lead.exit).radius);
  run(world, LIMIT.reach, towardExit(world), (): boolean => phaseOf(world) === 'strike');
  assert.equal(phaseOf(world), 'strike', 'a hero who walks on is met at once');
  assert.equal(moment.phase, 'awake', 'the moment is not left behind while he comes');
});

void test('the Warden appears beside the hero from outside the fight and cuts down every one of its echoes with his own strike', (): void => {
  const world: World = hall();
  untilPhase(world, 'fight', towardExit(world));
  const events: WorldEvent[] = untilPhase(world, 'strike', towardExit(world));
  const moment: MomentState = must(world.moments.find((entry: MomentState): boolean => entry.id === world.scene?.momentId), 'the moment');
  const echoes: MonsterState[] = echoMonsters(world, moment).filter((monster: MonsterState): boolean => monster.alive);
  assert.ok(echoes.length > 0);
  const npc: NpcState = warden(world);
  assert.equal(npc.def.id, meeting().npc);
  assert.ok(distance(npc.pos, moment.pos) > distance(world.player.pos, moment.pos), 'he comes in from outside the fight, not from among the echoes');
  assert.ok(distance(npc.pos, world.player.pos) <= meeting().arrive + SCENE.reach, 'he lands beside the hero, where the camera sees him');
  assert.ok(ofType(events, 'skill_start').every((event): boolean => event.actorId !== npc.id));
  const struck: WorldEvent[] = untilPhase(world, 'ward');
  const start: EventOf<'skill_start'> = must(ofType(struck, 'skill_start').find((event): boolean => event.actorId === npc.id), 'his swing');
  assert.equal(start.skill.id, meeting().strike);
  const hits: EventOf<'damage'>[] = ofType(struck, 'damage').filter((event): boolean => event.sourceId === npc.id);
  assert.deepEqual(hits.map((event): number => event.targetId).toSorted((a: number, b: number): number => a - b), echoes.map((monster: MonsterState): number => monster.id).toSorted((a: number, b: number): number => a - b));
  assert.ok(hits.every((event): boolean => event.killed && event.amount > 0 && event.skill.id === meeting().strike));
  assert.ok(ofType(struck, 'skill_impact').some((event): boolean => event.actorId === npc.id && event.team === 'player' && event.hits === echoes.length));
  assert.ok(echoes.every((monster: MonsterState): boolean => !monster.alive));
  assert.ok(ofType(struck, 'moment_ended').some((event): boolean => event.moment.id === moment.id && event.outcome === 'resolved'));
});

void test('after his cut he raises a ward around himself and the hero: nothing outside can come in, strike in or hold the hero, and nothing inside strikes out', (): void => {
  const world: World = hall();
  untilPhase(world, 'ward', towardExit(world));
  const ward: WardState = wardOf(world);
  const npc: NpcState = warden(world);
  assert.ok(distance(world.player.pos, ward.pos) < ward.def.radius && distance(npc.pos, ward.pos) < ward.def.radius, 'both stand inside it');
  assert.equal(world.flags['warden_met'], 'owed');
  const brute: MonsterDef = must(content.monsters.get('unfinished_brute'), 'a brute');
  const away: Vec2 = { x: ward.pos.x, z: ward.pos.z + ward.def.radius + 6 };
  const foe: MonsterState = spawnMonster(world, brute, world.nextPackId, away, { summonerId: null, scatter: 0, revived: false, level: monsterLevel(world) });
  world.nextPackId += 1;
  foe.pos = { x: ward.pos.x, z: ward.pos.z + ward.def.radius + foe.radius + 0.2 };
  foe.aggro = true;
  foe.foeId = world.player.id;
  const life: number = world.player.life;
  const closest: number[] = [];
  const strayed: number = distance(foe.pos, foe.home);
  const events: WorldEvent[] = run(world, 6, (): Command[] => {
    closest.push(distance(foe.pos, ward.pos));
    return [];
  });
  assert.equal(world.player.life, life);
  assert.equal(ofType(events, 'damage').filter((event): boolean => event.targetTeam === 'player').length, 0);
  assert.ok(closest.every((reach: number): boolean => reach >= ward.def.radius + foe.radius - 1e-6), 'the brute never crosses the edge');
  assert.equal(foe.aggro, false, 'it loses the hero behind the ward');
  assert.ok(distance(foe.pos, foe.home) < strayed - 1, 'and walks back where it came from');
  assert.equal(world.scene?.phase, 'ward', 'he waits for the hero to speak with him');
  assert.equal(wardStrength(ward), 1);
});

void test('the hero clicks him inside the ward and hears the three first lines in order with their voices, then he lowers the ward and walks straight into the way out', (): void => {
  const world: World = hall();
  world.quests = { out_of_the_mist: 1, the_first_taker: 1, to_the_waystation: 0 };
  untilPhase(world, 'ward', towardExit(world));
  const npc: NpcState = warden(world);
  const ward: WardState = wardOf(world);
  assert.deepEqual(questPins(world), [{ kind: 'npc', npcId: npc.id }], 'he carries the pin while the ward stands');
  const said: WorldEvent[] = talkTo(world, npc);
  assert.deepEqual(ofType(said, 'dialogue_line').map((event): string => event.line.id), firstTalk().lines);
  assert.ok(ofType(said, 'dialogue_closed').some((event): boolean => event.talk === meeting().talk && event.finished));
  assert.ok(world.heard.includes(meeting().talk));
  run(world, DT * 2);
  assert.equal(world.scene?.phase, 'lead');
  assert.notEqual(ward.lowering, null, 'the ward comes down once he has spoken');
  run(world, ward.def.fall + DT * 2);
  assert.equal(wardStrength(ward), 0);
  const exit: ZoneExit = exitOf(world, meeting().lead.exit);
  const stood: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  run(world, LIMIT.walk, (): Command[] => [], (): boolean => world.scene?.phase === 'through');
  assert.equal(phaseOf(world), 'through', 'he goes without waiting for the hero');
  assert.deepEqual(questPins(world), [{ kind: 'exit', exit: exit.id }], 'then the pin is on the way in');
  run(world, LIMIT.walk, (): Command[] => [], (): boolean => world.scene === null);
  assert.equal(world.scene, null);
  run(world, ward.def.grace);
  assert.equal(findWard(world, ward.id), null);
  assert.ok(!world.npcs.includes(npc));
  assert.ok(distance(world.player.pos, stood) < 1e-6);
  assert.equal(world.zone.id, HALL);
});

void test('a hero who walks off without speaking with him leaves him to lower the ward and go in alone, and the first lines wait once at the fire', (): void => {
  const world: World = hall();
  untilPhase(world, 'ward', towardExit(world));
  const npc: NpcState = warden(world);
  const ward: WardState = wardOf(world);
  world.player.pos = { x: ward.pos.x - ward.def.radius - meeting().ward.leave - 1, z: ward.pos.z };
  run(world, DT * 2);
  assert.equal(world.scene?.phase, 'lead');
  assert.notEqual(ward.lowering, null);
  run(world, LIMIT.walk, (): Command[] => [], (): boolean => world.scene === null);
  assert.ok(!world.npcs.includes(npc), 'he went in alone');
  assert.equal(world.flags['warden_met'], 'owed');
  assert.ok(!world.heard.includes(meeting().talk));
  enterZone(world, zoneOf(content, 'hideout'), { type: 'start' });
  const guide: NpcState = must(world.npcs.find((entry: NpcState): boolean => entry.def.id === meeting().npc), 'the Guide at the fire');
  assert.equal(nextTalk(world, guide.def)?.id, meeting().talk);
  world.player.pos = { x: guide.pos.x + ADJACENT, z: guide.pos.z };
  const said: WorldEvent[] = talkTo(world, guide);
  assert.deepEqual(ofType(said, 'dialogue_line').map((event): string => event.line.id), firstTalk().lines);
  assert.notEqual(nextTalk(world, guide.def)?.id, meeting().talk, 'heard once');
  assert.ok(replayable(world, guide.def).some((talk: TalkDef): boolean => talk.id === meeting().talk), 'and it can be heard again');
});

void test('the ward stands for a bounded time: left alone it comes down at its lifetime and he goes in without the hero', (): void => {
  const world: World = hall();
  untilPhase(world, 'ward', towardExit(world));
  const ward: WardState = wardOf(world);
  run(world, ward.def.lifetime - 1);
  assert.equal(world.scene?.phase, 'ward');
  assert.equal(ward.lowering, null);
  run(world, 1 + DT * 2);
  assert.notEqual(ward.lowering, null);
  assert.equal(phaseOf(world), 'lead');
});

void test('a lead that waits keeps the hero’s pace, waits when the hero lags, and waits beside the way out without covering it', (): void => {
  const world: World = patient(hall());
  heard(world);
  const npc: NpcState = warden(world);
  const lead = meeting().lead;
  world.player.pos = { ...LAGGING };
  run(world, 2);
  assert.equal(npc.pace, 0);
  assert.equal(npc.motion, 'still');
  const waitingAt: Vec2 = { x: npc.pos.x, z: npc.pos.z };
  run(world, 2);
  assert.ok(distance(npc.pos, waitingAt) < 1e-6, 'he waits for the hero');
  assert.ok(distance(world.player.pos, LAGGING) < 1e-6, 'the hero kept control and stood where he chose');
  run(world, LIMIT.walk, (): Command[] => [{ type: 'move', held: true, dest: { x: npc.pos.x, z: npc.pos.z } }], (): boolean => npc.pace > 0);
  assert.equal(npc.pace, lead.walk, 'he walks on once the hero catches up');
  assert.ok(distance(npc.pos, world.player.pos) <= lead.ahead);
  world.player.pos = { x: lead.x, z: lead.z };
  run(world, DT * 2);
  assert.equal(npc.pace, lead.run, 'a hero who goes ahead is followed at a run');
  run(world, LIMIT.walk, (): Command[] => [], (): boolean => npc.route.length === 0);
  assert.ok(distance(npc.pos, lead) < 1e-3, 'he ends beside the way out');
  assert.equal(world.zone.id, HALL);
});

void test('the hero clicks the way out, the Warden goes through with him and walks to his place at the fire', (): void => {
  const world: World = hall();
  heard(world);
  const exit: ZoneExit = exitOf(world, meeting().lead.exit);
  const events: WorldEvent[] = run(world, LIMIT.walk, (): Command[] => [{ type: 'travel', exit: exit.id }], (): boolean => world.zone.id !== HALL);
  assert.equal(world.zone.id, exit.to);
  assert.ok(ofType(events, 'zone_changed').length === 1);
  assert.equal(world.scene, null);
  const guide: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === meeting().npc), 'the Guide in the Hideout');
  assert.equal(world.npcs.filter((npc: NpcState): boolean => npc.def.id === meeting().npc).length, 1, 'one Warden, not a second at his place');
  assert.ok(distance(guide.pos, world.player.pos) < SCENE.reach, 'he arrives beside the hero');
  assert.ok(guide.route.length > 0 && guide.pace > 0);
  run(world, LIMIT.walk, (): Command[] => [], (): boolean => guide.route.length === 0);
  run(world, DT);
  assert.deepEqual({ x: guide.pos.x, z: guide.pos.z }, { x: guide.placement.x, z: guide.placement.z });
  assert.equal(guide.facing, guide.homeFacing);
  assert.equal(guide.motion, 'still');
});

void test('the meeting happens once: walking back to the far end later brings no second moment and no second Warden', (): void => {
  const world: World = hall();
  heard(world);
  world.player.pos = { ...APPROACH };
  run(world, 1);
  assert.notEqual(world.scene?.phase, 'ward');
  enterZone(world, zoneOf(content, HALL), { type: 'start' });
  quiet(world);
  world.player.pos = { ...APPROACH };
  const before: number = world.moments.length;
  run(world, LIMIT.reach, towardExit(world), (): boolean => world.zone.id !== HALL);
  assert.equal(world.scene, null);
  assert.ok(world.moments.length <= before);
  assert.ok(!world.npcs.some((npc: NpcState): boolean => npc.def.id === meeting().npc));
});

void test('a save that already reached the Hideout before the meeting existed walks the far end in peace', (): void => {
  const first: World = withoutGlitches(createWorld(content, { seed: 4, save: null }));
  enterZone(first, zoneOf(content, 'hideout'), { type: 'start' });
  enterZone(first, zoneOf(content, HALL), { type: 'start' });
  const world: World = quiet(withoutGlitches(createWorld(content, { seed: 4, save: parseSaveText(content, JSON.stringify(toSave(first))) })));
  enterZone(world, zoneOf(content, HALL), { type: 'start' });
  quiet(world);
  world.player.pos = { ...APPROACH };
  run(world, LIMIT.walk, (): Command[] => [{ type: 'travel', exit: meeting().lead.exit }], (): boolean => world.zone.id !== HALL || world.scene !== null);
  assert.equal(world.scene, null);
  assert.equal(world.flags['warden_met'], undefined);
  assert.equal(world.zone.id, 'hideout');
});

void test('a hero who dies before the Warden arrives meets him on the next approach instead', (): void => {
  const world: World = hall();
  untilPhase(world, 'fight', towardExit(world));
  world.player.life = 0;
  world.player.alive = false;
  stepWorld(world, [], DT);
  assert.equal(world.scene, null);
  assert.ok(!world.npcs.some((npc: NpcState): boolean => npc.def.id === meeting().npc));
});

void test('a hero already fighting in a moment at the far end has that fight cut short, and no second moment is brought', (): void => {
  const world: World = hall();
  world.flags['warden_met'] = 'yes';
  const at: Vec2 = { x: meeting().x, z: meeting().z };
  world.player.pos = { ...at };
  const own: MomentState = must(forceStrike(world, at, 'charge'), 'a moment of the hero’s own');
  run(world, LIMIT.reach, (): Command[] => [], (): boolean => own.phase === 'dormant');
  wakeMoment(world, own, true);
  run(world, 1);
  assert.equal(world.scene, null);
  world.flags = Object.fromEntries(Object.entries(world.flags).filter(([name]: [string, string]): boolean => name !== 'warden_met'));
  run(world, 1);
  assert.equal(momentIdOf(world), own.id);
  assert.deepEqual(world.moments.map((moment: MomentState): number => moment.id), [own.id]);
});

void test('a hero standing in a quiet moment at the far end has that one woken for the fight, and no second moment is brought', (): void => {
  const world: World = hall();
  world.flags['warden_met'] = 'yes';
  const at: Vec2 = { x: meeting().x, z: meeting().z };
  world.player.pos = { ...at };
  const own: MomentState = must(forceStrike(world, at, 'charge'), 'a quiet moment around the hero');
  run(world, LIMIT.reach, (): Command[] => [], (): boolean => own.phase === 'dormant');
  world.flags = Object.fromEntries(Object.entries(world.flags).filter(([name]: [string, string]): boolean => name !== 'warden_met'));
  run(world, LIMIT.reach, (): Command[] => [], (): boolean => momentIdOf(world) !== null);
  assert.equal(momentIdOf(world), own.id);
  run(world, 1);
  assert.equal(own.phase, 'awake');
  assert.deepEqual(world.moments.map((moment: MomentState): number => moment.id), [own.id]);
});

void test('a quiet moment beside the hero, where the brought one would land, is woken for the fight instead of a second moment overlapping it', (): void => {
  const world: World = hall();
  world.flags['warden_met'] = 'yes';
  const hero: Vec2 = { x: meeting().x, z: meeting().z };
  world.player.pos = { ...hero };
  const radius: number = must(content.moments.defs.get('charge'), 'the charge moment').radius;
  const own: MomentState = must(forceStrike(world, { x: hero.x - radius - 1, z: hero.z }, 'charge'), 'a quiet moment beside the hero');
  run(world, LIMIT.reach, (): Command[] => [], (): boolean => own.phase === 'dormant');
  assert.ok(distance(world.player.pos, own.pos) > own.def.radius, 'the hero stands outside it');
  world.player.facing = facingOf({ x: -1, z: 0 });
  world.flags = Object.fromEntries(Object.entries(world.flags).filter(([name]: [string, string]): boolean => name !== 'warden_met'));
  run(world, LIMIT.reach, (): Command[] => [], (): boolean => momentIdOf(world) !== null);
  assert.equal(momentIdOf(world), own.id);
  assert.deepEqual(world.moments.map((moment: MomentState): number => moment.id), [own.id]);
});

void test('a hero who reaches the way out before any fight is met at the door and warded there, and a click on the way out takes them through together with his first lines left owed at the fire', (): void => {
  const world: World = hall();
  const exit: ZoneExit = exitOf(world, meeting().lead.exit);
  world.player.pos = { x: exit.x - exit.radius - DOORSTEP, z: exit.z };
  const travel = (): Command[] => [{ type: 'travel', exit: exit.id }];
  run(world, LIMIT.reach, travel, (): boolean => world.scene?.phase === 'ward');
  assert.equal(world.scene?.phase, 'ward');
  assert.ok(distance(warden(world).pos, world.player.pos) <= SCENE.beside + SCENE.reach);
  assert.equal(world.zone.id, HALL, 'the way out waited while he came');
  run(world, LIMIT.meeting, travel, (): boolean => world.zone.id !== HALL);
  assert.equal(world.zone.id, exit.to);
  assert.equal(world.flags['warden_met'], 'owed');
  assert.ok(!world.heard.includes(meeting().talk));
  assert.ok(must(world.npcs.find((npc: NpcState): boolean => npc.def.id === meeting().npc), 'the Guide').route.length > 0, 'he came through with the hero');
});

function following(world: World): () => Command[] {
  return (): Command[] => {
    const npc: NpcState | undefined = world.npcs.find((entry: NpcState): boolean => entry.id === world.scene?.npcId);
    return npc === undefined ? [] : [{ type: 'move', held: true, dest: { x: npc.pos.x, z: npc.pos.z } }];
  };
}

void test('with the hero beside him at the way out he does not stop: he walks on into it and fades out as he passes in, and the way out keeps the hero', (): void => {
  const world: World = hall();
  heard(world);
  const npc: NpcState = warden(world);
  const exit: ZoneExit = exitOf(world, meeting().lead.exit);
  const fade: number = must(meeting().lead.through, 'the meeting ends through its exit');
  untilPhase(world, 'through', following(world));
  const fades: number[] = [];
  let entered: number | null = null;
  for (let elapsed: number = 0; elapsed < LIMIT.walk && world.scene !== null; elapsed += DT) {
    stepWorld(world, [], DT);
    if (npc.fade < 1 && entered === null) entered = distance(npc.pos, exit);
    fades.push(npc.fade);
  }
  assert.equal(world.scene, null);
  assert.ok(!world.npcs.includes(npc), 'he is gone through the way out');
  assert.ok(entered !== null && entered <= exit.radius + DOORSTEP, 'he fades only as he passes into the way out');
  assert.ok(fades.every((value: number, index: number): boolean => index === 0 || value <= (fades[index - 1] ?? 1)), 'the fade never comes back');
  const fading: number = fades.filter((value: number): boolean => value < 1).length * DT;
  assert.ok(fading >= fade - DT * 2 && fading <= fade + DT * 2, 'a short eased fade, not a pop');
  assert.equal(world.zone.id, HALL, 'he does not take the hero with him');
  assert.ok(world.heard.includes(meeting().talk));
  run(world, 1);
  assert.ok(!world.npcs.some((entry: NpcState): boolean => entry.def.id === meeting().npc), 'he does not come back');
});

void test('on a lead that waits, a hero who stays far behind is waited for at the way out, and once the hero comes back he goes on through', (): void => {
  const world: World = patient(hall());
  heard(world);
  const npc: NpcState = warden(world);
  world.player.pos = { ...LAGGING };
  run(world, 2);
  const waiting: Vec2 = { x: npc.pos.x, z: npc.pos.z };
  run(world, 5);
  assert.equal(world.scene?.phase, 'lead', 'he never leaves without the hero');
  assert.equal(npc.fade, 1);
  assert.ok(distance(npc.pos, waiting) < 1e-6, 'he holds where he is');
  run(world, LIMIT.walk, following(world), (): boolean => phaseOf(world) === 'through');
  assert.equal(phaseOf(world), 'through');
});

void test('on a lead that waits, a hero who falls back while he walks into the way out is waited for there, until the fade has begun', (): void => {
  const world: World = patient(hall());
  heard(world);
  untilPhase(world, 'through', following(world));
  const npc: NpcState = warden(world);
  world.player.pos = { ...LAGGING };
  world.player.intent = { type: 'idle' };
  world.player.path = [];
  run(world, 3);
  assert.equal(world.scene?.phase, 'through');
  assert.equal(npc.fade, 1, 'he waits rather than going without the hero');
  assert.equal(npc.pace, 0);
});

void test('once he has gone through, the way out he took carries the quest pin until the hero follows, and the hero finds him at the fire', (): void => {
  const world: World = hall();
  world.quests = { out_of_the_mist: 1, the_first_taker: 1, to_the_waystation: 0 };
  heard(world);
  const exit: ZoneExit = exitOf(world, meeting().lead.exit);
  assert.equal(world.scene?.phase, 'lead');
  assert.deepEqual(questPins(world), [{ kind: 'npc', npcId: warden(world).id }], 'while he leads, he carries the pin');
  untilPhase(world, 'through', following(world));
  assert.deepEqual(questPins(world), [{ kind: 'exit', exit: exit.id }], 'the pin moves to the way out as he walks into it');
  run(world, LIMIT.walk, following(world), (): boolean => world.scene === null);
  assert.deepEqual(questPins(world), [{ kind: 'exit', exit: exit.id }]);
  run(world, LIMIT.walk, (): Command[] => [{ type: 'travel', exit: exit.id }], (): boolean => world.zone.id !== HALL);
  assert.equal(world.zone.id, exit.to);
  const guide: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === meeting().npc), 'the Guide at the fire');
  assert.deepEqual({ x: guide.pos.x, z: guide.pos.z }, { x: guide.placement.x, z: guide.placement.z });
  assert.equal(guide.fade, 1);
});

const FIRE: Vec2 = { x: 24, z: 20 };
const TALKS_AT_FIRE: number = 6;

function onTheRoad(): World {
  const world: World = hall();
  world.quests = { out_of_the_mist: 1, the_first_taker: 1, to_the_waystation: 0 };
  return world;
}

function toTheFire(world: World): void {
  run(world, LIMIT.walk, (): Command[] => [], (): boolean => world.scene === null);
  const exit: ZoneExit = exitOf(world, meeting().lead.exit);
  run(world, LIMIT.walk, (): Command[] => [{ type: 'travel', exit: exit.id }], (): boolean => world.zone.id !== HALL);
  assert.equal(world.zone.id, 'hideout');
  world.player.pos = { ...FIRE };
  run(world, DT * 2);
  assert.equal(questState(world, 'wardens_lesson'), 'active');
}

function talksUntilTaught(world: World): string[] {
  const guide: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === meeting().npc), 'the Guide at the fire');
  world.player.pos = { x: guide.pos.x + ADJACENT, z: guide.pos.z };
  const talks: string[] = [];
  for (let talk: number = 0; talk < TALKS_AT_FIRE && questState(world, 'wardens_lesson') !== 'done'; talk += 1) {
    for (const event of ofType(talkTo(world, guide), 'dialogue_closed')) talks.push(event.talk);
  }
  return talks;
}

void test('the whole road from the meeting to the lesson: the first lines heard in the Hall are not offered again, and the lesson ends the step at the fire', (): void => {
  const world: World = onTheRoad();
  heard(world);
  assert.ok(world.heard.includes(meeting().talk));
  toTheFire(world);
  assert.deepEqual(talksUntilTaught(world), ['warden_guide_lesson']);
  assert.equal(world.flags['fire_lesson'], 'given');
});

void test('the whole road from the meeting to the lesson: walked away from in the Hall, the first lines come once at the fire before the lesson, and the lesson still ends the step', (): void => {
  const world: World = onTheRoad();
  untilPhase(world, 'ward', towardExit(world));
  const ward: WardState = wardOf(world);
  world.player.pos = { x: ward.pos.x - ward.def.radius - meeting().ward.leave - 1, z: ward.pos.z };
  run(world, DT * 2);
  assert.equal(world.scene?.phase, 'lead');
  toTheFire(world);
  assert.deepEqual(talksUntilTaught(world), [meeting().talk, 'warden_guide_lesson']);
  assert.equal(world.flags['fire_lesson'], 'given');
  const guide: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === meeting().npc), 'the Guide at the fire');
  assert.notEqual(nextTalk(world, guide.def)?.id, meeting().talk, 'nothing is left owed');
});
