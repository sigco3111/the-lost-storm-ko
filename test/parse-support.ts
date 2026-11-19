import quests from '../data/quests.json' with { type: 'json' };
import { PAIR_WORLD as world, SHALLOWS as shallows, WAYSTATION as waystation } from './pair-support.ts';
import { must } from './support.ts';
import { RAW_CONTENT } from '../sim/content/content.ts';
import { contentProblems, parseContent } from '../sim/content/parse.ts';
import type { RawContent } from '../sim/content/parse.ts';
import { ContentError } from '../sim/content/read.ts';

export const others: readonly unknown[] = RAW_CONTENT.zones.filter((zone: unknown): boolean => zone !== waystation && zone !== shallows);

export function zones(...mine: readonly unknown[]): unknown[] {
  return [...mine, ...others];
}

export const shipped: RawContent = { ...RAW_CONTENT, zones: zones(waystation, shallows), world };

export const act = must(world.acts[0], 'first act');

export function has(raw: RawContent, text: string): boolean {
  return contentProblems(parseContent(raw)).some((found: string): boolean => found.includes(text));
}

export function onlyQuest(quest: unknown): RawContent {
  return { ...shipped, quests: [quest] };
}

export function addedQuest(quest: unknown): RawContent {
  return { ...shipped, quests: [...quests, quest] };
}

export function townWithGate(change: Readonly<Record<string, unknown>>): unknown {
  return { ...waystation, exits: waystation.exits.map((exit): unknown => (exit.id === 'west_gate' ? { ...exit, ...change } : exit)) };
}

export function withZone(zone: unknown): RawContent {
  return { ...shipped, zones: zones(waystation, zone) };
}

export function problem(error: unknown, text: string): boolean {
  return error instanceof ContentError && error.message.includes(text);
}
