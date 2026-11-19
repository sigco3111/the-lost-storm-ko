import { zone as readZone } from '../content/parse-world.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { caveProblems } from './checks.ts';
import type { CaveLayout, CaveRequest, CaveResult } from './generate.ts';
import { generateCave } from './generate.ts';
import type { CaveKit } from './kit.ts';
import type { CaveNaming } from './zone.ts';
import { caveZoneRecord } from './zone.ts';
import type { WingHost, WingResult } from './wing.ts';
import { graftWing } from './wing.ts';

export interface MadeCave {
  readonly layout: CaveLayout;
  readonly record: Record<string, unknown>;
  readonly zone: ZoneDef;
  readonly attempts: number;
}

export type MadeResult = { readonly ok: true; readonly cave: MadeCave } | { readonly ok: false; readonly problem: string };

export function caveZone(layout: CaveLayout, naming: CaveNaming, kit: CaveKit): { readonly record: Record<string, unknown>; readonly zone: ZoneDef } {
  const record: Record<string, unknown> = caveZoneRecord(layout, naming, kit);
  return { record, zone: readZone(record, naming.id) };
}

type Joined = { readonly ok: true; readonly record: Record<string, unknown>; readonly zone: ZoneDef } | { readonly ok: false; readonly problem: string };

function joined(layout: CaveLayout, naming: CaveNaming, kit: CaveKit, host: WingHost | null): Joined {
  if (host === null) return { ok: true, ...caveZone(layout, naming, kit) };
  const result: WingResult = graftWing(host, layout, kit.walls);
  if (!result.ok) return result;
  return { ok: true, record: result.record, zone: readZone(result.record, naming.id) };
}

export function makeCave(content: Content, kit: CaveKit, request: CaveRequest, naming: CaveNaming, host: WingHost | null = null): MadeResult {
  const strangers: readonly string[] = [...new Set(kit.families.flatMap((family): string[] => family.members.map((member): string => member.monster)).filter((monster: string): boolean => !content.monsters.has(monster)))];
  if (strangers.length > 0) return { ok: false, problem: `kit ${kit.id} names monsters the game does not have: ${strangers.join(', ')}` };
  const before: ReadonlySet<string> = new Set<string>(host === null ? [] : caveProblems(content, readZone(host.record, naming.id), request.screen));
  const judge = (layout: CaveLayout): readonly string[] => {
    const made: Joined = joined(layout, naming, kit, host);
    return made.ok ? caveProblems(content, made.zone, request.screen).filter((problem: string): boolean => !before.has(problem)) : [made.problem];
  };
  const result: CaveResult = generateCave(request, { kit, defs: content.props, judge });
  if (!result.ok) return result;
  const made: Joined = joined(result.layout, naming, kit, host);
  if (!made.ok) return made;
  return { ok: true, cave: { layout: result.layout, record: made.record, zone: made.zone, attempts: result.attempts } };
}
