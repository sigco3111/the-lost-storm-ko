import { createHash } from 'node:crypto';
import { fields, flag, items, numeric, text } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';
import type { FightPlan, FightRaw, FightWave, RendererCounts } from '../src/bench/fight-bench.ts';

export const FIGHT_DEFAULTS = {
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  port: 5471,
  width: 1280,
  height: 800,
  scale: 2,
  hero: 'woman',
  quietLoad: 12,
} as const;

export const FIGHT_PROFILE = {
  base: 'fight-bench-profile',
  hashLength: 10,
} as const;

export const FIGHT_LIMITS = {
  over: [20, 33, 50],
  percentiles: [0.5, 0.95, 0.99],
  workDrift: 0.1,
  percent: 100,
  msPerSecond: 1000,
  decimals: 2,
} as const;

export interface WaveMix {
  readonly monster: string;
  readonly count: number;
}

export const FIGHT_SCENARIO = {
  name: 'hall-brawl-v1',
  zone: 'hall_of_time',
  seed: 20261116,
  level: 30,
  weapon: 'groundbreaker',
  bar: ['forkline', 'thunderclap', 'squall', 'downdraught', 'standing_storm', 'fire_burst'],
  rotation: [1, 2, 3, 4, 5, 0],
  castEveryMs: 280,
  waveEveryMs: 1500,
  lastWaveBeforeEndMs: 4000,
  cycle: [
    { monster: 'timekeeper_adept', count: 4 },
    { monster: 'timekeeper_binder', count: 3 },
    { monster: 'unfinished_brute', count: 2 },
    { monster: 'cinder_hound', count: 4 },
    { monster: 'unfinished_thrower', count: 3 },
    { monster: 'mender', count: 2 },
    { monster: 'ember_spitter', count: 3 },
    { monster: 'timekeeper_marshal', count: 1 },
  ],
  full: { warmupMs: 15000, measureMs: 40000 },
  short: { warmupMs: 4000, measureMs: 10000 },
} as const;

export interface FightArgs {
  readonly url: string | null;
  readonly chrome: string;
  readonly port: number;
  readonly hero: string;
  readonly short: boolean;
  readonly uncapped: boolean;
  readonly out: string | null;
  readonly compare: string | null;
  readonly to: string | null;
}

export interface FightMeta {
  readonly plan: string;
  readonly zone: string;
  readonly commit: string;
  readonly at: string;
  readonly load: number;
  readonly quiet: boolean;
  readonly capped: boolean;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly warmupMs: number;
  readonly measureMs: number;
}

export interface FrameStats {
  readonly frames: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly worstMs: number;
  readonly over20: number;
  readonly over33: number;
  readonly over50: number;
  readonly averageFps: number;
}

export interface Spread {
  readonly median: number;
  readonly max: number;
}

export interface LongTasks {
  readonly count: number;
  readonly totalMs: number;
}

export interface RendererDrift {
  readonly programsStart: number;
  readonly programsEnd: number;
  readonly geometriesStart: number;
  readonly geometriesEnd: number;
  readonly texturesStart: number;
  readonly texturesEnd: number;
}

export interface HeapDrift {
  readonly startMegabytes: number | null;
  readonly endMegabytes: number | null;
}

export interface FightWork {
  readonly peakLive: number;
  readonly kills: number;
  readonly hits: number;
  readonly drops: number;
  readonly casts: number;
  readonly heroDeaths: number;
}

export interface FightReport {
  readonly meta: FightMeta;
  readonly frames: FrameStats;
  readonly longTasks: LongTasks;
  readonly drawCalls: Spread;
  readonly triangles: Spread;
  readonly renderer: RendererDrift;
  readonly heap: HeapDrift;
  readonly work: FightWork;
  readonly problems: readonly string[];
}

export function fightProfileFor(checkout: string): string {
  return `${FIGHT_PROFILE.base}-${createHash('sha256').update(checkout).digest('hex').slice(0, FIGHT_PROFILE.hashLength)}`;
}

export function fightWaves(cycle: readonly WaveMix[], everyMs: number, untilMs: number): FightWave[] {
  if (cycle.length === 0 || everyMs <= 0) return [];
  return Array.from({ length: Math.floor(untilMs / everyMs) + 1 }, (_unused: unknown, index: number): FightWave | null => {
    const mix: WaveMix | undefined = cycle[index % cycle.length];
    return mix === undefined ? null : { atMs: index * everyMs, monster: mix.monster, count: mix.count };
  }).filter((wave: FightWave | null): wave is FightWave => wave !== null);
}

