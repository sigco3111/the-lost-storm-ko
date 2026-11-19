import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOT, botWalkTo, createBot } from '../sim/bot.ts';
import type { Bot } from '../sim/bot.ts';
import { nearestWalkable } from '../sim/nav/grid.ts';
import { createWorld } from '../sim/world/create.ts';
import { forceStrike } from '../sim/world/moments.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { MomentState, World } from '../sim/world/types.ts';
import { POLICIES } from './simulate-policies.ts';
import type { Job, RivalRun, Scenario } from './simulate-run.ts';
import type { BossLair } from './simulate-run.ts';
import { bossLair, CONTENT, farm, harder, runJob, runRivals, scenarioName } from './simulate-run.ts';
import type { BossAttempt } from './simulate-boss.ts';
import { bossAttempts } from './simulate-boss.ts';
import type { Condition, ScalingRamp, ZoneDef, ZoneExit } from '../sim/content/types.ts';
import { must } from '../test/support.ts';
import type { Fight, RunSummary } from './simulate-summary.ts';
import { spread, summarize } from './simulate-summary.ts';

const GUARD = {
  seeds: [1, 2, 3],
  sliceMinutes: { min: 1, max: 6 },
  firstFight: { min: 10, max: 45 },
  standingSurvives: 20,
  standingLimit: 60,
  farmMinutes: 30,
  farmLevel: { min: 6, max: 13 },
  rareShare: 2 / 3,
  strikeGap: 6,
  dormantWait: 0.5,
  over: { hero: 9, low: 1, near: 7, minutes: 8, seed: 1, drastic: 1 / 3 },
  boss: { level: 8, repeats: 2, poorSeeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], poorBelowAverage: 0.25, poorAtMost: 0.8, minutes: 60, carefulSeeds: [1, 2, 3, 4], carefulLosses: 1, medianSeconds: { min: 20, max: 150 }, builds: ['mixed', 'marksman'] },
} as const;

function runs(scenario: Scenario, skill: string): RunSummary[] {
  return GUARD.seeds.map((seed: number): RunSummary => summarize(runJob({ scenario, skill, build: 'mixed', seed, danger: 1, toughness: 1 } satisfies Job, POLICIES)));
}

const slices: readonly RunSummary[] = runs({ kind: 'slice' }, 'average');

void test('scenarios have readable names', (): void => {
  assert.deepEqual([scenarioName({ kind: 'slice' }), scenarioName({ kind: 'farm', minutes: 5 }), scenarioName({ kind: 'fight', moment: 'campfire', repeats: 2 }), scenarioName({ kind: 'level', level: 4, minutes: 9 }), scenarioName({ kind: 'over', hero: 9, zone: 1, minutes: 5 }), scenarioName({ kind: 'boss', levels: [8, 10], repeats: 2, minutes: 60 })], ['slice', 'farm 5m', 'fight campfire', 'level 4', 'hero 9 in level 1', 'boss at 8, 10']);
});

void test('a level 9 hero earns drastically less experience a minute in level 1 content than in level 7 content', (): void => {
  const rate = (zone: number): number => {
    const run: RunSummary = summarize(runJob({ scenario: { kind: 'over', hero: GUARD.over.hero, zone, minutes: GUARD.over.minutes }, skill: 'careful', build: 'mixed', seed: GUARD.over.seed, danger: 1, toughness: 1 }, POLICIES));
    assert.equal(run.reason, 'done');
    return run.xp / Math.max(1, run.seconds);
  };
  const low: number = rate(GUARD.over.low);
  const near: number = rate(GUARD.over.near);
  assert.ok(low > 0, 'still levelling, never zero');
  assert.ok(low < near * GUARD.over.drastic, `${(low * 3600).toFixed(0)} an hour in level ${GUARD.over.low}, ${(near * 3600).toFixed(0)} in level ${GUARD.over.near}`);
});

void test('a farm that cannot reach the Hall says so instead of idling', (): void => {
  const world: World = createWorld(CONTENT, { seed: 2, save: null, opening: true });
  assert.equal(farm(createBot(world), world.time + 60, true, (): boolean => false), false);
});

void test('an average player walks from waking to the Warden through every opening milestone in one to six minutes, and the end card waits for the boss', (): void => {
  const opening: readonly string[] = POLICIES.milestones.map((rule): string => rule.name).filter((name: string): boolean => name !== POLICIES.endCard);
  for (const run of slices) {
    assert.equal(run.reason, 'done', `seed ${run.seed ?? '?'}`);
    for (const name of opening) assert.ok(run.milestones[name] !== undefined, `seed ${run.seed ?? '?'} never reached ${name}`);
    assert.equal(run.milestones[POLICIES.endCard], undefined, `seed ${run.seed ?? '?'} reached the end card before the boss`);
    const minutes: number = Math.max(...opening.map((name: string): number => run.milestones[name] ?? Infinity)) / 60;
    assert.ok(minutes >= GUARD.sliceMinutes.min && minutes <= GUARD.sliceMinutes.max, `seed ${run.seed ?? '?'} took ${minutes.toFixed(1)} minutes`);
  }
});

