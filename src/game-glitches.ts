import type { Command, World } from '../sim/world/types.ts';
import { element } from './dom-element.ts';
import type { GlitchSettingsStore } from './glitch/glitch-settings.ts';
import type { GlitchView } from './glitch/glitch-view.ts';
import { createGlitchView } from './glitch/glitch-view.ts';
import type { Actors } from './render/actors.ts';
import { REDUCED_MOTION } from './render/effect-kit.ts';
import type { Stage } from './render/stage.ts';
import type { TearPass } from './render/tear-pass.ts';
import { createTearPass } from './render/tear-pass.ts';

export interface GameGlitchesDeps {
  readonly world: World;
  readonly stage: Stage;
  readonly glitchSettings: GlitchSettingsStore;
  readonly actors: Actors;
  readonly send: (command: Command) => void;
}

export function startGameGlitches(deps: GameGlitchesDeps): GlitchView {
  const { world, stage, actors, send } = deps;
  const tearPass: TearPass = createTearPass();
  stage.setTear(tearPass.pass);
  return createGlitchView({
    world,
    scene: stage.scene,
    app: element('hud', HTMLDivElement),
    settings: deps.glitchSettings,
    tearPass,
    reducedMotion: (): boolean => window.matchMedia(REDUCED_MOTION).matches,
    hero: () => actors.hero(),
    send,
  });
}
