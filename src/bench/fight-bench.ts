import type { Scene, WebGLInfo, WebGLRenderer } from 'three';
import type { Condition } from '../../sim/content/condition-types.ts';
import type { SkillDef, ZoneExit } from '../../sim/content/types.ts';
import type { BenchHero } from '../../sim/world/dev-commands.ts';
import { refillHero } from '../../sim/world/bench-hero.ts';
import { blockedReason } from '../../sim/world/skills.ts';
import type { Command, MonsterState, PlayerState, World, WorldEvent } from '../../sim/world/types.ts';
import { measureMemory } from '../mobile/memory.ts';
import { open } from '../walk/body-walk.ts';

export const FIGHT_BENCH = {
  arriveWithinMs: 60000,
  pollMs: 250,
  settleMs: 2500,
  steppingSeconds: 1,
} as const;

export interface FightWave {
  readonly atMs: number;
  readonly monster: string;
  readonly count: number;
}

export interface FightPlan {
  readonly zone: string;
  readonly hero: BenchHero;
  readonly waves: readonly FightWave[];
  readonly rotation: readonly number[];
  readonly castEveryMs: number;
  readonly warmupMs: number;
  readonly measureMs: number;
}

export interface RendererCounts {
  readonly programs: number;
  readonly geometries: number;
  readonly textures: number;
  readonly heapMegabytes: number | null;
}

export interface FightRaw {
  readonly zone: string;
  readonly frames: readonly number[];
  readonly calls: readonly number[];
  readonly triangles: readonly number[];
  readonly longTasks: readonly number[];
  readonly start: RendererCounts;
  readonly end: RendererCounts;
  readonly peakLive: number;
  readonly kills: number;
  readonly hits: number;
  readonly drops: number;
  readonly casts: number;
  readonly heroDeaths: number;
  readonly problems: readonly string[];
}

export type EventWatcher = (events: readonly WorldEvent[]) => void;

export interface FightDeps {
  readonly world: World;
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly send: (command: Command) => void;
  readonly watch: (watcher: EventWatcher | null) => void;
}

interface Tally {
  kills: number;
  hits: number;
  drops: number;
  heroDeaths: number;
  casts: number;
  peakLive: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => void window.setTimeout(resolve, ms));
}

function counts(deps: FightDeps): RendererCounts {
  return { programs: deps.renderer.info.programs?.length ?? 0, geometries: deps.renderer.info.memory.geometries, textures: deps.renderer.info.memory.textures, heapMegabytes: measureMemory(deps.renderer, deps.scene).heapMegabytes };
}

async function arrive(deps: FightDeps, zone: string, waited: number = 0): Promise<boolean> {
  if (deps.world.zone.id === zone) return true;
  if (waited >= FIGHT_BENCH.arriveWithinMs) return false;
  await sleep(FIGHT_BENCH.pollMs);
  return arrive(deps, zone, waited + FIGHT_BENCH.pollMs);
}

async function awake(deps: FightDeps, waited: number = 0): Promise<boolean> {
  if (deps.world.wake === null) return true;
  if (waited >= FIGHT_BENCH.arriveWithinMs) return false;
  await sleep(FIGHT_BENCH.pollMs);
  return awake(deps, waited + FIGHT_BENCH.pollMs);
}

async function stepping(deps: FightDeps, from: number = deps.world.time, waited: number = 0): Promise<boolean> {
  if (deps.world.time - from >= FIGHT_BENCH.steppingSeconds) return true;
  if (waited >= FIGHT_BENCH.arriveWithinMs) return false;
  await sleep(FIGHT_BENCH.pollMs);
  return stepping(deps, from, waited + FIGHT_BENCH.pollMs);
}

async function ready(deps: FightDeps, hero: BenchHero, waited: number = 0): Promise<string[]> {
  deps.send({ type: 'bench', hero });
  await sleep(FIGHT_BENCH.settleMs);
  const problems: string[] = heroProblems(deps.world, hero);
  if (problems.length === 0 || waited >= FIGHT_BENCH.arriveWithinMs) return problems;
  return ready(deps, hero, waited + FIGHT_BENCH.settleMs);
}

async function travelTo(deps: FightDeps, zone: string): Promise<string | null> {
  const { world } = deps;
  if (world.zone.id === zone) return null;
  if (!(await awake(deps))) return `the hero never woke in ${world.zone.id}`;
  const exit: ZoneExit | undefined = world.zone.exits.find((candidate: ZoneExit): boolean => candidate.to === zone);
  if (exit === undefined) return `no exit from ${world.zone.id} leads to ${zone}`;
  const shut: Condition[] = exit.requires.filter((condition: Condition): boolean => !open(world, condition));
  if (shut.length > 0) return `exit ${exit.id} in ${world.zone.id} stays shut`;
  world.player.pos.x = exit.x;
  world.player.pos.z = exit.z;
  deps.send({ type: 'travel', exit: exit.id });
  return (await arrive(deps, zone)) ? null : `travel through ${exit.id} never reached ${zone}`;
}

function nearest(world: World): MonsterState | null {
  const { pos } = world.player;
  return world.monsters.reduce((best: MonsterState | null, monster: MonsterState): MonsterState | null => {
    if (!monster.alive) return best;
    if (best === null) return monster;
    return Math.hypot(monster.pos.x - pos.x, monster.pos.z - pos.z) < Math.hypot(best.pos.x - pos.x, best.pos.z - pos.z) ? monster : best;
  }, null);
}

