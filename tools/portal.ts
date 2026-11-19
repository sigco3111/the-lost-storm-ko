import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig, Rollup } from 'vite';

export const PORTAL = {
  mode: 'portal',
  outDir: 'dist-portal',
  zip: 'the-lost-storm-portal.zip',
  page: { from: 'play/index.html', to: 'index.html' },
  withheldEnv: ['VITE_SERVER_URL', 'VITE_ASSET_BASE'],
  privateFolders: ['models/local/', 'audio/local/'],
  siteOnly: ['privacy.html', 'terms.html', 'og.jpg', 'site.webmanifest', 'icon-512.png', 'icon-maskable-512.png'],
  siteOnlyPage: /^[^/]+\.html$/,
  limits: { files: 1000, totalBytes: 500 * 1024 * 1024, fileBytes: 200 * 1024 * 1024 },
} as const;

export interface PortalTarget {
  readonly mode: string;
  readonly outDir: string;
  readonly zip: string;
  readonly sealed: boolean;
  readonly leftOut: readonly string[];
  readonly swaps: Readonly<Record<string, string>>;
}

export const GAMEPIX: PortalTarget = {
  mode: 'gamepix',
  outDir: 'dist-gamepix',
  zip: 'the-lost-storm-gamepix.zip',
  sealed: true,
  leftOut: ['landing/'],
  swaps: {
    'src/host.ts': 'src/host-framed.ts',
    'src/keep/keep-start.ts': 'src/keep/keep-start-none.ts',
    'src/launch/link-set.ts': 'src/launch/link-set-none.ts',
    'src/mobile/landscape.ts': 'src/mobile/landscape-none.ts',
    'src/mobile/rotate-hint.ts': 'src/mobile/rotate-hint-none.ts',
  },
};

export const PORTAL_TARGETS: readonly PortalTarget[] = [{ mode: PORTAL.mode, outDir: PORTAL.outDir, zip: PORTAL.zip, sealed: false, leftOut: [], swaps: {} }, GAMEPIX];

export const INERT_ADDRESSES: Readonly<Record<string, string>> = {
  'http://www.w3.org/2000/svg': 'the SVG namespace, a name and never fetched',
  'http://www.w3.org/1999/xhtml': 'the XHTML namespace three.js creates its canvas in, a name and never fetched',
  'https://jcgt.org/published/0007/04/01/': 'a citation in a comment inside a three.js shader, never fetched',
};

export function portalTarget(mode: string): PortalTarget | null {
  return PORTAL_TARGETS.find((target: PortalTarget): boolean => target.mode === mode) ?? null;
}

export interface PortalFile {
  readonly path: string;
  readonly bytes: number;
}

export interface PortalLimits {
  readonly files: number;
  readonly totalBytes: number;
  readonly fileBytes: number;
}

export interface PortalReport {
  readonly files: number;
  readonly totalBytes: number;
  readonly problems: readonly string[];
}

const PARENT_REF: RegExp = /(\s(?:src|href)=")\.\.\//g;
const PUBLIC_REF: RegExp = /(\s(?:src|href)=")\/(?!\/)/g;
const LOCAL_REF: RegExp = /\s(?:src|href)="\.\/([^"?#]+)/g;
const LEFT_PARENT: RegExp = /\s(?:src|href)="(?![a-z]+:|\/\/)[^"]*\.\.\/[^"]*"/;
const ROOT_REF: RegExp = /\s(?:src|href)="\/(?!\/)[^"]*"/;
const SITE_ANCHOR: RegExp = /<a\b([^>]*?)\shref="\/(?!\/)([^"]*)"([^>]*)>/g;
const MEGABYTE: number = 1024 * 1024;
const ADDRESS: RegExp = /https?:\/\/[^\s"'`<>()\\]+/g;
const OUTSIDE_OPEN: RegExp = /<([a-z]+)\b[^>]*\sdata-outside\b[^>]*>/;
const OUTSIDE_META: RegExp = /\s*<meta\b[^>]*\scontent="https?:\/\/[^"]*"[^>]*>/g;
const OUTSIDE_LINK: RegExp = /\s*<link\b[^>]*\shref="https?:\/\/[^"]*"[^>]*>/g;
const BODY_CLASS: RegExp = /<body\b([^>]*?)\sclass="([^"]*)"/;
export const STILL_CLASS: string = 'still';

