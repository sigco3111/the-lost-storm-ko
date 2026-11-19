import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { BROWSER_NOTICES, RETRY } from '../browser-support.ts';
import { sealPage } from '../../tools/portal.ts';
import { ALPHA_RULES } from './data.ts';
import { applyLinks } from './links.ts';

void test('every page names only links the data knows', (): void => {
  for (const page of ['index.html', 'play/index.html']) {
    const html: string = readFileSync(page, 'utf8');
    for (const match of html.matchAll(/data-link="([a-z]+)"/g)) assert.ok(['discord', 'github', 'x'].includes(match[1] ?? ''), `${page} names ${match[1] ?? ''}`);
  }
});

void test('the sealed game page keeps the credits as plain text and has no link out', (): void => {
  const html: string = readFileSync('play/index.html', 'utf8');
  const credits: RegExp = /<p class="title-credits">[\s\S]*?<\/p>/;
  const shipped: string = credits.exec(html)?.[0] ?? '';
  assert.match(shipped, /CC BY 4\.0/);
  assert.match(shipped, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.doesNotMatch(shipped, /<a\b/);
  const sealed: string = sealPage(applyLinks(html, null));
  assert.equal(credits.exec(sealed)?.[0], shipped);
  assert.doesNotMatch(sealed, /<a\b/);
  assert.doesNotMatch(sealed, /https?:\/\//);
});

void test('the slice ends on the alpha flag', (): void => {
  assert.deepEqual(ALPHA_RULES.complete, { kind: 'flag', flag: 'alpha_slice_complete' });
  assert.deepEqual(
    ALPHA_RULES.milestones.map((milestone) => milestone.event),
    ['picked_journal', 'left_mist', 'reached_hall', 'cleared_moment', 'reached_fire'],
  );
});

void test('every milestone zone is a zone the world loads', (): void => {
  const zones: Content['zones'] = loadContent().zones;
  for (const milestone of ALPHA_RULES.milestones) if (milestone.kind === 'zone') assert.ok(zones.has(milestone.zone), `no zone ${milestone.zone}`);
});

void test('every page quiets a view transition the browser abandons before any stylesheet loads', (): void => {
  const guards: string[] = [];
  for (const page of ['index.html', 'play/index.html']) {
    const html: string = readFileSync(page, 'utf8');
    const guard: RegExpMatchArray | null = html.match(/<script>(?:(?!<\/script>)[\s\S])*pagereveal(?:(?!<\/script>)[\s\S])*<\/script>/);
    assert.ok(guard !== null, `${page} has no view transition guard`);
    const at: number = guard.index ?? -1;
    assert.ok(at >= 0 && at < html.indexOf('rel="stylesheet"'), `${page} guards after a stylesheet`);
    for (const name of ['pageswap', 'pagereveal', "'ready'", "'finished'", "'updateCallbackDone'", 'skipTransition', "visibilityState === 'hidden'"]) assert.ok(guard[0].includes(name), `${page} guard misses ${name}`);
    guards.push(guard[0]);
  }
  assert.equal(guards[0], guards[1]);
});

interface TrapEvent {
  readonly target: object;
  readonly filename?: string;
}

interface TrapPage {
  readonly status: { textContent: string; readonly classList: Set<string> };
  readonly enter: { textContent: string; disabled: boolean };
  readonly stored: Map<string, string>;
  readonly boot: { boot?: string };
  readonly reloads: () => number;
  readonly error: (event: (page: { readonly window: object; readonly script: (src: string) => object }) => TrapEvent) => void;
}

class FakeScript {
  readonly src: string;
  constructor(src: string) {
    this.src = src;
  }
}

const ORIGIN: string = 'https://theloststorm.com';

function classes(held: Set<string>): { add: (name: string) => void; contains: (name: string) => boolean } {
  return { add: (name: string): void => void held.add(name), contains: (name: string): boolean => held.has(name) };
}

function trapPage(now: () => number, storage: 'open' | 'refused'): TrapPage {
  const html: string = readFileSync('play/index.html', 'utf8');
  const trap: RegExpMatchArray | null = html.match(/<script>((?:(?!<\/script>)[\s\S])*could not finish loading(?:(?!<\/script>)[\s\S])*)<\/script>/);
  assert.ok(trap !== null, 'the game page has no loading trap');
  const listeners: ((event: TrapEvent) => void)[] = [];
  const stored: Map<string, string> = new Map<string, string>();
  const boot: { boot?: string } = {};
  let reloads: number = 0;
  const statusClasses: Set<string> = new Set<string>();
  const status = { textContent: 'Loading…', classList: statusClasses };
  const enter = { textContent: 'Enter', disabled: true, addEventListener: (): void => undefined };
  const nodes: Record<string, object> = {
    'title-status': { get textContent(): string { return status.textContent; }, set textContent(value: string) { status.textContent = value; }, classList: classes(statusClasses) },
    'title-enter': enter,
    'title-loader': { classList: classes(new Set<string>()) },
    title: { classList: classes(new Set<string>()) },
  };
  const sessionStorage = {
    getItem: (key: string): string | null => {
      if (storage === 'refused') throw new Error('denied');
      return stored.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => void stored.set(key, value),
  };
  const window: object = {
    location: { href: `${ORIGIN}/play/`, origin: ORIGIN, reload: (): void => void (reloads += 1) },
    sessionStorage,
    addEventListener: (name: string, listener: (event: TrapEvent) => void): void => {
      if (name === 'error') listeners.push(listener);
      else assert.fail(`the trap listens for ${name}`);
    },
  };
  const document = { getElementById: (id: string): object | null => nodes[id] ?? null, documentElement: { dataset: boot } };
  runInNewContext(trap[1] ?? '', { window, document, HTMLScriptElement: FakeScript, URL, Date: { now }, Number, String });
  return {
    status,
    enter,
    stored,
    boot,
    reloads: (): number => reloads,
    error: (event): void => {
      const made: TrapEvent = event({ window, script: (src: string): object => new FakeScript(src) });
      for (const listener of listeners) listener(made);
    },
  };
}

void test('a script from another site that fails to load, or an error from one, never stops the title', (): void => {
  const page: TrapPage = trapPage((): number => 5_000, 'open');
  page.error(({ script }) => ({ target: script('https://static.cloudflareinsights.com/beacon.min.js') }));
  page.error(({ script }) => ({ target: script('https://accounts.google.com/gsi/client') }));
  page.error(({ window }) => ({ target: window, filename: 'chrome-extension://abc/inject.js' }));
  page.error(({ window }) => ({ target: window, filename: '' }));
  assert.equal(page.reloads(), 0);
  assert.equal(page.status.textContent, 'Loading…');
  assert.equal(page.enter.disabled, true);
});

void test("the game's own script failing to load reloads the page once, then says so", (): void => {
  let now: number = 5_000;
  const page: TrapPage = trapPage((): number => now, 'open');
  page.error(({ script }) => ({ target: script(`${ORIGIN}/assets/play-abc.js`) }));
  assert.equal(page.reloads(), 1);
  assert.equal(page.stored.get(RETRY.key), RETRY.mark);
  assert.equal(page.status.textContent, 'Loading…');
  now += 10 * 60_000;
  page.error(({ script }) => ({ target: script(`${ORIGIN}/assets/play-abc.js`) }));
  assert.equal(page.reloads(), 1);
  assert.equal(page.status.textContent, BROWSER_NOTICES.stopped);
  assert.ok(page.status.classList.has('failed'));
  assert.equal(page.enter.textContent, BROWSER_NOTICES.reload);
  assert.equal(page.enter.disabled, false);
});

void test("an error in the game's own code stops the title only until the game has taken over", (): void => {
  const early: TrapPage = trapPage((): number => 5_000, 'refused');
  early.error(({ window }) => ({ target: window, filename: `${ORIGIN}/assets/play-abc.js` }));
  assert.equal(early.reloads(), 0);
  assert.equal(early.status.textContent, BROWSER_NOTICES.stopped);
  const late: TrapPage = trapPage((): number => 5_000, 'open');
  late.boot.boot = RETRY.started;
  late.error(({ window }) => ({ target: window, filename: `${ORIGIN}/assets/play-abc.js` }));
  assert.equal(late.reloads(), 0);
  assert.equal(late.status.textContent, 'Loading…');
});
