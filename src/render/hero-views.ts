import type { PlayerState, World } from '../../sim/world/types.ts';

export interface HeroView {
  dispose(): void;
}

export interface HeroViews<View extends HeroView> {
  view(id: number): View | undefined;
  each(current: World, visit: (hero: PlayerState, view: View) => void): void;
  sweep(current: World): void;
}

export function createHeroViews<View extends HeroView>(make: (hero: PlayerState) => View | null): HeroViews<View> {
  const views: Map<number, View> = new Map<number, View>();
  const viewFor = (hero: PlayerState): View | null => {
    const existing: View | undefined = views.get(hero.id);
    if (existing !== undefined) return existing;
    const made: View | null = make(hero);
    if (made !== null) views.set(hero.id, made);
    return made;
  };
  return {
    view: (id: number): View | undefined => views.get(id),
    each: (current: World, visit: (hero: PlayerState, view: View) => void): void => {
      for (const hero of current.heroes) {
        if (hero.id === current.player.id) continue;
        const view: View | null = viewFor(hero);
        if (view !== null) visit(hero, view);
      }
    },
    sweep: (current: World): void => {
      for (const [id, view] of views) {
        if (id !== current.player.id && current.heroes.some((hero: PlayerState): boolean => hero.id === id)) continue;
        view.dispose();
        views.delete(id);
      }
    },
  };
}
