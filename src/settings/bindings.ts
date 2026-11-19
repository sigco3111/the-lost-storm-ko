export const FIXED_ACTIONS = ['inventory', 'character', 'tree', 'map', 'minimap', 'ladder', 'flask1', 'flask2', 'flask3', 'flask4', 'flask5', 'pause', 'frameRate', 'names'] as const;
export type FixedAction = (typeof FIXED_ACTIONS)[number];
export const FLASK_ACTIONS: readonly FixedAction[] = ['flask1', 'flask2', 'flask3', 'flask4', 'flask5'];
export type SkillAction = 'primary' | `skill:${number}`;
export const MOVE_ACTIONS = ['moveUp', 'moveLeft', 'moveDown', 'moveRight'] as const;
export type MoveAction = (typeof MOVE_ACTIONS)[number];
export type ActionId = FixedAction | SkillAction | MoveAction;

export const MOVEMENTS = ['click', 'keys'] as const;
export type Movement = (typeof MOVEMENTS)[number];
export const DEFAULT_MOVEMENT: Movement = 'click';

export type ActionGroup = '이동' | '전투' | '약병' | '패널' | '시스템';
export const ACTION_GROUPS: readonly ActionGroup[] = ['이동', '전투', '약병', '패널', '시스템'];

export interface ActionDef {
  readonly id: ActionId;
  readonly label: string;
  readonly group: ActionGroup;
  readonly defaults: readonly string[];
  readonly locked: boolean;
}

export interface SlotDefault {
  readonly name: string;
  readonly bindings: readonly string[];
}

export type Overrides = Readonly<Record<string, readonly string[]>>;

export interface ResolvedKeys {
  readonly table: readonly ActionDef[];
  actionOf(binding: string): ActionId | null;
  bindingsOf(action: ActionId): readonly string[];
  labelOf(action: ActionId): string;
}

export type RebindResult =
  | { readonly kind: 'ok'; readonly overrides: Overrides }
  | { readonly kind: 'conflict'; readonly with: ActionDef }
  | { readonly kind: 'refused'; readonly reason: string };

export const BINDING = {
  leftMouse: 'mouse_left',
  rightMouse: 'mouse_right',
  escape: 'Escape',
  maxLength: 24,
} as const;

export const PRIMARY_LABELS: Readonly<Record<Movement, string>> = { click: '이동 / 공격', keys: '공격' };

interface MoveDef {
  readonly id: MoveAction;
  readonly label: string;
  readonly code: string;
}

const MOVE_DEFS: readonly MoveDef[] = [
  { id: 'moveUp', label: '위로 이동', code: 'KeyW' },
  { id: 'moveLeft', label: '왼쪽으로 이동', code: 'KeyA' },
  { id: 'moveDown', label: '아래로 이동', code: 'KeyS' },
  { id: 'moveRight', label: '오른쪽으로 이동', code: 'KeyD' },
];

const MOVE_CODES: ReadonlySet<string> = new Set<string>(MOVE_DEFS.map((def: MoveDef): string => def.code));

const RESERVED: ReadonlySet<string> = new Set<string>([BINDING.leftMouse, 'ShiftLeft', 'ShiftRight', 'Enter', 'NumpadEnter']);

const FIXED_DEFS: readonly (Omit<ActionDef, 'locked'> & { readonly group: ActionGroup })[] = [
  { id: 'flask1', label: '약병 1', group: '약병', defaults: ['Digit1'] },
  { id: 'flask2', label: '약병 2', group: '약병', defaults: ['Digit2'] },
  { id: 'flask3', label: '약병 3', group: '약병', defaults: ['Digit3'] },
  { id: 'flask4', label: '약병 4', group: '약병', defaults: ['Digit4'] },
  { id: 'flask5', label: '약병 5', group: '약병', defaults: ['Digit5'] },
  { id: 'inventory', label: '소지품', group: '패널', defaults: ['KeyI'] },
  { id: 'character', label: '캐릭터', group: '패널', defaults: ['KeyC'] },
  { id: 'tree', label: '스킬 트리', group: '패널', defaults: ['KeyT'] },
  { id: 'map', label: '세계 지도', group: '패널', defaults: ['KeyM'] },
  { id: 'minimap', label: '미니맵', group: '패널', defaults: ['Tab'] },
  { id: 'ladder', label: '순위', group: '패널', defaults: ['KeyL'] },
  { id: 'pause', label: '메뉴', group: '시스템', defaults: [BINDING.escape] },
  { id: 'frameRate', label: '프레임', group: '시스템', defaults: ['F3'] },
  { id: 'names', label: '아이템 이름 표시', group: '시스템', defaults: ['AltLeft', 'AltRight'] },
];

