import type { RunCondition, RunReward } from '../../sim/content/run-table-types.ts';
import type { Content, MonsterDef, ZoneDef } from '../../sim/content/types.ts';
import { pinPrices, reachedLevels, runPrice } from '../../sim/world/run-table.ts';
import { levelKinds, pickChoices, pickName } from '../../sim/world/run-picks.ts';
import type { PickChoice } from '../../sim/world/run-picks.ts';
import { clashIn, conditionFrom, dangerOf, leanBoostOf, pinned, rewardOf, tooEarly } from '../../sim/world/run-state.ts';
import type { PinnedCondition } from '../../sim/world/run-state.ts';
import type { RunPin, RunSetup } from '../../sim/world/run-types.ts';
import type { Command, World } from '../../sim/world/types.ts';
import { goldShortText, isShort } from './gold-short.ts';

export interface TablePick {
  readonly zone: string | null;
  readonly pins: readonly RunPin[];
}

export interface LevelRow {
  readonly id: string;
  readonly name: string;
  readonly range: string;
  readonly holds: string;
  readonly chosen: boolean;
}

export interface KindChip {
  readonly id: string;
  readonly name: string;
  readonly chosen: boolean;
}

export interface ConditionRow {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly price: number;
  readonly reward: string;
  readonly danger: string;
  readonly pinned: boolean;
  readonly open: boolean;
  readonly kinds: readonly KindChip[];
}

export interface TableAction {
  readonly command: Command | null;
  readonly label: string;
  readonly note: string;
  readonly short: boolean;
}

export interface TableView {
  readonly levels: readonly LevelRow[];
  readonly conditions: readonly ConditionRow[];
  readonly pinsLeft: number;
  readonly price: number;
  readonly danger: string;
  readonly reward: string;
  readonly setOut: TableAction;
  readonly again: TableAction;
}

const TABLE_WORDS = {
  noLevels: '아직 향할 구역이 없다',
  pickFor: '하나를 골라라:',
  nothingHere: '이 구역에서 고를 것이 없다',
  from: '시작 레벨',
  plain: '조건 없음: 평범한 하강',
  noLast: '아직 여기서 출발한 것이 없다',
  clash: '함께 고정할 수 없다',
  lean: "lean toward this level's gear",
  lastGone: '그 구역에는 닿을 수 없다',
} as const;

function percent(share: number): string {
  return `+${Math.round(share * 100)}%`;
}

function gainsText(reward: RunReward): string | null {
  if (reward.xp === 0 && reward.gold === 0 && reward.items === 0 && reward.rarity === 0) return null;
  const same: boolean = reward.xp === reward.gold && reward.gold === reward.items;
  const gains: string = same ? `경험치·골드·아이템 ${percent(reward.xp)}` : `경험치 ${percent(reward.xp)}, 골드 ${percent(reward.gold)}, 아이템 ${percent(reward.items)}`;
  return reward.rarity > 0 ? `${gains}, 드롭의 ${Math.round(reward.rarity * 100)}%가 최소 매직` : gains;
}

export function rewardText(reward: RunReward, lean: number = 0): string {
  const gains: string | null = gainsText(reward);
  const leaning: string | null = lean > 0 ? `${percent(lean)} ${TABLE_WORDS.lean}` : null;
  return [gains, leaning].filter((part: string | null): part is string => part !== null).join(', ');
}

export function dangerText(danger: number): string {
  return danger <= 0 ? '추가 위험 없음' : `위험 ${percent(danger)}`;
}

function rangeText(zone: ZoneDef): string {
  const levels: number[] = zone.packs.map((pack): number => pack.level ?? zone.level);
  const least: number = Math.min(zone.level, ...levels);
  const most: number = Math.max(zone.levelUpTo, ...levels);
  return least === most ? `레벨 ${least}` : `레벨 ${least}–${most}`;
}

function holdsText(kinds: readonly MonsterDef[]): string {
  return kinds.map((kind: MonsterDef): string => kind.name).join(', ');
}

