import assert from 'node:assert/strict';
import test from 'node:test';
import type { Vec2 } from '../sim/math.ts';
import { TOUCH } from './mobile/touch-map.ts';
import type { MoveKeys } from './move-keys.ts';
import { createKeyWalk, keysDirection, keysReading } from './move-keys.ts';
import { must, worldIn } from '../test/support.ts';
import type { Command, World } from '../sim/world/types.ts';
import { isTextField } from './input.ts';
import { CAMERA } from './render/iso-camera.ts';
import { clickOn, DT, floorAhead, inputContent as content, rig, run } from '../test/input-support.ts';
import type { Rig } from '../test/input-support.ts';

const NONE: MoveKeys = { up: false, down: false, left: false, right: false };
const HERE: Vec2 = { x: 4, z: -2 };
const CLOSE: number = 1e-9;

function near(actual: Vec2 | null, expected: Vec2): void {
  assert.ok(actual !== null && Math.abs(actual.x - expected.x) < CLOSE && Math.abs(actual.z - expected.z) < CLOSE, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
}

void test('each key points along its side of the screen and a diagonal is no faster', (): void => {
  near(keysDirection({ ...NONE, up: true }, 0), { x: 0, z: -1 });
  near(keysDirection({ ...NONE, down: true }, 0), { x: 0, z: 1 });
  near(keysDirection({ ...NONE, left: true }, 0), { x: -1, z: 0 });
  near(keysDirection({ ...NONE, right: true }, 0), { x: 1, z: 0 });
  near(keysDirection({ ...NONE, up: true, right: true }, 0), { x: Math.SQRT1_2, z: -Math.SQRT1_2 });
  assert.equal(keysReading({ ...NONE, up: true, right: true }).magnitude, 1);
});

void test('the direction turns with the camera', (): void => {
  near(keysDirection({ ...NONE, up: true }, Math.PI / 4), { x: -Math.SQRT1_2, z: -Math.SQRT1_2 });
  near(keysDirection({ ...NONE, right: true }, Math.PI / 4), { x: Math.SQRT1_2, z: -Math.SQRT1_2 });
});

void test('no key, or two keys that oppose each other, point nowhere', (): void => {
  assert.equal(keysDirection(NONE, 0), null);
  assert.equal(keysDirection({ ...NONE, up: true, down: true }, 0), null);
  assert.equal(keysDirection({ up: true, down: true, left: true, right: true }, 0), null);
  near(keysDirection({ ...NONE, up: true, down: true, left: true }, 0), { x: -1, z: 0 });
});

void test('held keys walk every step, a release stops once, and idle keys send nothing', (): void => {
  const walk = createKeyWalk(0);
  assert.deepEqual(walk.step(NONE, HERE), []);
  assert.deepEqual(walk.step({ ...NONE, right: true }, HERE), [{ type: 'walk', held: false, dest: { x: HERE.x + TOUCH.stickReach, z: HERE.z } }]);
  assert.deepEqual(walk.step({ ...NONE, right: true }, HERE), [{ type: 'walk', held: true, dest: { x: HERE.x + TOUCH.stickReach, z: HERE.z } }]);
  assert.deepEqual(walk.step(NONE, HERE), [{ type: 'stop' }]);
  assert.deepEqual(walk.step(NONE, HERE), []);
  assert.deepEqual(walk.step({ ...NONE, left: true, right: true }, HERE), []);
  assert.equal(walk.step({ ...NONE, up: true }, HERE)[0]?.type, 'walk');
});

const YAW: number = (CAMERA.yawDegrees * Math.PI) / 180;

function walks(commands: readonly Command[]): Command[] {
  return commands.filter((command: Command): boolean => command.type === 'walk' || command.type === 'stop');
}

void test('with the keys moving the hero, a held W walks up the screen every frame and its release stops once', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  const up: Vec2 = must(keysDirection({ up: true, down: false, left: false, right: false }, YAW), 'up');
  const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  setup.fire('keydown', { code: 'KeyW' });
  assert.deepEqual(walks(setup.input.collect(DT)), [{ type: 'walk', held: false, dest: { x: from.x + up.x * TOUCH.stickReach, z: from.z + up.z * TOUCH.stickReach } }]);
  assert.deepEqual(walks(setup.input.collect(DT)).map((command: Command): string => (command.type === 'walk' ? `walk ${command.held}` : command.type)), ['walk true']);
  setup.fire('keyup', { code: 'KeyW' });
  assert.deepEqual(walks(setup.input.collect(DT)), [{ type: 'stop' }]);
  assert.deepEqual(walks(setup.input.collect(DT)), []);
});

