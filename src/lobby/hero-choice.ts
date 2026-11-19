import type { Content, HeroDef } from '../../sim/content/types.ts';
import type { HeroStanding } from '../../sim/hero.ts';
import { heroFind, heroOf, heroOpen } from '../../sim/hero.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import type { NameBody } from './name-pool.ts';

export const HERO_KEY: string = 'lost-storm.hero';

export const HERO_TEXT = {
  heading: '누가 깨어나는가',
  fixedHeading: '깨어난 이',
  pick: '폭풍에 들어갈, 깨어날 이를 골라라.',
  change: '들어가기 전까지 바꿀 수 있다.',
} as const;

export interface HeroOption {
  readonly id: string;
  readonly name: string;
  readonly finds: string | null;
}

export type HeroChoice =
  | { readonly kind: 'choose'; readonly options: readonly HeroOption[]; readonly chosen: string | null }
  | { readonly kind: 'fixed'; readonly id: string; readonly name: string };

export interface HeroSituation {
  readonly standing: HeroStanding;
  readonly chosen: string | null;
  readonly entered: boolean;
}

export function readHero(store: KeyValueStore, content: Content): string | null {
  const kept: string | null = store.read(HERO_KEY);
  return content.player.heroes.some((hero: HeroDef): boolean => hero.id === kept) ? kept : null;
}

export function keepHero(store: KeyValueStore, id: string): void {
  store.write(HERO_KEY, id);
}

export function heroLocked(situation: HeroSituation): boolean {
  return situation.entered || !heroOpen(situation.standing);
}

export function startingHero(content: Content, saved: string | null, kept: string | null): string | null {
  if (saved !== null) return saved;
  if (kept !== null) return kept;
  return content.player.heroes.length < 2 ? content.player.hero.id : null;
}

export function heroChoice(content: Content, situation: HeroSituation): HeroChoice | null {
  if (content.player.heroes.length < 2) return null;
  if (heroLocked(situation)) {
    const hero: HeroDef = heroOf(content, situation.chosen);
    return { kind: 'fixed', id: hero.id, name: hero.name };
  }
  const options: HeroOption[] = content.player.heroes.map((hero: HeroDef): HeroOption => {
    const found: string | null = heroFind(content, hero.id);
    return { id: hero.id, name: hero.name, finds: found === null ? null : (content.itemBases.get(found)?.name ?? null) };
  });
  const chosen: string | null = options.some((option: HeroOption): boolean => option.id === situation.chosen) ? situation.chosen : null;
  return { kind: 'choose', options, chosen };
}

export function sameHeroChoice(left: HeroChoice | null, right: HeroChoice | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind === 'fixed' && right.kind === 'fixed') return left.id === right.id && left.name === right.name;
  if (left.kind === 'choose' && right.kind === 'choose') {
    if (left.chosen !== right.chosen || left.options.length !== right.options.length) return false;
    return left.options.every((option: HeroOption, index: number): boolean => {
      const other: HeroOption | undefined = right.options[index];
      return other !== undefined && option.id === other.id && option.name === other.name && option.finds === other.finds;
    });
  }
  return false;
}

export interface LobbyControls {
  readonly shown: boolean;
  readonly held: boolean;
}

export function choiceCounts(controls: LobbyControls): boolean {
  return controls.shown && !controls.held;
}

export function canEnter(choice: HeroChoice | null): boolean {
  return choice === null || choice.kind === 'fixed' || choice.chosen !== null;
}

export function heroNote(choice: HeroChoice | null): string | null {
  if (choice === null || choice.kind === 'fixed') return null;
  return choice.chosen === null ? HERO_TEXT.pick : HERO_TEXT.change;
}

export function shownHero(choice: HeroChoice | null, previewed: string | null): string | null {
  if (choice === null) return null;
  if (choice.kind === 'fixed') return choice.id;
  return choice.options.some((option: HeroOption): boolean => option.id === previewed) ? previewed : choice.chosen;
}

export function nameBodyOf(content: Content, hero: string | null): NameBody | null {
  return hero === null ? null : heroOf(content, hero).names;
}
