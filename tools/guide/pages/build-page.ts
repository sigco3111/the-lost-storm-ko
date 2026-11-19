import { emptyEquipment } from '../../../sim/items.ts';
import { computeStats } from '../../../sim/stats.ts';
import { ANY_WEAPON } from '../../../sim/weapons.ts';
import type { DropLean, ItemBaseDef, RarityDef, SkillTreeNodeDef, StatBlock } from '../../../sim/content/types.ts';
import type { SkillPolicy } from '../../simulate-policies.ts';
import { namedSkill } from '../builds.ts';
import type { GuideData } from '../data.ts';
import { buildMeasure, focusSkill, levelForPlace, measuredNow, path, place, route, topLevel } from '../data.ts';
import { SLOT_NAMES } from '../facts.ts';
import { bullets, decimal, esc, list, minutes, note, para, percent, section, signedPercent, table , josa} from '../html.ts';
import type { LegendaryPlaces } from '../legendaries.ts';
import { legendary, legendaryShare, placesFor } from '../legendaries.ts';
import { signatureSection } from '../signature.ts';
import { treePicture } from '../tree-picture.ts';
import type { NamedMeasure } from './measured-view.ts';
import { barChart, bossAt, levelMinutes, measuredTable } from './measured-view.ts';

export interface BuildName {
  readonly name: string;
  readonly kind: string;
}

export const BUILD_NAMES: Readonly<Record<string, BuildName>> = {
  stormcaller: { name: '폭풍소환사', kind: '지팡이와 번개' },
  bulwark: { name: '잿불 파수꾼', kind: '중량 무기와 화염' },
  whirlwind: { name: '소용돌이', kind: '도검과 물' },
  windrunner: { name: '밤의 사수', kind: '쇠뇌와 그림자' },
  'echo-weaver': { name: '메아리', kind: '어떤 무기든, 두 번 적중' },
};

export function buildName(id: string): BuildName {
  const found: BuildName | undefined = BUILD_NAMES[id];
  if (found === undefined) throw new Error(`the build ${id} has no name in the guide`);
  return found;
}

export interface LegendaryNote {
  readonly item: string;
  readonly changes: string;
}

export interface BuildNotes {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly forWho: string;
  readonly plays: readonly string[];
  readonly lean: readonly string[];
  readonly lookFor: readonly string[];
  readonly avoid: readonly string[];
  readonly legendaries: readonly LegendaryNote[];
  readonly chase: string;
  readonly strengths: readonly string[];
  readonly weakSpots: readonly string[];
  readonly thin: readonly string[];
  readonly mainSkill: string | null;
  readonly marks: Readonly<Record<string, string>>;
  readonly afterRoute: string;
}

export const BUILD_PAGE = {
  bossLevelIndex: 0,
  levelIndex: 1,
} as const;

export function buildHref(id: string): string {
  return `/guide/builds/${id}/`;
}

function kindLabel(node: SkillTreeNodeDef): string {
  switch (node.kind) {
    case 'minor':
      return '';
    case 'notable':
      return '<span class="tag notable">노터블</span>';
    case 'keystone':
      return '<span class="tag keystone">키스톤</span>';
  }
  return '';
}

function pathsOf(data: GuideData, order: readonly string[]): string[] {
  const counts: Map<string, number> = new Map<string, number>();
  for (const id of order) {
    const node: SkillTreeNodeDef = place(data, id);
    counts.set(node.path, (counts.get(node.path) ?? 0) + 1);
  }
  return [...counts].toSorted((a: [string, number], b: [string, number]): number => b[1] - a[1]).map(([id, count]: [string, number]): string => `${path(data, id).name} (${count})`);
}

