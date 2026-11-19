import type { ActionDef, ActionId, Movement, RebindResult, ResolvedKeys } from '../settings/bindings.ts';
import { ACTION_GROUPS, BINDING, keyLabel, MOVEMENTS } from '../settings/bindings.ts';
import type { HeldSkills } from '../settings/settings.ts';
import { HELD_SKILLS } from '../settings/settings.ts';
import type { SettingsStore } from '../settings/store.ts';
import { el, label, setText } from './dom.ts';

const MOUSE_BUTTONS: ReadonlyMap<number, string> = new Map<number, string>([[2, BINDING.rightMouse]]);

const COPY = {
  idle: '동작을 고르고 새 키를 눌러라. Esc로 취소.',
  waiting: '키를 눌러라:',
  movement: '이동',
  moved: { click: '좌클릭으로 다시 영웅을 움직인다.', keys: '키로 영웅을 움직인다. 좌클릭은 가리키는 곳을 공격한다.' },
} as const;

const MOVEMENT_LABELS: Readonly<Record<Movement, string>> = { click: '클릭', keys: 'WASD' };

const HELD_LABELS: Readonly<Record<HeldSkills, string>> = { hold: '홀드', toggle: '눌러서 전환' };

function mountHeldSkills(page: HTMLElement, settings: SettingsStore): () => void {
  const row: HTMLDivElement = el('div', 'set-row', page);
  label('set-name', '유지 스킬', row);
  const segment: HTMLDivElement = el('div', 'set-seg wide', row);
  segment.setAttribute('role', 'radiogroup');
  segment.setAttribute('aria-label', '유지 스킬');
  segment.style.setProperty('--count', String(HELD_SKILLS.length));
  el('div', 'set-seg-thumb', segment);
  const buttons: Map<HeldSkills, HTMLButtonElement> = new Map<HeldSkills, HTMLButtonElement>();
  for (const mode of HELD_SKILLS) {
    const button: HTMLButtonElement = el('button', 'set-seg-btn', segment);
    button.type = 'button';
    button.textContent = HELD_LABELS[mode];
    button.setAttribute('role', 'radio');
    button.addEventListener('click', (): void => settings.setHeldSkills(mode));
    buttons.set(mode, button);
  }
  return (): void => {
    const current: HeldSkills = settings.get().heldSkills;
    segment.style.setProperty('--index', String(HELD_SKILLS.indexOf(current)));
    for (const [mode, button] of buttons) button.setAttribute('aria-checked', String(mode === current));
  };
}

interface RowView {
  readonly id: ActionId;
  readonly row: HTMLButtonElement;
  readonly name: HTMLElement;
  readonly chip: HTMLElement;
}

interface MovementPick {
  render(): void;
}

function mountMovement(page: HTMLElement, settings: SettingsStore, changed: (movement: Movement) => void): MovementPick {
  const row: HTMLDivElement = el('div', 'set-row', page);
  label('set-name', COPY.movement, row);
  const segment: HTMLDivElement = el('div', 'set-seg', row);
  segment.setAttribute('role', 'radiogroup');
  segment.setAttribute('aria-label', COPY.movement);
  segment.style.setProperty('--count', String(MOVEMENTS.length));
  el('div', 'set-seg-thumb', segment);
  const buttons: Map<Movement, HTMLButtonElement> = new Map<Movement, HTMLButtonElement>();
  for (const movement of MOVEMENTS) {
    const button: HTMLButtonElement = el('button', 'set-seg-btn', segment);
    button.type = 'button';
    button.textContent = MOVEMENT_LABELS[movement];
    button.setAttribute('role', 'radio');
    button.addEventListener('click', (): void => {
      if (settings.get().movement === movement) return;
      settings.setMovement(movement);
      changed(movement);
    });
    buttons.set(movement, button);
  }
  return {
    render(): void {
      const current: Movement = settings.get().movement;
      segment.style.setProperty('--index', String(MOVEMENTS.indexOf(current)));
      for (const [movement, button] of buttons) button.setAttribute('aria-checked', String(movement === current));
    },
  };
}

export interface ControlsPage {
  capturing(): boolean;
  cancel(): void;
  bind(code: string): void;
}

