export interface LootShowing {
  readonly all: boolean;
  readonly near: boolean;
  readonly find: boolean;
  readonly rank: number;
  readonly shownRank: number;
  readonly inView: boolean;
}

export function lootShown(showing: LootShowing): boolean {
  return showing.find || showing.rank >= showing.shownRank || showing.near || (showing.all && showing.inView);
}

export function pilesFold(all: boolean): boolean {
  return !all;
}
