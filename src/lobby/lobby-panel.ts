import type { Leaderboard, LevelUpNote } from '../backend/api.ts';
import { el, label, setClass, setData, setText } from '../hud/dom.ts';
import { createBoardView } from './board-view.ts';
import type { BoardView } from './board-view.ts';
import { ensureLobbyStyles } from './styles.ts';
import { agoText, levelUpText, onlineTotal, presentView, shownKey } from './lobby-model.ts';
import { createOnlineList } from './online-list.ts';
import type { OnlineList } from './online-list.ts';

export type PanelState = 'loading' | 'ready' | 'unreachable';

export interface LobbyPanel {
  readonly root: HTMLElement;
  readonly head: HTMLElement;
  show(board: Leaderboard | null): void;
  stop(): void;
  closeOnline(): boolean;
}

export interface LobbyPanelOptions {
  readonly title: string;
  readonly rows: number;
  readonly ticker: boolean;
  readonly pick: ((name: string) => void) | null;
}

export const LOBBY_PANEL: { readonly tickerMs: number; readonly tickerLines: number; readonly swapMs: number; readonly empty: string; readonly unreachable: string } = {
  tickerMs: 4200,
  tickerLines: 5,
  swapMs: 260,
  empty: '아직 깨어난 이가 없다.',
  unreachable: '지금은 순위에 닿지 않는다.',
};

interface Ticker {
  show(notes: readonly LevelUpNote[]): void;
  stop(): void;
}

function createTicker(parent: HTMLElement): Ticker {
  const box: HTMLDivElement = el('div', 'lobby-ticker', parent);
  const line: HTMLDivElement = el('div', 'lobby-ticker-line', box);
  const what: HTMLSpanElement = el('span', 'lobby-ticker-what', line);
  const when: HTMLSpanElement = el('span', 'lobby-ticker-when', line);
  let notes: readonly LevelUpNote[] = [];
  let index: number = 0;
  let painted: boolean = false;
  let timer: number | null = null;

  const paint = (): void => {
    const note: LevelUpNote | undefined = notes[index % Math.max(1, notes.length)];
    setText(what, note === undefined ? '' : levelUpText(note), false);
    setText(when, note === undefined ? '' : agoText(note.minutesAgo), false);
    setClass(box, 'shown', note !== undefined);
    setClass(line, 'out', false);
  };

  const swap = (): void => {
    setClass(line, 'out', true);
    window.setTimeout(paint, LOBBY_PANEL.swapMs);
  };

  const cycle = (): void => {
    if (timer !== null) window.clearInterval(timer);
    timer = notes.length > 1 ? window.setInterval((): void => {
      index += 1;
      swap();
    }, LOBBY_PANEL.tickerMs) : null;
  };

  return {
    show(next: readonly LevelUpNote[]): void {
      const trimmed: readonly LevelUpNote[] = next.slice(0, LOBBY_PANEL.tickerLines);
      const changed: boolean = !painted || trimmed.map(levelUpText).join('|') !== notes.map(levelUpText).join('|');
      notes = trimmed;
      painted = true;
      if (!changed) {
        const note: LevelUpNote | undefined = notes[index % Math.max(1, notes.length)];
        if (note !== undefined) setText(when, agoText(note.minutesAgo), false);
        return;
      }
      index = 0;
      swap();
      cycle();
    },
    stop(): void {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    },
  };
}

export function createLobbyPanel(parent: HTMLElement, options: LobbyPanelOptions): LobbyPanel {
  ensureLobbyStyles();
  const root: HTMLElement = el('section', 'lobby-panel', parent);
  root.dataset['state'] = 'loading';
  let drawn: string | null = null;
  const head: HTMLDivElement = el('div', 'lobby-head', root);
  label('lobby-title', options.title, head);
  const online: OnlineList = createOnlineList(head, root, options.pick);
  const list: HTMLOListElement = el('ol', 'lobby-board', root);
  const board: BoardView = createBoardView(list, options.rows, options.pick);
  const note: HTMLDivElement = label('lobby-note', '', root);
  const ticker: Ticker | null = options.ticker ? createTicker(root) : null;

  return {
    root,
    head,
    show(next: Leaderboard | null): void {
      if (next === null) {
        if (root.dataset['state'] !== 'ready') {
          setData(root, 'state', 'unreachable');
          setText(note, LOBBY_PANEL.unreachable, false);
        }
        return;
      }
      const key: string = shownKey(next, options.rows);
      if (key === drawn && root.dataset['state'] === 'ready') return;
      drawn = key;
      setData(root, 'state', 'ready');
      setClass(root, 'empty', next.top.length === 0);
      setText(note, LOBBY_PANEL.empty, false);
      online.show(onlineTotal(next), presentView(next));
      board.render(next.top, next.you === null ? null : next.you.name, next.by);
      ticker?.show(next.levelUps);
    },
    stop(): void {
      ticker?.stop();
      online.close();
    },
    closeOnline(): boolean {
      if (!online.isOpen()) return false;
      online.close();
      return true;
    },
  };
}
