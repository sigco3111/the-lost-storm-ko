import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { GuidePage } from '../guide/site.ts';
import { fillShell, GUIDE_PAGES, guideCrumbs, shellHtml } from '../guide/site.ts';
import { HIDDEN_PAGES, indexedPages } from './crawl.ts';
import type { SitePicture } from './head.ts';
import { absolute, fillHome, HOME_LD_MARK, SITE } from './head.ts';

interface CrawledPage {
  readonly path: string;
  readonly html: string;
}

type Fields = Readonly<Record<string, unknown>>;

const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const LIMITS = { titleMax: 70, descriptionMin: 70, descriptionMax: 170, headlineMax: 110 } as const;

function unescape(html: string): string {
  return html.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity: string): string => ENTITIES[entity] ?? entity);
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(fields: Fields, key: string): string {
  const value: unknown = fields[key];
  assert.ok(typeof value === 'string' && value.length > 0, `${key} is missing`);
  return value;
}

function child(fields: Fields, key: string): Fields {
  const value: unknown = fields[key];
  assert.ok(isFields(value), `${key} is not an object`);
  return value;
}

function list(fields: Fields, key: string): readonly unknown[] {
  const value: unknown = fields[key];
  assert.ok(Array.isArray(value) && value.length > 0, `${key} is not a list`);
  return value;
}

function crawledPages(): readonly CrawledPage[] {
  return [
    { path: '/', html: fillHome(readFileSync('index.html', 'utf8')) },
    { path: '/play/', html: readFileSync('play/index.html', 'utf8') },
    ...GUIDE_PAGES.map((page: GuidePage): CrawledPage => ({ path: page.href, html: fillShell(shellHtml(page.key)) })),
    ...HIDDEN_PAGES.map((path: string): CrawledPage => ({ path, html: readFileSync(`public${path}`, 'utf8') })),
  ];
}

function head(html: string): string {
  const end: number = html.indexOf('</head>');
  assert.ok(end > 0, 'no head');
  return html.slice(0, end);
}

function all(html: string, pattern: RegExp): readonly string[] {
  return [...html.matchAll(pattern)].map((match: RegExpMatchArray): string => unescape(match[1] ?? ''));
}

function one(html: string, pattern: RegExp, what: string): string {
  const found: readonly string[] = all(html, pattern);
  assert.equal(found.length, 1, `${what} appears ${found.length} times`);
  return found[0] ?? '';
}

function metaPattern(attribute: 'name' | 'property', key: string): RegExp {
  return new RegExp(`<meta ${attribute}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`, 'g');
}

