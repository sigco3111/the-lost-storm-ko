import type { Content, WearableDef } from './types.ts';

export function fitProblems(content: Content): string[] {
  const problems: string[] = [];
  const named: ReadonlySet<string> = new Set<string>([...content.wearables.values()].flatMap((def: WearableDef): string[] => (def.fit === null ? [] : [def.fit])));
  for (const def of content.wearables.values()) {
    for (const [fit, id] of Object.entries(def.fits)) {
      const other: WearableDef | undefined = content.wearables.get(id);
      if (!named.has(fit)) problems.push(`wearable ${def.id} fits over ${fit}, which no wearable is`);
      if (other === undefined) {
        problems.push(`wearable ${def.id} fits over ${fit} as unknown wearable ${id}`);
        continue;
      }
      if (other.region !== def.region) problems.push(`wearable ${def.id} fits over ${fit} as ${id}, which is worn on the ${other.region}, not the ${def.region}`);
      if (Object.keys(other.fits).length > 0) problems.push(`wearable ${def.id} fits over ${fit} as ${id}, which has fits of its own`);
    }
  }
  return problems;
}
