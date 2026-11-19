import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GuidePage } from '../guide/site.ts';
import { GUIDE_PAGES } from '../guide/site.ts';
import { CLOSED_PATHS, HIDDEN_PAGES, indexedPages, robotsTxt, SITEMAP_PATH, sitemapXml } from './crawl.ts';
import { absolute } from './head.ts';

function locations(xml: string): readonly string[] {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match: RegExpMatchArray): string => match[1] ?? '');
}

void test('the sitemap lists the home page, the game and every guide page once, at their canonical addresses', (): void => {
  const xml: string = sitemapXml();
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls: readonly string[] = locations(xml);
  const expected: readonly string[] = [absolute('/'), absolute('/play/'), ...GUIDE_PAGES.map((page: GuidePage): string => absolute(page.href))];
  assert.deepEqual(urls, expected);
  assert.equal(new Set(urls).size, urls.length);
});

void test('a new guide page reaches the sitemap without being named', (): void => {
  const urls: readonly string[] = locations(sitemapXml([...indexedPages(), '/guide/new-page/']));
  assert.ok(urls.includes(absolute('/guide/new-page/')));
});

void test('the sitemap leaves out the pages kept from search', (): void => {
  for (const path of HIDDEN_PAGES) assert.ok(!locations(sitemapXml()).includes(absolute(path)), path);
});

void test('robots.txt allows the site, closes the API and asset folders, and names the sitemap', (): void => {
  const lines: readonly string[] = robotsTxt().split('\n');
  assert.equal(lines[0], 'User-agent: *');
  assert.ok(lines.includes('Allow: /'));
  for (const path of CLOSED_PATHS) assert.ok(lines.includes(`Disallow: ${path}`), path);
  assert.ok(CLOSED_PATHS.includes('/v1/'));
  assert.ok(!lines.includes('Disallow: /assets/'), 'pages need their styles and scripts to render');
  for (const path of indexedPages()) assert.ok(!CLOSED_PATHS.some((closed: string): boolean => path.startsWith(closed)), path);
  assert.ok(lines.includes(`Sitemap: ${absolute(SITEMAP_PATH)}`));
});