export function isSkillAction(action: ActionId): boolean {
  return action === 'primary' || action.startsWith('skill:');
}

export function flaskAction(slot: number): FixedAction | null {
  return FLASK_ACTIONS[slot] ?? null;
}

export function slotAction(slot: number): SkillAction {
  return slot === 0 ? 'primary' : `skill:${slot}`;
}

export interface Shipped {
  readonly flasks: number;
  readonly ladder: boolean;
}

function shipped(def: ActionDef, build: Shipped): boolean {
  if (def.id === 'ladder') return build.ladder;
  const index: number = FLASK_ACTIONS.findIndex((action: FixedAction): boolean => action === def.id);
  return index < 0 || index < build.flasks;
}

export function actionTable(slots: readonly SlotDefault[], build: Shipped, movement: Movement = DEFAULT_MOVEMENT): readonly ActionDef[] {
  const byKeys: boolean = movement === 'keys';
  const moves: ActionDef[] = MOVE_DEFS.map((def: MoveDef): ActionDef => ({ id: def.id, label: def.label, group: '이동', defaults: byKeys ? [def.code] : [], locked: !byKeys }));
  const skills: ActionDef[] = slots.map(
    (slot: SlotDefault, index: number): ActionDef =>
      index === 0
        ? { id: 'primary', label: PRIMARY_LABELS[movement], group: '전투', defaults: [BINDING.leftMouse], locked: true }
        : { id: slotAction(index), label: slot.name, group: '전투', defaults: byKeys ? slot.bindings.filter((code: string): boolean => !MOVE_CODES.has(code)) : slot.bindings, locked: false },
  );
  const fixed: ActionDef[] = FIXED_DEFS.map((def): ActionDef => Object.assign({ locked: false }, def)).filter((def: ActionDef): boolean => shipped(def, build));
  const combat: ActionDef[] = [...skills, ...fixed.filter((def: ActionDef): boolean => def.group === '전투')];
  return [...moves, ...combat, ...fixed.filter((def: ActionDef): boolean => def.group !== '전투')];
}

export function freeMoveKeys(overrides: Overrides): Overrides {
  const kept: [string, readonly string[]][] = Object.entries(overrides).map(([action, codes]: [string, readonly string[]]): [string, readonly string[]] => [action, codes.filter((code: string): boolean => !MOVE_CODES.has(code))]);
  return Object.fromEntries(kept.filter(([, codes]: [string, readonly string[]]): boolean => codes.length > 0));
}

export function isBindingCode(value: string): boolean {
  return value.length > 0 && value.length <= BINDING.maxLength && /^[A-Za-z0-9_]+$/.test(value);
}

function bindingsFrom(def: ActionDef, overrides: Overrides): readonly string[] {
  if (def.locked) return def.defaults;
  const own: readonly string[] | undefined = overrides[def.id];
  if (own !== undefined) return own;
  const claimed: ReadonlySet<string> = new Set<string>(Object.values(overrides).flat());
  return def.defaults.filter((code: string): boolean => !claimed.has(code));
}

function collisions(table: readonly ActionDef[], overrides: Overrides): number {
  const seen: Set<string> = new Set<string>();
  let count = 0;
  for (const def of table) {
    for (const code of bindingsFrom(def, overrides)) {
      if (seen.has(code)) count += 1;
      seen.add(code);
    }
  }
  return count;
}

