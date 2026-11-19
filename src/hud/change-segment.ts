import { el, label, setAttr, setClass, setVar } from './dom.ts';
import type { ChangeChoice, SkillChanges } from './skill-changes.ts';

export interface ChangeSegment {
  refresh(changes: SkillChanges): void;
}

export function createChangeSegment(parent: HTMLElement, changes: SkillChanges, choose: (skill: string, becomes: string) => void): ChangeSegment {
  const root: HTMLDivElement = el('div', 'change-seg', parent);
  label('change-seg-title', changes.title, root);
  const row: HTMLDivElement = el('div', 'change-seg-row', root);
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', changes.title);
  setVar(row, '--count', String(changes.choices.length));
  el('div', 'change-seg-lit', row);
  const buttons: HTMLButtonElement[] = changes.choices.map((choice: ChangeChoice): HTMLButtonElement => {
    const button: HTMLButtonElement = el('button', 'change-seg-option', row);
    button.type = 'button';
    button.textContent = choice.name;
    button.setAttribute('role', 'radio');
    button.addEventListener('pointerdown', (event: PointerEvent): void => event.stopPropagation());
    button.addEventListener('click', (event: MouseEvent): void => {
      event.stopPropagation();
      choose(changes.skill, choice.becomes);
    });
    return button;
  });
  const refresh = (next: SkillChanges): void => {
    const lit: number = next.choices.findIndex((choice: ChangeChoice): boolean => choice.lit);
    setClass(row, 'unlit', lit < 0);
    if (lit >= 0) setVar(row, '--lit', String(lit));
    next.choices.forEach((choice: ChangeChoice, index: number): void => {
      const button: HTMLButtonElement | undefined = buttons[index];
      if (button === undefined) return;
      setClass(button, 'lit', choice.lit);
      setAttr(button, 'aria-checked', choice.lit ? 'true' : 'false');
    });
  };
  refresh(changes);
  return { refresh };
}
