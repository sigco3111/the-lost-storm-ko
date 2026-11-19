import { el, setClass } from '../hud/dom.ts';
import { durationMs } from '../hud/overlays.ts';
import type { Turntable } from '../render/item-thumbnails.ts';
import { dragTurn, isTurning, pressTurn, releaseTurn, RESTING_TURN, settleTurn, turnAngle } from './figure-turn.ts';
import type { FigureTurn } from './figure-turn.ts';

export const FIGURE_VIEW = {
  settleToken: '--spring-smooth-ms',
  fallbackSettleMs: 520,
  primaryButton: 0,
} as const;

export interface FigureView {
  show(table: Turntable): void;
  clear(): void;
  reset(): void;
  stop(): void;
}

export function createFigureView(host: HTMLElement): FigureView {
  const canvas: HTMLCanvasElement = el('canvas', 'profile-portrait', host);
  canvas.draggable = false;
  canvas.setAttribute('aria-hidden', 'true');
  let table: Turntable | null = null;
  let turn: FigureTurn = RESTING_TURN;
  let pointer: number | null = null;
  let frame: number | null = null;

  const settleMs = (): number => durationMs(getComputedStyle(host).getPropertyValue(FIGURE_VIEW.settleToken)) ?? FIGURE_VIEW.fallbackSettleMs;

  const paint = (now: number): void => {
    turn = settleTurn(turn, now);
    table?.draw(turnAngle(turn, now), canvas);
  };

  const tick = (now: number): void => {
    frame = null;
    paint(now);
    if (isTurning(turn)) frame = requestAnimationFrame(tick);
  };

  const wake = (): void => {
    frame ??= requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };

  const letGo = (event: PointerEvent): void => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    setClass(host, 'turning', false);
    turn = releaseTurn(turn, event.timeStamp, settleMs());
    wake();
  };

  host.addEventListener('pointerdown', (event: PointerEvent): void => {
    if (table === null || pointer !== null || (event.pointerType === 'mouse' && event.button !== FIGURE_VIEW.primaryButton)) return;
    event.preventDefault();
    pointer = event.pointerId;
    host.setPointerCapture(event.pointerId);
    setClass(host, 'turning', true);
    stop();
    turn = pressTurn(turn, event.clientX, event.timeStamp);
  });
  host.addEventListener('pointermove', (event: PointerEvent): void => {
    if (event.pointerId !== pointer) return;
    turn = dragTurn(turn, event.clientX, event.timeStamp, host.getBoundingClientRect().width);
    wake();
  });
  host.addEventListener('pointerup', letGo);
  host.addEventListener('pointercancel', letGo);
  host.addEventListener('lostpointercapture', letGo);
  for (const name of ['dragstart', 'selectstart', 'contextmenu'] as const) {
    host.addEventListener(name, (event: Event): void => {
      event.preventDefault();
    });
  }

  return {
    show(next: Turntable): void {
      table = next;
      setClass(host, 'ready', true);
      if (next.draw(turnAngle(turn, performance.now()), canvas)) setClass(canvas, 'shown', true);
    },
    clear(): void {
      table = null;
      setClass(host, 'ready', false);
      setClass(canvas, 'shown', false);
    },
    reset(): void {
      stop();
      pointer = null;
      setClass(host, 'turning', false);
      turn = RESTING_TURN;
    },
    stop,
  };
}
