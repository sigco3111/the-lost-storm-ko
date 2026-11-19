import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clipUrl, rigClipNames } from './clips.ts';
import { loadContent } from './content.ts';
import { fields, items } from './read.ts';
import type { Fields } from './read.ts';
import type { Content, RigDef } from './types.ts';

const content: Content = loadContent();

const GLB = { jsonLength: 12, jsonStart: 20 } as const;

function glbJson(path: string): Fields {
  const file: Buffer = readFileSync(path);
  return fields(JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8')), path);
}

function emptyTracks(path: string): number {
  const json: Fields = glbJson(path);
  const accessors: readonly unknown[] = items(json['accessors'], `${path}.accessors`);
  let empty: number = 0;
  for (const entry of items(json['animations'], `${path}.animations`)) {
    for (const sampler of items(fields(entry, path)['samplers'], `${path}.samplers`)) {
      const input: unknown = fields(sampler, path)['input'];
      const count: unknown = typeof input === 'number' ? fields(accessors[input], path)['count'] : undefined;
      if (typeof count !== 'number' || count < 1) empty += 1;
    }
  }
  return empty;
}

void test('every clip a rig plays keys each of its tracks at least once, since one empty track stops the whole game loading', (): void => {
  const paths: Set<string> = new Set<string>([...content.rigs.values()].flatMap((rig: RigDef): string[] => rigClipNames(rig).map((clip: string): string => `public/${clipUrl(rig, clip)}`)));
  assert.ok(paths.size > 0);
  for (const path of paths) assert.equal(emptyTracks(path), 0, path);
});
