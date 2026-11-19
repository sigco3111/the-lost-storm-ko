import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { ConfigEnv, Plugin, ResolvedConfig, ServerOptions, UserConfig } from 'vite';
import { PORTAL, portalPage, portalTarget, swapModules } from './tools/portal.ts';
import type { PortalTarget } from './tools/portal.ts';
import { assetVersionDefine } from './tools/asset-versions.ts';
import links from './data/links.json' with { type: 'json' };
import { readServerUrl } from './src/backend/server-url.ts';
import { readLinks } from './src/launch/links.ts';
import { loadContent } from './sim/content/content.ts';
import { buildPage } from './src/launch/page-html.ts';
import { defaultBar } from './sim/skill-book.ts';
import { defaultKeys, titleKeyRows, titleKeysHtml, titleNames } from './src/title-keys.ts';
import { fillShell, guideInputs } from './tools/guide/site.ts';
import { fillHome } from './tools/site/head.ts';
import { robotsTxt, sitemapXml } from './tools/site/crawl.ts';

const ROOT: string = import.meta.dirname;
function pageLinks(linksOut: boolean): Plugin {
  let hasServer: boolean = false;
  return {
    name: 'lost-storm-page-links',
    configResolved(config: ResolvedConfig): void {
      const raw: unknown = config.env['VITE_SERVER_URL'];
      hasServer = readServerUrl(typeof raw === 'string' ? raw : undefined).kind === 'ok';
    },
    transformIndexHtml(html: string): string {
      const content = loadContent();
      const keys: string = titleKeysHtml(titleKeyRows(defaultKeys(content, hasServer), titleNames(content, defaultBar(content))));
      return buildPage(html, linksOut ? readLinks(links) : null, hasServer, keys);
    },
  };
}

function guidePages(): Plugin {
  return {
    name: 'lost-storm-guide',
    transformIndexHtml(html: string): string {
      return fillShell(html);
    },
  };
}

function siteFiles(): Plugin {
  return {
    name: 'lost-storm-site-files',
    transformIndexHtml(html: string): string {
      return fillHome(html);
    },
    generateBundle(): void {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml() });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt() });
    },
  };
}

function assetVersions(): Plugin {
  return {
    name: 'lost-storm-asset-versions',
    config(_config: UserConfig, env: ConfigEnv): UserConfig {
      return { define: assetVersionDefine(resolve(ROOT, 'public'), env.command === 'build') };
    },
  };
}

const SERVER: ServerOptions = { port: 5193, open: false };
const BUILD_TARGET: string = 'es2022';
const CHUNK_WARNING_KB: number = 1500;
const PORTAL_PAGE: string = PORTAL.page.from;

function siteConfig(): UserConfig {
  return {
    base: '/the-lost-storm-ko/',
    server: SERVER,
    plugins: [guidePages(), siteFiles(), pageLinks(true), assetVersions()],
    build: {
      target: BUILD_TARGET,
      chunkSizeWarningLimit: CHUNK_WARNING_KB,
      rollupOptions: {
        input: {
          landing: resolve(ROOT, 'index.html'),
          play: resolve(ROOT, 'play/index.html'),
          ...guideInputs(ROOT),
        },
      },
    },
  };
}

function portalConfig(target: PortalTarget): UserConfig {
  return {
    base: './',
    envDir: false,
    publicDir: false,
    plugins: [pageLinks(!target.sealed), assetVersions(), swapModules(ROOT, target.swaps), portalPage(resolve(ROOT, 'public'), readLinks(links).site, target)],
    build: {
      target: BUILD_TARGET,
      chunkSizeWarningLimit: CHUNK_WARNING_KB,
      outDir: resolve(ROOT, target.outDir),
      emptyOutDir: true,
      rollupOptions: { input: { play: resolve(ROOT, PORTAL_PAGE) } },
    },
  };
}

export default defineConfig((env: ConfigEnv): UserConfig => {
  const target: PortalTarget | null = portalTarget(env.mode);
  return target === null ? siteConfig() : portalConfig(target);
});
