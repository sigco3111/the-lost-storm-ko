import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { activeChange, changesHeld } from '../../sim/progression.ts';
import type { HeldChange } from '../../sim/progression.ts';

export interface ChangeChoice {
  readonly becomes: string;
  readonly name: string;
  readonly lit: boolean;
}

export interface SkillChanges {
  readonly skill: string;
  readonly title: string;
  readonly choices: readonly ChangeChoice[];
}

export interface ChangeOwner {
  readonly allocated: readonly string[];
  readonly changes: Readonly<Record<string, string>>;
}

function nameOf(content: Content, id: string): string {
  return content.skills.get(id)?.name ?? id;
}

export function skillChanges(content: Content, owner: ChangeOwner, skill: string): SkillChanges | null {
  const held: readonly HeldChange[] = changesHeld(content, owner.allocated, skill);
  if (held.length < 2) return null;
  const active: string | null = activeChange(content, owner.allocated, owner.changes, skill);
  return {
    skill,
    title: `${nameOf(content, skill)} 사용 횟수`,
    choices: held.map((entry: HeldChange): ChangeChoice => ({ becomes: entry.becomes, name: entry.place.name, lit: entry.becomes === active })),
  };
}

export function placeChanges(content: Content, owner: ChangeOwner, node: SkillTreeNodeDef): SkillChanges[] {
  if (!owner.allocated.includes(node.id)) return [];
  const found: SkillChanges[] = [];
  for (const variant of node.variants) {
    if (found.some((entry: SkillChanges): boolean => entry.skill === variant.skill)) continue;
    const changes: SkillChanges | null = skillChanges(content, owner, variant.skill);
    if (changes !== null) found.push(changes);
  }
  return found;
}

export function changesShape(changes: readonly SkillChanges[]): string {
  return changes.map((entry: SkillChanges): string => `${entry.skill}=${entry.choices.map((choice: ChangeChoice): string => choice.becomes).join('|')}`).join(';');
}

