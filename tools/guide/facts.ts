import type { AffixDef, ItemBaseDef, ItemSlot, ModOp, SkillTreeNodeDef, SkillVariant, StatId, StatMod, WeaponGroup } from '../../sim/content/types.ts';
import { statLabel } from '../../sim/stat-text.ts';
import { weaponGroup } from '../../sim/weapons.ts';
import type { GuideData } from './data.ts';
import { levelForPlace, place, route, topLevel } from './data.ts';
import { guideRoute } from './builds.ts';
import { buildMeasure as buildMeasureOf, buildSpec, pointsAtLevel } from './data.ts';
import { decimal, esc, list, percent , josa} from './html.ts';
import type { BuildMeasure } from './measures.ts';
import { bossAt, levelMinutes } from './pages/measured-view.ts';

export const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = {
  weapon: '무기',
  head: '머리',
  chest: '가슴',
  hands: '손',
  legs: '다리',
  feet: '발',
  charm: '장신구',
};

const PERCENT_STATS: ReadonlySet<StatId> = new Set<StatId>(['damagePercent', 'attackSpeed', 'critChance', 'critMultiplier', 'goldFind', 'stormResist', 'frostResist']);

export function statAmount(stat: StatId, op: ModOp, value: number): string {
  if (op === 'percent' || PERCENT_STATS.has(stat)) return `${decimal(value * 100, 1)}%`;
  return decimal(value, 1);
}

export function modOf(node: SkillTreeNodeDef, stat: StatId): StatMod | null {
  return node.statMods.find((mod: StatMod): boolean => mod.stat === stat) ?? null;
}

export function modShare(data: GuideData, nodeId: string, stat: StatId): number {
  return Math.abs(modOf(place(data, nodeId), stat)?.value ?? 0);
}

export function placeLevel(data: GuideData, buildId: string, nodeId: string): number {
  const index: number = route(data, buildId).indexOf(nodeId);
  if (index < 0) throw new Error(`${nodeId} is not on the ${buildId} route`);
  return levelForPlace(data.content, index + 1);
}

export function affix(data: GuideData, id: string): AffixDef {
  const found: AffixDef | undefined = data.content.affixes.get(id);
  if (found === undefined) throw new Error(`the guide names the unknown affix ${id}`);
  return found;
}

export function affixLine(data: GuideData, id: string): string {
  const entry: AffixDef = affix(data, id);
  const range: string = `${statAmount(entry.stat, entry.op, entry.min)}~${statAmount(entry.stat, entry.op, entry.max)}`;
  return `<b>${esc(entry.label)}</b>: ${esc(statLabel(entry.stat))} +${range}, 높은 레벨 아이템은 더 큼 (${esc(list(entry.slots.map((slot: ItemSlot): string => SLOT_NAMES[slot])))})`;
}

export function statCap(data: GuideData, stat: StatId): number | null {
  return data.content.player.caps.find((cap): boolean => cap.stat === stat)?.max ?? null;
}

export function capPercent(data: GuideData, stat: StatId): string {
  const cap: number | null = statCap(data, stat);
  if (cap === null) throw new Error(`no cap on ${stat}`);
  return percent(cap);
}

export function nextPlaces(data: GuideData, buildId: string, count: number): SkillTreeNodeDef[] {
  const shown: number = route(data, buildId).length;
  const longer: readonly string[] = guideRoute(data.content, data.policies, data.spec, buildSpec(data, buildId), pointsAtLevel(data.content, topLevel(data.spec)) + count);
  return longer.slice(shown).map((id: string): SkillTreeNodeDef => place(data, id));
}

export function afterRouteText(data: GuideData, buildId: string, advice: string): string {
  const next: readonly SkillTreeNodeDef[] = nextPlaces(data, buildId, 4);
  const top: number = topLevel(data.spec);
  if (next.length === 0) return `레벨 ${top} 이후에도 포인트는 계속 오지만, 이 경로는 더 찍을 곳이 없다. ${advice}`;
  return `레벨 ${top} 이후에도 포인트는 계속 온다. 경로는 ${esc(list(next.map((node: SkillTreeNodeDef): string => node.name)))}${josa(esc(list(next.map((node: SkillTreeNodeDef): string => node.name))),'으','로')} 이어진다. ${advice}`;
}

export type Metric = (measure: BuildMeasure) => number | null;

export function rankOf(data: GuideData, buildId: string, metric: Metric, higherIsBetter: boolean): number {
  const values: { readonly id: string; readonly value: number }[] = data.measured.builds.flatMap((measure: BuildMeasure): { readonly id: string; readonly value: number }[] => {
    const value: number | null = metric(measure);
    return value === null ? [] : [{ id: measure.id, value }];
  });
  const sorted = values.toSorted((a, b): number => (higherIsBetter ? b.value - a.value : a.value - b.value));
  const index: number = sorted.findIndex((entry): boolean => entry.id === buildId);
  return index < 0 ? values.length + 1 : index + 1;
}

const ORDINALS: readonly string[] = ['가장', '두 번째로', '세 번째로', '네 번째로', '다섯 번째로', '여섯 번째로', '일곱 번째로', '여덟 번째로'];

