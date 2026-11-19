import type { Content, ItemSlot } from '../../sim/content/types.ts';
import { heroRig } from '../../sim/hero.ts';
import { frameOf } from '../../sim/wear.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { CharacterProfile, ProfileBuild, ProfileLookup } from '../backend/api.ts';
import type { ProfileApi } from '../backend/profile-api.ts';
import { foundTip } from '../hud/character-panel.ts';
import { createCloseButton } from '../hud/close-button.ts';
import type { HudContext } from '../hud/context.ts';
import { el, label, setClass, setData, setText } from '../hud/dom.ts';
import type { HudApi } from '../hud/hud-api.ts';
import { createItemCell, showItem } from '../hud/item-cell.ts';
import type { ItemCell } from '../hud/item-cell.ts';
import { foundLines, profileFigures, recordLines, valueText } from '../hud/record-lines.ts';
import type { RecordFigures, RecordLine } from '../hud/record-lines.ts';
import { createSaleOffer } from '../hud/sale-offer.ts';
import { attachTooltip, createTooltip } from '../hud/tooltip.ts';
import type { Tooltip } from '../hud/tooltip.ts';
import type { ItemPictures } from '../render/item-pictures.ts';
import type { Turntable } from '../render/item-thumbnails.ts';
import { createFigureView } from './figure-view.ts';
import type { FigureView } from './figure-view.ts';
import { buildSkills, placesText, profileFigure, profileHeadline, profileSlots } from './profile-model.ts';
import type { ProfileFigure, ProfileSlot } from './profile-model.ts';
import { ensureProfileStyles } from './profile-styles.ts';

export interface ProfilePanelDeps {
  readonly api: HudApi;
  readonly content: Content;
  readonly profiles: ProfileApi;
  readonly pictures: ItemPictures;
  readonly turntable: (figure: ProfileFigure) => Promise<Turntable | null>;
  readonly hosts: ProfileHosts;
  readonly playing: () => boolean;
}

export interface ProfileHosts {
  readonly play: HTMLElement;
  readonly lobby: HTMLElement;
}

export interface ProfilePanel {
  open(name: string): void;
  close(): boolean;
  isOpen(): boolean;
  refreshItems(): void;
}

export type ProfileState = 'loading' | ProfileLookup['kind'];

export const PROFILE_PANEL = {
  closeKey: 'Escape',
  label: '플레이어 프로필',
  blank: '–',
  noSkills: '스킬 바에 스킬이 없다',
  keepOpenWithin: ['.profile-pick', '.player-menu'],
} as const;

export const BLANK_PROFILE: CharacterProfile = { name: '', hero: null, level: 0, furthest: '', online: false, stats: { playedMs: 0, kills: 0, bosses: 0, deaths: 0, bestLevel: 0, biggestHit: 0, goldLooted: 0, moments: 0, quests: 0, found: {} }, worn: [], build: null };

const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = { weapon: '무기', head: '머리', chest: '가슴', hands: '손', legs: '다리', feet: '발', charm: '부적' };

export function stateNote(state: ProfileState, name: string): string {
  switch (state) {
    case 'loading':
      return `${name} 찾는 중…`;
    case 'ok':
      return '';
    case 'missing':
      return `${name}이라는 이는 없다.`;
    case 'unsupported':
      return '이 서버에서는 아직 프로필이 열리지 않았다.';
    case 'failed':
      return '지금은 프로필에 닿지 않는다.';
  }
  return '';
}

interface SlotView {
  readonly slot: ItemSlot;
  readonly cell: ItemCell;
}

interface RecordRow {
  readonly line: RecordLine;
  readonly value: HTMLDivElement;
}

