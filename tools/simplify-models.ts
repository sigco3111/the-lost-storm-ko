import { NodeIO } from '@gltf-transform/core';
import type { Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import type { SimplifyOptions, SimplifyReport } from './simplify-model.ts';
import { DEFAULT_SIMPLIFY, simplifyDocument } from './simplify-model.ts';

const USAGE = 'usage: node tools/simplify-models.ts <ratio> <error> <model.glb> [<model.glb> ...]';

async function simplifyFile(io: NodeIO, path: string, options: SimplifyOptions): Promise<void> {
  const document: Document = await io.read(path);
  const report: SimplifyReport = await simplifyDocument(document, options);
  await io.write(path, document);
  console.log(`${path}: ${report.before} -> ${report.after} triangles`);
}

async function main(): Promise<void> {
  const [ratioText, errorText, ...paths]: readonly string[] = process.argv.slice(2);
  const ratio: number = Number(ratioText);
  const error: number = Number(errorText);
  if (!(ratio > 0 && ratio <= 1) || !(error > 0) || paths.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const options: SimplifyOptions = { ...DEFAULT_SIMPLIFY, ratio, error };
  await Promise.all(paths.map((path: string): Promise<void> => simplifyFile(io, path, options)));
}

await main();
