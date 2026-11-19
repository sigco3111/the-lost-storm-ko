import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isFields } from '../../sim/content/read.ts';
import type { GuidePage } from '../guide/site.ts';
import { fillShell, GUIDE_PAGES, shellHtml } from '../guide/site.ts';
import { shipsInPortal } from '../portal.ts';
import { absolute, fillHome, SITE, socialProfiles } from './head.ts';

type Fields = Readonly<Record<string, unknown>>;

interface Size {
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE: string = '89504e470d0a1a0a';
const PNG_WIDTH_AT: number = 16;
const PNG_HEIGHT_AT: number = 20;
const ICO_ENTRY_AT: number = 6;
const ICO_FULL_SIZE: number = 256;
const GOOGLE_FAVICON_STEP: number = 48;
const INSTALL_ICON_MIN: number = 512;
const LOGO_MIN: number = 112;
const SITE_ONLY: readonly string[] = ['site.webmanifest', 'icon-512.png', 'icon-maskable-512.png'];

function publicFile(path: string): string {
  return `public${path}`;
}

function pngSize(path: string): Size {
  const bytes: Buffer = readFileSync(publicFile(path));
  assert.equal(bytes.subarray(0, 8).toString('hex'), PNG_SIGNATURE, `${path} is not a PNG`);
  return { width: bytes.readUInt32BE(PNG_WIDTH_AT), height: bytes.readUInt32BE(PNG_HEIGHT_AT) };
}

function icoSide(path: string): number {
  const bytes: Buffer = readFileSync(publicFile(path));
  assert.equal(bytes.readUInt16LE(2), 1, `${path} is not an icon`);
  const side: number = bytes.readUInt8(ICO_ENTRY_AT);
  return side === 0 ? ICO_FULL_SIZE : side;
}

function manifest(): Fields {
  const parsed: unknown = JSON.parse(readFileSync(publicFile(SITE.manifestPath), 'utf8'));
  assert.ok(isFields(parsed), 'the manifest is not an object');
  return parsed;
}

function entries(fields: Fields, key: string): readonly Fields[] {
  const value: unknown = fields[key];
  assert.ok(Array.isArray(value) && value.length > 0, `${key} is not a list`);
  return value.map((entry: unknown): Fields => {
    assert.ok(isFields(entry), `an entry of ${key} is not an object`);
    return entry;
  });
}

function text(fields: Fields, key: string): string {
  const value: unknown = fields[key];
  assert.ok(typeof value === 'string' && value.length > 0, `${key} is missing`);
  return value;
}

function themeColor(html: string): string {
  const found: RegExpMatchArray | null = /<meta name="theme-color" content="([^"]*)"/.exec(html);
  assert.ok(found !== null, 'no theme-color');
  return found[1] ?? '';
}

function homeGraph(): readonly Fields[] {
  const html: string = fillHome(readFileSync('index.html', 'utf8'));
  const found: RegExpMatchArray | null = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(found !== null, 'the home page has no JSON-LD');
  const parsed: unknown = JSON.parse(found[1] ?? '');
  assert.ok(isFields(parsed), 'JSON-LD is not an object');
  return entries(parsed, '@graph');
}

function nodeWithId(nodes: readonly Fields[], id: string): Fields {
  const found: Fields | undefined = nodes.find((entry: Fields): boolean => entry['@id'] === id);
  assert.ok(found !== undefined, `${id} is missing`);
  return found;
}

void test('the web manifest names the game, opens the game and matches the page colours', (): void => {
  const fields: Fields = manifest();
  assert.equal(text(fields, 'name'), SITE.name);
  assert.ok(text(fields, 'short_name').length <= 12);
  assert.equal(text(fields, 'start_url'), SITE.playPath);
  assert.equal(text(fields, 'scope'), '/');
  assert.equal(text(fields, 'lang'), SITE.language);
  const colour: string = themeColor(readFileSync('index.html', 'utf8'));
  assert.equal(text(fields, 'theme_color'), colour);
  assert.equal(text(fields, 'background_color'), colour);
});

void test('every manifest icon and screenshot is shipped at the size it claims, with a full-size icon and a maskable one', (): void => {
  const fields: Fields = manifest();
  const icons: readonly Fields[] = entries(fields, 'icons');
  for (const entry of [...icons, ...entries(fields, 'screenshots')]) {
    const src: string = text(entry, 'src');
    assert.ok(existsSync(publicFile(src)), `${src} is not in public`);
    const sizes: string = text(entry, 'sizes');
    if (sizes === 'any') continue;
    if (!src.endsWith('.png')) continue;
    const size: Size = pngSize(src);
    assert.equal(sizes, `${size.width}x${size.height}`, src);
  }
  const large = (purpose: string): boolean => icons.some((entry: Fields): boolean => entry['purpose'] === purpose && entry['sizes'] === `${INSTALL_ICON_MIN}x${INSTALL_ICON_MIN}`);
  assert.ok(large('any'), 'no 512 px icon');
  assert.ok(large('maskable'), 'no 512 px maskable icon');
});

void test('the home page and every guide page link the manifest once, and the game page, which the portal also ships, does not', (): void => {
  const tag: string = `<link rel="manifest" href="${SITE.manifestPath}" />`;
  const pages: readonly string[] = [fillHome(readFileSync('index.html', 'utf8')), ...GUIDE_PAGES.map((page: GuidePage): string => fillShell(shellHtml(page.key)))];
  for (const html of pages) assert.equal(html.split(tag).length - 1, 1);
  assert.ok(!readFileSync('play/index.html', 'utf8').includes('rel="manifest"'));
});

void test('the favicon Google reads is a square icon in steps of 48 px, and the SVG icon is square', (): void => {
  assert.equal(icoSide('/favicon.ico') % GOOGLE_FAVICON_STEP, 0);
  const svg: string = readFileSync(publicFile('/favicon.svg'), 'utf8');
  const box: RegExpMatchArray | null = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  assert.ok(box !== null && box[1] === box[2], 'favicon.svg is not square');
});

void test('the home page names the game as a brand with its logo, its other names and its social profiles', (): void => {
  const nodes: readonly Fields[] = homeGraph();
  const mark: Fields = nodeWithId(nodes, absolute('/#brand'));
  assert.equal(mark['@type'], 'Organization');
  assert.equal(text(mark, 'name'), SITE.name);
  assert.equal(text(mark, 'url'), absolute('/'));
  const logo: unknown = mark['logo'];
  assert.ok(isFields(logo));
  assert.equal(text(logo, 'url'), absolute(SITE.logo.path));
  const size: Size = pngSize(SITE.logo.path);
  assert.deepEqual(size, { width: SITE.logo.width, height: SITE.logo.height });
  assert.ok(size.width >= LOGO_MIN && size.width === size.height);
  assert.ok(socialProfiles().length > 0);
  for (const profile of socialProfiles()) assert.ok(profile.startsWith('https://'), profile);
  assert.deepEqual(mark['sameAs'], socialProfiles());
  assert.deepEqual(nodeWithId(nodes, absolute('/#game'))['sameAs'], socialProfiles());
  assert.deepEqual(nodeWithId(nodes, absolute('/#website'))['alternateName'], SITE.alternateNames);
});

void test('the manifest and the install icons stay on the site and out of the portal', (): void => {
  for (const path of SITE_ONLY) {
    assert.ok(existsSync(publicFile(`/${path}`)), path);
    assert.equal(shipsInPortal(path), false, path);
  }
});
