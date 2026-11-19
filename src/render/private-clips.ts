import type { AnimationClip, Object3D } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AssetManifest } from '../audio/manifest.ts';
import { assetUrl, parseManifest } from '../audio/manifest.ts';
import { within } from '../audio/timeout.ts';
import type { RigActionClip, RigPrivateClip } from '../../sim/content/types.ts';
import type { ActionClip } from './character-library.ts';

export const PRIVATE_CLIPS = {
  manifest: 'manifest.json',
  manifestTimeoutMs: 3000,
  clipTimeoutMs: 15000,
} as const;

export interface PrivateClipSource {
  readonly clip: AnimationClip;
  readonly scene: Object3D;
}

export interface LoadedClipFile {
  readonly animations: readonly AnimationClip[];
  readonly scene: Object3D;
}

export interface PrivateClipDeps {
  readonly base: string | null;
  readonly fetchJson: (url: string, signal: AbortSignal) => Promise<unknown>;
  readonly loadFile: (url: string) => Promise<LoadedClipFile>;
}

export type PrivateClips = ReadonlyMap<string, PrivateClipSource>;

const NONE: PrivateClips = new Map<string, PrivateClipSource>();

async function readManifest(deps: PrivateClipDeps, base: string): Promise<AssetManifest | null> {
  const url: string | null = assetUrl(base, PRIVATE_CLIPS.manifest);
  if (url === null) return null;
  try {
    return parseManifest(await within(PRIVATE_CLIPS.manifestTimeoutMs, (signal: AbortSignal): Promise<unknown> => deps.fetchJson(url, signal)));
  } catch {
    return null;
  }
}

async function loadOne(deps: PrivateClipDeps, base: string, path: string): Promise<PrivateClipSource | null> {
  const url: string | null = assetUrl(base, path);
  if (url === null) return null;
  try {
    const file: LoadedClipFile = await within(PRIVATE_CLIPS.clipTimeoutMs, (): Promise<LoadedClipFile> => deps.loadFile(url));
    const clip: AnimationClip | undefined = file.animations[0];
    return clip === undefined ? null : { clip, scene: file.scene };
  } catch {
    return null;
  }
}

export async function loadPrivateClips(deps: PrivateClipDeps): Promise<PrivateClips> {
  const base: string | null = deps.base;
  if (base === null) return NONE;
  const manifest: AssetManifest | null = await readManifest(deps, base);
  if (manifest === null || manifest.clips.size === 0) return NONE;
  const loaded: [string, PrivateClipSource | null][] = await Promise.all([...manifest.clips].map(async ([key, path]: [string, string]): Promise<[string, PrivateClipSource | null]> => [key, await loadOne(deps, base, path)]));
  const clips: Map<string, PrivateClipSource> = new Map<string, PrivateClipSource>();
  for (const [key, source] of loaded) if (source !== null) clips.set(key, source);
  return clips;
}

export function usePrivateActions(actions: Map<string, ActionClip>, entries: Readonly<Record<string, RigActionClip>>, clips: PrivateClips, fit: (source: PrivateClipSource) => AnimationClip): void {
  for (const [key, entry] of Object.entries(entries)) {
    const wanted: RigPrivateClip | null = entry.private;
    const source: PrivateClipSource | undefined = wanted === null ? undefined : clips.get(wanted.clip);
    if (wanted === null || source === undefined) continue;
    const clip: AnimationClip = fit(source);
    actions.set(key, { clip, impactTime: clip.duration * wanted.impactFraction });
  }
}

export function browserClipDeps(base: string | null, loader: GLTFLoader): PrivateClipDeps {
  return {
    base,
    fetchJson: async (url: string, signal: AbortSignal): Promise<unknown> => {
      const response: Response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${response.status}`);
      const data: unknown = await response.json();
      return data;
    },
    loadFile: async (url: string): Promise<LoadedClipFile> => {
      const response: Response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status}`);
      return loader.parseAsync(await response.arrayBuffer(), '');
    },
  };
}