function routeList(data: GuideData, order: readonly string[], notes: BuildNotes): string {
  let shownLevel: number = 0;
  const items: string[] = order.map((id: string, index: number): string => {
    const node: SkillTreeNodeDef = place(data, id);
    const level: number = levelForPlace(data.content, index + 1);
    const levelMark: string = level === shownLevel ? '' : `<span class="at-level">레벨 ${level}</span>`;
    shownLevel = level;
    const mark: string | undefined = notes.marks[id];
    return `<li class="${node.kind}" style="--tint:${esc(path(data, node.path).tint)}">${levelMark}<span class="step">${index + 1}</span><span class="what"><b>${esc(node.name)}</b> ${kindLabel(node)}<span class="does">${esc(node.description)}</span>${mark === undefined ? '' : `<span class="why">${mark}</span>`}</span></li>`;
  });
  return `<ol class="route">\n${items.join('\n')}\n</ol>`;
}

function treeStats(data: GuideData, order: readonly string[], level: number): StatBlock {
  return computeStats(data.content, level, emptyEquipment(), order, [], ANY_WEAPON);
}

function glance(data: GuideData, notes: BuildNotes, order: readonly string[]): string {
  const level: number = topLevel(data.spec);
  const bare: StatBlock = treeStats(data, [], level);
  const built: StatBlock = treeStats(data, order, level);
  const keystones: string[] = order.map((id: string): SkillTreeNodeDef => place(data, id)).filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone').map((node: SkillTreeNodeDef): string => esc(node.name));
  const rows: readonly (readonly [string, string])[] = [
    ['길', esc(list(pathsOf(data, order)))],
    ['주력 스킬', esc(mainSkillName(data, notes))],
    ['키스톤', keystones.length === 0 ? '없음' : list(keystones)],
    [`레벨 ${level} 생명력`, `${Math.round(built.maxLife)} <span class="vs">(장소 미착용 시 ${Math.round(bare.maxLife)})</span>`],
    ['트리에서 오는 방어구', `${Math.round(built.armour)}`],
    ['치명타', `확률 ${percent(built.critChance)}, 피해 ×${decimal(built.critMultiplier, 2)}`],
    ['트리에서 오는 피해', signedPercent(built.damagePercent)],
    ['공격 속도', `×${decimal(built.attackSpeed, 2)}`],
  ];
  return `<dl class="glance">${rows.map(([term, value]: readonly [string, string]): string => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('')}</dl>
<p class="small">생명력, 방어구 등은 아무것도 착용하지 않은 레벨 ${level} 캐릭터가 경로의 장소들로 얻는 값이다. 장비가 여기에 더해진다.</p>`;
}

function capitalised(text: string): string {
  return text;
}

function withArticle(name: string): string {
  return name;
}

export function whereLikely(places: LegendaryPlaces): string {
  const leaning: DropLean[] = [...places.family, ...places.weapon];
  const boss: string[] = places.boss.filter((lean: DropLean): boolean => !leaning.includes(lean)).map((lean: DropLean): string => lean.name);
  if (leaning.length === 0) return capitalised(boss.length === 0 ? '어디서나 같음' : `어디서나 같고, ${list(boss)}에서 더 자주`);
  return capitalised(list([...leaning.map((lean: DropLean): string => lean.name), ...boss]));
}

function legendaryRow(data: GuideData, entry: LegendaryNote): string[] {
  const base: ItemBaseDef = legendary(data.content, entry.item);
  return [`<b>${esc(base.name)}</b>`, base.slot === null ? '' : esc(capitalised(SLOT_NAMES[base.slot])), esc(base.power?.text ?? ''), esc(entry.changes), esc(whereLikely(placesFor(data.content, base)))];
}

