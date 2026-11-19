import type { GuidePage } from '../guide/site.ts';
import { GUIDE_PAGES } from '../guide/site.ts';
import { esc } from '../guide/html.ts';
import { absolute, SITE } from './head.ts';

export const HIDDEN_PAGES: readonly string[] = ['/privacy.html', '/terms.html'];
export const CLOSED_PATHS: readonly string[] = ['/v1/', '/sounds/', '/models/', '/textures/', '/audio/'];
export const SITEMAP_PATH: string = '/sitemap.xml';

export function indexedPages(): readonly string[] {
  return ['/', SITE.playPath, ...GUIDE_PAGES.map((page: GuidePage): string => page.href)];
}

export function sitemapXml(paths: readonly string[] = indexedPages()): string {
  const urls: string = paths.map((path: string): string => `  <url><loc>${esc(absolute(path))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return ['User-agent: *', 'Allow: /', ...CLOSED_PATHS.map((path: string): string => `Disallow: ${path}`), '', `Sitemap: ${absolute(SITEMAP_PATH)}`, ''].join('\n');
}
