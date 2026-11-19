import type { Play } from '../backend/play.ts';
import { el, label } from './dom.ts';

export const ELSEWHERE_CARD = {
  text: '이 캐릭터는 다른 탭이나 다른 기기에서 열려 있다.',
  action: '여기서 이어서 하기',
  shownClass: 'on',
} as const;

export interface Elsewhere {
  readonly replaced: boolean;
}

export function watchElsewhere(hud: HTMLElement, play: Play, playHere: () => void): Elsewhere {
  let replaced: boolean = false;
  const card: HTMLDivElement = el('div', 'elsewhere-card', hud);
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-hidden', 'true');
  const panel: HTMLDivElement = el('div', 'elsewhere-panel', card);
  label('elsewhere-text', ELSEWHERE_CARD.text, panel);
  const button: HTMLButtonElement = el('button', 'elsewhere-here', panel);
  button.type = 'button';
  button.textContent = ELSEWHERE_CARD.action;
  button.tabIndex = -1;
  button.addEventListener('click', (): void => {
    button.disabled = true;
    playHere();
  });
  play.onReplaced((): void => {
    replaced = true;
    card.classList.add(ELSEWHERE_CARD.shownClass);
    card.setAttribute('aria-hidden', 'false');
    button.tabIndex = 0;
    button.focus({ preventScroll: true });
  });
  return {
    get replaced(): boolean {
      return replaced;
    },
  };
}