function conditionOf(content: Content, id: string): RunCondition | null {
  return content.runTable.conditions.find((entry: RunCondition): boolean => entry.id === id) ?? null;
}

export function shapedLine(world: World, zoneId: string): string | null {
  const active: RunSetup | null = world.run.active;
  if (active === null || active.zone !== zoneId || active.pins.length === 0) return null;
  const names: string[] = pinned(world.content, active.pins).map((entry: PinnedCondition): string => {
    const choice: string | null = pickName(world.content, entry.condition.pick, entry.pick);
    return choice === null ? entry.condition.name : `${entry.condition.name}: ${choice}`;
  });
  return `형성 · ${names.join(' · ')}`;
}

export function firstPick(world: World): TablePick {
  const reached: ZoneDef[] = reachedLevels(world);
  const last: RunSetup | null = world.run.last;
  if (last !== null && reached.some((zone: ZoneDef): boolean => zone.id === last.zone)) return { zone: last.zone, pins: last.pins };
  return { zone: reached[reached.length - 1]?.id ?? null, pins: [] };
}

export function chooseLevel(world: World, pick: TablePick, zoneId: string): TablePick {
  const zone: ZoneDef | undefined = reachedLevels(world).find((entry: ZoneDef): boolean => entry.id === zoneId);
  if (zone === undefined) return pick;
  const kept = (pin: RunPin): boolean => {
    const condition: RunCondition | null = conditionOf(world.content, pin.condition);
    return pin.pick === null || (condition !== null && pickChoices(world.content, condition.pick, zone).some((choice: PickChoice): boolean => choice.id === pin.pick));
  };
  const allowed: RunPin[] = pick.pins.filter((pin: RunPin): boolean => !tooEarly(world.content, zone, pin.condition));
  return { zone: zone.id, pins: allowed.map((pin: RunPin): RunPin => (kept(pin) ? pin : { condition: pin.condition, pick: null })) };
}

export function togglePin(world: World, pick: TablePick, conditionId: string): TablePick {
  if (pick.pins.some((pin: RunPin): boolean => pin.condition === conditionId)) return { zone: pick.zone, pins: pick.pins.filter((pin: RunPin): boolean => pin.condition !== conditionId) };
  const condition: RunCondition | null = conditionOf(world.content, conditionId);
  if (condition === null || pick.pins.length >= world.content.runTable.pins || clashIn(world.content, pick.pins, conditionId) !== null) return pick;
  const zone: ZoneDef | undefined = pick.zone === null ? undefined : world.content.zones.get(pick.zone);
  if (zone !== undefined && tooEarly(world.content, zone, conditionId)) return pick;
  const first: string | null = zone === undefined ? null : (pickChoices(world.content, condition.pick, zone)[0]?.id ?? null);
  return { zone: pick.zone, pins: [...pick.pins, { condition: conditionId, pick: first }] };
}

export function choosePick(pick: TablePick, conditionId: string, value: string): TablePick {
  return { zone: pick.zone, pins: pick.pins.map((pin: RunPin): RunPin => (pin.condition === conditionId ? { condition: pin.condition, pick: value } : pin)) };
}

function unready(content: Content, pins: readonly RunPin[]): PinnedCondition | undefined {
  return pinned(content, pins).find((entry: PinnedCondition): boolean => entry.condition.pick !== 'none' && entry.pick === null);
}

function setOutAction(world: World, zone: ZoneDef | null, pins: readonly RunPin[]): TableAction {
  if (zone === null) return { command: null, label: '출발', note: TABLE_WORDS.noLevels, short: false };
  const price: number = runPrice(world.content, zone, pins);
  const short: boolean = isShort(price, world.player.gold);
  const label: string = price > 0 ? `출발 · ${price} 골드` : '출발';
  const waiting: PinnedCondition | undefined = unready(world.content, pins);
  if (waiting !== undefined) return { command: null, label, note: `${TABLE_WORDS.pickFor} ${waiting.condition.name}`, short: false };
  const note: string = short ? goldShortText(price, world.player.gold) : pins.length === 0 ? TABLE_WORDS.plain : '';
  return { command: short ? null : { type: 'set_out', setup: { zone: zone.id, pins } }, label, note, short };
}