function cast(deps: FightDeps, plan: FightPlan, cursor: number): number {
  const target: MonsterState | null = nearest(deps.world);
  if (target === null) return cursor;
  const player: PlayerState = deps.world.player;
  for (let offset: number = 0; offset < plan.rotation.length; offset += 1) {
    const at: number = (cursor + offset) % plan.rotation.length;
    const slot: number | undefined = plan.rotation[at];
    const skill: SkillDef | null | undefined = slot === undefined ? undefined : player.skills[slot];
    if (slot === undefined || skill === null || skill === undefined || blockedReason(player, skill) !== null) continue;
    deps.send({ type: 'skill', slot, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id });
    return at + 1;
  }
  return cursor;
}

function heroProblems(world: World, hero: BenchHero): string[] {
  const { player } = world;
  const bar: string[] = hero.bar.flatMap((skill: string | null, slot: number): string[] => (skill === null || player.bar[slot] === skill ? [] : [`slot ${slot} holds ${player.bar[slot] ?? 'nothing'}, not ${skill}`]));
  const weapon: string[] = hero.weapon === null || player.equipped.weapon?.base === hero.weapon ? [] : [`the hero holds ${player.equipped.weapon?.base ?? 'nothing'}, not ${hero.weapon}`];
  const level: string[] = player.level === hero.level ? [] : [`the hero is level ${player.level}, not ${hero.level}`];
  return [...bar, ...weapon, ...level];
}

function tallyEvents(tally: Tally, events: readonly WorldEvent[], heroId: number): void {
  for (const event of events) {
    if (event.type === 'damage' && event.targetTeam === 'monster') {
      tally.hits += 1;
      if (event.killed) tally.kills += 1;
    }
    if (event.type === 'drop') tally.drops += 1;
    if (event.type === 'skill_start' && event.actorId === heroId) tally.casts += 1;
    if (event.type === 'death' && event.actorId === heroId) tally.heroDeaths += 1;
  }
}

export async function runFightBench(deps: FightDeps, plan: FightPlan): Promise<FightRaw> {
  const problems: string[] = [];
  const travelled: string | null = await travelTo(deps, plan.zone);
  if (travelled !== null) {
    const now: RendererCounts = counts(deps);
    return { zone: deps.world.zone.id, frames: [], calls: [], triangles: [], longTasks: [], start: now, end: now, peakLive: 0, kills: 0, hits: 0, drops: 0, casts: 0, heroDeaths: 0, problems: [travelled] };
  }
  if (!(await stepping(deps))) problems.push(`the world never stepped in ${deps.world.zone.id}`);
  problems.push(...(await ready(deps, plan.hero)));
  const heroId: number = deps.world.player.id;
  const tally: Tally = { kills: 0, hits: 0, drops: 0, heroDeaths: 0, casts: 0, peakLive: 0 };
  const frames: number[] = [];
  const calls: number[] = [];
  const triangles: number[] = [];
  const longTasks: number[] = [];
  const observer: PerformanceObserver = new PerformanceObserver((list: PerformanceObserverEntryList): void => {
    for (const entry of list.getEntries()) longTasks.push(entry.duration);
  });
  const info: WebGLInfo = deps.renderer.info;
  const endAt: number = plan.warmupMs + plan.measureMs;
  let measuring: boolean = false;
  let start: RendererCounts = counts(deps);
  deps.watch((events: readonly WorldEvent[]): void => {
    if (measuring) tallyEvents(tally, events, heroId);
  });
  info.autoReset = false;
  info.reset();
  try {
    const end: RendererCounts = await new Promise<RendererCounts>((resolve: (value: RendererCounts) => void): void => {
      let began: number | null = null;
      let last: number = 0;
      let wave: number = 0;
      let nextCast: number = 0;
      let cursor: number = 0;
      const tick = (now: number): void => {
        began ??= now;
        const elapsed: number = now - began;
        if (measuring) {
          frames.push(now - last);
          calls.push(info.render.calls);
          triangles.push(info.render.triangles);
          tally.peakLive = Math.max(tally.peakLive, deps.world.monsters.filter((monster: MonsterState): boolean => monster.alive).length);
        }
        info.reset();
        last = now;
        if (elapsed >= endAt) {
          resolve(counts(deps));
          return;
        }
        if (!measuring && elapsed >= plan.warmupMs) {
          start = counts(deps);
          observer.observe({ type: 'longtask', buffered: false });
          measuring = true;
        }
        refillHero(deps.world);
        for (let due: FightWave | undefined = plan.waves[wave]; due !== undefined && due.atMs <= elapsed; due = plan.waves[wave]) {
          deps.send({ type: 'spawn', monster: due.monster, count: due.count });
          wave += 1;
        }
        if (elapsed >= nextCast) {
          cursor = cast(deps, plan, cursor);
          nextCast += plan.castEveryMs;
        }
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });
    return { zone: deps.world.zone.id, frames, calls, triangles, longTasks, start, end, peakLive: tally.peakLive, kills: tally.kills, hits: tally.hits, drops: tally.drops, casts: tally.casts, heroDeaths: tally.heroDeaths, problems };
  } finally {
    observer.disconnect();
    deps.watch(null);
    info.autoReset = true;
  }
}
