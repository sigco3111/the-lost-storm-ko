import type { CaveFight, CaveRun } from './simulate-cave.ts';

export const CAVE_TABLE = {
  levels: [10, 12, 14],
  ranks: ['normal', 'magic', 'rare'],
} as const;

export interface CaveRow {
  readonly build: string;
  readonly skill: string;
  readonly runs: number;
  readonly enteredAt: number | null;
  readonly levelMinutes: readonly (number | null)[];
  readonly levelReached: readonly number[];
  readonly deathsPerHour: number;
  readonly killsPerMinute: number;
  readonly farEnd: number | null;
  readonly farEndReached: number;
  readonly lost: Readonly<Record<string, readonly [number, number]>>;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted: number[] = values.toSorted((a: number, b: number): number => a - b);
  const low: number | undefined = sorted[Math.floor((sorted.length - 1) / 2)];
  const high: number | undefined = sorted[Math.ceil((sorted.length - 1) / 2)];
  return low === undefined || high === undefined ? null : (low + high) / 2;
}

function present(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((value: number | null | undefined): value is number => value !== null && value !== undefined);
}

export function caveRow(runs: readonly CaveRun[]): CaveRow | null {
  const first: CaveRun | undefined = runs[0];
  if (first === undefined) return null;
  const hours: number = runs.reduce((sum: number, run: CaveRun): number => sum + run.minutes, 0) / 60;
  const lost: Record<string, [number, number]> = {};
  for (const fight of runs.flatMap((run: CaveRun): readonly CaveFight[] => run.fights)) {
    const tally: [number, number] = lost[fight.rank] ?? [0, 0];
    tally[0] += 1;
    if (fight.lost) tally[1] += 1;
    lost[fight.rank] = tally;
  }
  const levels: number[][] = CAVE_TABLE.levels.map((level: number): number[] => present(runs.map((run: CaveRun): number | undefined => run.levelMinutes[String(level)])));
  const far: number[] = present(runs.map((run: CaveRun): number | null => run.farEndMinutes));
  return {
    build: first.job.build,
    skill: first.job.skill,
    runs: runs.length,
    enteredAt: median(present(runs.map((run: CaveRun): number | null => (run.entered ? run.enteredAtLevel : null)))),
    levelMinutes: levels.map((times: readonly number[]): number | null => median(times)),
    levelReached: levels.map((times: readonly number[]): number => times.length),
    deathsPerHour: hours > 0 ? runs.reduce((sum: number, run: CaveRun): number => sum + run.deaths, 0) / hours : 0,
    killsPerMinute: hours > 0 ? runs.reduce((sum: number, run: CaveRun): number => sum + run.kills, 0) / (hours * 60) : 0,
    farEnd: median(far),
    farEndReached: far.length,
    lost,
  };
}

function minutes(value: number | null, reached: number, runs: number): string {
  const shown: string = value === null ? '-' : value.toFixed(0);
  return reached < runs ? `${shown} (${reached}/${runs})` : shown;
}

export function caveTable(rows: readonly CaveRow[]): string {
  const head: string[] = ['build', 'skill', 'entered at', ...CAVE_TABLE.levels.map((level: number): string => `min to ${level}`), 'deaths/h', 'kills/min', 'far end min', 'fights lost by rank'];
  const lines: string[] = [`| ${head.join(' | ')} |`, `|${head.map((): string => '---').join('|')}|`];
  for (const row of rows) {
    const ranks: string = CAVE_TABLE.ranks
      .map((rank: string): string => {
        const tally: readonly [number, number] = row.lost[rank] ?? [0, 0];
        return `${rank} ${tally[1]}/${tally[0]}`;
      })
      .join(', ');
    const cells: string[] = [
      row.build,
      row.skill,
      row.enteredAt === null ? '-' : String(row.enteredAt),
      ...row.levelMinutes.map((value: number | null, index: number): string => minutes(value, row.levelReached[index] ?? 0, row.runs)),
      row.deathsPerHour.toFixed(1),
      row.killsPerMinute.toFixed(1),
      minutes(row.farEnd, row.farEndReached, row.runs),
      ranks,
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}
