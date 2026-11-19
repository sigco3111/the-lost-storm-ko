import { emptyEquipment } from '../../../sim/items.ts';
import { computeStats } from '../../../sim/stats.ts';
import { ANY_WEAPON } from '../../../sim/weapons.ts';
import type { DropLean, ItemBaseDef, RarityDef, SkillTreeNodeDef, StatBlock } from '../../../sim/content/types.ts';
import type { SkillPolicy } from '../../simulate-policies.ts';
import { namedSkill } from '../builds.ts';
import type { GuideData } from '../data.ts';
import { buildMeasure, focusSkill, levelForPlace, measuredNow, path, place, route, topLevel } from '../data.ts';
import { SLOT_NAMES } from '../facts.ts';
import { bullets, decimal, esc, list, minutes, note, para, percent, section, signedPercent, table } from '../html.ts';
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
  stormcaller: { name: 'Stormcaller', kind: 'Staff and lightning' },
  bulwark: { name: 'Emberwarden', kind: 'Heavy weapon and fire' },
  whirlwind: { name: 'Maelstrom', kind: 'Blade and water' },
  windrunner: { name: 'Nightshot', kind: 'Crossbow and shadow' },
  'echo-weaver': { name: 'The Echo', kind: 'Any weapon, struck twice' },
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
      return '<span class="tag notable">Notable</span>';
    case 'keystone':
      return '<span class="tag keystone">Keystone</span>';
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
    const levelMark: string = level === shownLevel ? '' : `<span class="at-level">Level ${level}</span>`;
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
    ['Paths', esc(list(pathsOf(data, order)))],
    ['Main skill', esc(mainSkillName(data, notes))],
    ['Keystone', keystones.length === 0 ? 'None' : list(keystones)],
    [`Life at level ${level}`, `${Math.round(built.maxLife)} <span class="vs">(${Math.round(bare.maxLife)} with no places taken)</span>`],
    ['Armour from the tree', `${Math.round(built.armour)}`],
    ['Critical strike', `${percent(built.critChance)} chance, ×${decimal(built.critMultiplier, 2)} damage`],
    ['Damage from the tree', signedPercent(built.damagePercent)],
    ['Attack speed', `×${decimal(built.attackSpeed, 2)}`],
  ];
  return `<dl class="glance">${rows.map(([term, value]: readonly [string, string]): string => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('')}</dl>
<p class="small">Life, armour and the rest are what the places on the route give a level ${level} character with nothing equipped. Gear adds to all of them.</p>`;
}