void test('the first fight lasts ten to forty-five seconds for an average player', (): void => {
  for (const run of slices) {
    const first: Fight | undefined = run.fights[0];
    assert.ok(first !== undefined && first.outcome === 'resolved', `seed ${run.seed ?? '?'}`);
    assert.ok(first.seconds >= GUARD.firstFight.min && first.seconds <= GUARD.firstFight.max, `seed ${run.seed ?? '?'}: ${first.seconds.toFixed(1)} s`);
  }
});

void test('the first fight does not kill a hero who stands still inside it for twenty seconds', (): void => {
  const first: string = 'first_fire';
  for (const seed of GUARD.seeds) {
    const world: World = createWorld(CONTENT, { seed, save: null });
    const at = nearestWalkable(world.grid, { x: world.player.pos.x + GUARD.strikeGap, z: world.player.pos.z }, GUARD.strikeGap);
    const moment: MomentState | null = at === null ? null : forceStrike(world, at, first);
    assert.ok(moment !== null);
    const bot: Bot = createBot(world, { dodges: false, reaction: 0 });
    while (moment.phase === 'mark') stepWorld(world, [], BOT.step);
    botWalkTo(bot, world.zone.id, moment.pos, BOT.arrive);
    const woke: number = world.time;
    while (world.player.alive && world.time - woke < GUARD.standingLimit && moment.phase === 'awake') stepWorld(world, [], BOT.step);
    const survived: number = world.player.alive ? GUARD.standingLimit : world.time - woke;
    assert.ok(survived >= GUARD.standingSurvives, `seed ${seed}: a standing hero fell after ${survived.toFixed(1)} s`);
  }
});

void test('a careful player farming the Hall for thirty minutes finds a rare or better in most runs and levels steadily', (): void => {
  const farms: RunSummary[] = runs({ kind: 'farm', minutes: GUARD.farmMinutes }, 'careful');
  const rare: ReadonlySet<string> = new Set<string>(CONTENT.rarities.filter((rarity): boolean => rarity.weight <= (CONTENT.rarities.find((entry): boolean => entry.id === POLICIES.rare)?.weight ?? 0)).map((rarity): string => rarity.id));
  const lucky: number = farms.filter((run: RunSummary): boolean => run.drops.some((drop): boolean => rare.has(drop.rarity))).length;
  assert.ok(lucky / farms.length >= GUARD.rareShare, `${lucky} of ${farms.length} runs found a rare`);
  for (const run of farms) assert.ok(run.endLevel >= GUARD.farmLevel.min && run.endLevel <= GUARD.farmLevel.max, `seed ${run.seed ?? '?'} ended at level ${run.endLevel}`);
});

void test('a farm that finds the hero already standing in a dormant moment lets time pass instead of spinning', (): void => {
  const world: World = createWorld(CONTENT, { seed: 3, save: null });
  world.monsters = [];
  const moment: MomentState | null = forceStrike(world, { x: world.player.pos.x, z: world.player.pos.z }, 'first_fire');
  assert.ok(moment !== null);
  while (moment.phase === 'mark') stepWorld(world, [], BOT.step);
  assert.equal(moment.phase, 'dormant');
  const start: number = world.time;
  assert.equal(farm(createBot(world), start + GUARD.dormantWait, false, (): boolean => false), true);
  assert.ok(world.time >= start + GUARD.dormantWait);
});

void test('danger scales how fast monster damage grows per level, toughness how fast monster life grows, and one of each leaves the content as it is', (): void => {
  assert.equal(harder(CONTENT, 1, 1), CONTENT);
  const tougher = harder(CONTENT, 3, 2);
  assert.equal(tougher.world.scaling.damagePerLevel, CONTENT.world.scaling.damagePerLevel * 3);
  assert.equal(tougher.world.scaling.lifePerLevel, CONTENT.world.scaling.lifePerLevel * 2);
  assert.equal(tougher.world.scaling.xpPerLevel, CONTENT.world.scaling.xpPerLevel);
  const shippedRamp: ScalingRamp = must(CONTENT.world.scaling.ramp, 'shipped ramp');
  const harderRamp: ScalingRamp = must(tougher.world.scaling.ramp, 'harder ramp');
  assert.equal(harderRamp.damagePerLevel, shippedRamp.damagePerLevel * 3);
  assert.equal(harderRamp.lifePerLevel, shippedRamp.lifePerLevel * 2);
  assert.equal(tougher.monsters, CONTENT.monsters);
  const lifeOnly = harder(CONTENT, 1, 4);
  assert.equal(lifeOnly.world.scaling.damagePerLevel, CONTENT.world.scaling.damagePerLevel);
});

