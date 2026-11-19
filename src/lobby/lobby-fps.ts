import { createFpsReadout } from '../hud/fps.ts';
import type { FpsReadout } from '../hud/fps.ts';
import type { FrameView } from '../hud/frame-meter.ts';

export interface LobbyReadoutState {
  readonly shown: boolean;
  readonly view: FrameView;
}

export function lobbyReadout(setting: boolean, active: boolean, busy: boolean): LobbyReadoutState {
  return { shown: setting && active, view: active && !busy ? 'shown' : 'veiled' };
}

export interface LobbyFps {
  frame(now: number, active: boolean, busy: boolean): void;
}

export function createLobbyFps(parent: HTMLElement, setting: () => boolean, tier: () => string): LobbyFps {
  const readout: FpsReadout = createFpsReadout(parent, tier);
  let shown: boolean = false;
  return {
    frame(now: number, active: boolean, busy: boolean): void {
      const state: LobbyReadoutState = lobbyReadout(setting(), active, busy);
      if (state.shown !== shown) {
        shown = state.shown;
        readout.setVisible(shown);
      }
      readout.frame(now, state.view);
    },
  };
}
