import type { SkillMend } from './mend-types.ts';
import type { Fields } from './read.ts';
import { ContentError, fields, nonNegative, share } from './read.ts';
import type { BossSkill, Content, SkillDef } from './types.ts';

export function skillMend(value: unknown, where: string): SkillMend | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const flat: number = source['flat'] === undefined ? 0 : nonNegative(source, 'flat', where);
  const lifeShare: number = source['lifeShare'] === undefined ? 0 : share(source, 'lifeShare', where);
  if (flat === 0 && lifeShare === 0) throw new ContentError(where, 'a mend must restore some life');
  return { flat, lifeShare };
}

export function reachesAllies(skill: SkillDef): boolean {
  return skill.delivery.type === 'nova' && skill.delivery.side === 'allies';
}

function heals(content: Content, id: string | null): boolean {
  if (id === null) return false;
  return (content.skills.get(id)?.mend ?? null) !== null;
}

export function mendProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  for (const skill of content.skills.values()) {
    if (reachesAllies(skill)) need(skill.mend !== null, `skill ${skill.id} reaches allies but mends nothing`);
    else need(skill.mend === null, `skill ${skill.id} mends, but only a nova that reaches allies can carry a mend`);
    if (skill.mend === null) continue;
    need(skill.echo === 0, `skill ${skill.id} mends, and a mend cannot echo`);
    need(skill.leap === null, `skill ${skill.id} mends, and a mend cannot leap`);
  }
  for (const monster of content.monsters.values()) {
    need(!heals(content, monster.skill), `monster ${monster.id} attacks with ${monster.skill}, which only mends allies`);
    need(!heals(content, monster.deathSkill), `monster ${monster.id} bursts with ${monster.deathSkill ?? ''}, which only mends allies`);
    for (const phase of monster.boss?.phases ?? []) {
      const cast: readonly string[] = [...phase.skills.map((pick: BossSkill): string => pick.skill), ...phase.measure];
      for (const id of cast) need(!heals(content, id), `boss ${monster.id} casts ${id} below ${phase.below}, which only mends allies`);
    }
  }
  for (const mod of content.monsterMods.values()) need(!heals(content, mod.deathSkill), `monster mod ${mod.id} bursts with ${mod.deathSkill ?? ''}, which only mends allies`);
  return problems;
}
