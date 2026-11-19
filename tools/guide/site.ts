import { resolve } from 'node:path';
import type { GuideData } from './data.ts';
import { guideData } from './data.ts';
import { esc } from './html.ts';
import type { NavEntry, PageBody } from './layout.ts';
import { frame } from './layout.ts';
import type { BuildNotes } from './pages/build-page.ts';
import { buildHref, buildPage, staleNotice } from './pages/build-page.ts';
import { BUILD_NOTES } from './pages/build-notes.ts';
import { buildsPage } from './pages/builds.ts';
import { combatPage } from './pages/combat.ts';
import { homePage } from './pages/home.ts';
import { itemsPage } from './pages/items.ts';
import { skillsPage } from './pages/skills.ts';
import { startPage } from './pages/start.ts';
import { treePage } from './pages/tree.ts';
import type { Crumb } from '../site/head.ts';
import { article, breadcrumbList, ldScript, shareTags, SITE } from '../site/head.ts';

export interface GuidePage {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly render: (data: GuideData) => PageBody;
  readonly measured: boolean;
}

function indefinite(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function buildEntry(notes: BuildNotes): GuidePage {
  return {
    key: `builds/${notes.id}`,
    href: buildHref(notes.id),
    label: notes.name,
    measured: true,
    render: (data: GuideData): PageBody => ({ kicker: `Build · ${notes.kind}`, title: notes.name, lede: notes.forWho, description: `${notes.name}, ${indefinite(notes.kind)} ${notes.kind.toLowerCase()} build for The Lost Storm: the route through the Skill Tree, the skill to lean on, gear and measured numbers.`, body: buildPage(data, notes) }),
  };
}

export const GUIDE_PAGES: readonly GuidePage[] = [
  { key: 'home', href: '/guide/', label: 'Guide', render: homePage, measured: false },
  { key: 'start', href: '/guide/start/', label: 'Getting started', render: startPage, measured: false },
  { key: 'combat', href: '/guide/combat/', label: 'Combat', render: combatPage, measured: false },
  { key: 'skills', href: '/guide/skills/', label: 'Skills', render: skillsPage, measured: false },
  { key: 'tree', href: '/guide/tree/', label: 'Skill Tree', render: treePage, measured: false },
  { key: 'items', href: '/guide/items/', label: 'Items', render: itemsPage, measured: false },
  { key: 'builds', href: '/guide/builds/', label: 'Builds', render: buildsPage, measured: true },
  ...BUILD_NOTES.map(buildEntry),
];

export const MAIN_NAV: readonly NavEntry[] = GUIDE_PAGES.filter((page: GuidePage): boolean => !page.key.startsWith('builds/')).map((page: GuidePage): NavEntry => ({ href: page.href, label: page.label }));

export function guidePage(key: string): GuidePage {
  const found: GuidePage | undefined = GUIDE_PAGES.find((page: GuidePage): boolean => page.key === key);
  if (found === undefined) throw new Error(`no guide page ${key}`);
  return found;
}

export function shellPath(key: string): string {
  return key === 'home' ? 'guide/index.html' : `guide/${key}/index.html`;
}

export function guideInputs(root: string): Record<string, string> {
  return Object.fromEntries(GUIDE_PAGES.map((page: GuidePage): [string, string] => [`guide-${page.key.replace('/', '-')}`, resolve(root, shellPath(page.key))]));
}

function nextOf(page: GuidePage): NavEntry | null {
  const index: number = GUIDE_PAGES.indexOf(page);
  const next: GuidePage | undefined = GUIDE_PAGES[index + 1];
  return next === undefined ? null : { href: next.href, label: next.label };
}

function current(page: GuidePage): string {
  return page.key.startsWith('builds/') ? '/guide/builds/' : page.href;
}

export function renderGuideBody(data: GuideData, page: GuidePage): PageBody & { readonly html: string } {
  const rendered: PageBody = page.render(data);
  const body: PageBody = page.measured ? { ...rendered, body: `${staleNotice(data)}${rendered.body}` } : rendered;
  const html: string = frame({ href: page.href, kicker: body.kicker, title: body.title, lede: body.lede, body: body.body, nav: MAIN_NAV, next: nextOf(page), current: current(page) });
  return { ...body, html };
}

const MARK: RegExp = /<div id="guide" data-page="([a-z/-]+)"><\/div>/;
const TITLE: RegExp = /<title>[\s\S]*?<\/title>/;

export function shellHtml(key: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>The Lost Storm · Guide</title>
    <meta name="theme-color" content="#05070b" />
    <meta name="color-scheme" content="dark" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="/src/guide/guide.css" />
    <link rel="stylesheet" href="/src/guide/guide-parts.css" />
  </head>
  <body>
    <div id="guide" data-page="${key}"></div>
  </body>
</html>
`;
}

function isBuild(page: GuidePage): boolean {
  return page.key.startsWith('builds/');
}

export function guideCrumbs(page: GuidePage): readonly Crumb[] {
  const home: GuidePage = guidePage('home');
  const trail: Crumb[] = [{ name: SITE.name, path: '/' }, { name: home.label, path: home.href }];
  if (isBuild(page)) trail.push({ name: guidePage('builds').label, path: guidePage('builds').href });
  if (page.key !== 'home') trail.push({ name: page.label, path: page.href });
  return trail;
}

export function guideTitle(page: GuidePage, heading: string): string {
  if (page.key === 'home') return `${SITE.name} · Player’s guide`;
  return `${heading}${isBuild(page) ? ' build' : ''} · ${SITE.name} guide`;
}

export function fillShell(html: string, data: GuideData = guideData()): string {
  const match: RegExpExecArray | null = MARK.exec(html);
  const key: string | undefined = match?.[1];
  if (key === undefined) return html;
  const page: GuidePage = guidePage(key);
  const rendered = renderGuideBody(data, page);
  const title: string = guideTitle(page, rendered.title);
  const head: readonly string[] = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(rendered.description)}" />`,
    `<link rel="canonical" href="${esc(SITE.origin + page.href)}" />`,
    ...shareTags({ path: page.href, title, description: rendered.description, kind: 'article' }),
    ldScript([breadcrumbList(guideCrumbs(page)), article({ path: page.href, headline: title, description: rendered.description })]),
  ];
  return html.replace(TITLE, head.join('\n    ')).replace(MARK, rendered.html);
}
