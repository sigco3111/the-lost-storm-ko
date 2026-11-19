import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { GuidePage } from './site.ts';
import { GUIDE_PAGES, shellHtml, shellPath } from './site.ts';

const ROOT: string = resolve(import.meta.dirname, '../..');

for (const page of GUIDE_PAGES) {
  const target: string = resolve(ROOT, shellPath(page.key));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, shellHtml(page.key));
}

process.stderr.write(`wrote ${GUIDE_PAGES.map((page: GuidePage): string => shellPath(page.key)).join(', ')}\n`);
