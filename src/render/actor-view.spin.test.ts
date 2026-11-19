import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Group } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, RigDef } from '../../sim/content/types.ts';
import { HERO } from '../../sim/hero.ts';
import type { ActorView } from './actor-view.ts';
import { createActorView } from './actor-view.ts';
import type { ActionClip, CharacterLibrary, LoadedRig, RigClipSet } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';
import { SPIN_STYLES } from './spin-style.ts';

const content: Content = loadContent();

function heroView(def: RigDef, actions: ReadonlyMap<string, ActionClip>): ActorView {
  const clips: RigClipSet = { idle: new AnimationClip('idle', 1, []), run: new AnimationClip('run', 1, []), gaits: [], hit: [], death: [], rise: null, actions: new Map(actions), unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def, template: new Group(), clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  return createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), HERO.size, 0);
}

void test('a spin style whose clips the rig lacks plays the authored attack pose, and one whose clips it has plays them', (): void => {
  const def: RigDef = must(content.rigs.get(content.player.heroes[0]?.rig ?? ''), 'hero rig');
  const swing: AnimationClip = new AnimationClip('Sword_Attack', 1, []);
  const opening: AnimationClip = new AnimationClip('Whirlwind_In', 1, []);
  const pose = { animation: 'spin', turn: 0, lean: 0, leanAt: 0, cycle: null, clips: SPIN_STYLES.whirlwind.clips };
  const bare: ActorView = heroView(def, new Map([['spin', { clip: swing, impactTime: 0.4 }]]));
  bare.spin(pose);
  assert.equal(bare.rig.mixer.existingAction(swing)?.timeScale, 0);
  const whole: ActorView = heroView(def, new Map([['spin', { clip: swing, impactTime: 0.4 }], ['spin_whirlwind_in', { clip: opening, impactTime: 0 }], ['spin_whirlwind_loop', { clip: new AnimationClip('Whirlwind_Loop', 1, []), impactTime: 0 }], ['spin_whirlwind_out', { clip: new AnimationClip('Whirlwind_Out', 1, []), impactTime: 0 }]]));
  whole.spin(pose);
  assert.equal(whole.rig.mixer.existingAction(swing), null);
  assert.equal(whole.rig.mixer.existingAction(opening)?.isRunning(), true);
});
