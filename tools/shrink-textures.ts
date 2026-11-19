import type { Document, Texture } from '@gltf-transform/core';
import { ImageUtils, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Size } from './shrink-size.ts';
import { shrunkSize } from './shrink-size.ts';

const SHRINK = {
  webpQuality: '84',
  kilobyte: 1024,
} as const;

const EXTENSION_OF: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function shrinkTexture(texture: Texture, folder: string, index: number, edge: number): boolean {
  const image: Uint8Array | null = texture.getImage();
  const mime: string = texture.getMimeType();
  const extension: string | undefined = EXTENSION_OF[mime];
  if (image === null || extension === undefined) return false;
  const size: Size | null = ImageUtils.getSize(image, mime);
  const target: Size | null = size === null ? null : shrunkSize(size, edge);
  if (target === null) return false;
  const source: string = join(folder, `${index}.${extension}`);
  const output: string = join(folder, `${index}-small.webp`);
  writeFileSync(source, image);
  execFileSync('cwebp', ['-quiet', '-q', SHRINK.webpQuality, '-m', '6', '-resize', String(target[0]), String(target[1]), source, '-o', output]);
  texture.setImage(new Uint8Array(readFileSync(output)));
  texture.setMimeType('image/webp');
  texture.setURI(texture.getURI().replace(/\.(png|jpe?g)$/i, '.webp'));
  return true;
}

async function shrinkFile(io: NodeIO, path: string, edge: number): Promise<void> {
  const before: number = statSync(path).size;
  const document: Document = await io.read(path);
  const folder: string = mkdtempSync(join(tmpdir(), 'shrink-textures-'));
  const changed: boolean[] = document
    .getRoot()
    .listTextures()
    .map((texture: Texture, index: number): boolean => shrinkTexture(texture, folder, index, edge));
  if (changed.some((done: boolean): boolean => done)) document.createExtension(EXTTextureWebP).setRequired(true);
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(path, document);
  console.log(`${path}: ${Math.round(before / SHRINK.kilobyte)} KB -> ${Math.round(statSync(path).size / SHRINK.kilobyte)} KB`);
}

async function main(): Promise<void> {
  const [edgeText, ...paths]: readonly string[] = process.argv.slice(2);
  const edge: number = Number(edgeText);
  if (!(edge >= 16) || paths.length === 0) {
    console.error('usage: node tools/shrink-textures.ts <longest-edge> <model.glb> [<model.glb> ...]');
    process.exit(2);
  }
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  await Promise.all(paths.map((path: string): Promise<void> => shrinkFile(io, path, edge)));
}

await main();
