import type { Condition, Content, ZoneExit } from './types.ts';

function heldBack(content: Content, requires: readonly Condition[]): boolean {
  return requires.some((condition: Condition): boolean => condition.type === 'flag' && !condition.not && content.world.withheld.includes(condition.flag));
}

function reachable(content: Content, roots: readonly string[], holding: boolean): ReadonlySet<string> {
  const found: Set<string> = new Set<string>(roots.filter((id: string): boolean => content.zones.has(id)));
  const queue: string[] = [...found];
  while (queue.length > 0) {
    const from: string | undefined = queue.pop();
    if (from === undefined) break;
    for (const exit of content.zones.get(from)?.exits ?? []) {
      if (found.has(exit.to) || (holding && heldBack(content, exit.requires))) continue;
      found.add(exit.to);
      queue.push(exit.to);
    }
  }
  return found;
}

export function withheldZones(content: Content): ReadonlySet<string> {
  const roots: readonly string[] = [content.world.start, content.world.town, ...(content.world.opening === null ? [] : [content.world.opening])];
  const everywhere: ReadonlySet<string> = reachable(content, roots, false);
  const open: ReadonlySet<string> = reachable(content, roots, true);
  return new Set<string>([...content.zones.keys()].filter((id: string): boolean => everywhere.has(id) && !open.has(id)));
}

export function exitWithheld(content: Content, exit: ZoneExit): boolean {
  return heldBack(content, exit.requires);
}