function legendariesSection(data: GuideData, notes: BuildNotes): string {
  const rarity: RarityDef | undefined = data.content.rarities.find((entry: RarityDef): boolean => entry.powers);
  const share: number = legendaryShare(data.content, null, null);
  const first: LegendaryNote | undefined = notes.legendaries[0];
  const firstName: string = first === undefined ? '' : esc(legendary(data.content, first.item).name);
  return section(
    'legendaries',
    '전설 아이템',
    [
      para(
        `드롭 약 ${Math.round(1 / share)}개 중 하나가 전설이고, 최대 ${rarity?.wornLimit ?? 0}개까지 착용할 수 있다. 여기 있는 것들이 이 빌드를 위해 만들어진 것이다. 하나만 입어도 좋고, 함께 입으면 빌드의 플레이가 바뀐다.`,
        '모든 지역에서 모든 전설이 나온다. 마지막 열은 각각이 가장 잘 나오는 곳이다: 그 지역에서 그 종류가 더 자주 나온다.',
      ),
      table({ head: ['아이템', '슬롯', '고유 힘', '바뀌는 것', '잘 나오는 곳'], rows: notes.legendaries.map((entry: LegendaryNote): string[] => legendaryRow(data, entry)), className: 'wide' }),
      first === undefined ? '' : para(`${withArticle(firstName)}${josa(withArticle(firstName),'을','를')} 먼저 노려라. ${notes.chase}`),
    ].join('\n'),
  );
}

export function namedMeasures(data: GuideData): NamedMeasure[] {
  return data.spec.builds.map((build): NamedMeasure => ({ id: build.id, name: buildName(build.id).name, href: buildHref(build.id), measure: buildMeasure(data, build.id) }));
}

export function comparison(data: GuideData, current: string): string {
  const entries: NamedMeasure[] = namedMeasures(data);
  const level: number = data.spec.levels[BUILD_PAGE.levelIndex] ?? topLevel(data.spec);
  const bossLevel: number = data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? topLevel(data.spec);
  return [
    `<div class="charts">`,
    barChart(entries, { title: `레벨 ${level}까지 걸리는 시간`, hint: '짧을수록 빠름', value: (measure): number | null => levelMinutes(measure.steady, level), show: (value: number): string => `${Math.round(value)}분`, lowerIsBetter: true }, current),
    barChart(entries, { title: `레벨 ${bossLevel}의 우두머리`, hint: '이길 때까지의 초, 짧을수록 좋음', value: (measure): number | null => bossAt(measure.steady, bossLevel)?.seconds ?? null, show: (value: number): string => `${Math.round(value)}초`, lowerIsBetter: true }, current),
    barChart(entries, { title: `레벨 ${bossLevel}의 우두머리, 부주의한 플레이`, hint: '이긴 싸움 비율', value: (measure): number | null => bossAt(measure.careless, bossLevel)?.winShare ?? null, show: (value: number): string => percent(value), lowerIsBetter: false }, current),
    barChart(entries, { title: '시간당 사망, 부주의한 플레이', hint: '적을수록 안전', value: (measure): number | null => measure.careless.deathsPerHour, show: (value: number): string => decimal(value, 1), lowerIsBetter: true }, current),
    `</div>`,
  ].join('\n');
}

function drinks(policy: SkillPolicy): string {
  return policy.flaskAt === null ? '약병을 마시지 않고' : `생명력 ${percent(policy.flaskAt)}에서 생명력 약병을 마시고`;
}

function habits(policy: SkillPolicy): string {
  const dodge: string = policy.habits.dodges ? '보이는 공격은 피하고' : '어떤 공격도 피하지 않고';
  return `${dodge}, ${drinks(policy)}, ${policy.rolls ? '위험에서 구른다' : '절대 구르지 않는다'}`;
}

export function measuredMethod(data: GuideData): string {
  return para(
    `이 수치들은 게임 자체의 규칙 위에서, 새 캐릭터로 시작한 시뮬레이션 플레이어가 빌드당 ${data.measured.runs}번씩 플레이한 결과다. 차분한 플레이어는 ${habits(namedSkill(data.policies, data.spec.skill))}. 부주의한 플레이어는 ${habits(namedSkill(data.policies, data.spec.careless))}. 둘 다 페이지의 경로를 따르고 피해와 생존을 가장 올려주는 장비를 입는다.`,
    '시뮬레이션 플레이어는 다음 싸움으로 곧장 걸어가고 아이템을 읽느라 멈추지 않으므로, 실제 사람은 각 레벨에 더 오래 걸린다. 자신의 시계가 아니라 빌드끼리 비교하라.',
    measuredNow(data) ? `이 수치들은 지금의 게임, 밸런스 ${data.balance}에서 측정됐다.` : `이 수치들은 밸런스 ${data.measured.fingerprint}에서 측정됐다. 지금 게임은 밸런스 ${data.balance}다.`,
  );
}

