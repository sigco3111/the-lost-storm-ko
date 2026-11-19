import { readFileSync, writeFileSync } from 'node:fs';
import { loadContent } from '../sim/content/content.ts';
import { isFields } from '../sim/content/read.ts';
import { zone as readZone } from '../sim/content/parse-world.ts';
import type { Condition } from '../sim/content/condition-types.ts';
import type { Content, PropDef, ZoneDef, ZoneExit, ZoneProp } from '../sim/content/types.ts';
import { screenLoad } from '../sim/cave/checks.ts';
import type { CaveRankShare, CaveRequest, ScreenLimit } from '../sim/cave/generate.ts';
import { requestProblem } from '../sim/cave/generate.ts';
import type { MadeResult } from '../sim/cave/make.ts';
import { makeCave } from '../sim/cave/make.ts';
import { CAVE_LAYOUT } from '../sim/cave/layout.ts';
import type { CaveKit } from '../sim/cave/kit.ts';
import { readKit } from '../sim/cave/kit.ts';
import type { CaveDoor, CaveNaming } from '../sim/cave/zone.ts';
import type { WingHost } from '../sim/cave/wing.ts';
import { wingTop } from '../sim/cave/wing.ts';
import { TERRAIN_MARKS } from '../sim/content/terrain-types.ts';
import type { Vec2 } from '../sim/math.ts';
import { distance } from '../sim/math.ts';
import { propBlockers } from '../sim/nav/grid.ts';
import type { GapFinding } from '../sim/world/zone-gaps.ts';
import { analyseGaps, stageWorld } from '../sim/world/zone-gaps.ts';
import { createTerrainSight } from '../src/render/terrain-sight.ts';
import type { TerrainSight } from '../src/render/terrain-sight.ts';
import type { ZoneSweep } from './hidden-sweep.ts';
import { sweepFailed, sweepZone } from './hidden-sweep.ts';

export const CAVE_CLI = {
  reference: 'under_hall',
  seeds: 8,
  repairs: 12,
  repairReach: 4,
  notchReach: 2,
  columns: 120,
  rows: 120,
  chambers: 12,
  packs: 24,
  scale: 1,
  rooms: 1,
} as const;

export interface CaveOptions {
  readonly kit: string;
  readonly id: string;
  readonly name: string;
  readonly seed: number;
  readonly seeds: number;
  readonly request: Omit<CaveRequest, 'seed' | 'screen'>;
  readonly up: CaveDoor;
  readonly down: CaveDoor | null;
  readonly attach: CaveAttach | null;
  readonly out: string | null;
}

export interface CaveAttach {
  readonly zone: string;
  readonly exit: string;
}

export interface RepairScope {
  readonly props: number;
  readonly columns: number;
  readonly rows: number;
}

export interface CaveVerdict {
  readonly seed: number;
  readonly problems: readonly string[];
  readonly record: Record<string, unknown> | null;
  readonly zone: ZoneDef | null;
  readonly removed: number;
  readonly descent: { readonly at: Vec2; readonly arrival: Vec2 } | null;
}

function option(args: readonly string[], name: string): string | null {
  const at: number = args.indexOf(`--${name}`);
  return at < 0 ? null : (args[at + 1] ?? null);
}

function door(spec: string, id: string, gate: string | null): CaveDoor {
  const [to, toExit] = spec.split(':');
  if (to === undefined || toExit === undefined || to === '' || toExit === '') throw new Error(`a door is zone:exit, not ${spec}`);
  const requires: Condition[] = gate === null ? [] : [{ type: 'visited', zone: gate, not: false }];
  return { id, to, toExit, requires, lockedHint: '', hiddenWhenLocked: gate !== null };
}

function attachment(spec: string | null): CaveAttach | null {
  if (spec === null) return null;
  const [zone, exit] = spec.split(':');
  if (zone === undefined || exit === undefined || zone === '' || exit === '') throw new Error(`--attach takes zone:exit, the exit the wing grows from, not ${spec}`);
  return { zone, exit };
}

function rankShares(spec: string | null): CaveRankShare[] {
  if (spec === null) return [];
  return spec.split(',').map((part: string): CaveRankShare => {
    const [rank, share] = part.split(':');
    if (rank === undefined || share === undefined || rank === '' || share === '' || !Number.isFinite(Number(share))) throw new Error(`--ranks takes rank:share pairs, deepest first, not ${part}`);
    return { rank, share: Number(share) };
  });
}

