import type { Bot } from '../sim/bot.ts';
import { BOT, botFight, botStep, createBot } from '../sim/bot.ts';
import type { ItemBaseDef } from '../sim/content/item-types.ts';
import type { Content, ItemSlot, MonsterDef, ZoneDef } from '../sim/content/types.ts';
import { ITEM_SLOTS } from '../sim/content/types.ts';
import { xpToNextLevel } from '../sim/progression.ts';
import { grantXp } from '../sim/world/character.ts';
import { createWorld } from '../sim/world/create.ts';
import { makeItem } from '../sim/world/ledger.ts';
import { enterZone } from '../sim/world/zones.ts';
import type { ItemInstance, MonsterState, World, WorldEvent } from '../sim/world/types.ts';
import type { BuildPolicy, Policies, SkillPolicy } from './simulate-policies.ts';
import { planFor } from './simulate-policies.ts';

export const TRIAL = {
  level: 30,
  rarity: 'rare',
  settle: 3,
  limit: 600,
} as const;

export interface TrialJob {
  readonly zone: string;
  readonly skill: string;
  readonly build: string;
  readonly weapon: string;
  readonly hero: string | null;
  readonly seed: number;
  readonly limit: number;
}

export type TrialOutcome = 'won' | 'lost' | 'timeout';

export interface TrialAttempt {
  readonly outcome: TrialOutcome;
  readonly seconds: number;
  readonly deaths: number;
  readonly flasks: number;
  readonly phase: number;
  readonly lifeLeft: number;
  readonly heroLife: number;
  readonly bossLife: number;
  readonly hurt: number;
  readonly onPieces: number;
}

export interface TrialRing {
  readonly zone: ZoneDef;
  readonly boss: MonsterDef;
}

export function trialRing(content: Content, zoneId: string): TrialRing | null {
  const zone: ZoneDef | undefined = content.zones.get(zoneId);
  if (zone === undefined) return null;
  for (const pack of zone.packs) {
    for (const member of pack.members) {
      const def: MonsterDef | undefined = content.monsters.get(member.monster);
      if (def !== undefined && def.boss !== null) return { zone, boss: def };
    }
  }
  return null;
}

export function bestBase(content: Content, slot: ItemSlot, level: number): ItemBaseDef | null {
  let best: ItemBaseDef | null = null;
  for (const base of content.itemBases.values()) {
    if (base.slot !== slot || base.story || base.book !== null || base.keepsake !== null || base.use !== null || base.minLevel > level || base.dropWeight <= 0) continue;
    if (best === null || base.minLevel > best.minLevel) best = base;
  }
  return best;
}

export function bestWeapon(content: Content, kind: string, level: number): ItemBaseDef | null {
  let best: ItemBaseDef | null = null;
  for (const base of content.itemBases.values()) {
    if (base.slot !== 'weapon' || base.weaponKind !== kind || base.minLevel > level || base.dropWeight <= 0) continue;
    if (best === null || base.minLevel > best.minLevel) best = base;
  }
  return best;
}

export function gearUp(bot: Bot, weapon: string, level: number): ItemInstance[] {
  const world: World = bot.world;
  const made: ItemInstance[] = [];
  for (const slot of ITEM_SLOTS) {
    const base: string | null = slot === 'weapon' ? weapon : (bestBase(world.content, slot, level)?.id ?? null);
    if (base === null) continue;
    const item: ItemInstance | null = makeItem(world, level, base, TRIAL.rarity, { kind: 'start', base });
    const free: number = world.player.inventory.indexOf(null);
    if (item === null || free < 0) continue;
    world.player.inventory[free] = item;
    botStep(bot, [{ type: 'equip', inventoryIndex: free }]);
    made.push(item);
  }
  return made;
}

export function raiseTo(world: World, level: number): void {
  while (world.player.level < Math.min(level, world.content.player.xp.maxLevel)) grantXp(world, xpToNextLevel(world.content.player.xp, world.player.level) - world.player.xp);
}

function bossOf(world: World, ring: TrialRing): MonsterState | null {
  return world.monsters.find((monster: MonsterState): boolean => monster.def.id === ring.boss.id) ?? null;
}

interface HeldClock {
  from: number | null;
  total: number;
}

function heldTotal(held: HeldClock, now: number): number {
  return held.from === null ? held.total : held.total + now - held.from;
}

