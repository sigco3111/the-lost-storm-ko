import buildFile from './builds.json' with { type: 'json' };
import { nextPlace } from '../../sim/bot-plan.ts';
import type { BotPlan } from '../../sim/bot-plan.ts';
import type { Fields } from '../../sim/content/read.ts';
import { ContentError, each, fields, numeric, text, textList } from '../../sim/content/read.ts';
import type { Content } from '../../sim/content/types.ts';
import type { BuildPolicy, Policies, SkillPolicy } from '../simulate-policies.ts';
import type { Job } from '../simulate-run.ts';
import { planFor } from '../simulate-policies.ts';

export interface GuideBuildSpec {
  readonly id: string;
  readonly from: string;
  readonly route: readonly string[] | null;
  readonly after: readonly string[];
}

export interface GuideSpec {
  readonly skill: string;
  readonly careless: string;
  readonly seeds: readonly number[];
  readonly levels: readonly number[];
  readonly bossRepeats: number;
  readonly climbMinutes: number;
  readonly builds: readonly GuideBuildSpec[];
}

function readBuild(value: unknown, where: string): GuideBuildSpec {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), from: text(source, 'from', where), route: source['route'] === undefined ? null : textList(source, 'route', where), after: textList(source, 'after', where) };
}

function wholeNumbers(value: unknown, where: string): number[] {
  return each(value, where, (entry: unknown, at: string): number => {
    const number: number = numeric({ value: entry }, 'value', at);
    if (!Number.isInteger(number) || number < 1) throw new ContentError(at, 'expected a whole number above zero');
    return number;
  });
}

export function readGuideSpec(value: unknown): GuideSpec {
  const source: Fields = fields(value, 'guide');
  return {
    skill: text(source, 'skill', 'guide'),
    careless: text(source, 'careless', 'guide'),
    seeds: wholeNumbers(source['seeds'], 'guide.seeds'),
    levels: wholeNumbers(source['levels'], 'guide.levels'),
    bossRepeats: numeric(source, 'bossRepeats', 'guide'),
    climbMinutes: numeric(source, 'climbMinutes', 'guide'),
    builds: each(source['builds'], 'guide.builds', readBuild),
  };
}

export const GUIDE_SPEC: GuideSpec = readGuideSpec(buildFile);

export function namedSkill(policies: Policies, name: string): SkillPolicy {
  const skill: SkillPolicy | undefined = policies.skills.get(name);
  if (skill === undefined) throw new ContentError('guide.skill', `no skill policy ${name}`);
  return skill;
}

export function skillPolicy(policies: Policies, spec: GuideSpec): SkillPolicy {
  return namedSkill(policies, spec.skill);
}

function archetype(policies: Policies, build: GuideBuildSpec): BuildPolicy {
  const policy: BuildPolicy | undefined = policies.builds.get(build.from);
  if (policy === undefined) throw new ContentError(`guide.builds.${build.id}`, `no build policy ${build.from}`);
  return policy;
}

export function takenOrder(content: Content, plan: BotPlan, limit: number): string[] {
  const taken: string[] = [];
  while (taken.length < limit) {
    const place: string | null = nextPlace(content, plan, taken, 1);
    if (place === null) break;
    taken.push(place);
  }
  return taken;
}

function routeEnd(taken: readonly string[], targets: readonly string[]): number {
  return Math.max(0, ...targets.map((id: string): number => taken.indexOf(id) + 1));
}

export function guideBuildPolicy(content: Content, policies: Policies, spec: GuideSpec, build: GuideBuildSpec): BuildPolicy {
  const found: BuildPolicy = archetype(policies, build);
  const base: BuildPolicy = build.route === null ? found : { ...found, route: build.route };
  const taken: string[] = takenOrder(content, planFor(skillPolicy(policies, spec), base), content.skillTree.length);
  const own: string[] = build.route === null ? taken : taken.slice(0, routeEnd(taken, build.route));
  return { ...base, name: build.id, paths: [], route: [...own, ...build.after] };
}

export function guidePolicies(content: Content, policies: Policies, spec: GuideSpec): Policies {
  const builds: Map<string, BuildPolicy> = new Map<string, BuildPolicy>(spec.builds.map((build: GuideBuildSpec): [string, BuildPolicy] => [build.id, guideBuildPolicy(content, policies, spec, build)]));
  return { ...policies, builds };
}

export function guideRoute(content: Content, policies: Policies, spec: GuideSpec, build: GuideBuildSpec, limit: number): string[] {
  return takenOrder(content, planFor(skillPolicy(policies, spec), guideBuildPolicy(content, policies, spec, build)), limit);
}

export function guideJobs(spec: GuideSpec): Job[] {
  return spec.builds.flatMap((build: GuideBuildSpec): Job[] =>
    [spec.skill, spec.careless].flatMap((skill: string): Job[] =>
      spec.seeds.map((seed: number): Job => ({ scenario: { kind: 'boss', levels: spec.levels, repeats: spec.bossRepeats, minutes: spec.climbMinutes }, skill, build: build.id, seed, danger: 1, toughness: 1 })),
    ),
  );
}
