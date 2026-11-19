import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { canAllocate } from '../../sim/progression.ts';
import type { GuideBuildSpec } from './builds.ts';
import { GUIDE_SPEC } from './builds.ts';
import type { GuideData } from './data.ts';
import { guideData, levelForPlace, measuredNow, pointsAtLevel, route } from './data.ts';
import { currentFingerprint } from './fingerprint.ts';
import type { BuildMeasure } from './measures.ts';
import { BUILD_NOTES } from './pages/build-notes.ts';
import type { BuildNotes } from './pages/build-page.ts';
import type { GuidePage } from './site.ts';
import { fillShell, GUIDE_PAGES, renderGuideBody, shellHtml, shellPath } from './site.ts';

const UNMEASURED: string = 'a build in the guide has no measured numbers yet. Measure them once with: node tools/guide/measure.ts';
const STALE: string = 'the guide\'s measured numbers are older than the balance data, and the guide says so on every page that shows them. They are refreshed on main by npm run guide:refresh; a branch never re-measures.';

function visibleText(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
}

function measuredAt(fingerprint: string): GuideData {
  const data: GuideData = guideData();
  return { ...data, measured: { ...data.measured, fingerprint } };
}

const MEASURED_PAGES: readonly GuidePage[] = GUIDE_PAGES.filter((page: GuidePage): boolean => page.measured);

void test('the guide reads its balance from the game, and reports numbers measured on other balance without failing', (t: TestContext): void => {
  assert.equal(guideData().balance, currentFingerprint());
  if (!measuredNow(guideData())) t.diagnostic(STALE);
});

void test('numbers measured on other balance are marked as old on every page that shows them, and current ones are not', (): void => {
  assert.deepEqual(MEASURED_PAGES.map((page: GuidePage): string => page.key), GUIDE_PAGES.filter((page: GuidePage): boolean => page.key === 'builds' || page.key.startsWith('builds/')).map((page: GuidePage): string => page.key));
  const old: GuideData = measuredAt('0000000000000000');
  const now: GuideData = measuredAt(guideData().balance);
  for (const page of MEASURED_PAGES) {
    const stale: string = visibleText(renderGuideBody(old, page).html);
    assert.ok(stale.includes('show the game as it was, not as it is now'), page.key);
    assert.ok(stale.includes('measured on balance 0000000000000000'), page.key);
    const fresh: string = visibleText(renderGuideBody(now, page).html);
    assert.ok(!fresh.includes('as it was'), page.key);
    assert.ok(fresh.includes(`as it is now, balance ${now.balance}`), page.key);
  }
  for (const page of GUIDE_PAGES.filter((entry: GuidePage): boolean => !entry.measured)) assert.ok(!visibleText(renderGuideBody(old, page).html).includes('as it was'), page.key);
});

void test('every build in the guide has measurements, notes and a page, and nothing else does', (): void => {
  const ids: readonly string[] = GUIDE_SPEC.builds.map((build: GuideBuildSpec): string => build.id);
  assert.deepEqual(guideData().measured.builds.map((build: BuildMeasure): string => build.id).toSorted(), [...ids].toSorted(), UNMEASURED);
  assert.deepEqual(BUILD_NOTES.map((notes: BuildNotes): string => notes.id).toSorted(), [...ids].toSorted());
  for (const id of ids) assert.ok(GUIDE_PAGES.some((page: GuidePage): boolean => page.key === `builds/${id}`), id);
});

void test('every route can be taken in its order with the points a character has at each level', (): void => {
  const data = guideData();
  for (const build of GUIDE_SPEC.builds) {
    const order: readonly string[] = route(data, build.id);
    assert.equal(order.length, pointsAtLevel(data.content, Math.max(...GUIDE_SPEC.levels)), `${build.id} leaves points unspent`);
    order.forEach((id: string, index: number): void => {
      const level: number = levelForPlace(data.content, index + 1);
      assert.ok(pointsAtLevel(data.content, level) >= index + 1, `${build.id}: ${id}`);
      assert.ok(canAllocate(data.content, order.slice(0, index), 1, id), `${build.id} cannot take ${id} as place ${index + 1}`);
    });
  }
});

void test('every list of places after a route reaches the route the guide shows', (): void => {
  const data = guideData();
  for (const build of GUIDE_SPEC.builds) {
    if (build.after.length === 0) continue;
    const order: readonly string[] = route(data, build.id);
    assert.ok(
      build.after.some((id: string): boolean => order.includes(id)),
      `${build.id} lists places after its route that its route never reaches`,
    );
  }
});

void test('every remark on a route sits on a place the route takes', (): void => {
  const data = guideData();
  for (const notes of BUILD_NOTES) {
    const order: readonly string[] = route(data, notes.id);
    for (const id of Object.keys(notes.marks)) assert.ok(order.includes(id), `${notes.id} remarks on ${id}, which its route does not take`);
  }
});

void test('every page renders words a player reads, with no ids, blanks or broken numbers', (): void => {
  const data = guideData();
  for (const page of GUIDE_PAGES) {
    const rendered = renderGuideBody(data, page);
    const text: string = visibleText(rendered.html);
    assert.ok(rendered.title.length > 0 && rendered.description.length > 0 && rendered.lede.length > 0, `${page.key} has no title, lede or description`);
    assert.ok(rendered.body.length > 0, `${page.key} is empty`);
    for (const word of ['undefined', 'NaN', 'null', 'Infinity', '[object']) assert.ok(!text.includes(word), `${page.key} shows ${word}`);
    const ids: readonly string[] = text.match(/\b[a-z]+_[a-z0-9_]+\b/g) ?? [];
    assert.deepEqual(ids, [], `${page.key} shows ids`);
  }
});

void test('every page has its shell on disk, and the shell is filled with the page', (): void => {
  for (const page of GUIDE_PAGES) {
    const shell: string = readFileSync(shellPath(page.key), 'utf8');
    assert.equal(shell, shellHtml(page.key), `${shellPath(page.key)} is out of date: run node tools/guide/write-shells.ts`);
    const filled: string = fillShell(shell);
    assert.ok(!filled.includes('data-page='), page.key);
    assert.ok(filled.includes('<main class="page">'), page.key);
    assert.ok(filled.includes(`href="https://theloststorm.com${page.href}"`), page.key);
  }
});

void test('a page without the guide mark passes through unchanged', (): void => {
  const html: string = '<!doctype html><title>Other</title><main></main>';
  assert.equal(fillShell(html), html);
});
