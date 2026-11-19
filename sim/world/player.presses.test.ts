import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { refreshPlayer } from './character.ts';
import { stepWorld } from './step.ts';
import type { ActionState, Command, World, WorldEvent } from './types.ts';

const DT: number = 1 / 60;
const PRESSES = { first: 0.1, release: 0.7, run: 3, still: 1e-4, far: 8 } as const;
const BAR: readonly (string | null)[] = ['cleave', 'cleave_heave', 'cleave_millwheel', null, null, 'dodge_roll'];

type Kind = 'move' | 'skill' | 'held' | 'channel' | 'dodge' | 'potion';

const KINDS: readonly Kind[] = ['move', 'skill', 'held', 'channel', 'dodge', 'potion'];

const SLOT: Readonly<Record<Kind, number | null>> = { move: null, skill: 0, held: 1, channel: 2, dodge: 5, potion: null };

function fighter(): World {
  const world: World = shapeArena([]);
  for (const id of BAR) if (id !== null) world.player.learned.push(id);
  world.player.bar = [...BAR];
  refreshPlayer(world);
  world.player.mana = world.player.stats.maxMana;
  world.player.life = world.player.maxLife / 2;
  return world;
}

function toward(world: World, x: number): Vec2 {
  return { x: world.player.pos.x + x, z: world.player.pos.z };
}

function pressOf(world: World, kind: Kind, side: number): readonly Command[] {
  const aim: Vec2 = toward(world, side * 4);
  switch (kind) {
    case 'move':
      return [{ type: 'move', held: false, dest: toward(world, side * PRESSES.far) }];
    case 'skill':
      return [{ type: 'skill', slot: 0, aim, targetId: null }];
    case 'held':
      return [{ type: 'hold', slot: 1, down: true }, { type: 'skill', slot: 1, aim, targetId: null }];
    case 'channel':
      return [{ type: 'hold', slot: 2, down: true }, { type: 'skill', slot: 2, aim, targetId: null }];
    case 'dodge':
      return [{ type: 'skill', slot: 5, aim: toward(world, side * 6), targetId: null }];
    case 'potion':
      return [{ type: 'flask', slot: 0 }];
  }
  return [];
}

interface Outcome {
  readonly started: number;
  readonly noticed: number;
  readonly flasks: number;
  readonly dodgeAt: number | null;
  readonly impactAt: number | null;
  readonly strayStep: number | null;
}

function play(first: Kind, second: Kind): Outcome {
  const world: World = fighter();
  let actions: Set<ActionState> = new Set<ActionState>();
  let started: number = 0;
  let noticed: number = 0;
  let flasks: number = 0;
  let dodgeAt: number | null = null;
  let impactAt: number | null = null;
  let strayStep: number | null = null;
  const secondSlot: number | null = SLOT[second];
  const steps: number = Math.round(PRESSES.run / DT);
  for (let step: number = 0; step < steps; step += 1) {
    const time: number = step * DT;
    const commands: Command[] = [];
    if (step === 0) commands.push(...pressOf(world, first, 1));
    const pressing: boolean = step === Math.round(PRESSES.first / DT);
    if (pressing) commands.push(...pressOf(world, second, -1));
    if (step === Math.round(PRESSES.release / DT)) commands.push({ type: 'hold', slot: 1, down: false }, { type: 'hold', slot: 2, down: false });
    world.player.mana = world.player.stats.maxMana;
    const before: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
    if (pressing) actions = new Set<ActionState>(world.player.action === null ? [] : [world.player.action]);
    const events: WorldEvent[] = stepWorld(world, commands, DT);
    const after: boolean = step >= Math.round(PRESSES.first / DT);
    const acting: ActionState | null = world.player.action;
    if (after && acting !== null && secondSlot !== null && acting.slot === secondSlot && !actions.has(acting)) {
      actions.add(acting);
      started += 1;
      if (second === 'dodge') dodgeAt ??= time;
    }
    if (after) noticed += events.filter((event: WorldEvent): boolean => event.type === 'notice').length;
    if (after) flasks += events.filter((event: WorldEvent): boolean => event.type === 'flask_used').length;
    if (impactAt === null && first === 'skill' && events.some((event: WorldEvent): boolean => event.type === 'skill_impact')) impactAt = time;
    const moved: number = Math.hypot(world.player.pos.x - before.x, world.player.pos.z - before.z);
    if (strayStep === null && moved > PRESSES.still && world.player.motion === 'still' && !carried(acting)) strayStep = step;
  }
  return { started, noticed, flasks, dodgeAt, impactAt, strayStep };
}

function carried(action: ActionState | null): boolean {
  return action !== null && action.skill.press?.type === 'channel' && action.phase !== 'recovery';
}

const CUT_BY_DODGE: ReadonlySet<Kind> = new Set<Kind>(['move', 'held', 'channel', 'potion']);

for (const first of KINDS) {
  for (const second of KINDS) {
    if (first === second && (first === 'held' || first === 'channel')) continue;
    void test(`${second} pressed during ${first}: it is taken once, never lost, in the order the rule gives, and the hero never moves without a motion`, (): void => {
      const outcome: Outcome = play(first, second);
      assert.equal(outcome.strayStep, null, `the hero moved while standing still at step ${outcome.strayStep ?? -1}`);
      if (second === 'potion') {
        assert.equal(outcome.flasks + (first === 'potion' ? outcome.noticed : 0), 1, `the potion was drunk ${outcome.flasks} times and noticed ${outcome.noticed} times`);
        return;
      }
      if (second === 'move') return;
      assert.equal(outcome.started + outcome.noticed, 1, `started ${outcome.started}, noticed ${outcome.noticed}`);
      if (second !== 'dodge') return;
      if (first === 'dodge') {
        assert.equal(outcome.started, 0, 'a second roll fired through the cooldown');
        return;
      }
      const at: number = outcome.dodgeAt ?? Infinity;
      if (CUT_BY_DODGE.has(first)) assert.ok(Math.abs(at - PRESSES.first) < DT / 2, `the dodge waited until ${at}s`);
      else assert.ok(outcome.impactAt !== null && at >= outcome.impactAt, `the dodge at ${at}s cut the swing before it landed at ${outcome.impactAt ?? -1}s`);
    });
  }
}

void test('a move pressed during anything is taken: the hero ends up walking toward it', (): void => {
  for (const first of KINDS) {
    const world: World = fighter();
    const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
    stepWorld(world, [...pressOf(world, first, 1)], DT);
    for (let step: number = 1; step < Math.round(PRESSES.first / DT); step += 1) stepWorld(world, [], DT);
    const dest: Vec2 = toward(world, -PRESSES.far);
    const pressedAt: number = world.player.pos.x;
    stepWorld(world, [{ type: 'move', held: false, dest }, { type: 'hold', slot: 1, down: false }, { type: 'hold', slot: 2, down: false }], DT);
    for (let step: number = 0; step < Math.round(PRESSES.run / DT); step += 1) stepWorld(world, [], DT);
    if (first === 'channel') assert.ok(world.player.pos.x < pressedAt, `the click never turned the spin toward it: ${world.player.pos.x} from ${pressedAt}`);
    else assert.ok(world.player.pos.x < start.x - 1, `after ${first} the hero never walked to the click: ${world.player.pos.x} from ${start.x}`);
  }
});