export function liftPage(html: string): string {
  const lifted: string = html.replace(PARENT_REF, '$1./').replace(PUBLIC_REF, '$1./');
  const above: RegExpExecArray | null = LEFT_PARENT.exec(lifted);
  if (above !== null) throw new Error(`the portal page still points above its own folder:${above[0]}`);
  const rooted: RegExpExecArray | null = ROOT_REF.exec(lifted);
  if (rooted !== null) throw new Error(`the portal page still has a root-relative URL:${rooted[0]}`);
  return lifted;
}

export function localRefs(html: string): readonly string[] {
  return [...html.matchAll(LOCAL_REF)].map((match: RegExpExecArray): string => match[1] ?? '');
}

export function siteAnchors(html: string, site: string): string {
  const root: string = site.endsWith('/') ? site.slice(0, -1) : site;
  return html.replace(SITE_ANCHOR, (_match: string, before: string, path: string, after: string): string => `<a${before} href="${root}/${path}" target="_blank" rel="noopener"${after}>`);
}

export function addressesIn(text: string): readonly string[] {
  return [...new Set<string>(text.match(ADDRESS) ?? [])];
}

export function outsideAddresses(text: string): readonly string[] {
  return addressesIn(text).filter((address: string): boolean => !Object.hasOwn(INERT_ADDRESSES, address));
}

function closingEnd(html: string, tag: string, from: number): number {
  const edge: RegExp = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  edge.lastIndex = from;
  let depth: number = 1;
  for (let found: RegExpExecArray | null = edge.exec(html); found !== null; found = edge.exec(html)) {
    depth += found[1] === '/' ? -1 : 1;
    if (depth === 0) return found.index + found[0].length;
  }
  throw new Error(`a data-outside <${tag}> is never closed`);
}

export function dropOutside(html: string): string {
  const open: RegExpExecArray | null = OUTSIDE_OPEN.exec(html);
  if (open === null) return html;
  const end: number = closingEnd(html, open[1] ?? '', open.index + open[0].length);
  return dropOutside(html.slice(0, open.index) + html.slice(end));
}

export function sealPage(html: string): string {
  const body: RegExpExecArray | null = BODY_CLASS.exec(html);
  if (body === null) throw new Error('the sealed page has no <body class="...">');
  const sealed: string = dropOutside(html)
    .replace(OUTSIDE_META, '')
    .replace(OUTSIDE_LINK, '')
    .replace(BODY_CLASS, (_match: string, before: string, names: string): string => `<body${before} class="${names} ${STILL_CLASS}"`);
  const left: readonly string[] = outsideAddresses(sealed);
  if (left.length > 0) throw new Error(`the sealed page still names an outside address: ${left.join(', ')}`);
  return sealed;
}

export function shipsInPortal(path: string, leftOut: readonly string[] = []): boolean {
  if (PORTAL.privateFolders.some((folder: string): boolean => path.startsWith(folder))) return false;
  if (leftOut.some((folder: string): boolean => path.startsWith(folder))) return false;
  if (PORTAL.siteOnlyPage.test(path)) return false;
  return !PORTAL.siteOnly.some((file: string): boolean => path === file);
}

export function withheldSet(env: Readonly<Record<string, unknown>>): readonly string[] {
  return PORTAL.withheldEnv.filter((key: string): boolean => {
    const value: unknown = env[key];
    return typeof value === 'string' && value.trim() !== '';
  });
}

export function refuseWithheld(env: Readonly<Record<string, unknown>>): void {
  const set: readonly string[] = withheldSet(env);
  if (set.length > 0) throw new Error(`the portal build runs with no server: unset ${set.join(' and ')}`);
}

export function megabytes(bytes: number): string {
  return `${(bytes / MEGABYTE).toFixed(1)} MB`;
}

