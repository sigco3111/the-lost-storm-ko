import { tagPart } from './hud-gate.ts';
import type { Content } from '../../sim/content/types.ts';
import { xpToNextLevel } from '../../sim/progression.ts';
import type { XpReduction } from '../../sim/content/types.ts';
import type { NoticeReason, PlayerState, World } from '../../sim/world/types.ts';
import { clamp01, el, setText } from './dom.ts';
import { reducedLine } from './xp-note.ts';

const STATUS = {
  noticeMs: 1800,
  reducedMs: 4000,
  xpStep: 0.002,
} as const;

const NOTICE_TEXT: Readonly<Record<NoticeReason, string>> = {
  wrong_weapon: '다른 무기가 필요하다',
  no_mana: '마나가 부족하다',
  on_cooldown: '아직 준비되지 않았다',
  inventory_full: '소지품이 가득 찼다',
  flask_empty: '약병이 비었다',
  life_full: '생명력이 이미 가득 찼다',
  mana_full: '마나가 이미 가득 찼다',
  no_gold: '골드가 부족하다',
  stash_full: '보관함이 가득 찼다',
  legendary_limit: '전설 아이템을 이미 세 개 착용하고 있다',
  portal_town: '여기서는 길이 열리지 않는다',
  portal_boss: '전투가 길을 막고 있다',
  unidentified: '입기 전에 감정해야 한다',
  run_refused: '그 하강은 정할 수 없다',
};

export interface Notices {
  readonly element: HTMLElement;
  show(reason: NoticeReason): void;
  say(text: string): void;
}

export interface XpBar {
  readonly element: HTMLElement;
  update(player: PlayerState, content: Content): void;
  gained(reduced: XpReduction | null): void;
}

export interface WorldStatus {
  update(world: World): void;
}

export function createNotices(parent: HTMLElement): Notices {
  const element: HTMLDivElement = el('div', 'hud-notice', parent);
  let timer: number | null = null;
  const say = (text: string): void => {
    setText(element, text, true);
    element.classList.add('visible');
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout((): void => {
      element.classList.remove('visible');
      timer = null;
    }, STATUS.noticeMs);
  };
  return {
    element,
    say,
    show(reason: NoticeReason): void {
      say(NOTICE_TEXT[reason]);
    },
  };
}

export function createXpBar(parent: HTMLElement): XpBar {
  const element: HTMLDivElement = el('div', 'hud-xp', parent);
  tagPart(element, 'xp');
  const level: HTMLDivElement = el('div', 'xp-level', element);
  const track: HTMLDivElement = el('div', 'xp-track', element);
  const fill: HTMLDivElement = el('div', 'xp-fill', track);
  const note: HTMLDivElement = el('div', 'xp-note', element);
  let shown: number = -1;
  let noteTimer: number | null = null;
  return {
    element,
    gained(reduced: XpReduction | null): void {
      const line: string | null = reducedLine(reduced);
      if (line === null) return;
      setText(note, line, note.classList.contains('visible'));
      note.classList.add('visible');
      if (noteTimer !== null) window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout((): void => {
        note.classList.remove('visible');
        noteTimer = null;
      }, STATUS.reducedMs);
    },
    update(player: PlayerState, content: Content): void {
      setText(level, String(player.level), true);
      const need: number = xpToNextLevel(content.player.xp, player.level);
      const fraction: number = need > 0 ? clamp01(player.xp / need) : 0;
      const quantised: number = Math.round(fraction / STATUS.xpStep) * STATUS.xpStep;
      if (quantised === shown) return;
      shown = quantised;
      fill.style.transform = `scaleX(${quantised})`;
    },
  };
}

export function createSurgeStatus(parent: HTMLElement): WorldStatus {
  const element: HTMLDivElement = el('div', 'hud-top', parent);
  const surge: HTMLDivElement = el('div', 'surge-label', element);
  const gather: HTMLDivElement = el('div', 'surge-gather', element);
  let gathering: boolean | null = null;
  let surging: boolean | null = null;
  return {
    update(world: World): void {
      const inSurgeZone: boolean = world.zone.surge !== null;
      if (inSurgeZone !== surging) {
        surging = inSurgeZone;
        element.classList.toggle('visible', inSurgeZone);
      }
      if (inSurgeZone) setText(surge, `쇄도 ${world.surge}`, true);
      const timer: number | null = world.surgeTimer;
      const active: boolean = timer !== null;
      if (timer !== null) setText(gather, `폭풍이 모여든다… ${Math.max(0, Math.ceil(timer))}`, true);
      if (active !== gathering) {
        gathering = active;
        gather.classList.toggle('visible', active);
      }
    },
  };
}
