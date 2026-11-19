import measuredFile from './measured.json' with { type: 'json' };
import type { Content, ItemBaseDef, MonsterDef, SkillDef, SkillTreeNodeDef, ZoneDef } from '../../sim/content/types.ts';
import type { ChartPath } from '../../sim/content/chart-types.ts';
import type { PointGrant } from '../../sim/content/chart-types.ts';
import { refundCost } from '../../sim/progression.ts';
import type { Policies } from '../simulate-policies.ts';
import { POLICIES } from '../simulate-policies.ts';
import { CONTENT } from '../simulate-run.ts';
import type { GuideBuildSpec, GuideSpec } from './builds.ts';
import { GUIDE_SPEC, guideBuildPolicy, guideRoute } from './builds.ts';
import type { BuildMeasure, Measured } from './measures.ts';
import { readMeasured } from './measures.ts';
import { currentFingerprint } from './fingerprint.ts';

export interface GuideData {
  readonly content: Content;
  readonly policies: Policies;
  readonly spec: GuideSpec;
  readonly measured: Measured;
  readonly balance: string;
  readonly routes: ReadonlyMap<string, readonly string[]>;
}

export function pointsAtLevel(content: Content, level: number): number {
  const granted: number = content.chart.grants.reduce((sum: number, grant: PointGrant): number => sum + grant.points, 0);
  return content.chart.pointsPerLevel * (level - 1) + granted;
}

export function levelForPlace(content: Content, count: number): number {
  let level: number = 1;
  while (pointsAtLevel(content, level) < count && level < content.player.xp.maxLevel) level += 1;
  return level;
}

export function topLevel(spec: GuideSpec): number {
  return Math.max(...spec.levels);
}

export function makeGuideData(content: Content, policies: Policies, spec: GuideSpec, measured: Measured, balance: string): GuideData {
  const limit: number = pointsAtLevel(content, topLevel(spec));
  const routes: Map<string, readonly string[]> = new Map<string, readonly string[]>(spec.builds.map((build: GuideBuildSpec): [string, readonly string[]] => [build.id, guideRoute(content, policies, spec, build, limit)]));
  const shown: ReadonlySet<string> = new Set<string>(spec.builds.map((build: GuideBuildSpec): string => build.id));
  const builds: readonly BuildMeasure[] = measured.builds.filter((build: BuildMeasure): boolean => shown.has(build.id));
  return { content, policies, spec, measured: { ...measured, builds }, balance, routes };
}

let cached: GuideData | null = null;

export function guideData(): GuideData {
  cached ??= makeGuideData(CONTENT, POLICIES, GUIDE_SPEC, readMeasured(measuredFile), currentFingerprint());
  return cached;
}

export function measuredNow(data: GuideData): boolean {
  return data.measured.fingerprint === data.balance;
}

export function skill(data: GuideData, id: string): SkillDef {
  const found: SkillDef | undefined = data.content.skills.get(id);
  if (found === undefined) throw new Error(`the guide names the unknown skill ${id}`);
  return found;
}

export function place(data: GuideData, id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | undefined = data.content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id);
  if (found === undefined) throw new Error(`the guide names the unknown Skill Tree place ${id}`);
  return found;
}

export function path(data: GuideData, id: string): ChartPath {
  const found: ChartPath | undefined = data.content.chart.paths.find((entry: ChartPath): boolean => entry.id === id);
  if (found === undefined) throw new Error(`the guide names the unknown path ${id}`);
  return found;
}

export function item(data: GuideData, id: string): ItemBaseDef {
  const found: ItemBaseDef | undefined = data.content.itemBases.get(id);
  if (found === undefined) throw new Error(`the guide names the unknown item ${id}`);
  return found;
}

export function monster(data: GuideData, id: string): MonsterDef {
  const found: MonsterDef | undefined = data.content.monsters.get(id);
  if (found === undefined) throw new Error(`the guide names the unknown monster ${id}`);
  return found;
}

export function zone(data: GuideData, id: string): ZoneDef {
  const found: ZoneDef | undefined = data.content.zones.get(id);
  if (found === undefined) throw new Error(`the guide names the unknown zone ${id}`);
  return found;
}

export function buildSpec(data: GuideData, id: string): GuideBuildSpec {
  const found: GuideBuildSpec | undefined = data.spec.builds.find((build: GuideBuildSpec): boolean => build.id === id);
  if (found === undefined) throw new Error(`the guide names the unknown build ${id}`);
  return found;
}

export function buildMeasure(data: GuideData, id: string): BuildMeasure {
  const found: BuildMeasure | undefined = data.measured.builds.find((build: BuildMeasure): boolean => build.id === id);
  if (found === undefined) throw new Error(`the guide has no measurements for the build ${id}`);
  return found;
}

export function route(data: GuideData, id: string): readonly string[] {
  const found: readonly string[] | undefined = data.routes.get(id);
  if (found === undefined) throw new Error(`the guide has no route for the build ${id}`);
  return found;
}

export function focusSkill(data: GuideData, id: string): SkillDef {
  const policy = guideBuildPolicy(data.content, data.policies, data.spec, buildSpec(data, id));
  return skill(data, policy.focus ?? data.content.player.skillBar[0]?.skill ?? 'cleave');
}

export function unlockPlace(data: GuideData, skillId: string): SkillTreeNodeDef | null {
  return data.content.skillTree.find((node: SkillTreeNodeDef): boolean => node.unlock === skillId) ?? null;
}

export function respecCost(data: GuideData, level: number, points: number): number {
  return refundCost(data.content, level, points);
}

export function playerSkills(data: GuideData): SkillDef[] {
  const learned: ReadonlySet<string> = new Set<string>([...data.content.player.skillBook.map((entry): string => entry.skill), ...data.content.skillTree.flatMap((node: SkillTreeNodeDef): string[] => (node.unlock === null ? [] : [node.unlock]))]);
  return [...data.content.skills.values()].filter((entry: SkillDef): boolean => learned.has(entry.id));
}