export function createProfilePanel(deps: ProfilePanelDeps): ProfilePanel {
  ensureProfileStyles();
  const { content } = deps;
  const layer: HTMLDivElement = el('div', 'hud profile-layer', deps.hosts.lobby);
  const tooltip: Tooltip = createTooltip(layer);
  let frame: string = frameOf(content, heroRig(content, null));
  let shown: CharacterProfile | null = null;
  const api: HudApi = { ...deps.api, itemImage: (item: ItemInstance): string | null => deps.pictures.imageOn(frame, item), unverified: (): boolean => false };
  const context: HudContext = { api, tooltip, sale: createSaleOffer() };

  const sheet: HTMLElement = el('section', 'profile-sheet', layer);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', PROFILE_PANEL.label);
  setData(sheet, 'state', 'loading');
  const head: HTMLDivElement = el('div', 'profile-head', sheet);
  const nameRow: HTMLDivElement = el('div', 'profile-name-row', head);
  const dot: HTMLSpanElement = el('span', 'profile-dot', nameRow);
  const title: HTMLDivElement = label('profile-name', '', nameRow);
  const headline: HTMLDivElement = label('profile-headline', '', head);

  const body: HTMLDivElement = el('div', 'profile-body', sheet);
  const figure: HTMLDivElement = el('div', 'profile-figure', body);
  const turning: FigureView = createFigureView(figure);
  const side: HTMLDivElement = el('div', 'profile-side', body);
  label('cs-heading', '착용', side);
  const worn: HTMLDivElement = el('div', 'profile-worn', side);
  const slots: SlotView[] = profileSlots(BLANK_PROFILE, 0).map((entry: ProfileSlot): SlotView => {
    const holder: HTMLDivElement = el('div', 'profile-slot', worn);
    const cell: ItemCell = createItemCell(context, holder, (): string => (shown === null ? '' : `${shown.name} 착용`));
    label('profile-slot-name', SLOT_NAMES[entry.slot], holder);
    return { slot: entry.slot, cell };
  });
  label('cs-heading wide', '빌드', side);
  const skills: HTMLDivElement = label('profile-skills', PROFILE_PANEL.blank, side);
  const places: HTMLDivElement = label('profile-places', '', side);

  label('cs-heading wide', '기록', sheet);
  const recordList: HTMLDivElement = el('div', 'cs-record profile-record', sheet);
  let figures: RecordFigures | null = null;
  const rows: RecordRow[] = recordLines(profileFigures(BLANK_PROFILE)).map((line: RecordLine): RecordRow => {
    const holder: HTMLDivElement = el('div', 'cs-row', recordList);
    label('cs-name', line.name, holder);
    const value: HTMLDivElement = label('cs-value', PROFILE_PANEL.blank, holder);
    if (line.id === 'found') attachTooltip(tooltip, holder, (): HTMLElement | null => (figures === null ? null : foundTip(foundLines(content, figures.found))));
    return { line, value };
  });

  let open: boolean = false;
  let asking: AbortController | null = null;
  let token: number = 0;
  let portraitKey: string = '';
  let batch: number = 0;

  const setOpen = (next: boolean): void => {
    open = next;
    setClass(layer, 'open', open);
    if (open) return;
    tooltip.hide();
    turning.stop();
  };

  const showSlots = (profile: CharacterProfile | null): void => {
    const items: readonly ProfileSlot[] = profile === null ? [] : profileSlots(profile, batch);
    for (const view of slots) showItem(context, view.cell, items.find((entry: ProfileSlot): boolean => entry.slot === view.slot)?.item ?? null);
  };

  const showRecord = (profile: CharacterProfile | null): void => {
    figures = profile === null ? null : profileFigures(profile);
    const lines: readonly RecordLine[] | null = figures === null ? null : recordLines(figures);
    rows.forEach((row: RecordRow, index: number): void => {
      const line: RecordLine | undefined = lines?.[index];
      setText(row.value, line === undefined ? PROFILE_PANEL.blank : valueText(line.value), open);
    });
  };

  const place = async (dressed: ProfileFigure, asked: number): Promise<void> => {
    const table: Turntable | null = await deps.turntable(dressed);
    if (asked !== token || table === null) return;
    turning.show(table);
  };

  const showPortrait = (profile: CharacterProfile | null, asked: number): void => {
    if (profile === null) {
      portraitKey = '';
      turning.clear();
      return;
    }
    const dressed: ProfileFigure = profileFigure(content, profile);
    if (dressed.key === portraitKey) return;
    portraitKey = dressed.key;
    turning.clear();
    turning.reset();
    void place(dressed, asked);
  };

  const paintState = (state: ProfileState, name: string): void => {
    setData(sheet, 'state', state);
    setText(title, name, open);
    if (state === 'ok') return;
    setText(headline, stateNote(state, name), open);
    setClass(dot, 'on', false);
  };

  const paintProfile = (profile: CharacterProfile | null, asked: number): void => {
    if (profile !== null) setText(headline, profileHeadline(content, profile), open);
    setClass(dot, 'on', profile?.online === true);
    if (profile !== shown) batch += 1;
    shown = profile;
    frame = frameOf(content, heroRig(content, profile?.hero ?? null));
    showSlots(profile);
    showRecord(profile);
    const build: ProfileBuild | null = profile?.build ?? null;
    const names: readonly string[] = buildSkills(content, build);
    setText(skills, profile === null ? PROFILE_PANEL.blank : names.length === 0 ? PROFILE_PANEL.noSkills : names.join(', '), open);
    setText(places, build === null ? '' : placesText(build.places), open);
    showPortrait(profile, asked);
  };

  const ask = async (name: string, asked: number, signal: AbortSignal): Promise<void> => {
    const lookup: ProfileLookup = await deps.profiles.profile(name, signal);
    if (asked !== token) return;
    const profile: CharacterProfile | null = lookup.kind === 'ok' ? lookup.profile : null;
    paintState(lookup.kind, profile?.name ?? name);
    paintProfile(profile, asked);
  };

  const close = (): boolean => {
    if (!open) return false;
    asking?.abort();
    asking = null;
    token += 1;
    setOpen(false);
    return true;
  };

  createCloseButton(sheet, 'profile', (): void => {
    close();
  });

  document.addEventListener(
    'pointerdown',
    (event: PointerEvent): void => {
      if (!open || !(event.target instanceof Element)) return;
      if (sheet.contains(event.target)) return;
      if (PROFILE_PANEL.keepOpenWithin.some((selector: string): boolean => event.target instanceof Element && event.target.closest(selector) !== null)) return;
      close();
    },
    { capture: true },
  );

  window.addEventListener(
    'keydown',
    (event: KeyboardEvent): void => {
      if (!open || event.code !== PROFILE_PANEL.closeKey) return;
      close();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );

  return {
    open(name: string): void {
      if (open && shown?.name.toLowerCase() === name.toLowerCase()) return;
      asking?.abort();
      const controller: AbortController = new AbortController();
      asking = controller;
      token += 1;
      const asked: number = token;
      const wasOpen: boolean = open;
      const host: HTMLElement = deps.playing() ? deps.hosts.play : deps.hosts.lobby;
      if (layer.parentElement !== host) {
        host.append(layer);
        layer.getBoundingClientRect();
      }
      if (!wasOpen) {
        turning.reset();
        paintProfile(null, asked);
      }
      setOpen(true);
      paintState('loading', name);
      void ask(name, asked, controller.signal);
    },
    close,
    isOpen(): boolean {
      return open;
    },
    refreshItems(): void {
      if (open) showSlots(shown);
    },
  };
}