export function checkLimits(files: readonly PortalFile[], limits: PortalLimits): PortalReport {
  const totalBytes: number = files.reduce((sum: number, file: PortalFile): number => sum + file.bytes, 0);
  const problems: string[] = [];
  if (files.length > limits.files) problems.push(`${files.length} files, more than the ${limits.files} allowed`);
  if (totalBytes > limits.totalBytes) problems.push(`${megabytes(totalBytes)} in all, more than the ${megabytes(limits.totalBytes)} allowed`);
  for (const file of files) {
    if (file.bytes > limits.fileBytes) problems.push(`${file.path} is ${megabytes(file.bytes)}, more than the ${megabytes(limits.fileBytes)} allowed for one file`);
  }
  return { files: files.length, totalBytes, problems };
}

export function describeReport(report: PortalReport): string {
  return `${report.files} files, ${megabytes(report.totalBytes)}`;
}

export function filesUnder(dir: string): PortalFile[] {
  const walk = (folder: string): PortalFile[] =>
    readdirSync(folder)
      .toSorted()
      .flatMap((name: string): PortalFile[] => {
        const path: string = join(folder, name);
        const stats = statSync(path);
        return stats.isDirectory() ? walk(path) : [{ path: relative(dir, path).split(sep).join('/'), bytes: stats.size }];
      });
  return walk(dir);
}

export function swapModules(root: string, swaps: Readonly<Record<string, string>>): Plugin {
  const table: ReadonlyMap<string, string> = new Map<string, string>(Object.entries(swaps).map(([from, to]: [string, string]): [string, string] => [resolve(root, from), resolve(root, to)]));
  const swapped: Set<string> = new Set<string>();
  return {
    name: 'lost-storm-swaps',
    enforce: 'pre',
    async resolveId(source: string, importer: string | undefined): Promise<string | null> {
      if (importer === undefined) return null;
      const found: Rollup.ResolvedId | null = await this.resolve(source, importer, { skipSelf: true });
      if (found === null) return null;
      const to: string | undefined = table.get(found.id);
      if (to === undefined) return null;
      swapped.add(found.id);
      return to;
    },
    generateBundle(_options: Rollup.NormalizedOutputOptions, bundle: Rollup.OutputBundle): void {
      const missed: readonly string[] = [...table.keys()].filter((from: string): boolean => !swapped.has(from));
      if (missed.length > 0) throw new Error(`no import reached these swapped modules, so the swap table is stale: ${missed.map((from: string): string => relative(root, from)).join(', ')}`);
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        const kept: readonly string[] = output.moduleIds.filter((id: string): boolean => table.has(id));
        if (kept.length > 0) throw new Error(`${output.fileName} still holds swapped-out modules: ${kept.map((id: string): string => relative(root, id)).join(', ')}`);
      }
    },
  };
}

export function portalPage(publicDir: string, site: string, target: PortalTarget): Plugin {
  return {
    name: 'lost-storm-portal',
    enforce: 'post',
    configResolved(config: ResolvedConfig): void {
      refuseWithheld(config.env);
    },
    transformIndexHtml(html: string): string {
      return target.sealed ? sealPage(html) : siteAnchors(html, site);
    },
    generateBundle(_options: Rollup.NormalizedOutputOptions, bundle: Rollup.OutputBundle): void {
      const page: Rollup.OutputAsset | Rollup.OutputChunk | undefined = bundle[PORTAL.page.from];
      if (page?.type !== 'asset' || typeof page.source !== 'string') throw new Error(`the portal build made no ${PORTAL.page.from}`);
      const source: string = page.source;
      Reflect.deleteProperty(bundle, PORTAL.page.from);
      this.emitFile({ type: 'asset', fileName: PORTAL.page.to, source: liftPage(source) });
      for (const file of filesUnder(publicDir)) {
        if (shipsInPortal(file.path, target.leftOut)) this.emitFile({ type: 'asset', fileName: file.path, source: readFileSync(join(publicDir, file.path)) });
      }
    },
  };
}