function allowed(def: ActionDef, list: readonly string[]): boolean {
  return list.every((code: string): boolean => isBindingCode(code) && !RESERVED.has(code) && (code !== BINDING.escape || def.id === 'pause') && (code !== BINDING.rightMouse || isSkillAction(def.id)));
}

export function sanitizeOverrides(table: readonly ActionDef[], raw: Overrides): Overrides {
  let kept: Overrides = {};
  for (const def of table) {
    const list: readonly string[] | undefined = raw[def.id];
    if (def.locked || list === undefined || list.length === 0 || !allowed(def, list)) continue;
    const next: Overrides = { ...kept, [def.id]: list };
    if (collisions(table, next) <= collisions(table, kept)) kept = next;
  }
  return kept;
}

export function resolveKeys(table: readonly ActionDef[], overrides: Overrides): ResolvedKeys {
  const byCode: Map<string, ActionId> = new Map<string, ActionId>();
  const byAction: Map<ActionId, readonly string[]> = new Map<ActionId, readonly string[]>();
  for (const def of table) {
    const list: readonly string[] = bindingsFrom(def, overrides);
    byAction.set(def.id, list);
    for (const code of list) byCode.set(code, def.id);
  }
  return {
    table,
    actionOf(binding: string): ActionId | null {
      return byCode.get(binding) ?? null;
    },
    bindingsOf(action: ActionId): readonly string[] {
      return byAction.get(action) ?? [];
    },
    labelOf(action: ActionId): string {
      const first: string | undefined = byAction.get(action)?.[0];
      return first === undefined ? '' : keyLabel(first);
    },
  };
}

const NAMED: ReadonlyMap<string, string> = new Map<string, string>([
  [BINDING.leftMouse, 'LMB'],
  [BINDING.rightMouse, 'RMB'],
  ['mouse_middle', 'MMB'],
  ['Escape', 'Esc'],
  ['Space', 'Space'],
  ['Backquote', '`'],
  ['Minus', '-'],
  ['Equal', '='],
  ['BracketLeft', '['],
  ['BracketRight', ']'],
  ['Semicolon', ';'],
  ['Quote', "'"],
  ['Comma', ','],
  ['Period', '.'],
  ['Slash', '/'],
  ['Backslash', '\\'],
  ['ArrowUp', 'Up'],
  ['ArrowDown', 'Down'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
  ['AltLeft', 'Alt'],
  ['AltRight', 'Alt'],
]);

export function keyLabel(code: string): string {
  const named: string | undefined = NAMED.get(code);
  if (named !== undefined) return named;
  if (code.startsWith('Key') || code.startsWith('Digit')) return code.replace(/^(Key|Digit)/, '');
  if (code.startsWith('Numpad')) return `Num ${code.slice('Numpad'.length)}`;
  return code;
}

export function rebind(table: readonly ActionDef[], overrides: Overrides, action: ActionId, code: string): RebindResult {
  const target: ActionDef | undefined = table.find((def: ActionDef): boolean => def.id === action);
  if (target === undefined || target.locked) return { kind: 'refused', reason: '그 동작은 키를 바꿀 수 없다.' };
  if (!isBindingCode(code)) return { kind: 'refused', reason: '그 키는 쓸 수 없다.' };
  if (RESERVED.has(code)) return { kind: 'refused', reason: `${keyLabel(code)} is reserved.` };
  if (code === BINDING.rightMouse && !isSkillAction(action)) return { kind: 'refused', reason: '우클릭은 스킬만 쓸 수 있다.' };
  if (code === BINDING.escape && action !== 'pause') return { kind: 'refused', reason: 'Esc는 패널과 메뉴를 닫는 데 쓰인다.' };
  const owner: ActionDef | undefined = table.find((def: ActionDef): boolean => def.id !== action && bindingsFrom(def, overrides).includes(code));
  if (owner !== undefined) return { kind: 'conflict', with: owner };
  return { kind: 'ok', overrides: { ...overrides, [action]: [code] } };
}

export function slotName(slot: number): string {
  return slot === 0 ? '이동 / 공격' : `스킬 칸 ${slot}`;
}