function againAction(world: World): TableAction {
  const last: RunSetup | null = world.run.last;
  if (last === null) return { command: null, label: '다시', note: TABLE_WORDS.noLast, short: false };
  const zone: ZoneDef | undefined = reachedLevels(world).find((entry: ZoneDef): boolean => entry.id === last.zone);
  if (zone === undefined) return { command: null, label: '다시', note: TABLE_WORDS.lastGone, short: false };
  const price: number = runPrice(world.content, zone, last.pins);
  const short: boolean = isShort(price, world.player.gold);
  const names: string = pinned(world.content, last.pins).map((entry: PinnedCondition): string => entry.condition.name).join(', ');
  const note: string = short ? goldShortText(price, world.player.gold) : names === '' ? zone.name : `${zone.name}: ${names}`;
  return { command: short ? null : { type: 'set_out', setup: last }, label: price > 0 ? `다시 · ${price} 골드` : '다시', note, short };
}

export function tableView(world: World, pick: TablePick): TableView {
  const content: Content = world.content;
  const reached: ZoneDef[] = reachedLevels(world);
  const zone: ZoneDef | null = reached.find((entry: ZoneDef): boolean => entry.id === pick.zone) ?? null;
  const full: boolean = pick.pins.length >= content.runTable.pins;
  const conditions: ConditionRow[] = content.runTable.conditions.map((condition: RunCondition): ConditionRow => {
    const at: number = pick.pins.findIndex((pin: RunPin): boolean => pin.condition === condition.id);
    const trial: readonly RunPin[] = at >= 0 ? pick.pins : [...pick.pins, { condition: condition.id, pick: null }];
    const index: number = at >= 0 ? at : trial.length - 1;
    const price: number = zone === null ? 0 : (pinPrices(content, zone, trial)[index] ?? 0);
    const chosen: string | null = at >= 0 ? (pick.pins[at]?.pick ?? null) : null;
    const clash: string | null = at >= 0 ? null : clashIn(content, pick.pins, condition.id);
    const clashName: string = clash === null ? '' : (conditionOf(content, clash)?.name ?? clash);
    const choices: PickChoice[] = zone === null ? [] : pickChoices(content, condition.pick, zone);
    const empty: boolean = condition.pick !== 'none' && zone !== null && choices.length === 0;
    const from: number = conditionFrom(content, condition);
    const early: boolean = zone !== null && from > zone.level;
    return {
      id: condition.id,
      name: condition.name,
      text: condition.text,
      price,
      reward: rewardText(condition.reward, condition.shape.lean),
      danger: clash !== null ? `${TABLE_WORDS.clash} ${clashName}` : early ? `${TABLE_WORDS.from} ${from}` : empty ? TABLE_WORDS.nothingHere : dangerText(condition.danger),
      pinned: at >= 0,
      open: at >= 0 || (!full && zone !== null && clash === null && !empty && !early),
      kinds: at >= 0 ? choices.map((choice: PickChoice): KindChip => ({ id: choice.id, name: choice.name, chosen: choice.id === chosen })) : [],
    };
  });
  return {
    levels: reached.map((entry: ZoneDef): LevelRow => ({ id: entry.id, name: entry.name, range: rangeText(entry), holds: holdsText(levelKinds(content, entry)), chosen: entry.id === zone?.id })),
    conditions,
    pinsLeft: content.runTable.pins - pick.pins.length,
    price: zone === null ? 0 : runPrice(content, zone, pick.pins),
    danger: dangerText(dangerOf(content, pick.pins)),
    reward: rewardText(rewardOf(content, pick.pins), leanBoostOf(content, pick.pins) - 1),
    setOut: setOutAction(world, zone, pick.pins),
    again: againAction(world),
  };
}
