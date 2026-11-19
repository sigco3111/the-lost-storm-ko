export interface UnisonState {
  seen: boolean;
  lookUntil: number;
  flinchUntil: number;
}

export interface UnisonLook {
  readonly type: 'unison_look';
  readonly monsterIds: readonly number[];
  readonly turn: number;
}

export interface UnisonFlinch {
  readonly type: 'unison_flinch';
  readonly monsterIds: readonly number[];
  readonly time: number;
}

export type UnisonEvent = UnisonLook | UnisonFlinch;
