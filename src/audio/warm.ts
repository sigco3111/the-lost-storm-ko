import type { AssetManifest } from './manifest.ts';

export function warmPaths(ids: readonly string[], manifest: AssetManifest): string[] {
  const seen: Set<string> = new Set<string>();
  const paths: string[] = [];
  for (const id of ids) {
    for (const path of manifest.sfx.get(id) ?? []) {
      if (seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
  }
  return paths;
}

export function warmVoicePaths(ids: readonly string[], manifest: AssetManifest): string[] {
  const paths: Set<string> = new Set<string>();
  for (const id of ids) {
    const path: string | undefined = manifest.voice.get(id);
    if (path !== undefined) paths.add(path);
  }
  return [...paths];
}