void test('with the keys moving the hero, the hero really walks the way the key points', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const reached: number[] = [];
  for (const [code, keys] of [['KeyW', { up: true, down: false, left: false, right: false }], ['KeyS', { up: false, down: true, left: false, right: false }]] as const) {
    world.player.pos.x = from.x;
    world.player.pos.z = from.z;
    const way: Vec2 = must(keysDirection(keys, YAW), code);
    setup.fire('keydown', { code });
    run(setup, 0.6, (): boolean => false);
    setup.fire('keyup', { code });
    run(setup, 0.1, (): boolean => false);
    reached.push((world.player.pos.x - from.x) * way.x + (world.player.pos.z - from.z) * way.z);
  }
  assert.ok(Math.max(...reached) > 1, `the hero walked ${reached.join(' and ')} along the keys`);
});

void test('with the keys moving the hero, a press on open ground never walks there', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  const commands: Command[] = clickOn(setup, floorAhead(world));
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'move'), []);
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'skill').map((command: Command): number | null => (command.type === 'skill' ? command.slot : null)), [0]);
  assert.equal(setup.input.reading.click?.kind, 'skill');
});

void test('while a click moves the hero, W never walks', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.fire('keydown', { code: 'KeyW' });
  assert.deepEqual(walks(setup.input.collect(DT)), []);
});

void test('a move key held while a text field takes the focus is let go, and a button taking the focus changes nothing', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  setup.fire('keydown', { code: 'KeyD' });
  assert.equal(walks(setup.input.collect(DT))[0]?.type, 'walk');
  setup.focus(new EventTarget());
  assert.equal(walks(setup.input.collect(DT))[0]?.type, 'walk');
  const field: EventTarget = Object.assign(new EventTarget(), { selectionStart: 0 });
  assert.equal(isTextField(field), true);
  assert.equal(isTextField(null), false);
  setup.focus(field);
  assert.deepEqual(walks(setup.input.collect(DT)), [{ type: 'stop' }]);
});

const KEY_WAYS: readonly { readonly codes: readonly string[]; readonly keys: MoveKeys }[] = [
  { codes: ['KeyW'], keys: { ...NONE, up: true } },
  { codes: ['KeyS'], keys: { ...NONE, down: true } },
  { codes: ['KeyA'], keys: { ...NONE, left: true } },
  { codes: ['KeyD'], keys: { ...NONE, right: true } },
  { codes: ['KeyW', 'KeyA'], keys: { ...NONE, up: true, left: true } },
  { codes: ['KeyW', 'KeyD'], keys: { ...NONE, up: true, right: true } },
  { codes: ['KeyS', 'KeyA'], keys: { ...NONE, down: true, left: true } },
  { codes: ['KeyS', 'KeyD'], keys: { ...NONE, down: true, right: true } },
];

function walkToward(setup: Rig, target: Vec2, seconds: number): void {
  const { pos } = setup.world.player;
  const yaw: number = (CAMERA.yawDegrees * Math.PI) / 180;
  const score = (keys: MoveKeys): number => {
    const way: Vec2 | null = keysDirection(keys, yaw);
    return way === null ? -Infinity : way.x * (target.x - pos.x) + way.z * (target.z - pos.z);
  };
  const best = must(KEY_WAYS.toSorted((a, b): number => score(b.keys) - score(a.keys))[0], 'a way');
  for (const code of best.codes) setup.fire('keydown', { code });
  run(setup, seconds, (): boolean => false);
  for (const code of best.codes) setup.fire('keyup', { code });
  run(setup, DT * 2, (): boolean => false);
}

void test('walking by the keys into an exit, over an item or up to a person never travels, picks up or talks: each needs a click', (): void => {
  const world: World = worldIn(content, 'hideout', 23);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  const exit = must(world.zone.exits[0], 'an exit');
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  world.ground.push({ id: world.nextId++, pos: { x: start.x + (exit.x - start.x) * 0.3, z: start.z + (exit.z - start.z) * 0.3 }, from: { x: start.x, z: start.z }, content: { kind: 'item', item: { ...must(world.player.equipped.weapon, 'a weapon to drop'), uid: 99001 } }, find: null, age: 10, kept: false });
  const lying: number = world.ground.length;
  walkToward(setup, exit, 4);
  assert.equal(world.zone.id, 'hideout', 'walked through the exit');
  assert.ok(Math.hypot(world.player.pos.x - exit.x, world.player.pos.z - exit.z) < Math.hypot(start.x - exit.x, start.z - exit.z) - 3, 'the hero walked toward the exit');
  assert.equal(world.ground.length, lying, 'walked over the item and picked it up');
  const person = must(world.npcs[0], 'a person');
  walkToward(setup, person.pos, 4);
  assert.equal(world.dialogue, null, 'walked into a person and talked');
});

void test('a touch tap moves the hero by click even with the keys setting on, and the readout says which mode is live', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  setup.fire('pointermove', { clientX: 10, clientY: 10, pointerType: 'mouse' });
  setup.input.collect(DT);
  assert.equal(setup.input.reading.movement, 'keys');
  const point: Vec2 = floorAhead(world);
  setup.input.tap(point.x, point.z);
  const commands: Command[] = setup.input.collect(DT);
  assert.equal(commands.filter((command: Command): boolean => command.type === 'move').length, 1, JSON.stringify(commands));
  assert.equal(setup.input.reading.movement, 'click');
});
