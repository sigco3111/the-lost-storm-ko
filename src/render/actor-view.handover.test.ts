import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Group } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, RigDef } from '../../sim/content/types.ts';
import { HERO } from '../../sim/hero.ts';
import type { ActorPose, ActorView, SyncOptions } from './actor-view.ts';
import { createActorView } from './actor-view.ts';
import type { ActionClip, CharacterLibrary, GaitClip, LoadedRig, RigClipSet } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';
import type { SpinPose } from './spin-view.ts';
import type { SpinClips } from './spin-style.ts';
import { SPIN_STYLES } from './spin-style.ts';

const content: Content = loadContent();

const DT: number = 1 / 60;
const ROLL = { windup: 0.36, recovery: 0.12, impact: 0.3, length: 0.6 } as const;
const OPTIONS: SyncOptions = { rise: 1, floor: 0, turnRate: 22, seen: true };
const SPINNING_FRAMES: number = 40;
const SETTLED_FRAMES: number = 3;

interface Rigged {
  readonly view: ActorView;
  readonly roll: AnimationClip;
  readonly others: readonly AnimationClip[];
}

const ACTION_NAMES: readonly string[] = ['sweep', 'slam', 'spin_mocap_in', 'spin_mocap_loop', 'spin_mocap_out'];

function rigged(def: RigDef): Rigged {
  const gaits: GaitClip[] = def.gaits.map((gait): GaitClip => ({ clip: new AnimationClip(gait.clip, 1, []), groundSpeed: gait.groundSpeed }));
  const idle: AnimationClip = new AnimationClip('idle', 1, []);
  const roll: AnimationClip = new AnimationClip('roll', ROLL.length, []);
  const named: AnimationClip[] = ACTION_NAMES.map((name: string): AnimationClip => new AnimationClip(name, 1, []));
  const actions: Map<string, ActionClip> = new Map<string, ActionClip>([['roll', { clip: roll, impactTime: ROLL.impact }], ...named.map((clip: AnimationClip): [string, ActionClip] => [clip.name, { clip, impactTime: 0.5 }])]);
  const clips: RigClipSet = { idle, run: new AnimationClip('run', 1, []), gaits, hit: [], death: [], rise: null, actions, unarmed: null, stances: new Map() };
  const loaded: LoadedRig = { def, template: new Group(), clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[def.id, loaded]]), attachments: new Map(), wearables: new Map() };
  const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }), HERO.size, 0);
  return { view, roll, others: [idle, ...gaits.map((gait: GaitClip): AnimationClip => gait.clip), ...named] };
}

function weightOf(view: ActorView, clip: AnimationClip): number {
  const action = view.rig.mixer.existingAction(clip);
  return action === null || !action.isRunning() ? 0 : action.getEffectiveWeight();
}

function spinPose(animation: string | null, turn: number, clips: SpinClips | null): SpinPose {
  return { animation, turn, lean: 0, leanAt: 0, cycle: null, clips };
}

const SPIN: ActorPose = { pos: { x: 0, z: 0 }, facing: 0, motion: 'stride', gait: 3, knockTime: 0, busy: true, held: false, beat: null, deadTime: 0 };
const HELD: ActorPose = { ...SPIN, motion: 'still', gait: 0 };

type Before = (view: ActorView) => SpinClips | null;

function spinning(clips: SpinClips | null): Before {
  return (view: ActorView): SpinClips | null => {
    for (let frame: number = 0; frame < SPINNING_FRAMES; frame += 1) {
      view.spin(spinPose('sweep', frame * 0.2, clips));
      view.sync(DT, SPIN, OPTIONS);
    }
    return clips;
  };
}

function charging(view: ActorView): SpinClips | null {
  view.startAction('slam', 1, 0.3);
  for (let frame: number = 0; frame < SPINNING_FRAMES; frame += 1) {
    view.spin(spinPose(null, 0, null));
    view.sync(DT, HELD, OPTIONS);
  }
  return null;
}

const BEFORE: readonly { readonly name: string; readonly start: Before }[] = [
  { name: 'a spin channel drawn by turning the body', start: spinning(SPIN_STYLES.upright.clips) },
  { name: 'a spin channel drawn by its own start, loop and end clips', start: spinning(SPIN_STYLES.mocap.clips) },
  { name: 'a held charge', start: charging },
];

for (const hero of content.player.heroes) {
  for (const before of BEFORE) {
    void test(`the ${hero.id} hero's roll cast out of ${before.name} plays from its first frame and holds the body through the whole move`, (): void => {
      const def: RigDef = must(content.rigs.get(hero.rig), hero.rig);
      const { view, roll, others } = rigged(def);
      before.start(view);
      assert.equal(view.startAction('roll', ROLL.windup, ROLL.recovery), true);
      const frames: number = Math.ceil((ROLL.windup + ROLL.recovery) / DT);
      for (let frame: number = 0; frame < frames; frame += 1) {
        view.spin(spinPose(null, 0, null));
        view.sync(DT, { ...SPIN, motion: frame * DT < ROLL.windup ? 'dash' : 'still', gait: frame * DT < ROLL.windup ? 18 : 0 }, OPTIONS);
        const action = must(view.rig.mixer.existingAction(roll), 'roll action');
        assert.ok(action.isRunning(), `the roll stopped at frame ${frame}`);
        if (frame === 0) assert.ok(action.time <= DT * (ROLL.impact / ROLL.windup) + 1e-9, `the roll began at ${action.time}s, not its first frame`);
        if (frame < SETTLED_FRAMES) continue;
        const rollWeight: number = weightOf(view, roll);
        for (const other of others) assert.ok(weightOf(view, other) < rollWeight, `frame ${frame}: ${other.name} (${weightOf(view, other)}) outweighs the roll (${rollWeight})`);
      }
    });
  }
}
