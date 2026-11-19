import type { ChartGroup, ItemBaseDef, SkillDef, SkillMod, SkillTreeNodeDef, SkillVariant } from '../../../sim/content/types.ts';
import type { SkillUnlock } from '../../../sim/content/shape-types.ts';
import type { GuideData } from '../data.ts';
import { path, playerSkills, skill, unlockPlace } from '../data.ts';
import { decimal, esc, link, list, para, section, table , josa} from '../html.ts';
import type { PageBody } from '../layout.ts';

export interface SkillChange {
  readonly source: string;
  readonly becomes: SkillDef;
}

export function mergedChanges(changes: readonly SkillChange[]): SkillChange[] {
  const merged: Map<string, string[]> = new Map<string, string[]>();
  const skills: Map<string, SkillDef> = new Map<string, SkillDef>();
  for (const change of changes) {
    merged.set(change.becomes.id, [...(merged.get(change.becomes.id) ?? []), change.source]);
    skills.set(change.becomes.id, change.becomes);
  }
  return [...merged.entries()].flatMap(([id, sources]: [string, string[]]): SkillChange[] => {
    const becomes: SkillDef | undefined = skills.get(id);
    return becomes === undefined ? [] : [{ source: list(sources), becomes }];
  });
}

function cost(entry: SkillDef): string {
  return entry.manaCost === 0 ? '없음' : `마나 ${decimal(entry.manaCost, 1)}`;
}

function wait(entry: SkillDef): string {
  return entry.cooldown === 0 ? '없음' : `${decimal(entry.cooldown, 2)}초`;
}

export function groupsOf(data: GuideData, skillId: string): ChartGroup[] {
  return data.content.chart.groups.filter((group: ChartGroup): boolean => group.skills.includes(skillId));
}

export function howToGet(data: GuideData, entry: SkillDef): string {
  const place: SkillTreeNodeDef | null = unlockPlace(data, entry.id);
  if (place !== null) return `${esc(path(data, place.path).name)}에서 ${esc(place.name)} 찍기`;
  const book: SkillUnlock | undefined = data.content.player.skillBook.find((own: SkillUnlock): boolean => own.skill === entry.id);
  if (book !== undefined) return book.when.length === 0 ? '처음부터 보유' : '시간의 전당에서 습득';
  const weapon: ItemBaseDef | undefined = variantSources(data, entry.id)[0];
  return weapon === undefined ? '아직 게임에 없음' : '쇠뇌를 든다';
}

function variantSources(data: GuideData, becomes: string): ItemBaseDef[] {
  return [...data.content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.variants.some((variant: SkillVariant): boolean => variant.becomes === becomes));
}

export function placeChanges(data: GuideData, skillId: string): SkillChange[] {
  return data.content.skillTree.flatMap((node: SkillTreeNodeDef): SkillChange[] =>
    node.variants.filter((variant: SkillVariant): boolean => variant.skill === skillId).map((variant: SkillVariant): SkillChange => ({ source: `${node.name} (${path(data, node.path).name})`, becomes: skill(data, variant.becomes) })),
  );
}

export function itemChanges(data: GuideData, skillId: string): SkillChange[] {
  return [...data.content.itemBases.values()].flatMap((base: ItemBaseDef): SkillChange[] => {
    const own: readonly SkillVariant[] = [...base.variants, ...(base.power?.variants ?? [])];
    return own.filter((variant: SkillVariant): boolean => variant.skill === skillId).map((variant: SkillVariant): SkillChange => ({ source: base.power === null ? base.name : `전설 아이템 ${base.name}`, becomes: skill(data, variant.becomes) }));
  });
}

function strengthenedBy(data: GuideData, skillId: string): SkillTreeNodeDef[] {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.skillMods.some((mod: SkillMod): boolean => mod.target.type === 'skill' && mod.target.skill === skillId));
}