export function mountControls(page: HTMLElement, settings: SettingsStore): ControlsPage {
  const movement: MovementPick = mountMovement(page, settings, (next: Movement): void => {
    select(null);
    say(COPY.moved[next], false);
  });
  const showHeld: () => void = mountHeldSkills(page, settings);
  const list: HTMLDivElement = el('div', 'ctl-list', page);
  const note: HTMLDivElement = label('ctl-note', COPY.idle, page);
  const footer: HTMLDivElement = el('div', 'ctl-foot', page);
  const reset: HTMLButtonElement = el('button', 'set-text-btn', footer);
  reset.type = 'button';
  reset.textContent = '기본값으로 되돌리기';
  const rows: RowView[] = [];
  const folds: HTMLElement[] = [];
  let pending: ActionDef | null = null;
  const defOf = (id: ActionId): ActionDef | null => settings.keys().table.find((def: ActionDef): boolean => def.id === id) ?? null;

  const say = (text: string, warn: boolean): void => {
    note.classList.toggle('warn', warn);
    setText(note, text, true);
  };

  const refresh = (): void => {
    showHeld();
    const keys: ResolvedKeys = settings.keys();
    movement.render();
    for (const fold of folds) fold.classList.toggle('open', settings.get().movement === 'keys');
    for (const view of rows) {
      const def: ActionDef | null = defOf(view.id);
      const waiting: boolean = pending?.id === view.id;
      view.row.classList.toggle('waiting', waiting);
      view.row.classList.toggle('locked', def === null || def.locked);
      if (def !== null) setText(view.name, def.label, true);
      setText(view.chip, waiting ? '...' : keys.bindingsOf(view.id).map(keyLabel).join(' / '), true);
    }
  };

  const select = (def: ActionDef | null): void => {
    pending = def;
    refresh();
    say(def === null ? COPY.idle : `${COPY.waiting} ${def.label}`, false);
  };

  const build = (): void => {
    for (const group of ACTION_GROUPS) {
      const defs: ActionDef[] = settings.keys().table.filter((def: ActionDef): boolean => def.group === group);
      if (defs.length === 0) continue;
      const fold: HTMLElement | null = group === '이동' ? el('div', 'ctl-fold', list) : null;
      const parent: HTMLElement = fold === null ? list : el('div', 'ctl-fold-in', fold);
      if (fold !== null) folds.push(fold);
      label('ctl-group', group, parent);
      for (const { id, label: text } of defs) {
        const row: HTMLButtonElement = el('button', 'ctl-row', parent);
        row.type = 'button';
        const name: HTMLDivElement = label('ctl-name', text, row);
        const chip: HTMLDivElement = label('ctl-chip', '', row);
        rows.push({ id, row, name, chip });
        row.addEventListener('click', (): void => {
          const def: ActionDef | null = defOf(id);
          if (def === null || def.locked) return;
          select(pending?.id === id ? null : def);
        });
      }
    }
  };
  build();

  const bind = (code: string): void => {
    const target: ActionDef | null = pending;
    if (target === null) return;
    const result: RebindResult = settings.rebind(target.id, code);
    switch (result.kind) {
      case 'ok':
        select(null);
        say(`${target.label}은(는) 이제 ${keyLabel(code)}.`, false);
        return;
      case 'conflict':
        say(`${keyLabel(code)}은(는) ${result.with.label}에 이미 쓰인다. 다른 키를 눌러라.`, true);
        return;
      case 'refused':
        say(`${result.reason} 다른 키를 눌러라.`, true);
        return;
    }
  };

  reset.addEventListener('click', (): void => {
    settings.resetControls();
    select(null);
    say('조작이 기본값으로 돌아갔다.', false);
  });
  settings.subscribe(refresh);
  window.addEventListener(
    'mousedown',
    (event: MouseEvent): void => {
      const code: string | undefined = MOUSE_BUTTONS.get(event.button);
      if (pending === null || code === undefined) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      bind(code);
    },
    true,
  );
  refresh();
  return {
    capturing(): boolean {
      return pending !== null;
    },
    cancel(): void {
      if (pending !== null) select(null);
    },
    bind,
  };
}