export function caveOptions(args: readonly string[]): CaveOptions {
  const number = (name: string, fallback: number): number => {
    const raw: string | null = option(args, name);
    const value: number = raw === null ? fallback : Number(raw);
    if (!Number.isFinite(value)) throw new Error(`--${name} takes a number`);
    return value;
  };
  const attach: CaveAttach | null = attachment(option(args, 'attach'));
  const id: string | null = option(args, 'id') ?? attach?.zone ?? null;
  const up: string | null = option(args, 'up') ?? (attach === null ? null : `${attach.zone}:${attach.exit}`);
  if (id === null || up === null) throw new Error('usage: node tools/cave-generate.ts --kit data/kits/<kit>.json --id <zone id> --name <name> --up <zone:exit> [--down <zone:exit>] | --attach <zone:exit> --from <level> --to <level> [--seed N --seeds N --columns N --rows N --chambers N --packs N --scale X --rooms X --ranks rank:share,... --out FILE]');
  const down: string | null = option(args, 'down');
  if (option(args, 'from') === null || option(args, 'to') === null) throw new Error('--from and --to set the level band and are required');
  if (!Number.isInteger(number('seeds', CAVE_CLI.seeds)) || number('seeds', CAVE_CLI.seeds) < 1) throw new Error('--seeds takes a whole number of at least 1');
  const request: Omit<CaveRequest, 'seed' | 'screen'> = { columns: number('columns', CAVE_CLI.columns), rows: number('rows', CAVE_CLI.rows), chambers: number('chambers', CAVE_CLI.chambers), levels: { from: number('from', 1), to: number('to', 1) }, packs: number('packs', CAVE_CLI.packs), packScale: number('scale', CAVE_CLI.scale), roomScale: number('rooms', CAVE_CLI.rooms), top: number('top', CAVE_LAYOUT.top), ranks: rankShares(option(args, 'ranks')) };
  const refused: string | null = requestProblem(request);
  if (refused !== null) throw new Error(refused);
  return {
    kit: option(args, 'kit') ?? 'data/kits/hourfall.json',
    id,
    name: option(args, 'name') ?? id,
    seed: number('seed', 1),
    seeds: number('seeds', CAVE_CLI.seeds),
    request,
    up: door(up, 'up', null),
    down: down === null ? null : door(down, 'down', option(args, 'down-gate')),
    attach,
    out: option(args, 'out'),
  };
}

function withZone(content: Content, zone: ZoneDef): Content {
  return { ...content, zones: new Map<string, ZoneDef>([...content.zones, [zone.id, zone]]) };
}

function blockerNear(content: Content, props: readonly ZoneProp[], finding: GapFinding, scope: RepairScope): number {
  let best: number = -1;
  let bestGap: number = CAVE_CLI.repairReach;
  props.forEach((placed: ZoneProp, at: number): void => {
    if (at < scope.props) return;
    const def: PropDef | undefined = content.props.get(placed.prop);
    if (def === undefined || propBlockers(def, placed.x, placed.z, placed.rotationDegrees).length === 0) return;
    const gap: number = distance(placed, finding) - def.blockRadius - def.blockLength / 2;
    if (gap < bestGap) {
      best = at;
      bestGap = gap;
    }
  });
  return best;
}

function textRows(record: Record<string, unknown>, key: 'tiles' | 'levels'): string[] | null {
  const holder: unknown = key === 'tiles' ? record : record['terrain'];
  if (!isFields(holder)) return null;
  const value: unknown = holder[key];
  return Array.isArray(value) && value.every((row: unknown): row is string => typeof row === 'string') ? value : null;
}

function setChar(row: string, at: number, value: string): string {
  return `${row.slice(0, at)}${value}${row.slice(at + 1)}`;
}

