import type { CaveRun } from './simulate-cave.ts';
import { runCave } from './simulate-cave.ts';
import type { CaveRow } from './simulate-cave-table.ts';
import { caveRow, caveTable } from './simulate-cave-table.ts';
import { POLICIES } from './simulate-policies.ts';

const CAVE_CLI = {
  zone: 'under_hall',
  through: '',
  raise: 0,
  gear: '',
  enterLevel: 8,
  minutes: 60,
  runs: 3,
  skills: 'careful,average,poor',
  builds: 'mixed,marksman',
} as const;

function option(name: string, fallback: string): string {
  const at: number = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : (process.argv[at + 1] ?? fallback);
}

function list(value: string): string[] {
  return value.split(',').filter((entry: string): boolean => entry !== '');
}

function count(name: string, fallback: number): number {
  const value: number = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} takes a whole number of at least 0`);
  return value;
}

const raise: number = count('raise', CAVE_CLI.raise);
const enterLevel: number = count('enter', CAVE_CLI.enterLevel);
const minutes: number = Number(option('minutes', String(CAVE_CLI.minutes)));
const runs: number = Number(option('runs', String(CAVE_CLI.runs)));
const rows: CaveRow[] = [];
for (const build of option('build', CAVE_CLI.builds).split(',')) {
  for (const skill of option('skill', CAVE_CLI.skills).split(',')) {
    const done: CaveRun[] = [];
    for (let seed: number = 1; seed <= runs; seed += 1) {
      done.push(runCave({ zone: option('zone', CAVE_CLI.zone), through: list(option('through', CAVE_CLI.through)), raise, gear: list(option('gear', CAVE_CLI.gear)), dress: process.argv.includes('--dress'), arm: list(option('arm', '')), enterLevel, minutes, skill, build, seed }, POLICIES));
      process.stderr.write(`${build} ${skill} ${seed}/${runs}\n`);
    }
    const row: CaveRow | null = caveRow(done);
    if (row !== null) rows.push(row);
  }
}
process.stdout.write(`${caveTable(rows)}\n`);