function capitalised(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function withArticle(name: string): string {
  return name.startsWith('The ') ? name : `the ${name}`;
}

export function whereLikely(places: LegendaryPlaces): string {
  const leaning: DropLean[] = [...places.family, ...places.weapon];
  const boss: string[] = places.boss.filter((lean: DropLean): boolean => !leaning.includes(lean)).map((lean: DropLean): string => lean.name);
  if (leaning.length === 0) return capitalised(boss.length === 0 ? 'anywhere alike' : `anywhere alike, and more often in ${list(boss)}`);
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
    'Legendaries',
    [
      para(
        `About one drop in ${Math.round(1 / share)} is a legendary, and you can wear ${rarity?.wornLimit ?? 0} at once. These are the ones made for this build. Each is good worn alone, and together they change how the build plays.`,
        'Every area drops every legendary. The last column says where each is most likely: those areas drop its kind more often.',
      ),
      table({ head: ['Item', 'Slot', 'Power', 'What it changes', 'Most likely in'], rows: notes.legendaries.map((entry: LegendaryNote): string[] => legendaryRow(data, entry)), className: 'wide' }),
      first === undefined ? '' : para(`Chase ${withArticle(firstName)} first. ${notes.chase}`),
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
    barChart(entries, { title: `Time to level ${level}`, hint: 'shorter is faster', value: (measure): number | null => levelMinutes(measure.steady, level), show: (value: number): string => `${Math.round(value)} min`, lowerIsBetter: true }, current),
    barChart(entries, { title: `The boss at level ${bossLevel}`, hint: 'seconds to win, shorter is better', value: (measure): number | null => bossAt(measure.steady, bossLevel)?.seconds ?? null, show: (value: number): string => `${Math.round(value)} s`, lowerIsBetter: true }, current),
    barChart(entries, { title: `The boss at level ${bossLevel}, played carelessly`, hint: 'share of fights won', value: (measure): number | null => bossAt(measure.careless, bossLevel)?.winShare ?? null, show: (value: number): string => percent(value), lowerIsBetter: false }, current),
    barChart(entries, { title: 'Deaths an hour, played carelessly', hint: 'fewer is safer', value: (measure): number | null => measure.careless.deathsPerHour, show: (value: number): string => decimal(value, 1), lowerIsBetter: true }, current),
    `</div>`,
  ].join('\n');
}

function drinks(policy: SkillPolicy): string {
  return policy.flaskAt === null ? 'never drinks a flask' : `drinks a life flask at ${percent(policy.flaskAt)} life`;
}

function habits(policy: SkillPolicy): string {
  const dodge: string = policy.habits.dodges ? 'steps out of attacks it can see coming' : 'never steps out of anything';
  return `${dodge}, ${drinks(policy)} and ${policy.rolls ? 'rolls out of danger' : 'never rolls'}`;
}

export function measuredMethod(data: GuideData): string {
  return para(
    `These numbers come from the game's own rules, played by a simulated player ${data.measured.runs} times per build from a fresh character. The steady player ${habits(namedSkill(data.policies, data.spec.skill))}. The careless player ${habits(namedSkill(data.policies, data.spec.careless))}. Both follow the route on the page and wear whatever raises their damage and toughness most.`,
    'A simulated player walks straight to the next fight and never stops to read an item, so a person takes longer to reach each level. Compare the builds with each other, not with your own clock.',
    measuredNow(data) ? `They were measured on the game as it is now, balance ${data.balance}.` : `They were measured on balance ${data.measured.fingerprint}. The game is now at balance ${data.balance}.`,
  );
}

export function staleNotice(data: GuideData): string {
  return measuredNow(data) ? '' : note(`The game's balance has changed since these numbers were measured, so they show the game as it was, not as it is now. They are measured again after the changes settle.`);
}

function deaths(perHour: number): string {
  return perHour === 0 ? 'never died' : `died ${decimal(perHour, 1)} times an hour`;
}

export function summaryLine(data: GuideData, id: string): string {
  const measure = buildMeasure(data, id);
  const top: number = topLevel(data.spec);
  const bossLevel: number = data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? top;
  const reached: number | null = levelMinutes(measure.steady, top);
  const climb: string = reached === null ? `reached level ${top} in only some runs` : `reached level ${top} in about ${minutes(reached)} of play`;
  const won: string = percent(bossAt(measure.careless, bossLevel)?.winShare ?? 0);
  return `Played steadily, this build ${climb} and ${deaths(measure.steady.deathsPerHour)}. Played carelessly it ${deaths(measure.careless.deathsPerHour)} and won ${won} of its fights with the boss at level ${bossLevel}.`;
}

export function mainSkillName(data: GuideData, notes: BuildNotes): string {
  return notes.mainSkill ?? focusSkill(data, notes.id).name;
}

export function buildPage(data: GuideData, notes: BuildNotes): string {
  const order: readonly string[] = route(data, notes.id);
  const top: number = topLevel(data.spec);
  return [
    section('glance', 'At a glance', glance(data, notes, order)),
    signatureSection(data, notes.id),
    section('plays', 'How it plays', para(...notes.plays)),
    section(
      'route',
      'The route',
      [
        para(`Take the places in this order. Two points come with every level after the first, and the first two come early in the Hall of Time, so the list says the level at which you can afford each place. It runs to level ${top}, where the Hall of Time stops growing harder.`),
        `<figure class="tree">${treePicture(data.content, order, `The ${notes.name} route on the Skill Tree`)}<figcaption>Filled places are on the route. The numbers mark the notables and keystones in the order you reach them.</figcaption></figure>`,
        routeList(data, order, notes),
        para(notes.afterRoute),
      ].join('\n'),
    ),
    section('lean', `Lean on ${esc(mainSkillName(data, notes))}`, para(...notes.lean)),
    legendariesSection(data, notes),
    section('gear', 'Gear', `<div class="two"><div><h3>Look for</h3>${bullets(notes.lookFor)}</div><div><h3>Avoid</h3>${bullets(notes.avoid)}</div></div>`),
    section('strengths', 'Strengths and weak spots', `<div class="two"><div><h3>Strong at</h3>${bullets(notes.strengths)}</div><div><h3>Weak at</h3>${bullets(notes.weakSpots)}</div></div>`),
    notes.thin.length === 0 ? '' : section('thin', 'Thin today', para(...notes.thin)),
    section(
      'numbers',
      'Measured',
      [
        para(summaryLine(data, notes.id)),
        comparison(data, notes.id),
        measuredTable(namedMeasures(data), data.spec.levels, data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? top),
        measuredMethod(data),
      ].join('\n'),
    ),
  ].join('\n');
}