export function fightPlan(short: boolean): FightPlan {
  const timing: { readonly warmupMs: number; readonly measureMs: number } = short ? FIGHT_SCENARIO.short : FIGHT_SCENARIO.full;
  const untilMs: number = timing.warmupMs + timing.measureMs - FIGHT_SCENARIO.lastWaveBeforeEndMs;
  return {
    zone: FIGHT_SCENARIO.zone,
    hero: { seed: FIGHT_SCENARIO.seed, level: FIGHT_SCENARIO.level, weapon: FIGHT_SCENARIO.weapon, bar: FIGHT_SCENARIO.bar },
    waves: fightWaves(FIGHT_SCENARIO.cycle, FIGHT_SCENARIO.waveEveryMs, untilMs),
    rotation: FIGHT_SCENARIO.rotation,
    castEveryMs: FIGHT_SCENARIO.castEveryMs,
    warmupMs: timing.warmupMs,
    measureMs: timing.measureMs,
  };
}

export function planName(short: boolean, capped: boolean): string {
  return `${FIGHT_SCENARIO.name}${short ? '-short' : ''}${capped ? '' : '-uncapped'}`;
}

function valueOf(argv: readonly string[], name: string): string | null {
  const at: number = argv.indexOf(name);
  if (at < 0) return null;
  const value: string | undefined = argv[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}

export function fightArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): FightArgs {
  const portText: string | null = valueOf(argv, '--port');
  const port: number = Number(portText ?? FIGHT_DEFAULTS.port);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`--port must be a port number, not ${portText ?? ''}`);
  const hero: string = valueOf(argv, '--hero') ?? FIGHT_DEFAULTS.hero;
  if (!/^[a-z]+$/.test(hero)) throw new Error(`--hero must be a hero id, not ${hero}`);
  const url: string | null = valueOf(argv, '--url');
  const to: string | null = valueOf(argv, '--to');
  const compare: string | null = valueOf(argv, '--compare');
  if (to !== null && compare === null) throw new Error('--to needs --compare <earlier.json> to compare against');
  return { url: url === null ? null : url.replace(/\/+$/, ''), chrome: valueOf(argv, '--chrome') ?? env['CHROME_PATH'] ?? FIGHT_DEFAULTS.chrome, port, hero, short: argv.includes('--short'), uncapped: argv.includes('--uncapped'), out: valueOf(argv, '--out'), compare, to };
}

