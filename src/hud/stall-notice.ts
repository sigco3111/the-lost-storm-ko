import { el, label } from './dom.ts';

export const STALL_NOTICE = {
  text: '세계가 멈췄다.',
  action: '계속하기',
  shownClass: 'on',
} as const;

export interface StallNotice {
  show(): void;
  hide(): void;
}

export function createStallNotice(parent: HTMLElement, resume: () => void): StallNotice {
  const note: HTMLDivElement = el('div', 'stall-notice', parent);
  note.setAttribute('role', 'status');
  label('stall-text', STALL_NOTICE.text, note);
  const button: HTMLButtonElement = el('button', 'stall-resume', note);
  button.type = 'button';
  button.textContent = STALL_NOTICE.action;
  button.tabIndex = -1;
  button.addEventListener('click', resume);
  const set = (on: boolean): void => {
    note.classList.toggle(STALL_NOTICE.shownClass, on);
    button.tabIndex = on ? 0 : -1;
  };
  return {
    show: (): void => set(true),
    hide: (): void => set(false),
  };
}
