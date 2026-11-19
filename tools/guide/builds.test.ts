import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError } from '../../sim/content/read.ts';
import { POLICIES } from '../simulate-policies.ts';
import { CONTENT } from '../simulate-run.ts';
import { GUIDE_SPEC, guideBuildPolicy, guideJobs, readGuideSpec } from './builds.ts';

void test('the guide spec is read and checked', (): void => {
  assert.ok(GUIDE_SPEC.builds.length > 0);
  assert.throws((): unknown => readGuideSpec({ skill: 'average' }), ContentError);
  assert.throws((): unknown => readGuideSpec({ ...structuredClone(GUIDE_SPEC), seeds: [0] }), ContentError);
});

void test('a build with its own route takes that route, then the places listed after it', (): void => {
  for (const build of GUIDE_SPEC.builds) {
    const policy = guideBuildPolicy(CONTENT, POLICIES, GUIDE_SPEC, build);
    const order: readonly string[] = policy.route;
    for (const id of build.route ?? []) assert.ok(order.includes(id), `${build.id} skips ${id}`);
    const tail: readonly string[] = order.slice(order.length - build.after.length);
    assert.deepEqual(tail, build.after, build.id);
  }
});

void test('every build is measured steady and careless on every seed', (): void => {
  const jobs = guideJobs(GUIDE_SPEC);
  assert.equal(jobs.length, GUIDE_SPEC.builds.length * 2 * GUIDE_SPEC.seeds.length);
});