function changeLine(change: SkillChange): string {
  const costs: string = change.becomes.manaCost === 0 && change.becomes.cooldown === 0 ? '' : ` <span class="small">(${[change.becomes.manaCost === 0 ? '' : `마나 ${decimal(change.becomes.manaCost, 1)}`, change.becomes.cooldown === 0 ? '' : `대기 ${decimal(change.becomes.cooldown, 2)}초`].filter((part: string): boolean => part.length > 0).join(', ')})</span>`;
  return `<li><b>${esc(change.becomes.name)}</b>, ${esc(change.source)}에서: ${esc(change.becomes.description)}${costs}</li>`;
}

function skillCard(data: GuideData, entry: SkillDef): string {
  const groups: string[] = groupsOf(data, entry.id).map((group: ChartGroup): string => group.name);
  const changes: SkillChange[] = mergedChanges([...placeChanges(data, entry.id), ...itemChanges(data, entry.id)]);
  const stronger: string[] = strengthenedBy(data, entry.id).map((node: SkillTreeNodeDef): string => node.name);
  const facts: string[] = [
    `<div><dt>비용</dt><dd>${cost(entry)}</dd></div>`,
    `<div><dt>대기</dt><dd>${wait(entry)}</dd></div>`,
    `<div><dt>얻는 방법</dt><dd>${howToGet(data, entry)}</dd></div>`,
    `<div><dt>취급 분류</dt><dd>${groups.length === 0 ? '해당 없음' : esc(list(groups))}</dd></div>`,
  ];
  const changed: string = changes.length === 0 ? '' : `<p class="label">이 스킬을 바꾸는 것</p><ul class="changes">${changes.map(changeLine).join('')}</ul>`;
  const helped: string = stronger.length === 0 ? '' : `<p class="label">이 스킬을 위한 장소</p><p>${esc(list(stronger))}</p>`;
  return `<article class="skill" id="${esc(entry.id.replace(/_/g, '-'))}">
<h3>${esc(entry.name)}</h3>
<p>${esc(entry.description)}</p>
<dl class="facts">${facts.join('')}</dl>
${changed}
${helped}
</article>`;
}

export function skillsPage(data: GuideData): PageBody {
  const skills: SkillDef[] = [...playerSkills(data), skill(data, 'quarrel')];
  return {
    kicker: '안내서',
    title: '스킬',
    lede: '오늘 쓸 수 있는 모든 스킬: 무엇을 하는지, 무엇이 드는지, 어떻게 얻고 무엇이 바꾸는지.',
    description: '폭풍의 잔향의 모든 스킬: 효과, 마나 비용과 재사용 대기, 스킬 트리에서 얻는 위치, 그리고 그것을 바꾸는 모든 장소와 아이템.',
    body: [
      section(
        'how',
        '스킬의 작동 방식',
        para(
          `${esc(skill(data, 'cleave').name)}${josa(esc(skill(data, 'cleave').name),'을','를')} 가지고 시작하고, 시간의 전당에서 ${esc(skill(data, 'dodge_roll').name)}${josa(esc(skill(data, 'dodge_roll').name),'을','를')} 배운다. 나머지 모든 스킬은 ${link('/guide/tree/', '스킬 트리')}의 한 장소다: 찍으면 스킬이 첫 번째 빈 슬롯에 들어간다.`,
          '스킬은 트리의 장소나 손에 쥔 무기에 의해 다른 것으로 바뀔 수 있다. 트리에서는 하나의 스킬을 한 번에 한 장소만 바꿀 수 있다. 무기의 변경은 그 위에 얹힌다: 쇠뇌를 들면 다른 것과 관계없이 베기가 볼트가 된다.',
          '"취급 분류"는 그 스킬이 어떤 종류로 취급되는지를 말한다. "번개 스킬 피해"라고 적힌 장소는 번개 스킬로 취급되는 모든 스킬에 적용된다.',
        ),
      ),
      section(
        'table',
        '한눈에 보기',
        table({ head: ['스킬', '비용', '대기', '얻는 방법'], rows: skills.map((entry: SkillDef): string[] => [`<a href="#${esc(entry.id.replace(/_/g, '-'))}">${esc(entry.name)}</a>`, cost(entry), wait(entry), howToGet(data, entry)]) }),
      ),
      section('all', '모든 스킬', skills.map((entry: SkillDef): string => skillCard(data, entry)).join('\n')),
    ].join('\n'),
  };
}