export function fillNotch(record: Record<string, unknown>, cellSize: number, finding: GapFinding, scope: RepairScope): boolean {
  const tiles: string[] | null = textRows(record, 'tiles');
  const levels: string[] | null = textRows(record, 'levels');
  if (tiles === null || levels === null) return false;
  const column: number = Math.floor(finding.x / cellSize);
  const row: number = Math.floor(finding.z / cellSize);
  let best: { readonly column: number; readonly row: number; readonly tile: string; readonly level: string; readonly gap: number } | null = null;
  for (let dr: number = -CAVE_CLI.notchReach; dr <= CAVE_CLI.notchReach; dr += 1) {
    for (let dc: number = -CAVE_CLI.notchReach; dc <= CAVE_CLI.notchReach; dc += 1) {
      const c: number = column + dc;
      const r: number = row + dr;
      if (tiles[r]?.charAt(c) !== ' ' || (c < scope.columns && r < scope.rows)) continue;
      const around: { readonly tile: string; readonly level: string }[] = [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([nc, nr]: number[]): { readonly tile: string; readonly level: string }[] => {
        const tile: string = tiles[r + (nr ?? 0)]?.charAt(c + (nc ?? 0)) ?? ' ';
        const level: string = levels[r + (nr ?? 0)]?.charAt(c + (nc ?? 0)) ?? '';
        return tile === ' ' || tile === '' ? [] : [{ tile, level }];
      });
      const first = around[0];
      if (first === undefined || first.level === TERRAIN_MARKS.ramp || around.some((side): boolean => side.level !== first.level)) continue;
      const gap: number = Math.hypot((c + 0.5) * cellSize - finding.x, (r + 0.5) * cellSize - finding.z);
      if (best === null || gap < best.gap) best = { column: c, row: r, tile: first.tile, level: first.level, gap };
    }
  }
  if (best === null) return false;
  tiles[best.row] = setChar(tiles[best.row] ?? '', best.column, best.tile);
  levels[best.row] = setChar(levels[best.row] ?? '', best.column, best.level);
  return true;
}

function gapFindings(content: Content, zone: ZoneDef): readonly GapFinding[] {
  const staged: Content = withZone(content, zone);
  return analyseGaps(staged, stageWorld(staged, zone.id)).findings;
}

function findingKey(finding: GapFinding): string {
  return `${finding.kind} ${finding.x.toFixed(1)} ${finding.z.toFixed(1)}`;
}

export function repairScope(host: Readonly<Record<string, unknown>> | null): RepairScope {
  if (host === null) return { props: 0, columns: 0, rows: 0 };
  const props: unknown = host['props'];
  const tiles: string[] | null = textRows({ tiles: host['tiles'] }, 'tiles');
  return { props: Array.isArray(props) ? props.length : 0, columns: tiles?.[0]?.length ?? 0, rows: tiles?.length ?? 0 };
}

function hostFindings(content: Content, host: Readonly<Record<string, unknown>> | null, id: string): ReadonlySet<string> {
  if (host === null) return new Set<string>();
  return new Set<string>(gapFindings(content, readZone(host, id)).map(findingKey));
}

export function judgeSeed(content: Content, kit: CaveKit, options: CaveOptions, seed: number, limit: ScreenLimit, host: Readonly<Record<string, unknown>> | null = null): CaveVerdict {
  const naming: CaveNaming = { id: options.id, name: options.name, up: options.up, down: options.down };
  if (options.attach !== null && host === null) return { seed, problems: [`no host zone ${options.attach.zone} to attach to`], record: null, zone: null, removed: 0, descent: null };
  const wingHost: WingHost | null = options.attach === null || host === null ? null : { record: host, exit: options.attach.exit };
  const made: MadeResult = makeCave(content, kit, { ...options.request, seed, screen: limit }, naming, wingHost);
  if (!made.ok) return { seed, problems: [made.problem], record: null, zone: null, removed: 0, descent: null };
  const { record } = made.cave;
  let zone: ZoneDef = made.cave.zone;
  const moved: ZoneExit | undefined = options.attach === null ? undefined : zone.exits.find((entry: ZoneExit): boolean => entry.id === options.attach?.exit);
  const descent: { readonly at: Vec2; readonly arrival: Vec2 } = moved === undefined ? { at: made.cave.layout.descent, arrival: made.cave.layout.descentArrival } : { at: { x: moved.x, z: moved.z }, arrival: moved.arrival };
  const scope: RepairScope = repairScope(wingHost === null ? null : host);
  const known: ReadonlySet<string> = hostFindings(content, wingHost === null ? null : host, options.id);
  let removed: number = 0;
  for (let round: number = 0; round <= CAVE_CLI.repairs; round += 1) {
    const findings: readonly GapFinding[] = gapFindings(content, zone).filter((finding: GapFinding): boolean => !known.has(findingKey(finding)));
    if (findings.length === 0) break;
    const drop: Set<number> = new Set<number>(findings.map((finding: GapFinding): number => blockerNear(content, zone.props, finding, scope)).filter((at: number): boolean => at >= 0));
    const filled: number = findings.filter((finding: GapFinding): boolean => blockerNear(content, zone.props, finding, scope) < 0 && fillNotch(record, zone.cellSize, finding, scope)).length;
    if ((drop.size === 0 && filled === 0) || round === CAVE_CLI.repairs) return { seed, problems: findings.map((finding: GapFinding): string => `${finding.kind} gap at ${finding.x},${finding.z}`), record: null, zone: null, removed, descent: null };
    removed += drop.size + filled;
    record['props'] = zone.props.filter((_placed, at: number): boolean => !drop.has(at)).map((placed: ZoneProp): Record<string, unknown> => ({ prop: placed.prop, x: placed.x, z: placed.z, y: placed.y, rotationDegrees: placed.rotationDegrees }));
    zone = readZone(record, options.id);
  }
  const sight: TerrainSight | null = createTerrainSight(zone);
  if (sight !== null) {
    const swept: ZoneSweep = sweepZone(withZone(content, zone), zone, sight);
    if (sweepFailed([swept])) return { seed, problems: [`hidden or missed floor: ${swept.cutHidden.length} hidden, ${swept.missed.length} missed, ${swept.window.after.length + swept.bare.after.length} off-floor clicks`], record: null, zone: null, removed, descent: null };
  }
  return { seed, problems: [], record, zone, removed, descent };
}

