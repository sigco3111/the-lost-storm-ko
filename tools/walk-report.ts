import { createHash } from 'node:crypto';
import { fields, flag, items, numeric, text } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';

export const WALK_DEFAULTS = {
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  port: 5461,
  width: 1280,
  height: 800,
  hero: 'woman',
} as const;

export const PROFILE = {
  base: 'walk-bodies-profile',
  hashLength: 10,
} as const;

export function profileFor(checkout: string): string {
  return `${PROFILE.base}-${createHash('sha256').update(checkout).digest('hex').slice(0, PROFILE.hashLength)}`;
}

export const SLOW_WAIT = {
  slowedFactor: 3,
} as const;

export interface WalkHold {
  readonly pattern: string;
  readonly ms: number;
}

export interface WalkFail {
  readonly pattern: string;
  readonly times: number;
}

export interface WalkSlow {
  readonly cpuRate: number;
  readonly kbps: number | null;
  readonly holds: readonly WalkHold[];
  readonly fails: readonly WalkFail[];
}

export interface WalkArgs {
  readonly url: string | null;
  readonly chrome: string;
  readonly port: number;
  readonly hero: string;
  readonly slow: WalkSlow;
}

export const UNSLOWED: WalkSlow = { cpuRate: 1, kbps: null, holds: [], fails: [] };

function positive(name: string, value: string): number {
  const parsed: number = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number, not ${value}`);
  return parsed;
}

function pairOf(name: string, value: string): { readonly pattern: string; readonly amount: string | null } {
  const at: number = value.lastIndexOf('=');
  const pattern: string = at < 0 ? value : value.slice(0, at);
  if (pattern === '') throw new Error(`${name} needs a part of a file path, not ${value}`);
  return { pattern, amount: at < 0 ? null : value.slice(at + 1) };
}

function valuesOf(argv: readonly string[], name: string): string[] {
  return argv.flatMap((entry: string, at: number): string[] => {
    if (entry !== name) return [];
    const value: string | undefined = argv[at + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
    return [value];
  });
}

function count(name: string, value: string): number {
  const parsed: number = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} needs a whole number of times of at least 1, not ${value}`);
  return parsed;
}

export function walkSlow(argv: readonly string[]): WalkSlow {
  const cpu: string | undefined = valuesOf(argv, '--cpu')[0];
  const kbps: string | undefined = valuesOf(argv, '--kbps')[0];
  return {
    cpuRate: cpu === undefined ? UNSLOWED.cpuRate : positive('--cpu', cpu),
    kbps: kbps === undefined ? null : positive('--kbps', kbps),
    holds: valuesOf(argv, '--hold').map((value: string): WalkHold => {
      const pair = pairOf('--hold', value);
      if (pair.amount === null) throw new Error(`--hold needs a delay in ms after =, as in Throw.glb=40000, not ${value}`);
      return { pattern: pair.pattern, ms: positive('--hold', pair.amount) };
    }),
    fails: valuesOf(argv, '--fail').map((value: string): WalkFail => {
      const pair = pairOf('--fail', value);
      return { pattern: pair.pattern, times: pair.amount === null ? Number.POSITIVE_INFINITY : count('--fail', pair.amount) };
    }),
  };
}

export function slowLine(slow: WalkSlow): string | null {
  const parts: string[] = [
    ...(slow.cpuRate === 1 ? [] : [`cpu ${slow.cpuRate}x slower`]),
    ...(slow.kbps === null ? [] : [`network ${slow.kbps} kbps`]),
    ...slow.holds.map((hold: WalkHold): string => `hold ${hold.pattern} ${hold.ms} ms`),
    ...slow.fails.map((fail: WalkFail): string => `fail ${fail.pattern} ${Number.isFinite(fail.times) ? `${fail.times} times` : 'always'}`),
  ];
  return parts.length === 0 ? null : `slowed: ${parts.join(', ')}`;
}

export function patienceFor(slow: WalkSlow, baseMs: number): number {
  if (slowLine(slow) === null) return baseMs;
  const held: number = slow.holds.reduce((sum: number, hold: WalkHold): number => sum + hold.ms, 0);
  return baseMs * slow.cpuRate * SLOW_WAIT.slowedFactor + held;
}

export interface WalkLook {
  readonly zone: string;
  readonly afterMs: number;
  readonly live: number;
  readonly missing: readonly string[];
}

export interface WalkSummary {
  readonly ok: boolean;
  readonly looks: readonly WalkLook[];
  readonly problems: readonly string[];
}

export function walkArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): WalkArgs {
  const valueOf = (name: string): string | null => {
    const at: number = argv.indexOf(name);
    const value: string | undefined = at < 0 ? undefined : argv[at + 1];
    return value === undefined || value.startsWith('--') ? null : value;
  };
  const port: number = Number(valueOf('--port') ?? WALK_DEFAULTS.port);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`--port must be a port number, not ${valueOf('--port') ?? ''}`);
  const url: string | null = valueOf('--url');
  const hero: string = valueOf('--hero') ?? WALK_DEFAULTS.hero;
  if (!/^[a-z]+$/.test(hero)) throw new Error(`--hero must be a hero id, not ${hero}`);
  return { url: url === null ? null : url.replace(/\/+$/, ''), chrome: valueOf('--chrome') ?? env['CHROME_PATH'] ?? WALK_DEFAULTS.chrome, port, hero, slow: walkSlow(argv) };
}

function readLook(value: unknown, where: string): WalkLook {
  const source: Fields = fields(value, where);
  return { zone: text(source, 'zone', where), afterMs: numeric(source, 'afterMs', where), live: numeric(source, 'live', where), missing: items(source['missing'], `${where}.missing`).map((entry: unknown, index: number): string => text({ entry }, 'entry', `${where}.missing[${index}]`)) };
}

export function readWalk(value: unknown): WalkSummary {
  const source: Fields = fields(value, 'walk');
  return {
    ok: flag(source, 'ok', 'walk'),
    looks: items(source['looks'], 'walk.looks').map((entry: unknown, index: number): WalkLook => readLook(entry, `walk.looks[${index}]`)),
    problems: items(source['problems'], 'walk.problems').map((entry: unknown, index: number): string => text({ entry }, 'entry', `walk.problems[${index}]`)),
  };
}

export const WALK_ALARMS: readonly string[] = ['was alive with nothing drawable'];

export function withAlarms(summary: WalkSummary, warnings: readonly string[]): WalkSummary {
  const alarms: string[] = warnings.filter((warning: string): boolean => WALK_ALARMS.some((alarm: string): boolean => warning.includes(alarm)));
  return { ok: summary.ok && alarms.length === 0, looks: summary.looks, problems: [...summary.problems, ...alarms.map((alarm: string): string => `the page's safety net fired: ${alarm}`)] };
}

export function walkLines(summary: WalkSummary): string[] {
  const looks: string[] = summary.looks.map((look: WalkLook): string => `${look.missing.length === 0 ? 'ok  ' : 'FAIL'} ${look.zone.padEnd(14)} +${String(look.afterMs).padStart(5)} ms  ${look.live - look.missing.length}/${look.live} drawn${look.missing.length === 0 ? '' : `  missing: ${look.missing.join(', ')}`}`);
  return [...looks, ...summary.problems.map((problem: string): string => `problem: ${problem}`), summary.ok ? 'BODY WALK OK: every live monster on the route was drawn' : 'BODY WALK FAILED'];
}