export function runTrial(content: Content, policies: Policies, job: TrialJob): TrialAttempt {
  const skill: SkillPolicy | undefined = policies.skills.get(job.skill);
  const build: BuildPolicy | undefined = policies.builds.get(job.build);
  const ring: TrialRing | null = trialRing(content, job.zone);
  if (skill === undefined || build === undefined) throw new Error(`no policy ${job.skill}/${job.build}`);
  if (ring === null) throw new Error(`no trial zone ${job.zone} with a boss`);
  const world: World = createWorld(content, job.hero === null ? { seed: job.seed, save: null, opening: false } : { seed: job.seed, save: null, opening: false, hero: job.hero });
  let flasks: number = 0;
  let hurt: number = 0;
  const held: HeldClock = { from: null, total: 0 };
  const bot: Bot = createBot(world, skill.habits, (events: readonly WorldEvent[]): void => {
    for (const event of events) {
      if (event.type === 'flask_used') flasks += 1;
      if (event.type === 'damage' && event.targetTeam === 'player') hurt += event.amount;
      if (event.type === 'boss_held' && held.from === null) held.from = world.time;
      if (event.type === 'count_broken' && held.from !== null) {
        held.total += world.time - held.from;
        held.from = null;
      }
    }
  }, planFor(skill, build));
  raiseTo(world, TRIAL.level);
  gearUp(bot, job.weapon, TRIAL.level);
  for (let waited: number = 0; waited < TRIAL.settle; waited += BOT.step) botStep(bot, []);
  world.player.life = world.player.maxLife;
  flasks = 0;
  hurt = 0;
  held.from = null;
  held.total = 0;
  enterZone(world, ring.zone, { type: 'start' });
  const boss: MonsterState | null = bossOf(world, ring);
  if (boss === null) throw new Error(`${ring.boss.id} did not stand in ${ring.zone.id}`);
  boss.aggro = true;
  const start: number = world.time;
  const over = (): boolean => !boss.alive || bot.deaths > 0 || world.zone.id !== ring.zone.id || world.time - start >= job.limit;
  while (!over()) botFight(bot, over, ring.boss.id);
  const onPieces: number = heldTotal(held, world.time);
  const outcome: TrialOutcome = !boss.alive ? 'won' : bot.deaths > 0 ? 'lost' : 'timeout';
  return { outcome, seconds: Math.round((world.time - start) * 10) / 10, deaths: bot.deaths, flasks, phase: boss.phase, lifeLeft: Math.round((boss.life / boss.maxLife) * 1000) / 1000, heroLife: world.player.maxLife, bossLife: boss.maxLife, hurt: Math.round(hurt), onPieces: Math.round(onPieces * 10) / 10 };
}

export interface TrialRow {
  readonly build: string;
  readonly skill: string;
  readonly heroes: number;
  readonly firstWin: number;
  readonly winWithin: number;
  readonly triesToWin: number | null;
  readonly minutes: number | null;
  readonly barMinutes: number | null;
  readonly pieceMinutes: number | null;
  readonly flasks: number;
  readonly lostInPhase: readonly number[];
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted: number[] = values.toSorted((a: number, b: number): number => a - b);
  const middle: number = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function tenths(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export function trialRow(build: string, skill: string, runs: readonly (readonly TrialAttempt[])[]): TrialRow {
  const firsts: TrialAttempt[] = runs.flatMap((tries: readonly TrialAttempt[]): TrialAttempt[] => (tries[0] === undefined ? [] : [tries[0]]));
  const tries: number[] = runs.flatMap((attempts: readonly TrialAttempt[]): number[] => {
    const won: number = attempts.findIndex((attempt: TrialAttempt): boolean => attempt.outcome === 'won');
    return won < 0 ? [] : [won + 1];
  });
  const all: TrialAttempt[] = runs.flat();
  const wins: TrialAttempt[] = all.filter((attempt: TrialAttempt): boolean => attempt.outcome === 'won');
  const lostInPhase: number[] = [0, 0, 0];
  for (const attempt of all) if (attempt.outcome !== 'won') lostInPhase[attempt.phase] = (lostInPhase[attempt.phase] ?? 0) + 1;
  const minutes: number | null = median(wins.map((attempt: TrialAttempt): number => attempt.seconds / 60));
  const pieceMinutes: number | null = median(wins.map((attempt: TrialAttempt): number => attempt.onPieces / 60));
  const barMinutes: number | null = median(wins.map((attempt: TrialAttempt): number => (attempt.seconds - attempt.onPieces) / 60));
  return {
    build,
    skill,
    heroes: runs.length,
    firstWin: firsts.length === 0 ? 0 : firsts.filter((attempt: TrialAttempt): boolean => attempt.outcome === 'won').length / firsts.length,
    winWithin: runs.length === 0 ? 0 : tries.length / runs.length,
    triesToWin: median(tries),
    minutes: tenths(minutes),
    barMinutes: tenths(barMinutes),
    pieceMinutes: tenths(pieceMinutes),
    flasks: wins.length === 0 ? 0 : Math.round((wins.reduce((sum: number, attempt: TrialAttempt): number => sum + attempt.flasks, 0) / wins.length) * 10) / 10,
    lostInPhase,
  };
}

export function trialTable(rows: readonly TrialRow[]): string {
  const head: string = '| build | play | heroes | first-try win | win within tries | tries to win | minutes | on the bar | on the pieces | flasks a win | losses by phase |';
  const line: string = '|---|---|---|---|---|---|---|---|---|---|---|';
  const body: string[] = rows.map((row: TrialRow): string => `| ${row.build} | ${row.skill} | ${row.heroes} | ${Math.round(row.firstWin * 100)}% | ${Math.round(row.winWithin * 100)}% | ${row.triesToWin ?? '-'} | ${row.minutes ?? '-'} | ${row.barMinutes ?? '-'} | ${row.pieceMinutes ?? '-'} | ${row.flasks} | ${row.lostInPhase.join(' / ')} |`);
  return [head, line, ...body].join('\n');
}
