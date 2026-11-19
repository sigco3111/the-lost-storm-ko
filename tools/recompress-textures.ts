import { execFileSync } from 'node:child_process';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { shrunkSize } from './shrink-size.ts';
import type { Size } from './shrink-size.ts';

const RECOMPRESS = {
  folder: 'public/textures',
  halfFolder: 'public/textures/half',
  effort: '6',
  halfQuality: 86,
  kilobyte: 1024,
  keep: 'keep',
  sizePattern: /Canvas size:\s*(\d+)\s*x\s*(\d+)/,
} as const;

function sizeOf(path: string): Size {
  const report: string = execFileSync('webpmux', ['-info', path], { encoding: 'utf8' });
  const found: RegExpExecArray | null = RECOMPRESS.sizePattern.exec(report);
  if (found?.[1] === undefined || found[2] === undefined) throw new Error(`Could not read the size of ${path}`);
  return [Number(found[1]), Number(found[2])];
}

function decode(path: string, folder: string, label: string): string {
  const decoded: string = join(folder, `${label}.png`);
  execFileSync('dwebp', ['-quiet', path, '-o', decoded]);
  return decoded;
}

function encode(source: string, target: string, quality: number, size: Size | null): void {
  const resize: string[] = size === null ? [] : ['-resize', String(size[0]), String(size[1])];
  execFileSync('cwebp', ['-quiet', '-q', String(quality), '-m', RECOMPRESS.effort, ...resize, source, '-o', target]);
}

function kilobytes(path: string): number {
  return Math.round(statSync(path).size / RECOMPRESS.kilobyte);
}

function halved(size: Size): Size {
  return [Math.max(1, Math.round(size[0] / 2)), Math.max(1, Math.round(size[1] / 2))];
}

function recompress(name: string, quality: number, edge: number | null, folder: string): void {
  const full: string = join(RECOMPRESS.folder, name);
  const half: string = join(RECOMPRESS.halfFolder, name);
  const fullBefore: number = kilobytes(full);
  const halfBefore: number = kilobytes(half);
  const size: Size = sizeOf(full);
  const target: Size = edge === null ? size : (shrunkSize(size, edge) ?? size);
  const source: string = decode(full, folder, `${name}-full`);
  encode(source, full, quality, target[0] === size[0] && target[1] === size[1] ? null : target);
  encode(source, half, RECOMPRESS.halfQuality, halved(target));
  console.log(`${name}: ${fullBefore} KB -> ${kilobytes(full)} KB, half ${halfBefore} KB -> ${kilobytes(half)} KB`);
}

function main(): void {
  const [qualityText, edgeText, ...names]: readonly string[] = process.argv.slice(2);
  const quality: number = Number(qualityText);
  const edge: number | null = edgeText === RECOMPRESS.keep ? null : Number(edgeText);
  if (!(quality >= 1 && quality <= 100) || (edge !== null && !(edge >= 16)) || names.length === 0) {
    console.error('usage: node tools/recompress-textures.ts <quality 1-100> <longest-edge|keep> <name.webp> [<name.webp> ...]');
    process.exit(2);
  }
  const folder: string = mkdtempSync(join(tmpdir(), 'recompress-textures-'));
  for (const name of names) recompress(basename(name), quality, edge, folder);
}

main();