interface BossRun {
  readonly attempts: readonly BossAttempt[];
  readonly summary: RunSummary;
}

function winRate(attempts: readonly BossAttempt[]): number {
  return attempts.length === 0 ? 0 : attempts.filter((attempt: BossAttempt): boolean => attempt.outcome === 'won').length / attempts.length;
}

interface PairedFights {
  readonly poor: readonly BossAttempt[];
  readonly average: readonly BossAttempt[];
}

function bossJob(skill: string, build: string, seed: number): Job {
  return { scenario: { kind: 'boss', levels: [GUARD.boss.level], repeats: GUARD.boss.repeats, minutes: GUARD.boss.minutes }, skill, build, seed, danger: 1, toughness: 1 };
}

function bossFights(skill: string, build: string, seed: number): BossRun {
  const stream = runJob(bossJob(skill, build, seed), POLICIES);
  return { attempts: bossAttempts(stream), summary: summarize(stream) };
}

function pairedFights(build: string, seed: number): PairedFights {
  const run: RivalRun = runRivals(bossJob('poor', build, seed), POLICIES, ['average']);
  return { poor: bossAttempts(run.stream), average: bossAttempts(run.rivals.get('average') ?? []) };
}

function zonesBefore(lair: string): ZoneDef[] {
  const reached: Set<string> = new Set<string>([CONTENT.world.start]);
  const queue: string[] = [CONTENT.world.start];
  while (queue.length > 0) {
    const id: string | undefined = queue.pop();
    if (id === undefined) break;
    for (const exit of CONTENT.zones.get(id)?.exits ?? []) {
      if (exit.to === lair || reached.has(exit.to)) continue;
      reached.add(exit.to);
      queue.push(exit.to);
    }
  }
  return [...CONTENT.zones.values()].filter((zone: ZoneDef): boolean => reached.has(zone.id));
}

void test('the boss lair is found from the content, and its boss sits behind a level the hero has to reach', (): void => {
  const lair: BossLair = must(bossLair(CONTENT), 'a lair');
  assert.notEqual(lair.boss.boss, null);
  const before: ZoneDef[] = zonesBefore(lair.zone.id);
  const gates: ZoneExit[] = before.flatMap((zone: ZoneDef): ZoneExit[] => zone.exits.filter((exit: ZoneExit): boolean => exit.to === lair.zone.id));
  assert.ok(gates.length > 0 && gates.every((exit: ZoneExit): boolean => exit.requires.some((entry: Condition): boolean => entry.type === 'level' && entry.atLeast === GUARD.boss.level)));
});

void test('at the gate\'s level both heroes win all but at most one boss fight with careful play over four seeds, its fights last half a minute to two minutes at the median and reach the end card, and poor play wins clearly less often than average play', (): void => {
  for (const build of GUARD.boss.builds) {
    const careful: readonly BossAttempt[] = GUARD.boss.carefulSeeds.flatMap((seed: number): readonly BossAttempt[] => {
      const won: BossRun = bossFights('careful', build, seed);
      assert.ok(won.summary.milestones[POLICIES.endCard] !== undefined, `${build} careful never reached the end card on seed ${seed}`);
      assert.equal(won.attempts.length, GUARD.boss.repeats, `${build} seed ${seed}`);
      return won.attempts;
    });
    const paired: readonly PairedFights[] = GUARD.boss.poorSeeds.map((seed: number): PairedFights => pairedFights(build, seed));
    const poor: readonly BossAttempt[] = paired.flatMap((fights: PairedFights): readonly BossAttempt[] => fights.poor);
    assert.ok(careful.filter((attempt: BossAttempt): boolean => attempt.outcome !== 'won').length <= GUARD.boss.carefulLosses, `${build} careful: ${JSON.stringify(careful)}`);
    const median: number = spread(careful.map((attempt: BossAttempt): number => attempt.seconds)).median;
    assert.ok(median >= GUARD.boss.medianSeconds.min && median <= GUARD.boss.medianSeconds.max, `${build} careful fights last ${median.toFixed(0)} s at the median`);
    const average: readonly BossAttempt[] = paired.flatMap((fights: PairedFights): readonly BossAttempt[] => fights.average);
    const poorRate: number = winRate(poor);
    const averageRate: number = winRate(average);
    assert.ok(poor.length > 0 && average.length > 0, `${build}: ${poor.length} poor and ${average.length} average attempts`);
    assert.ok(poorRate <= averageRate - GUARD.boss.poorBelowAverage, `${build} poor wins ${(poorRate * 100).toFixed(0)}%, average ${(averageRate * 100).toFixed(0)}%`);
    assert.ok(poorRate < GUARD.boss.poorAtMost, `${build} poor wins ${(poorRate * 100).toFixed(0)}%: ${JSON.stringify(poor)}`);
  }
});