export function staleNotice(data: GuideData): string {
  return measuredNow(data) ? '' : note(`이 수치들이 측정된 뒤 게임 밸런스가 바뀌었으므로, 지금의 게임이 아니라 그때의 게임을 보여준다. 변경이 안정되면 다시 측정된다.`);
}

function deaths(perHour: number): string {
  return perHour === 0 ? '한 번도 죽지 않았고' : `시간당 ${decimal(perHour, 1)}번 죽었고`;
}

export function summaryLine(data: GuideData, id: string): string {
  const measure = buildMeasure(data, id);
  const top: number = topLevel(data.spec);
  const bossLevel: number = data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? top;
  const reached: number | null = levelMinutes(measure.steady, top);
  const climb: string = reached === null ? `일부 실행에서만 레벨 ${top}에 도달했고` : `약 ${minutes(reached)}의 플레이로 레벨 ${top}에 도달했고`;
  const won: string = percent(bossAt(measure.careless, bossLevel)?.winShare ?? 0);
  return `차분하게 플레이하면 이 빌드는 ${climb}, ${deaths(measure.steady.deathsPerHour)}다. 부주의하게 플레이하면 ${deaths(measure.careless.deathsPerHour)}, 레벨 ${bossLevel} 우두머리와의 싸움에서 ${won}를 이겼다.`;
}

export function mainSkillName(data: GuideData, notes: BuildNotes): string {
  return notes.mainSkill ?? focusSkill(data, notes.id).name;
}

export function buildPage(data: GuideData, notes: BuildNotes): string {
  const order: readonly string[] = route(data, notes.id);
  const top: number = topLevel(data.spec);
  return [
    section('glance', '한눈에 보기', glance(data, notes, order)),
    signatureSection(data, notes.id),
    section('plays', '플레이 방식', para(...notes.plays)),
    section(
      'route',
      '성장 경로',
      [
        para(`이 순서대로 장소를 찍어라. 첫 레벨 이후로는 레벨마다 포인트 두 개가 오고, 처음 두 개는 시간의 전당 초반에 얻으므로, 목록에는 각 장소를 찍을 수 있는 레벨이 적혀 있다. 시간의 전당이 더 어려워지지 않는 레벨 ${top}까지 이어진다.`),
        `<figure class="tree">${treePicture(data.content, order, `스킬 트리의 ${notes.name} 경로`)}<figcaption>채워진 장소가 경로다. 숫자는 도달하는 순서대로의 노터블과 키스톤이다.</figcaption></figure>`,
        routeList(data, order, notes),
        para(notes.afterRoute),
      ].join('\n'),
    ),
    section('lean', `${esc(mainSkillName(data, notes))}에 의지하라`, para(...notes.lean)),
    legendariesSection(data, notes),
    section('gear', '장비', `<div class="two"><div><h3>찾을 것</h3>${bullets(notes.lookFor)}</div><div><h3>피할 것</h3>${bullets(notes.avoid)}</div></div>`),
    section('strengths', '강점과 약점', `<div class="two"><div><h3>강한 점</h3>${bullets(notes.strengths)}</div><div><h3>약한 점</h3>${bullets(notes.weakSpots)}</div></div>`),
    notes.thin.length === 0 ? '' : section('thin', '오늘의 아쉬운 점', para(...notes.thin)),
    section(
      'numbers',
      '실측',
      [
        para(summaryLine(data, notes.id)),
        comparison(data, notes.id),
        measuredTable(namedMeasures(data), data.spec.levels, data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? top),
        measuredMethod(data),
      ].join('\n'),
    ),
  ].join('\n');
}
