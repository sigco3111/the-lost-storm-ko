import type { SkillUnlock } from '../../sim/content/shape-types.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import { everySkill } from '../../sim/skill-book.ts';
import { appendForms, pressLine } from './skill-forms-view.ts';
import { strongerLine } from './weapon-family.ts';
import type { HudContext } from './context.ts';
import { el, label, setClass, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import { promptText, use } from './prompts.ts';
import { attachTooltip } from './tooltip.ts';
import { slotAction } from '../settings/bindings.ts';

export interface SkillPicker {
  readonly element: HTMLElement;
  readonly slot: number | null;
  open(slot: number, anchor: HTMLElement): void;
  close(): boolean;
  refresh(player: PlayerState): void;
}

const CLEAR = {
  pointerBinding: 'mouse_left',
  pointerName: '이동 전용',
  keyName: '비어 있음',
  pointerLine: '좌클릭은 이동·대화·열기·줍기만 한다. 공격하지 않는다.',
  keyLine: '스킬을 고르기 전까지 이 키는 아무것도 하지 않는다.',
} as const;

interface Choice {
  readonly root: HTMLElement;
  readonly entry: SkillUnlock;
  readonly skill: SkillDef;
  state: string;
}

export function skillDetails(skill: SkillDef, sub: string, unlock: number | null, stronger: string | null): HTMLElement {
  const root: HTMLDivElement = el('div', 'tip', null);
  label('tip-title', skill.name, root);
  label('tip-sub', sub, root);
  label('tip-line', skill.description, root);
  el('div', 'tip-sep', root);
  const press: string | null = pressLine(skill.press);
  if (press !== null) label('tip-line tip-press', press, root);
  if (skill.manaCost > 0) label('tip-line cost', skill.press?.type === 'channel' ? `마나 소모: ${skill.manaCost}/펄스` : `마나 소모: ${skill.manaCost}`, root);
  if (skill.cooldown > 0) label('tip-line', `재사용 대기: ${skill.cooldown.toFixed(1)}초`, root);
  if (unlock !== null) label('tip-line locked', `레벨 ${unlock}에 습득`, root);
  if (stronger !== null) label('tip-line stronger', stronger, root);
  return root;
}

export function pointerSlotOf(context: HudContext, slot: number): boolean {
  return context.api.settings.keys().bindingsOf(slotAction(slot)).includes(CLEAR.pointerBinding);
}

export function clearDetails(pointer: boolean, sub: string): HTMLElement {
  const root: HTMLDivElement = el('div', 'tip', null);
  label('tip-title', pointer ? CLEAR.pointerName : CLEAR.keyName, root);
  label('tip-sub', sub, root);
  label('tip-line', pointer ? CLEAR.pointerLine : CLEAR.keyLine, root);
  return root;
}

export function createSkillPicker(parent: HTMLElement, context: HudContext, track: (element: HTMLElement) => void): SkillPicker {
  const element: HTMLDivElement = el('div', 'skill-picker', parent);
  track(element);
  label('skill-picker-title', '스킬 선택', element);
  const grid: HTMLDivElement = el('div', 'skill-picker-grid', element);
  const choices: Choice[] = [];
  let slot: number | null = null;
  const content = context.api.world.content;
  const clear: HTMLButtonElement = el('button', 'skill-choice skill-clear', grid);
  clear.type = 'button';
  el('span', 'skill-clear-mark', clear);
  const clearName: HTMLDivElement = label('skill-clear-name', CLEAR.keyName, clear);
  attachTooltip(context.tooltip, clear, (): HTMLElement | null => (slot === null ? null : clearDetails(pointerSlotOf(context, slot), promptText(context.api.touch, use('이 칸 비우기')))));
  clear.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    if (slot === null) return;
    context.api.send({ type: 'slot', slot, skill: null });
    picker.close();
  });
  for (const entry of everySkill(content)) {
    const skill: SkillDef | undefined = content.skills.get(entry.skill);
    if (skill === undefined) continue;
    const root: HTMLButtonElement = el('button', 'skill-choice', grid);
    root.type = 'button';
    el('span', 'skill-choice-icon', root).innerHTML = iconSvg(skill.icon);
    label('skill-choice-level', `${entry.level}`, root);
    const choice: Choice = { root, entry, skill, state: '' };
    attachTooltip(context.tooltip, root, (): HTMLElement => {
      const details: HTMLElement = skillDetails(skill, choice.state === 'locked' ? '아직 배우지 않음' : promptText(context.api.touch, use('이 칸에 놓기')), choice.state === 'locked' ? entry.level : null, strongerLine(content, skill.empowered));
      appendForms(details, content, skill, context.api.world.player.wielding);
      return details;
    });
    root.addEventListener('click', (event: MouseEvent): void => {
      event.stopPropagation();
      if (slot === null || choice.state === 'locked') return;
      context.api.send({ type: 'slot', slot, skill: entry.skill });
      picker.close();
    });
    choices.push(choice);
  }

  const picker: SkillPicker = {
    element,
    get slot(): number | null {
      return slot;
    },
    open(next: number, anchor: HTMLElement): void {
      slot = next;
      const bar: DOMRect = parent.getBoundingClientRect();
      const at: DOMRect = anchor.getBoundingClientRect();
      element.style.setProperty('--picker-x', `${(at.left + at.width / 2 - bar.left).toFixed(1)}px`);
      element.classList.add('open');
      picker.refresh(context.api.world.player);
    },
    close(): boolean {
      if (slot === null) return false;
      slot = null;
      element.classList.remove('open');
      context.tooltip.hide();
      return true;
    },
    refresh(player: PlayerState): void {
      if (slot === null) return;
      const current: string | null = player.bar[slot] ?? null;
      setText(clearName, pointerSlotOf(context, slot) ? CLEAR.pointerName : CLEAR.keyName, true);
      setClass(clear, 'current', current === null);
      for (const choice of choices) {
        const state: string = choice.entry.level > player.level || !player.learned.includes(choice.entry.skill) ? 'locked' : choice.entry.skill === current ? 'current' : player.bar.includes(choice.entry.skill) ? 'elsewhere' : 'free';
        if (state === choice.state) continue;
        if (choice.state !== '') choice.root.classList.remove(choice.state);
        choice.root.classList.add(state);
        choice.state = state;
      }
    },
  };
  return picker;
}