function graph(html: string): readonly Fields[] {
  const nodes: Fields[] = [];
  for (const block of all(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const parsed: unknown = JSON.parse(block);
    assert.ok(isFields(parsed), 'JSON-LD is not an object');
    assert.equal(parsed['@context'], 'https://schema.org');
    for (const entry of list(parsed, '@graph')) {
      assert.ok(isFields(entry), 'a graph node is not an object');
      nodes.push(entry);
    }
  }
  return nodes;
}

function node(nodes: readonly Fields[], type: string): Fields {
  const found: readonly Fields[] = nodes.filter((entry: Fields): boolean => entry['@type'] === type);
  assert.equal(found.length, 1, `${type} appears ${found.length} times`);
  return found[0] ?? {};
}

function checkOrganization(fields: Fields): void {
  assert.equal(fields['@type'], 'Organization');
  assert.equal(text(fields, 'name'), SITE.publisher.name);
  assert.equal(text(fields, 'url'), SITE.publisher.url);
}

void test('every page has one title, description and language, and no two pages share a title or description', (): void => {
  const titles: string[] = [];
  const descriptions: string[] = [];
  for (const page of crawledPages()) {
    assert.match(page.html, /^<!doctype html>\s*<html lang="en">/, `${page.path} has no lang`);
    const top: string = head(page.html);
    const title: string = one(top, /<title>([\s\S]*?)<\/title>/g, `${page.path} title`);
    const description: string = one(top, metaPattern('name', 'description'), `${page.path} description`);
    assert.ok(title.length > 0 && title.length <= LIMITS.titleMax, `${page.path} title is ${title.length} characters`);
    if (!HIDDEN_PAGES.includes(page.path)) assert.ok(description.length >= LIMITS.descriptionMin && description.length <= LIMITS.descriptionMax, `${page.path} description is ${description.length} characters`);
    titles.push(title);
    descriptions.push(description);
  }
  assert.equal(new Set(titles).size, titles.length, 'two pages share a title');
  assert.equal(new Set(descriptions).size, descriptions.length, 'two pages share a description');
});

void test('every indexed page names one canonical address and shares itself with the site image', (): void => {
  for (const page of crawledPages().filter((entry: CrawledPage): boolean => !HIDDEN_PAGES.includes(entry.path))) {
    const top: string = head(page.html);
    const canonical: string = one(top, /<link rel="canonical" href="([^"]*)"/g, `${page.path} canonical`);
    assert.equal(canonical, absolute(page.path));
    assert.equal(all(top, /<meta name="robots" content="([^"]*)"/g).length, 0, `${page.path} tells robots something`);
    assert.equal(one(top, metaPattern('property', 'og:url'), 'og:url'), canonical);
    assert.equal(one(top, metaPattern('property', 'og:title'), 'og:title'), one(top, /<title>([\s\S]*?)<\/title>/g, 'title'));
    assert.equal(one(top, metaPattern('property', 'og:description'), 'og:description'), one(top, metaPattern('name', 'description'), 'description'));
    assert.equal(one(top, metaPattern('property', 'og:site_name'), 'og:site_name'), SITE.name);
    assert.equal(one(top, metaPattern('property', 'og:image'), 'og:image'), absolute(SITE.image.path));
    assert.equal(one(top, metaPattern('property', 'og:image:width'), 'og:image:width'), String(SITE.image.width));
    assert.equal(one(top, metaPattern('property', 'og:image:height'), 'og:image:height'), String(SITE.image.height));
    assert.equal(one(top, metaPattern('property', 'og:image:alt'), 'og:image:alt'), SITE.image.alt);
    assert.equal(one(top, metaPattern('name', 'twitter:card'), 'twitter:card'), 'summary_large_image');
    assert.equal(one(top, metaPattern('name', 'twitter:image'), 'twitter:image'), absolute(SITE.image.path));
    assert.equal(one(top, metaPattern('name', 'twitter:title'), 'twitter:title'), one(top, metaPattern('property', 'og:title'), 'og:title'));
    assert.equal(one(top, metaPattern('name', 'twitter:description'), 'twitter:description'), one(top, metaPattern('property', 'og:description'), 'og:description'));
  }
});

void test('the legal pages are kept out of search and out of the sitemap, and the footers still link them', (): void => {
  for (const page of crawledPages().filter((entry: CrawledPage): boolean => HIDDEN_PAGES.includes(entry.path))) {
    assert.match(one(head(page.html), /<meta name="robots" content="([^"]*)"/g, `${page.path} robots`), /\bnoindex\b/);
    assert.ok(!indexedPages().includes(page.path), page.path);
  }
  const footers: readonly string[] = [fillHome(readFileSync('index.html', 'utf8')), fillShell(shellHtml('home'))];
  for (const html of footers) for (const path of HIDDEN_PAGES) assert.ok(html.includes(`href="${path}"`), `a footer lost ${path}`);
});

