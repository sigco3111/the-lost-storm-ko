import type { ActArm, ArmPlan, PlaceRow } from './act-scaling.ts';
import { ACT_SCALING, placeRow, scalingTables } from './act-scaling.ts';
import { pointsAtLevel } from './guide/data.ts';
import type { GuideBuildSpec } from './guide/builds.ts';
import { GUIDE_SPEC, guideBuildPolicy, guideRoute } from './guide/builds.ts';
import type { BuildPolicy } from './simulate-policies.ts';
import { POLICIES } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';

function option(name: string, fallback: string): string {
  const at: number = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : (process.argv[at + 1] ?? fallback);
}

function planAt(arm: ActArm, level: number): ArmPlan | null {
  const spec: GuideBuildSpec | undefined = GUIDE_SPEC.builds.find((build: GuideBuildSpec): boolean => build.id === arm.build);
  if (spec === undefined) return null;
  const policy: BuildPolicy = guideBuildPolicy(CONTENT, POLICIES, GUIDE_SPEC, spec);
  const route: string[] = guideRoute(CONTENT, POLICIES, GUIDE_SPEC, spec, CONTENT.skillTree.length);
  return { arm, weights: policy.weights, focus: policy.focus, route: route.slice(0, pointsAtLevel(CONTENT, level)) };
}

function plansAt(level: number): ArmPlan[] {
  return ACT_SCALING.arms.map((arm: ActArm): ArmPlan | null => planAt(arm, level)).filter((plan: ArmPlan | null): plan is ArmPlan => plan !== null);
}

const seeds: number = Number(option('seeds', String(ACT_SCALING.seeds)));
const only: string = option('only', '');
const rows: PlaceRow[] = [];
for (const place of ACT_SCALING.places) {
  if (only !== '' && !only.split(',').includes(place.zone)) continue;
  const row: PlaceRow | null = placeRow(CONTENT, plansAt, place, seeds);
  if (row !== null) rows.push(row);
  process.stderr.write(`${place.zone}\n`);
}
process.stdout.write(`${scalingTables(rows)}\n`);
