import type { MonsterModDef } from '../../sim/content/combat-types.ts';
import type { Content, MonsterDef, SkillDef } from '../../sim/content/types.ts';
import { momentOfEcho } from '../../sim/world/moments.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { CATEGORY_NAMES } from './chart-ability.ts';

export type MonsterLine =
  | { readonly kind: 'ability'; readonly name: string; readonly tags: string; readonly effect: string }
  | { readonly kind: 'resist'; readonly text: string }
  | { readonly kind: 'weak'; readonly text: string }
  | { readonly kind: 'state'; readonly text: string };

function ability(skill: SkillDef, prefix: string): MonsterLine {
  return { kind: 'ability', name: `${prefix}${skill.name}`, tags: CATEGORY_NAMES[skill.category], effect: skill.description };
}

function abilities(content: Content, def: MonsterDef): MonsterLine[] {
  const ids: string[] = [def.skill, ...(def.boss?.phases.flatMap((phase): string[] => phase.skills.map((entry): string => entry.skill)) ?? [])];
  if (def.support !== null) ids.push(def.support);
  const lines: MonsterLine[] = [];
  for (const id of new Set<string>(ids)) {
    const skill: SkillDef | undefined = content.skills.get(id);
    if (skill !== undefined) lines.push(ability(skill, ''));
  }
  const last: SkillDef | undefined = def.deathSkill === null ? undefined : content.skills.get(def.deathSkill);
  if (last !== undefined) lines.push(ability(last, '죽을 때: '));
  if (def.summon !== null) {
    const kin: MonsterDef = def.summon.monster === null ? def : (content.monsters.get(def.summon.monster) ?? def);
    lines.push({ kind: 'ability', name: `${Number(def.summon.cooldown.toFixed(1))}초마다 ${kin.name} ${def.summon.count} 소환`, tags: '', effect: '' });
  }
  return lines;
}

function poiseLine(what: string, share: number): MonsterLine | null {
  if (share <= 0) return { kind: 'resist', text: `${what} 면역` };
  if (share < 1) return { kind: 'resist', text: `${what} 저항` };
  if (share > 1) return { kind: 'weak', text: `쉽게 ${what === 'stagger' ? '비틀거림' : '밀려남'}` };
  return null;
}

function defences(def: MonsterDef): MonsterLine[] {
  const lines: MonsterLine[] = [];
  const knock: MonsterLine | null = poiseLine('knockback', def.boss === null ? def.poise.knockback : def.boss.poise.knockback);
  const stagger: MonsterLine | null = poiseLine('stagger', def.boss === null ? def.poise.stagger : 0);
  if (knock !== null) lines.push(knock);
  if (stagger !== null) lines.push(stagger);
  if (def.guard !== null) {
    lines.push({ kind: 'resist', text: '정면을 지킨다' });
    lines.push({ kind: 'weak', text: '뒤는 열려 있다. 강한 일격은 방어를 부순다' });
  }
  return lines;
}

function stateTexts(world: World, monster: MonsterState): string[] {
  const def: MonsterDef = monster.def;
  const texts: string[] = [];
  if (def.boss !== null) texts.push('우두머리');
  if (def.rank !== null) texts.push(def.rank.leader ? `${def.rank.name} 우두머리` : def.rank.name);
  else if (def.mods.length > 0) texts.push('정예');
  if (def.faction === world.content.moments.faction) texts.push('적대적인 메아리');
  if (momentOfEcho(world, monster.id) !== null) texts.push('순간에 묶여 있다');
  if (monster.revived) texts.push('다시 일어난');
  if (monster.summonerId !== null) texts.push('다른 이가 불러낸');
  if (def.dormant !== null && !monster.aggro) texts.push('그대를 듣기 전까지 잠들어 있다');
  switch (def.behaviour.type) {
    case 'ranged':
      texts.push('거리를 유지한다');
      break;
    case 'stalker':
      texts.push('치기 전에 빙빙 돈다');
      break;
    case 'swarm':
      texts.push('무리로 그대를 에워싼다');
      break;
    case 'ambush':
      texts.push('가까이 오기를 기다렸다가 튀어 오른다');
      break;
    case 'fixed':
      texts.push(monster.sealed ? '봉인됨' : '제자리에 서 있다');
      break;
    case 'chaser':
      break;
  }
  return texts;
}

function modLines(content: Content, def: MonsterDef): MonsterLine[] {
  return def.mods.flatMap((id: string): MonsterLine[] => {
    const mod: MonsterModDef | undefined = content.monsterMods.get(id);
    return mod === undefined || mod.line.length === 0 ? [] : [{ kind: 'state', text: mod.line }];
  });
}

function stateLines(texts: readonly string[]): MonsterLine[] {
  return texts.map((text: string): MonsterLine => ({ kind: 'state', text }));
}

export interface RankPlate {
  readonly color: string | null;
  readonly mods: string;
}

export function rankPlate(content: Content, def: MonsterDef): RankPlate {
  if (def.rank === null) return { color: null, mods: '' };
  const prefixes: string[] = def.mods.flatMap((id: string): string[] => {
    const mod: MonsterModDef | undefined = content.monsterMods.get(id);
    return mod === undefined ? [] : [mod.prefix];
  });
  return { color: def.rank.color, mods: prefixes.join(' · ') };
}

export function monsterLines(world: World, monster: MonsterState): MonsterLine[] {
  return [...stateLines(stateTexts(world, monster)), ...modLines(world.content, monster.def), ...abilities(world.content, monster.def), ...defences(monster.def)];
}

export interface MonsterInfo {
  readonly content: Content;
  readonly def: MonsterDef;
  readonly states: readonly string[];
  readonly lines: readonly MonsterLine[];
  readonly key: string;
  readonly parts: readonly string[];
  readonly said: string;
}

function sameTexts(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((text: string, index: number): boolean => text === b[index]);
}

export function monsterInfo(before: MonsterInfo | null, world: World, monster: MonsterState): MonsterInfo {
  const states: string[] = stateTexts(world, monster);
  if (before !== null && before.content === world.content && before.def === monster.def && sameTexts(before.states, states)) return before;
  const lines: MonsterLine[] = [...stateLines(states), ...modLines(world.content, monster.def), ...abilities(world.content, monster.def), ...defences(monster.def)];
  const parts: string[] = monsterSummaryParts(lines);
  return { content: world.content, def: monster.def, states, lines, key: JSON.stringify(lines), parts, said: parts.join(' · ') };
}

export function monsterSummary(lines: readonly MonsterLine[]): string {
  return monsterSummaryParts(lines).join(' · ');
}

export function monsterSummaryParts(lines: readonly MonsterLine[]): string[] {
  return lines
    .map((line: MonsterLine): string => {
      switch (line.kind) {
        case 'ability':
          return line.tags.length > 0 ? line.tags : line.name;
        case 'resist':
        case 'weak':
        case 'state':
          return line.text;
      }
      return '';
    })
    .filter((text: string, index: number, all: readonly string[]): boolean => text.length > 0 && all.indexOf(text) === index);
}

export function reusedPhrases(shown: readonly string[], wanted: readonly string[]): (number | null)[] {
  let from: number = 0;
  return wanted.map((phrase: string): number | null => {
    const at: number = shown.indexOf(phrase, from);
    if (at < 0) return null;
    from = at + 1;
    return at;
  });
}
