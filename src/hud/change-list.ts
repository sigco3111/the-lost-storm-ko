import { el, label, setAttr } from './dom.ts';
import type { ChangeChoice, SkillChanges } from './skill-changes.ts';

export interface ChangeList {
  readonly element: HTMLElement;
  shownFor(): string | null;
  open(anchor: HTMLElement, changes: SkillChanges): void;
  refresh(changes: SkillChanges | null): void;
  close(): boolean;
}

export function createChangeList(parent: HTMLElement, choose: (skill: string, becomes: string) => void, track: (element: HTMLElement) => void): ChangeList {
  const element: HTMLDivElement = el('div', 'dropdown-list change-list', parent);
  element.setAttribute('role', 'listbox');
  element.setAttribute('aria-hidden', 'true');
  track(element);
  let skill: string | null = null;
  let rows: HTMLDivElement[] = [];

  const close = (): boolean => {
    if (skill === null) return false;
    skill = null;
    element.classList.remove('open');
    element.setAttribute('aria-hidden', 'true');
    return true;
  };

  const paint = (changes: SkillChanges): void => {
    changes.choices.forEach((choice: ChangeChoice, index: number): void => {
      const row: HTMLDivElement | undefined = rows[index];
      if (row === undefined) return;
      setAttr(row, 'aria-selected', choice.lit ? 'true' : 'false');
    });
  };

  const build = (changes: SkillChanges): void => {
    const title: HTMLDivElement = label('change-list-title', changes.title, null);
    rows = changes.choices.map((choice: ChangeChoice): HTMLDivElement => {
      const row: HTMLDivElement = el('div', 'dropdown-option', null);
      row.setAttribute('role', 'option');
      el('span', 'dropdown-option-label', row).textContent = choice.name;
      el('span', 'change-list-dot', row);
      row.addEventListener('click', (event: MouseEvent): void => {
        event.stopPropagation();
        choose(changes.skill, choice.becomes);
        close();
      });
      return row;
    });
    element.setAttribute('aria-label', changes.title);
    element.replaceChildren(title, ...rows);
  };

  return {
    element,
    shownFor(): string | null {
      return skill;
    },
    open(anchor: HTMLElement, changes: SkillChanges): void {
      const bar: DOMRect = parent.getBoundingClientRect();
      const at: DOMRect = anchor.getBoundingClientRect();
      element.style.setProperty('--change-x', `${(at.left + at.width / 2 - bar.left).toFixed(1)}px`);
      if (skill !== changes.skill) build(changes);
      skill = changes.skill;
      paint(changes);
      element.classList.add('open');
      element.setAttribute('aria-hidden', 'false');
    },
    refresh(changes: SkillChanges | null): void {
      if (skill === null) return;
      if (changes === null || changes.choices.length !== rows.length) {
        close();
        return;
      }
      paint(changes);
    },
    close,
  };
}