void test('the home page describes the site and the game in JSON-LD', (): void => {
  const source: string = readFileSync('index.html', 'utf8');
  assert.ok(source.includes(HOME_LD_MARK), 'index.html lost its JSON-LD mark');
  const html: string = fillHome(source);
  const description: string = one(head(html), metaPattern('name', 'description'), 'description');
  const nodes: readonly Fields[] = graph(head(html));
  const site: Fields = node(nodes, 'WebSite');
  assert.equal(text(site, 'name'), SITE.name);
  assert.equal(text(site, 'url'), absolute('/'));
  const game: Fields = node(nodes, 'VideoGame');
  assert.equal(text(game, 'name'), SITE.name);
  assert.equal(text(game, 'description'), description);
  assert.equal(text(game, 'url'), absolute('/'));
  assert.equal(text(game, 'image'), absolute(SITE.image.path));
  assert.ok(list(game, 'genre').length > 0);
  assert.equal(text(game, 'gamePlatform'), 'Web browser');
  assert.equal(text(game, 'operatingSystem'), 'Any');
  assert.equal(text(game, 'applicationCategory'), 'GameApplication');
  const offer: Fields = child(game, 'offers');
  assert.equal(offer['@type'], 'Offer');
  assert.equal(text(offer, 'price'), '0');
  assert.equal(text(offer, 'priceCurrency'), SITE.currency);
  checkOrganization(child(game, 'publisher'));
  const shots: readonly unknown[] = list(game, 'screenshot');
  assert.equal(shots.length, SITE.screenshots.length);
  for (const shot of shots) {
    assert.ok(isFields(shot));
    assert.equal(shot['@type'], 'ImageObject');
    assert.ok(text(shot, 'contentUrl').startsWith(`${SITE.origin}/`));
    assert.ok(typeof shot['width'] === 'number' && typeof shot['height'] === 'number');
  }
  const trailer: Fields = child(game, 'trailer');
  assert.equal(trailer['@type'], 'VideoObject');
  for (const key of ['name', 'description', 'uploadDate', 'contentUrl', 'duration']) text(trailer, key);
  assert.match(text(trailer, 'uploadDate'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(text(trailer, 'duration'), /^PT(?:\d+M)?\d+(?:\.\d+)?S$/);
  assert.ok(list(trailer, 'thumbnailUrl').length > 0);
});

void test('every file named in the home page JSON-LD is shipped in public', (): void => {
  const named: readonly string[] = [SITE.image.path, SITE.trailer.path, SITE.trailer.poster, ...SITE.screenshots.map((shot: SitePicture): string => shot.path)];
  for (const path of named) assert.ok(existsSync(`public${path}`), `public${path} does not exist`);
});

void test('every guide page carries a breadcrumb trail and an article that match the page', (): void => {
  for (const page of GUIDE_PAGES) {
    const top: string = head(fillShell(shellHtml(page.key)));
    const nodes: readonly Fields[] = graph(top);
    const trail: Fields = node(nodes, 'BreadcrumbList');
    const items: readonly unknown[] = list(trail, 'itemListElement');
    assert.equal(items.length, guideCrumbs(page).length);
    items.forEach((item: unknown, index: number): void => {
      assert.ok(isFields(item));
      assert.equal(item['@type'], 'ListItem');
      assert.equal(item['position'], index + 1);
      assert.equal(text(item, 'name'), guideCrumbs(page)[index]?.name);
      assert.ok(text(item, 'item').startsWith(`${SITE.origin}/`));
    });
    const last: unknown = items.at(-1);
    assert.ok(isFields(last) && last['item'] === absolute(page.href), `${page.key} trail does not end on the page`);
    const story: Fields = node(nodes, 'Article');
    const headline: string = text(story, 'headline');
    assert.ok(headline.length <= LIMITS.headlineMax, `${page.key} headline is too long`);
    assert.equal(headline, one(top, /<title>([\s\S]*?)<\/title>/g, 'title'));
    assert.equal(text(story, 'description'), one(top, metaPattern('name', 'description'), 'description'));
    assert.equal(text(story, 'url'), absolute(page.href));
    assert.deepEqual(list(story, 'image'), [absolute(SITE.image.path)]);
    checkOrganization(child(story, 'author'));
    checkOrganization(child(story, 'publisher'));
  }
});

void test('JSON-LD cannot close its own script tag', (): void => {
  for (const page of crawledPages()) for (const block of all(page.html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.ok(!block.includes('<'), page.path);
});
