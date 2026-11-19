import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MaterialFix } from './creature-model.ts';
import { clipNamesOf, dropClips, fixMaterials, flatColour, flattenMaterials, holdStillClips, keepOnlyClip, plainClipNames } from './creature-model.ts';

async function writeBody(io: NodeIO, source: string, target: string, flat: readonly [number, number, number] | null): Promise<readonly MaterialFix[]> {
  const document: Document = await io.read(source);
  const fixed: readonly MaterialFix[] = fixMaterials(document);
  if (flat !== null) console.log(`dropped ${flattenMaterials(document, flat)} textures for a flat colour`);
  dropClips(document);
  await document.transform(prune({ keepLeaves: true }));
  mkdirSync(dirname(target), { recursive: true });
  await io.write(target, document);
  return fixed;
}

async function writeClip(io: NodeIO, source: string, folder: string, name: string): Promise<string> {
  const document: Document = await io.read(source);
  plainClipNames(document);
  keepOnlyClip(document, name);
  holdStillClips(document);
  await document.transform(prune({ keepLeaves: true }));
  const target: string = join(folder, `${name}.glb`);
  await io.write(target, document);
  return target;
}

async function main(): Promise<void> {
  const [source, body, folder, ...rest] = process.argv.slice(2);
  const flatAt: number = rest.indexOf('--flat');
  const flat: readonly [number, number, number] | null = flatAt === 0 ? flatColour(rest[1] ?? '') : null;
  if (source === undefined || body === undefined || folder === undefined || rest.length !== (flatAt === 0 ? 2 : 0) || (flatAt === 0 && flat === null)) {
    console.error('usage: node tools/build-creature.ts <creature.gltf|glb> <body.glb> <clip-folder> [--flat #rrggbb]');
    process.exit(2);
  }
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const named: Document = await io.read(source);
  plainClipNames(named);
  const names: readonly string[] = clipNamesOf(named);
  mkdirSync(folder, { recursive: true });
  const fixed: readonly MaterialFix[] = await writeBody(io, source, body, flat);
  const clips: readonly string[] = await Promise.all(names.map((name: string): Promise<string> => writeClip(io, source, folder, name)));
  for (const fix of fixed) console.log(`${fix.name}: ${fix.opacity ? 'made opaque' : ''}${fix.opacity && fix.emissive ? ', ' : ''}${fix.emissive ? 'emissive cleared' : ''}`);
  console.log(`${source} -> ${body}, ${clips.length} clips into ${folder}`);
}

await main();
