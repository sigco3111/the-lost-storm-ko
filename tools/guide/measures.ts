import type { BossAttempt } from '../simulate-boss.ts';
import type { Fight, RunSummary } from '../simulate-summary.ts';
import { spread } from '../simulate-summary.ts';
import type { Fields } from '../../sim/content/read.ts';
import { ContentError, fields, items, numeric, text } from '../../sim/content/read.ts';

export interface LevelReach {
  readonly level: number;
  readonly share: number;
  readonly minutes: number | null;
}

export interface BossAt {
  readonly level: number;
  readonly attempts: number;
  readonly winShare: number;
  readonly seconds: number | null;
  readonly lifeLeft: number | null;
}

export interface PlayMeasure {
  readonly runs: number;
  readonly levels: readonly LevelReach[];
  readonly killsPerMinute: number;
  readonly fightSeconds: number;
  readonly flasksPerFight: number;
  readonly deathsPerHour: number;
  readonly lowShare: number;
  readonly magicDeathShare: number;
  readonly rareDeathShare: number;
  readonly boss: readonly BossAt[];
}

export interface BuildMeasure {
  readonly id: string;
  readonly steady: PlayMeasure;
  readonly careless: PlayMeasure;
}

export interface Measured {
  readonly fingerprint: string;
  readonly runs: number;
  readonly builds: readonly BuildMeasure[];
}

export const MEASURE = {
  tenths: 10,
  hundredths: 100,
  secondsPerMinute: 60,
  minutesPerHour: 60,
} as const;

function round(value: number, scale: number): number {
  return Math.round(value * scale) / scale;
}

function median(values: readonly number[]): number {
  return spread(values).median;
}

function runningMinutes(run: RunSummary): number {
  return run.seconds / MEASURE.secondsPerMinute;
}

function lived(runs: readonly RunSummary[]): RunSummary[] {
  return runs.filter((run: RunSummary): boolean => run.seconds > 0);
}

function rankDeaths(fights: readonly Fight[], rank: string): number {
  const ranked: Fight[] = fights.filter((fight: Fight): boolean => fight.rank === rank);
  return ranked.length === 0 ? 0 : ranked.filter((fight: Fight): boolean => fight.died).length / ranked.length;
}

function levelReach(runs: readonly RunSummary[], level: number): LevelReach {
  const times: number[] = runs.flatMap((run: RunSummary): number[] => {
    const seconds: number | undefined = run.levels[String(level)];
    return seconds === undefined ? [] : [seconds];
  });
  return {
    level,
    share: runs.length === 0 ? 0 : round(times.length / runs.length, MEASURE.hundredths),
    minutes: times.length === 0 ? null : round(median(times) / MEASURE.secondsPerMinute, MEASURE.tenths),
  };
}

function bandOf(levels: readonly number[], level: number): number | null {
  const below: number[] = levels.filter((entry: number): boolean => entry <= level);
  return below.length === 0 ? null : Math.max(...below);
}

function bossAt(attempts: readonly BossAttempt[], levels: readonly number[], level: number): BossAt {
  const here: BossAttempt[] = attempts.filter((attempt: BossAttempt): boolean => bandOf(levels, attempt.level) === level);
  const won: BossAttempt[] = here.filter((attempt: BossAttempt): boolean => attempt.outcome === 'won');
  return {
    level,
    attempts: here.length,
    winShare: here.length === 0 ? 0 : round(won.length / here.length, MEASURE.hundredths),
    seconds: won.length === 0 ? null : Math.round(median(won.map((attempt: BossAttempt): number => attempt.seconds))),
    lifeLeft: won.length === 0 ? null : round(median(won.map((attempt: BossAttempt): number => attempt.lifeLeft)), MEASURE.hundredths),
  };
}

export function playMeasure(runs: readonly RunSummary[], attempts: readonly BossAttempt[], levels: readonly number[]): PlayMeasure {
  const playing: RunSummary[] = lived(runs);
  const fights: Fight[] = runs.flatMap((run: RunSummary): readonly Fight[] => run.fights);
  const cleared: Fight[] = fights.filter((fight: Fight): boolean => fight.outcome === 'resolved');
  return {
    runs: runs.length,
    levels: levels.map((level: number): LevelReach => levelReach(runs, level)),
    killsPerMinute: round(median(playing.map((run: RunSummary): number => run.kills / runningMinutes(run))), MEASURE.tenths),
    fightSeconds: round(median(cleared.map((fight: Fight): number => fight.seconds)), MEASURE.tenths),
    flasksPerFight: round(fights.length === 0 ? 0 : fights.reduce((sum: number, fight: Fight): number => sum + fight.flasks, 0) / fights.length, MEASURE.hundredths),
    deathsPerHour: round(median(playing.map((run: RunSummary): number => (run.deaths.length / runningMinutes(run)) * MEASURE.minutesPerHour)), MEASURE.tenths),
    lowShare: round(median(playing.map((run: RunSummary): number => run.lowSeconds / run.seconds)), MEASURE.hundredths),
    magicDeathShare: round(rankDeaths(fights, 'magic'), MEASURE.hundredths),
    rareDeathShare: round(rankDeaths(fights, 'rare'), MEASURE.hundredths),
    boss: levels.map((level: number): BossAt => bossAt(attempts, levels, level)),
  };
}

function nullable(source: Fields, key: string, where: string): number | null {
  return source[key] === null ? null : numeric(source, key, where);
}

function readReach(value: unknown, where: string): LevelReach {
  const source: Fields = fields(value, where);
  return { level: numeric(source, 'level', where), share: numeric(source, 'share', where), minutes: nullable(source, 'minutes', where) };
}

function readBoss(value: unknown, where: string): BossAt {
  const source: Fields = fields(value, where);
  return { level: numeric(source, 'level', where), attempts: numeric(source, 'attempts', where), winShare: numeric(source, 'winShare', where), seconds: nullable(source, 'seconds', where), lifeLeft: nullable(source, 'lifeLeft', where) };
}

function readPlay(value: unknown, where: string): PlayMeasure {
  const source: Fields = fields(value, where);
  return {
    runs: numeric(source, 'runs', where),
    levels: items(source['levels'], `${where}.levels`).map((entry: unknown, index: number): LevelReach => readReach(entry, `${where}.levels.${index}`)),
    killsPerMinute: numeric(source, 'killsPerMinute', where),
    fightSeconds: numeric(source, 'fightSeconds', where),
    flasksPerFight: numeric(source, 'flasksPerFight', where),
    deathsPerHour: numeric(source, 'deathsPerHour', where),
    lowShare: numeric(source, 'lowShare', where),
    magicDeathShare: numeric(source, 'magicDeathShare', where),
    rareDeathShare: numeric(source, 'rareDeathShare', where),
    boss: items(source['boss'], `${where}.boss`).map((entry: unknown, index: number): BossAt => readBoss(entry, `${where}.boss.${index}`)),
  };
}

function readBuildMeasure(value: unknown, where: string): BuildMeasure {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), steady: readPlay(source['steady'], `${where}.steady`), careless: readPlay(source['careless'], `${where}.careless`) };
}

export function readMeasured(value: unknown): Measured {
  const source: Fields = fields(value, 'measured');
  const runs: number = numeric(source, 'runs', 'measured');
  if (runs < 1) throw new ContentError('measured.runs', 'expected at least one run');
  return {
    fingerprint: text(source, 'fingerprint', 'measured'),
    runs,
    builds: items(source['builds'], 'measured.builds').map((entry: unknown, index: number): BuildMeasure => readBuildMeasure(entry, `measured.builds.${index}`)),
  };
}