export function percentile(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) return 0;
  const rank: number = Math.min(sorted.length, Math.max(1, Math.ceil(share * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

function ascending(values: readonly number[]): number[] {
  return values.toSorted((a: number, b: number): number => a - b);
}

function rounded(value: number): number {
  const scale: number = 10 ** FIGHT_LIMITS.decimals;
  return Math.round(value * scale) / scale;
}

export function frameStats(frames: readonly number[]): FrameStats {
  const sorted: number[] = ascending(frames);
  const total: number = frames.reduce((sum: number, frame: number): number => sum + frame, 0);
  const [over20, over33, over50] = FIGHT_LIMITS.over.map((limit: number): number => frames.filter((frame: number): boolean => frame > limit).length);
  const [median, p95, p99] = FIGHT_LIMITS.percentiles.map((share: number): number => rounded(percentile(sorted, share)));
  return {
    frames: frames.length,
    medianMs: median ?? 0,
    p95Ms: p95 ?? 0,
    p99Ms: p99 ?? 0,
    worstMs: rounded(sorted.at(-1) ?? 0),
    over20: over20 ?? 0,
    over33: over33 ?? 0,
    over50: over50 ?? 0,
    averageFps: total <= 0 ? 0 : rounded((frames.length * FIGHT_LIMITS.msPerSecond) / total),
  };
}

export function spread(values: readonly number[]): Spread {
  const sorted: number[] = ascending(values);
  return { median: percentile(sorted, FIGHT_LIMITS.percentiles[0]), max: sorted.at(-1) ?? 0 };
}

function numbers(value: unknown, where: string): number[] {
  return items(value, where).map((entry: unknown, index: number): number => numeric({ entry }, 'entry', `${where}[${index}]`));
}

function strings(value: unknown, where: string): string[] {
  return items(value, where).map((entry: unknown, index: number): string => text({ entry }, 'entry', `${where}[${index}]`));
}

function maybeNumber(source: Fields, key: string, where: string): number | null {
  return source[key] === null ? null : numeric(source, key, where);
}

function readCounts(value: unknown, where: string): RendererCounts {
  const source: Fields = fields(value, where);
  return { programs: numeric(source, 'programs', where), geometries: numeric(source, 'geometries', where), textures: numeric(source, 'textures', where), heapMegabytes: maybeNumber(source, 'heapMegabytes', where) };
}

export function readRaw(value: unknown): FightRaw {
  const source: Fields = fields(value, 'fight');
  return {
    zone: text(source, 'zone', 'fight'),
    frames: numbers(source['frames'], 'fight.frames'),
    calls: numbers(source['calls'], 'fight.calls'),
    triangles: numbers(source['triangles'], 'fight.triangles'),
    longTasks: numbers(source['longTasks'], 'fight.longTasks'),
    start: readCounts(source['start'], 'fight.start'),
    end: readCounts(source['end'], 'fight.end'),
    peakLive: numeric(source, 'peakLive', 'fight'),
    kills: numeric(source, 'kills', 'fight'),
    hits: numeric(source, 'hits', 'fight'),
    drops: numeric(source, 'drops', 'fight'),
    casts: numeric(source, 'casts', 'fight'),
    heroDeaths: numeric(source, 'heroDeaths', 'fight'),
    problems: strings(source['problems'], 'fight.problems'),
  };
}

export function fightReport(raw: FightRaw, meta: FightMeta): FightReport {
  const problems: string[] = [...raw.problems];
  if (raw.zone !== meta.zone) problems.push(`the fight ran in ${raw.zone}, not ${meta.zone}`);
  if (raw.frames.length === 0) problems.push('no frames were measured');
  if (raw.heroDeaths > 0) problems.push(`the hero died ${raw.heroDeaths} times`);
  if (raw.kills === 0) problems.push('nothing was killed');
  return {
    meta,
    frames: frameStats(raw.frames),
    longTasks: { count: raw.longTasks.length, totalMs: rounded(raw.longTasks.reduce((sum: number, task: number): number => sum + task, 0)) },
    drawCalls: spread(raw.calls),
    triangles: spread(raw.triangles),
    renderer: { programsStart: raw.start.programs, programsEnd: raw.end.programs, geometriesStart: raw.start.geometries, geometriesEnd: raw.end.geometries, texturesStart: raw.start.textures, texturesEnd: raw.end.textures },
    heap: { startMegabytes: raw.start.heapMegabytes, endMegabytes: raw.end.heapMegabytes },
    work: { peakLive: raw.peakLive, kills: raw.kills, hits: raw.hits, drops: raw.drops, casts: raw.casts, heroDeaths: raw.heroDeaths },
    problems,
  };
}

function readMeta(value: unknown): FightMeta {
  const where: string = 'report.meta';
  const source: Fields = fields(value, where);
  return {
    plan: text(source, 'plan', where),
    zone: text(source, 'zone', where),
    commit: text(source, 'commit', where),
    at: text(source, 'at', where),
    load: numeric(source, 'load', where),
    quiet: flag(source, 'quiet', where),
    capped: flag(source, 'capped', where),
    width: numeric(source, 'width', where),
    height: numeric(source, 'height', where),
    scale: numeric(source, 'scale', where),
    warmupMs: numeric(source, 'warmupMs', where),
    measureMs: numeric(source, 'measureMs', where),
  };
}

export function readReport(value: unknown): FightReport {
  const source: Fields = fields(value, 'report');
  const frames: Fields = fields(source['frames'], 'report.frames');
  const longTasks: Fields = fields(source['longTasks'], 'report.longTasks');
  const drawCalls: Fields = fields(source['drawCalls'], 'report.drawCalls');
  const triangles: Fields = fields(source['triangles'], 'report.triangles');
  const renderer: Fields = fields(source['renderer'], 'report.renderer');
  const heap: Fields = fields(source['heap'], 'report.heap');
  const work: Fields = fields(source['work'], 'report.work');
  return {
    meta: readMeta(source['meta']),
    frames: { frames: numeric(frames, 'frames', 'report.frames'), medianMs: numeric(frames, 'medianMs', 'report.frames'), p95Ms: numeric(frames, 'p95Ms', 'report.frames'), p99Ms: numeric(frames, 'p99Ms', 'report.frames'), worstMs: numeric(frames, 'worstMs', 'report.frames'), over20: numeric(frames, 'over20', 'report.frames'), over33: numeric(frames, 'over33', 'report.frames'), over50: numeric(frames, 'over50', 'report.frames'), averageFps: numeric(frames, 'averageFps', 'report.frames') },
    longTasks: { count: numeric(longTasks, 'count', 'report.longTasks'), totalMs: numeric(longTasks, 'totalMs', 'report.longTasks') },
    drawCalls: { median: numeric(drawCalls, 'median', 'report.drawCalls'), max: numeric(drawCalls, 'max', 'report.drawCalls') },
    triangles: { median: numeric(triangles, 'median', 'report.triangles'), max: numeric(triangles, 'max', 'report.triangles') },
    renderer: { programsStart: numeric(renderer, 'programsStart', 'report.renderer'), programsEnd: numeric(renderer, 'programsEnd', 'report.renderer'), geometriesStart: numeric(renderer, 'geometriesStart', 'report.renderer'), geometriesEnd: numeric(renderer, 'geometriesEnd', 'report.renderer'), texturesStart: numeric(renderer, 'texturesStart', 'report.renderer'), texturesEnd: numeric(renderer, 'texturesEnd', 'report.renderer') },
    heap: { startMegabytes: maybeNumber(heap, 'startMegabytes', 'report.heap'), endMegabytes: maybeNumber(heap, 'endMegabytes', 'report.heap') },
    work: { peakLive: numeric(work, 'peakLive', 'report.work'), kills: numeric(work, 'kills', 'report.work'), hits: numeric(work, 'hits', 'report.work'), drops: numeric(work, 'drops', 'report.work'), casts: numeric(work, 'casts', 'report.work'), heroDeaths: numeric(work, 'heroDeaths', 'report.work') },
    problems: strings(source['problems'], 'report.problems'),
  };
}

export type Better = 'lower' | 'higher' | 'same';

export interface Metric {
  readonly label: string;
  readonly better: Better;
  readonly read: (report: FightReport) => number | null;
}

export const METRICS: readonly Metric[] = [
  { label: 'frame median ms', better: 'lower', read: (report: FightReport): number => report.frames.medianMs },
  { label: 'frame p95 ms', better: 'lower', read: (report: FightReport): number => report.frames.p95Ms },
  { label: 'frame p99 ms', better: 'lower', read: (report: FightReport): number => report.frames.p99Ms },
  { label: 'worst frame ms', better: 'lower', read: (report: FightReport): number => report.frames.worstMs },
  { label: 'frames > 20 ms', better: 'lower', read: (report: FightReport): number => report.frames.over20 },
  { label: 'frames > 33 ms', better: 'lower', read: (report: FightReport): number => report.frames.over33 },
  { label: 'frames > 50 ms', better: 'lower', read: (report: FightReport): number => report.frames.over50 },
  { label: 'average fps', better: 'higher', read: (report: FightReport): number => report.frames.averageFps },
  { label: 'long tasks', better: 'lower', read: (report: FightReport): number => report.longTasks.count },
  { label: 'long task ms', better: 'lower', read: (report: FightReport): number => report.longTasks.totalMs },
  { label: 'draw calls median', better: 'lower', read: (report: FightReport): number => report.drawCalls.median },
  { label: 'draw calls max', better: 'lower', read: (report: FightReport): number => report.drawCalls.max },
  { label: 'triangles median', better: 'lower', read: (report: FightReport): number => report.triangles.median },
  { label: 'triangles max', better: 'lower', read: (report: FightReport): number => report.triangles.max },
  { label: 'programs added', better: 'lower', read: (report: FightReport): number => report.renderer.programsEnd - report.renderer.programsStart },
  { label: 'geometries added', better: 'lower', read: (report: FightReport): number => report.renderer.geometriesEnd - report.renderer.geometriesStart },
  { label: 'textures added', better: 'lower', read: (report: FightReport): number => report.renderer.texturesEnd - report.renderer.texturesStart },
  { label: 'heap growth MB', better: 'lower', read: (report: FightReport): number | null => (report.heap.startMegabytes === null || report.heap.endMegabytes === null ? null : rounded(report.heap.endMegabytes - report.heap.startMegabytes)) },
  { label: 'peak live', better: 'same', read: (report: FightReport): number => report.work.peakLive },
  { label: 'kills', better: 'same', read: (report: FightReport): number => report.work.kills },
  { label: 'hits', better: 'same', read: (report: FightReport): number => report.work.hits },
  { label: 'drops', better: 'same', read: (report: FightReport): number => report.work.drops },
  { label: 'casts', better: 'same', read: (report: FightReport): number => report.work.casts },
];

function cell(value: number | null): string {
  return value === null ? '-' : String(rounded(value));
}

export function reportLines(report: FightReport): string[] {
  const { meta, frames, longTasks, drawCalls, triangles, renderer, heap, work } = report;
  return [
    `fight bench ${meta.plan} in ${meta.zone} at ${meta.commit}, ${meta.width}x${meta.height} @${meta.scale}x, ${meta.capped ? 'vsync capped' : 'uncapped'}, ${meta.warmupMs / FIGHT_LIMITS.msPerSecond} s warm-up, ${meta.measureMs / FIGHT_LIMITS.msPerSecond} s measured`,
    ...(meta.quiet ? [] : [`WARNING: the machine was not quiet (1-minute load ${meta.load}); these numbers are not a baseline`]),
    `frames     ${frames.frames} at ${frames.averageFps} fps: median ${frames.medianMs} ms, p95 ${frames.p95Ms}, p99 ${frames.p99Ms}, worst ${frames.worstMs}`,
    `slow       >20 ms ${frames.over20}, >33 ms ${frames.over33}, >50 ms ${frames.over50}; long tasks ${longTasks.count} (${longTasks.totalMs} ms)`,
    `draws      calls median ${drawCalls.median} max ${drawCalls.max}; triangles median ${triangles.median} max ${triangles.max}`,
    `renderer   programs ${renderer.programsStart} -> ${renderer.programsEnd}, geometries ${renderer.geometriesStart} -> ${renderer.geometriesEnd}, textures ${renderer.texturesStart} -> ${renderer.texturesEnd}`,
    `heap       ${cell(heap.startMegabytes)} MB -> ${cell(heap.endMegabytes)} MB`,
    `work       peak live ${work.peakLive}, kills ${work.kills}, hits ${work.hits}, drops ${work.drops}, casts ${work.casts}, hero deaths ${work.heroDeaths}`,
    ...report.problems.map((problem: string): string => `problem: ${problem}`),
  ];
}

export interface MetricDelta {
  readonly label: string;
  readonly before: number | null;
  readonly after: number | null;
  readonly delta: number | null;
  readonly percent: number | null;
  readonly better: Better;
}

export function compareReports(before: FightReport, after: FightReport): MetricDelta[] {
  return METRICS.map((metric: Metric): MetricDelta => {
    const was: number | null = metric.read(before);
    const now: number | null = metric.read(after);
    const delta: number | null = was === null || now === null ? null : rounded(now - was);
    const percent: number | null = delta === null || was === null || was === 0 ? null : rounded((delta / Math.abs(was)) * FIGHT_LIMITS.percent);
    return { label: metric.label, before: was, after: now, delta, percent, better: metric.better };
  });
}

export function compareWarnings(before: FightReport, after: FightReport): string[] {
  const shape: string[] = (['plan', 'zone', 'capped', 'width', 'height', 'scale', 'measureMs'] as const).filter((key: keyof FightMeta): boolean => before.meta[key] !== after.meta[key]).map((key: keyof FightMeta): string => `the runs differ in ${key}: ${String(before.meta[key])} vs ${String(after.meta[key])}`);
  const drift: string[] = (['kills', 'hits'] as const).filter((key: keyof FightWork): boolean => Math.abs(after.work[key] - before.work[key]) > FIGHT_LIMITS.workDrift * Math.max(1, before.work[key])).map((key: keyof FightWork): string => `the runs did different work: ${key} ${before.work[key]} vs ${after.work[key]}`);
  const loud: string[] = [before, after].filter((report: FightReport): boolean => !report.meta.quiet).map((report: FightReport): string => `the run at ${report.meta.commit} (${report.meta.at}) was taken on a busy machine (load ${report.meta.load})`);
  return [...shape, ...drift, ...loud];
}

function verdict(entry: MetricDelta): string {
  if (entry.delta === null || entry.delta === 0 || entry.better === 'same') return '';
  const improved: boolean = entry.better === 'lower' ? entry.delta < 0 : entry.delta > 0;
  return improved ? '  better' : '  worse';
}

export function compareLines(before: FightReport, after: FightReport): string[] {
  const rows: string[] = compareReports(before, after).map((entry: MetricDelta): string => `${entry.label.padEnd(20)} ${cell(entry.before).padStart(10)} ${cell(entry.after).padStart(10)} ${(entry.delta === null ? '-' : `${entry.delta > 0 ? '+' : ''}${entry.delta}`).padStart(10)} ${(entry.percent === null ? '' : `${entry.percent > 0 ? '+' : ''}${entry.percent}%`).padStart(9)}${verdict(entry)}`);
  return [`compare ${before.meta.commit} (${before.meta.at}) -> ${after.meta.commit} (${after.meta.at})`, `${'metric'.padEnd(20)} ${'before'.padStart(10)} ${'after'.padStart(10)} ${'delta'.padStart(10)} ${'change'.padStart(9)}`, ...rows, ...compareWarnings(before, after).map((warning: string): string => `warning: ${warning}`)];
}

export function isQuiet(load: number, ownerPlaying: boolean): boolean {
  return !ownerPlaying && load < FIGHT_DEFAULTS.quietLoad;
}