export function rankWords(rank: number, best: string, worst: string, count: number): string {
  if (rank === count) return `가장 ${worst}`;
  return `${ORDINALS[rank - 1] ?? `${rank}번째로`} ${best}`;
}

export function speedRank(data: GuideData, buildId: string, level: number): string {
  const metric: Metric = (measure: BuildMeasure): number | null => levelMinutes(measure.steady, level);
  return rankWords(rankOf(data, buildId, metric, false), '빠르게', '느리게', data.measured.builds.length);
}

export function bossSpeedRank(data: GuideData, buildId: string, level: number): string {
  const metric: Metric = (measure: BuildMeasure): number | null => bossAt(measure.steady, level)?.seconds ?? null;
  return rankWords(rankOf(data, buildId, metric, false), '빠르게', '느리게', data.measured.builds.length);
}

export function carelessBossShare(data: GuideData, buildId: string, level: number): number {
  return bossAt(buildMeasureOf(data, buildId).careless, level)?.winShare ?? 0;
}

export function carelessDeaths(data: GuideData, buildId: string): number {
  return buildMeasureOf(data, buildId).careless.deathsPerHour;
}

export function bossLevels(data: GuideData): readonly number[] {
  return data.spec.levels;
}

export function droppedWeapons(data: GuideData, keep: (base: ItemBaseDef) => boolean): ItemBaseDef[] {
  return [...data.content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === 'weapon' && base.dropWeight > 0 && base.power === null && keep(base)).toSorted((a: ItemBaseDef, b: ItemBaseDef): number => a.minLevel - b.minLevel);
}

function group(data: GuideData, id: string): WeaponGroup {
  const found: WeaponGroup | null = weaponGroup(data.content, id);
  if (found === null) throw new Error(`the guide names the unknown weapon group ${id}`);
  return found;
}

export function groupWeapons(data: GuideData, id: string): ItemBaseDef[] {
  const kinds: WeaponGroup['kinds'] = group(data, id).kinds;
  return droppedWeapons(data, (base: ItemBaseDef): boolean => base.weaponKind !== null && kinds.includes(base.weaponKind));
}

export function groupNeeds(data: GuideData, id: string): string {
  return esc(group(data, id).needs);
}

export function implicitOf(base: ItemBaseDef, stat: StatId): number {
  return base.implicit.find((mod: StatMod): boolean => mod.stat === stat)?.value ?? 0;
}

export function heavyWeapons(data: GuideData): ItemBaseDef[] {
  return droppedWeapons(data, (base: ItemBaseDef): boolean => implicitOf(base, 'attackSpeed') < 0);
}

export function variantWeapons(data: GuideData, skillId: string): ItemBaseDef[] {
  return droppedWeapons(data, (base: ItemBaseDef): boolean => base.variants.some((variant: SkillVariant): boolean => variant.skill === skillId));
}

export function quickWeapons(data: GuideData): ItemBaseDef[] {
  return droppedWeapons(data, (base: ItemBaseDef): boolean => implicitOf(base, 'attackSpeed') > 0 && implicitOf(base, 'moveSpeed') > 0);
}

export function manaWeapons(data: GuideData): ItemBaseDef[] {
  return droppedWeapons(data, (base: ItemBaseDef): boolean => implicitOf(base, 'maxMana') > 0);
}

export function legendaryLine(data: GuideData, id: string): string {
  const base: ItemBaseDef | undefined = data.content.itemBases.get(id);
  if (base?.power === null || base?.power === undefined) throw new Error(`${id} is not a legendary`);
  return esc(`전설 ${base.name}: ${base.power.text}`);
}

export function familyNames(data: GuideData, family: string): string {
  const pieces: ItemBaseDef[] = [...data.content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.power?.family === family);
  if (pieces.length === 0) throw new Error(`no legendary belongs to ${family}`);
  return weaponNames(pieces);
}

export function weaponNames(bases: readonly ItemBaseDef[]): string {
  return esc(list(bases.map((base: ItemBaseDef): string => base.name)));
}

export function variantName(data: GuideData, baseId: string, skillId: string): string {
  const base: ItemBaseDef | undefined = data.content.itemBases.get(baseId);
  const becomes: string | undefined = base?.variants.find((variant: SkillVariant): boolean => variant.skill === skillId)?.becomes;
  const found = becomes === undefined ? undefined : data.content.skills.get(becomes);
  if (found === undefined) throw new Error(`${baseId} does not change ${skillId}`);
  return found.name;
}

export function steadyBossShare(data: GuideData, buildId: string, level: number): number {
  return bossAt(buildMeasureOf(data, buildId).steady, level)?.winShare ?? 0;
}

export function deathWords(perHour: number): string {
  return perHour === 0 ? '한 번도 죽지 않았다' : `시간당 약 ${decimal(perHour, 1)}번 죽었다`;
}

export function steadyDeaths(data: GuideData, buildId: string): number {
  return buildMeasureOf(data, buildId).steady.deathsPerHour;
}

export function steadyBossLife(data: GuideData, buildId: string, level: number): number {
  return bossAt(buildMeasureOf(data, buildId).steady, level)?.lifeLeft ?? 0;
}
