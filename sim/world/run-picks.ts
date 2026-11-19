import type { RunFamily, RunPick } from '../content/run-table-types.ts';
import type { Content, MonsterDef, ZoneDef } from '../content/types.ts';

export interface PickChoice {
  readonly id: string;
  readonly name: string;
  readonly monsters: readonly string[];
}

function plain(monster: MonsterDef): boolean {
  return monster.boss === null && monster.rank === null && monster.summon === null;
}

export function levelMonsters(content: Content, zone: ZoneDef): MonsterDef[] {
  const seen: Map<string, MonsterDef> = new Map<string, MonsterDef>();
  for (const pack of zone.packs) {
    for (const member of pack.members) {
      const monster: MonsterDef | undefined = content.monsters.get(member.monster);
      if (monster !== undefined && plain(monster)) seen.set(monster.id, monster);
    }
  }
  return [...seen.values()];
}

export function levelKinds(content: Content, zone: ZoneDef): MonsterDef[] {
  const seen: Map<string, MonsterDef> = new Map<string, MonsterDef>();
  for (const monster of levelMonsters(content, zone)) {
    if (!seen.has(monster.name)) seen.set(monster.name, monster);
  }
  return [...seen.values()];
}

export function levelFamilies(content: Content, zone: ZoneDef): PickChoice[] {
  const here: ReadonlySet<string> = new Set<string>(levelMonsters(content, zone).map((monster: MonsterDef): string => monster.id));
  return content.runTable.families.flatMap((family: RunFamily): PickChoice[] => {
    const monsters: string[] = family.monsters.filter((id: string): boolean => here.has(id));
    return monsters.length >= content.runTable.familyLeast ? [{ id: family.id, name: family.name, monsters }] : [];
  });
}

export function pickChoices(content: Content, pick: RunPick, zone: ZoneDef): PickChoice[] {
  let choices: PickChoice[] = [];
  switch (pick) {
    case 'none':
      break;
    case 'monster':
      choices = levelKinds(content, zone).map((monster: MonsterDef): PickChoice => ({ id: monster.id, name: monster.name, monsters: [monster.id] }));
      break;
    case 'family':
      choices = levelFamilies(content, zone);
      break;
  }
  return choices;
}

export function pickName(content: Content, pick: RunPick, id: string | null): string | null {
  if (id === null) return null;
  let name: string | null = null;
  switch (pick) {
    case 'none':
      break;
    case 'monster':
      name = content.monsters.get(id)?.name ?? null;
      break;
    case 'family':
      name = content.runTable.families.find((family: RunFamily): boolean => family.id === id)?.name ?? null;
      break;
  }
  return name;
}