function compact(value: unknown): string {
  return JSON.stringify(value);
}

export function formatZone(record: Readonly<Record<string, unknown>>): string {
  const lines: string[] = Object.entries(record).map(([key, value]: [string, unknown]): string => {
    if (Array.isArray(value) && value.length > 0) return `  ${compact(key)}: [\n${value.map((entry: unknown): string => `    ${compact(entry)}`).join(',\n')}\n  ]`;
    if (key === 'terrain' && isFields(value)) {
      const { levels, ...rest } = value;
      const head: string = compact(rest).slice(0, -1);
      const rows: string = Array.isArray(levels) ? levels.map((row: unknown): string => `    ${compact(row)}`).join(',\n') : '';
      return `  ${compact(key)}: ${head}, "levels": [\n${rows}\n  ]}`;
    }
    return `  ${compact(key)}: ${compact(value)}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

function monsters(zone: ZoneDef): number {
  return zone.packs.reduce((sum: number, pack): number => sum + pack.members.reduce((count: number, member): number => count + member.count, 0), 0);
}

export function attachedOptions(options: CaveOptions, host: Readonly<Record<string, unknown>>, attach: CaveAttach): CaveOptions {
  const top: number | string = wingTop(host, attach.exit);
  if (typeof top === 'string') throw new Error(top);
  const request: Omit<CaveRequest, 'seed' | 'screen'> = { ...options.request, top };
  const refused: string | null = requestProblem(request);
  if (refused !== null) throw new Error(refused);
  return { ...options, request };
}

function hostRecord(zone: string): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(readFileSync(`data/zones/${zone}.json`, 'utf8'));
  if (!isFields(value)) throw new Error(`data/zones/${zone}.json is not a zone`);
  return value;
}

function main(): void {
  const options: CaveOptions = caveOptions(process.argv.slice(2));
  const kit: CaveKit = readKit(JSON.parse(readFileSync(options.kit, 'utf8')), options.kit);
  const content: Content = loadContent();
  const reference: ZoneDef | undefined = content.zones.get(CAVE_CLI.reference);
  if (reference === undefined) throw new Error(`no reference zone ${CAVE_CLI.reference}`);
  const limit: ScreenLimit = screenLoad(content, reference);
  const host: Readonly<Record<string, unknown>> | null = options.attach === null ? null : hostRecord(options.attach.zone);
  const run: CaveOptions = host === null || options.attach === null ? options : attachedOptions(options, host, options.attach);
  for (let seed: number = run.seed; seed < run.seed + run.seeds; seed += 1) {
    const verdict: CaveVerdict = judgeSeed(content, kit, run, seed, limit, host);
    if (verdict.record === null || verdict.zone === null) {
      process.stderr.write(`seed ${seed}: ${verdict.problems.slice(0, 3).join('; ')}\n`);
      continue;
    }
    const floor: number = verdict.zone.tiles.reduce((sum: number, line: string): number => sum + line.replaceAll(' ', '').length, 0);
    process.stdout.write(`${JSON.stringify({ seed, packs: verdict.zone.packs.length, monsters: monsters(verdict.zone), props: verdict.zone.props.length, removed: verdict.removed, floorTiles: floor, limit, descent: verdict.descent })}\n`);
    if (options.out !== null) writeFileSync(options.out, formatZone(verdict.record));
    return;
  }
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith('cave-generate.ts') === true) main();
