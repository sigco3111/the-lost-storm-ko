import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { must, worldIn, zoneOf } from '../test/support.ts';
import type { ZoneExit } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { createWorld } from '../sim/world/create.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { Command, EncounterState, MonsterState, World } from '../sim/world/types.ts';
import { wakeLength } from '../sim/world/wake.ts';
import { enterZone } from '../sim/world/zones.ts';
import { refreshPlayer } from '../sim/world/character.ts';
import { floorAt, heightAt } from '../sim/nav/terrain.ts';
import { Vector2 } from 'three';
import type { Vector3 } from 'three';
import type { InputCamera } from './input.ts';
import { clickFloor, clickHeight } from './render/terrain-sight.ts';
import { stickMove } from './mobile/touch-map.ts';
import type { SlotDefault } from './settings/bindings.ts';
import { at, clickOn, DT, floorAhead, heroCamera, inputContent as content, LEFT, noPlayers, RIGHT, rig, run, screenOf, SLOTS, VIEW } from '../test/input-support.ts';
import type { PlayerHooks, Rig } from '../test/input-support.ts';

void test('pointer presses become world input only on the canvas, so a click on the HUD never moves the hero', (): void => {
  const source: string = readFileSync('src/input.ts', 'utf8');
  const listeners: string[] = [...source.matchAll(/(\w+)\.addEventListener\(\s*'(pointer\w+|mouse\w+|click|touch\w+)'/g)].map((match: RegExpExecArray): string => `${match[1] ?? ''}.${match[2] ?? ''}`);
  assert.ok(listeners.includes('canvas.pointerdown'));
  for (const listener of listeners) assert.ok(listener.startsWith('canvas.'), `${listener} listens outside the canvas`);
});

function voidWithLight(seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: true });
  const wake = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / DT) + 1; step += 1) stepWorld(world, [], DT);
  Object.assign(world.flags, { opening: 'read', first_choice: 'took_journal', first_blade: 'found' });
  for (let clock: number = 0; clock < 90 && !world.encounters.some((state: EncounterState): boolean => state.pos !== null); clock += DT) {
    stepWorld(world, [{ type: 'move', held: true, dest: { x: world.player.pos.x + world.heading.x * 6, z: world.player.pos.z + world.heading.z * 6 } }], DT);
  }
  stepWorld(world, [{ type: 'stop' }], DT);
  return world;
}

function lightOf(world: World): ZoneExit {
  return must(world.zone.exits[0], 'light exit');
}

function arrivedBy(zoneId: string, exitId: string): World {
  const world: World = worldIn(content, zoneId, 5);
  const came: string | undefined = zoneOf(content, zoneId).exits.find((entry: ZoneExit): boolean => entry.id === exitId)?.to;
  if (came !== undefined) world.visited.push(came);
  enterZone(world, zoneOf(content, zoneId), { type: 'exit', exit: exitId });
  world.events = [];
  return world;
}

function toward(from: Vec2, to: Vec2, metres: number): Vec2 {
  const gap: number = Math.hypot(to.x - from.x, to.z - from.z);
  return { x: from.x + ((to.x - from.x) / gap) * metres, z: from.z + ((to.z - from.z) / gap) * metres };
}

void test('holding the pointer still, far ahead toward the light, walks the hero into it but never through', (): void => {
  const world: World = voidWithLight(11);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const point: Vec2 = screenOf(world, toward(world.player.pos, lightOf(world), VIEW.span * 0.7));
  setup.input.holdAt(point.x, point.z);
  run(setup, 20, (): boolean => world.zone.id !== from);
  assert.equal(world.zone.id, from);
});

void test('a held pointer dragged across the light and resting on it never carries the hero through', (): void => {
  const world: World = voidWithLight(12);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const start: Vec2 = screenOf(world, toward(world.player.pos, lightOf(world), 3));
  setup.input.holdAt(start.x, start.z);
  run(setup, 0.3, (): boolean => false);
  const onLight: Vec2 = screenOf(world, lightOf(world));
  setup.input.moveHold(onLight.x, onLight.z);
  run(setup, 20, (): boolean => world.zone.id !== from);
  assert.equal(world.zone.id, from);
});

void test('a tap on the ground inside the light travels', (): void => {
  const world: World = voidWithLight(13);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const inside: Vec2 = screenOf(world, toward(lightOf(world), world.player.pos, lightOf(world).radius * 0.5));
  setup.input.tap(inside.x, inside.z);
  run(setup, 60, (): boolean => world.zone.id !== from);
  assert.notEqual(world.zone.id, from);
});

void test('the stick held toward the light never walks the hero through it', (): void => {
  const world: World = voidWithLight(14);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  let moving: boolean = false;
  run(setup, 20, (): boolean => world.zone.id !== from, (): readonly Command[] => {
    const light: ZoneExit = lightOf(world);
    const gap: number = Math.hypot(light.x - world.player.pos.x, light.z - world.player.pos.z);
    const command = stickMove(world.player.pos, { x: (light.x - world.player.pos.x) / gap, z: (light.z - world.player.pos.z) / gap }, moving);
    moving = true;
    return command === null ? [] : [command];
  });
  assert.equal(world.zone.id, from);
});

void test('every zone exit travels by a press that starts on it, held or tapped', (): void => {
  const exits: readonly { readonly zone: string; readonly exit: string }[] = [
    { zone: 'hall_of_time', exit: 'mist' },
    { zone: 'hall_of_time', exit: 'east' },
    { zone: 'hideout', exit: 'west' },
  ];
  for (const { zone, exit } of exits) {
    for (const press of ['held', 'click'] as const) {
      const world: World = arrivedBy(zone, exit);
      const setup: Rig = rig(world);
      const target: ZoneExit = must(world.zone.exits.find((entry: ZoneExit): boolean => entry.id === exit), exit);
      const point: Vec2 = screenOf(world, target);
      if (press === 'held') setup.input.holdAt(point.x, point.z);
      else setup.input.tap(point.x, point.z);
      run(setup, 30, (): boolean => world.zone.id !== zone);
      assert.equal(world.zone.id, target.to, `${press} on ${zone}.${exit}: ${JSON.stringify(world.player.intent)} at ${world.player.pos.x.toFixed(1)},${world.player.pos.z.toFixed(1)} exit ${target.x},${target.z} r ${target.radius}`);
    }
  }
});

void test('a held walk across the waypoint keeps walking past it', (): void => {
  const world: World = worldIn(content, 'hideout', 6);
  const mark = must(world.zone.waypoint, 'waypoint');
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const gap: number = Math.hypot(mark.x - start.x, mark.z - start.z);
  const dir: Vec2 = { x: (mark.x - start.x) / gap, z: (mark.z - start.z) / gap };
  const setup: Rig = rig(world);
  const point: Vec2 = screenOf(world, toward(world.player.pos, mark, 5));
  setup.input.holdAt(point.x, point.z);
  const along = (): number => (world.player.pos.x - start.x) * dir.x + (world.player.pos.z - start.z) * dir.z;
  run(setup, 30, (): boolean => along() > gap + 2);
  assert.ok(along() > gap + 2, `stopped ${(gap - along()).toFixed(2)} m short of the waypoint`);
});

void test('a held walk that began on the ground keeps walking into an open exit while the pointer drifts over the HUD, and never travels', (): void => {
  const world: World = arrivedBy('hall_of_time', 'east');
  let overHud: boolean = false;
  const setup: Rig = rig(world, (): boolean => overHud);
  const exit: ZoneExit = must(world.zone.exits.find((entry: ZoneExit): boolean => entry.id === 'east'), 'east exit');
  const start: Vec2 = screenOf(world, toward(world.player.pos, exit, 1.5));
  setup.input.holdAt(start.x, start.z);
  run(setup, 0.2, (): boolean => false);
  overHud = true;
  const beyond: Vec2 = screenOf(world, { x: exit.x + 2, z: exit.z });
  setup.input.moveHold(beyond.x, beyond.z);
  run(setup, 10, (): boolean => world.zone.id !== 'hall_of_time');
  assert.equal(world.zone.id, 'hall_of_time');
  assert.ok(Math.hypot(exit.x - world.player.pos.x, exit.z - world.player.pos.z) <= exit.radius + 1, 'he stopped short of the exit');
});

function talkingToGuide(): World {
  const world: World = worldIn(content, 'hideout', 7);
  for (const quest of content.quests.values()) if (quest.id !== 'wardens_lesson') world.quests[quest.id] = quest.objectives.length;
  world.quests['wardens_lesson'] = 0;
  const guide = must(world.npcs.find((npc): boolean => npc.def.id === 'warden_guide'), 'guide');
  world.player.pos.x = guide.pos.x + 1;
  world.player.pos.z = guide.pos.z;
  stepWorld(world, [{ type: 'talk', npcId: guide.id }], DT);
  for (let step: number = 0; step < 60 && world.dialogue === null; step += 1) stepWorld(world, [], DT);
  assert.equal(world.dialogue?.talk.id, 'warden_guide_lesson');
  return world;
}

void test('one click anywhere in the world closes the guide\'s one-line lesson and completes the objective', (): void => {
  const world: World = talkingToGuide();
  const setup: Rig = rig(world);
  setup.input.holdAt(200, 300);
  run(setup, 0.15, (): boolean => false);
  setup.input.releaseHold();
  run(setup, 0.1, (): boolean => false);
  assert.equal(world.dialogue, null);
  assert.equal(world.quests['wardens_lesson'], 1);
});

void test('one phone tap closes the guide\'s one-line lesson and completes the objective', (): void => {
  const world: World = talkingToGuide();
  const setup: Rig = rig(world);
  setup.input.tap(200, 300);
  run(setup, 0.1, (): boolean => false);
  assert.equal(world.dialogue, null);
  assert.equal(world.quests['wardens_lesson'], 1);
});

function hideoutWorld(): World {
  return worldIn(content, 'hideout', 3);
}

void test('a tap on another player opens their menu and never walks or uses a skill', (): void => {
  const world: World = hideoutWorld();
  const players: PlayerHooks = { at: 'p1', takes: (id: string | null): boolean => id !== null, pressed: [], hovered: [] };
  const setup: Rig = rig(world, (): boolean => false, players);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + 4, z: world.player.pos.z });
  setup.input.tap(point.x, point.z);
  const commands: readonly Command[] = setup.input.collect(DT);
  assert.deepEqual(players.pressed, ['p1']);
  assert.ok(players.hovered.includes('p1'));
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'move' || command.type === 'skill' || command.type === 'hold'), []);
});

void test('a held press that began on another player never turns into a walk', (): void => {
  const world: World = hideoutWorld();
  const players: PlayerHooks = { at: 'p1', takes: (id: string | null): boolean => id !== null, pressed: [], hovered: [] };
  const setup: Rig = rig(world, (): boolean => false, players);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + 4, z: world.player.pos.z });
  setup.input.holdAt(point.x, point.z);
  const moves: Command[] = [];
  for (let frame: number = 0; frame < 30; frame += 1) moves.push(...setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move' || command.type === 'skill'));
  setup.input.releaseHold();
  moves.push(...setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move' || command.type === 'skill'));
  assert.deepEqual(moves, []);
  assert.deepEqual(players.pressed, ['p1']);
});

void test('a press that closes an open player menu is taken by it, and the next press walks', (): void => {
  const world: World = hideoutWorld();
  let open: boolean = true;
  const players: PlayerHooks = {
    at: null,
    takes: (): boolean => {
      const took: boolean = open;
      open = false;
      return took;
    },
    pressed: [],
    hovered: [],
  };
  const setup: Rig = rig(world, (): boolean => false, players);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + 4, z: world.player.pos.z });
  setup.input.tap(point.x, point.z);
  assert.deepEqual(setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move'), []);
  setup.input.tap(point.x, point.z);
  assert.equal(setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move').length, 1);
  assert.deepEqual(players.pressed, [null, null]);
});

function freshMoves(commands: readonly Command[]): Command[] {
  return commands.filter((command: Command): boolean => command.type === 'move' && !command.held);
}

function besideDownExit(): { readonly world: World; readonly exit: ZoneExit } {
  const world: World = worldIn(content, 'under_hall', 21);
  const exit: ZoneExit = must(world.zone.exits.find((entry: ZoneExit): boolean => entry.to === 'under_hall_2'), 'under_hall down exit');
  world.player.pos.x = exit.arrival.x;
  world.player.pos.z = exit.arrival.z;
  world.monsters = [];
  return { world, exit };
}

void test('a chorded press (left down, right down, left up, right up) leaves no button held, so the next left click walks', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 22);
  const setup: Rig = rig(world);
  const point: Vec2 = floorAhead(world);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  setup.input.collect(DT);
  setup.fire('pointermove', at(point, RIGHT.button, LEFT.bit + RIGHT.bit));
  setup.input.collect(DT);
  setup.fire('pointermove', at(point, LEFT.button, RIGHT.bit));
  setup.input.collect(DT);
  setup.fire('pointerup', at(point, RIGHT.button, 0));
  setup.input.collect(DT);
  assert.deepEqual(setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move'), []);
  assert.equal(freshMoves(clickOn(setup, point)).length, 1);
});

void test('a chorded press that began on the exit down out of Hourfall Caves never swallows the clicks after it', (): void => {
  const { world, exit } = besideDownExit();
  const setup: Rig = rig(world);
  const onExit: Vec2 = screenOf(world, exit);
  setup.fire('pointermove', at(onExit, -1, 0));
  setup.fire('pointerdown', at(onExit, LEFT.button, LEFT.bit));
  setup.fire('pointermove', at(onExit, RIGHT.button, LEFT.bit + RIGHT.bit));
  setup.fire('pointermove', at(onExit, LEFT.button, RIGHT.bit));
  setup.fire('pointerup', at(onExit, RIGHT.button, 0));
  run(setup, 30, (): boolean => world.zone.id !== 'under_hall');
  assert.equal(world.zone.id, 'under_hall_2');
  run(setup, 0.5, (): boolean => false);
  assert.equal(freshMoves(clickOn(setup, floorAhead(world))).length, 1);
});

void test('a release that never reaches the canvas is healed by the next pointer event, and the next press is a fresh click', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 23);
  const setup: Rig = rig(world);
  const point: Vec2 = floorAhead(world);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  setup.input.collect(DT);
  setup.fire('pointermove', at(point, -1, 0));
  setup.input.collect(DT);
  assert.deepEqual(setup.input.collect(DT).filter((command: Command): boolean => command.type === 'move'), []);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  assert.equal(freshMoves(setup.input.collect(DT)).length, 1);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  assert.equal(freshMoves(setup.input.collect(DT)).length, 1);
});

void test('a lost pointer capture, a cancelled pointer, a blur or a hidden tab each end the press', (): void => {
  for (const ending of ['lostpointercapture', 'pointercancel', 'blur', 'visibilitychange']) {
    const world: World = worldIn(content, 'under_hall_2', 24);
    const setup: Rig = rig(world);
    const point: Vec2 = floorAhead(world);
    setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
    setup.input.collect(DT);
    setup.fire(ending, at(point, -1, LEFT.bit));
    setup.input.collect(DT);
    const after: Command[] = [];
    for (let frame: number = 0; frame < 20; frame += 1) after.push(...setup.input.collect(DT));
    assert.deepEqual(after.filter((command: Command): boolean => command.type === 'move'), [], ending);
  }
});

void test('a press on the exit down out of Hourfall Caves held through the zone change ends there, wherever it is released', (): void => {
  for (const release of ['under the veil', 'after arrival', 'over the HUD', 'never']) {
    const { world, exit } = besideDownExit();
    let overHud: boolean = false;
    const setup: Rig = rig(world, (): boolean => overHud);
    const onExit: Vec2 = screenOf(world, exit);
    setup.fire('pointermove', at(onExit, -1, 0));
    setup.fire('pointerdown', at(onExit, LEFT.button, LEFT.bit));
    stepWorld(world, setup.input.collect(DT), DT);
    if (release === 'over the HUD') {
      overHud = true;
      setup.fire('pointermove', at({ x: VIEW.size / 2, z: VIEW.size - 4 }, -1, LEFT.bit));
    }
    run(setup, 30, (): boolean => world.zone.id !== 'under_hall');
    assert.equal(world.zone.id, 'under_hall_2', release);
    if (release === 'under the veil' || release === 'over the HUD') setup.fire('pointerup', at(onExit, LEFT.button, 0));
    const held: Command[] = [];
    for (let frame: number = 0; frame < 30; frame += 1) held.push(...setup.input.collect(DT));
    assert.deepEqual(held.filter((command: Command): boolean => command.type === 'move' || command.type === 'travel'), [], release);
    if (release === 'after arrival') setup.fire('pointerup', at(onExit, LEFT.button, 0));
    overHud = false;
    assert.equal(freshMoves(clickOn(setup, floorAhead(world))).length, 1, release);
  }
});

void test('a press on an exit that is released and pressed again within one frame on the ground walks', (): void => {
  const { world, exit } = besideDownExit();
  const setup: Rig = rig(world);
  const onExit: Vec2 = screenOf(world, exit);
  setup.fire('pointermove', at(onExit, -1, 0));
  setup.fire('pointerdown', at(onExit, LEFT.button, LEFT.bit));
  assert.ok(setup.input.collect(DT).some((command: Command): boolean => command.type === 'travel'));
  const ground: Vec2 = screenOf(world, { x: world.player.pos.x - 3, z: world.player.pos.z - 2 });
  setup.fire('pointerup', at(onExit, LEFT.button, 0));
  setup.fire('pointermove', at(ground, -1, 0));
  setup.fire('pointerdown', at(ground, LEFT.button, LEFT.bit));
  assert.equal(freshMoves(setup.input.collect(DT)).length, 1);
});

void test('a name label that is still reported hovered never turns a click on open ground into a talk with that person', (): void => {
  const world: World = hideoutWorld();
  const lookout = must(world.npcs.find((npc): boolean => npc.def.id === 'warden_lookout'), 'lookout');
  const setup: Rig = rig(world, (): boolean => false, noPlayers(), (): number | null => lookout.id);
  const ground: Vec2 = { x: world.player.pos.x - 6, z: world.player.pos.z + 1 };
  assert.ok(Math.hypot(ground.x - lookout.pos.x, ground.z - lookout.pos.z) > 3, 'the ground is away from the lookout');
  const commands: Command[] = clickOn(setup, screenOf(world, ground));
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'talk'), []);
  assert.equal(freshMoves(commands).length, 1);
  assert.equal(setup.input.hoveredId, null);
  assert.deepEqual(setup.input.reading, { click: { kind: 'move', reason: null }, held: [], inside: true, overUi: false, toggled: null, movement: 'click' });
});

void test('the input reading reports a held press, a no-ground click and a press taken by another player, as collect resolved them', (): void => {
  const world: World = hideoutWorld();
  const players: PlayerHooks = { at: 'p1', takes: (id: string | null): boolean => id !== null, pressed: [], hovered: [] };
  const setup: Rig = rig(world, (): boolean => false, players);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + 4, z: world.player.pos.z });
  setup.fire('pointermove', at(point, -1, 0));
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  setup.input.collect(DT);
  assert.deepEqual(setup.input.reading, { click: { kind: 'player', reason: 'another player under pointer or their menu open' }, held: ['left'], inside: true, overUi: false, toggled: null, movement: 'click' });
  setup.fire('pointerup', at(point, LEFT.button, 0));
  setup.input.collect(DT);
  assert.deepEqual(setup.input.reading.held, []);
});


const KEYED_SPIN: readonly SlotDefault[] = [
  { name: 'Left', bindings: ['mouse_left'] },
  { name: 'Spin', bindings: ['KeyQ'] },
  { name: 'Bolt', bindings: ['KeyW'] },
];

function spinner(seed: number): World {
  const world: World = worldIn(content, 'under_hall_2', seed);
  world.monsters = [];
  world.player.bar = world.player.bar.map((_id: string | null, slot: number): string | null => (slot === 1 ? 'cleave_millwheel' : slot === 2 ? 'storm_bolt' : null));
  refreshPlayer(world);
  assert.equal(world.player.skills[1]?.id, 'cleave_millwheel');
  assert.equal(world.player.skills[0] ?? null, null);
  return world;
}

function spinning(world: World): boolean {
  return world.player.action?.skill.id === 'cleave_millwheel' && world.player.action.phase !== 'recovery';
}

function play(setup: Rig, seconds: number, sent: Command[] = []): Command[] {
  for (let clock: number = 0; clock < seconds; clock += DT) {
    setup.world.player.mana = setup.world.player.stats.maxMana;
    const commands: Command[] = setup.input.collect(DT);
    sent.push(...commands);
    stepWorld(setup.world, commands, DT);
  }
  return sent;
}

function pointAt(setup: Rig, ground: Vec2): Vec2 {
  const point: Vec2 = screenOf(setup.world, ground);
  setup.fire('pointermove', at(point, -1, 0));
  return point;
}

void test('the Millwheel held on a key spins while the key is held, glides toward the cursor and left clicks, and a left click walks once it ends', (): void => {
  const world: World = spinner(31);
  const setup: Rig = rig(world, (): boolean => false, noPlayers(), (): number | null => null, KEYED_SPIN);
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  pointAt(setup, { x: start.x + 6, z: start.z });
  setup.fire('keydown', { code: 'KeyQ' });
  const steered: Command[] = play(setup, 1.2);
  assert.ok(spinning(world), `spin started: ${JSON.stringify(world.player.action?.phase ?? null)}`);
  assert.ok(steered.some((command: Command): boolean => command.type === 'steer'), 'the held key steers');
  assert.ok(world.player.pos.x > start.x + 1, `glided toward the cursor: ${(world.player.pos.x - start.x).toFixed(2)} m`);
  const before: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const west: Vec2 = { x: before.x - 6, z: before.z };
  const point: Vec2 = pointAt(setup, west);
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  const clicked: Command[] = play(setup, 0.1);
  setup.fire('pointerup', at(point, LEFT.button, 0));
  play(setup, 0.8, clicked);
  assert.ok(clicked.some((command: Command): boolean => command.type === 'move' && !command.held), 'the left click sends a move');
  assert.equal(setup.input.reading.click?.kind, 'move');
  assert.ok(spinning(world), 'the left click does not end the spin');
  assert.ok(world.player.pos.x < before.x - 1, `glided toward the click: ${(world.player.pos.x - before.x).toFixed(2)} m`);
  setup.fire('keyup', { code: 'KeyQ' });
  play(setup, 1.5);
  assert.ok(!spinning(world), 'releasing the key ends the spin');
  const after: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const walk: Command[] = clickOn(setup, pointAt(setup, { x: after.x, z: after.z + 5 }));
  assert.equal(freshMoves(walk).length, 1);
  stepWorld(world, walk, DT);
  play(setup, 0.6);
  assert.ok(world.player.pos.z > after.z + 1, `a click after the spin walks: ${JSON.stringify({ intent: world.player.intent, action: world.player.action?.phase ?? null, buffered: world.player.buffered, from: after, now: world.player.pos })}`);
});

void test('with held skills on press to toggle, one press keeps the Millwheel turning and steering until the same key, another skill or the sim ends it', (): void => {
  for (const ending of ['same key', 'another skill', 'no mana']) {
    const world: World = spinner(32);
    const setup: Rig = rig(world, (): boolean => false, noPlayers(), (): number | null => null, KEYED_SPIN);
    setup.settings.setHeldSkills('toggle');
    const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
    pointAt(setup, { x: start.x + 6, z: start.z });
    setup.fire('keydown', { code: 'KeyQ' });
    play(setup, 0.05);
    setup.fire('keyup', { code: 'KeyQ' });
    const sent: Command[] = play(setup, 1.5);
    assert.ok(spinning(world), `${ending}: the spin keeps turning after the key is let go`);
    assert.ok(sent.some((command: Command): boolean => command.type === 'steer'), `${ending}: the toggled spin steers`);
    assert.ok(world.player.pos.x > start.x + 1, `${ending}: glided toward the cursor`);
    assert.equal(setup.input.reading.toggled, 'Millwheel');
    if (ending === 'same key') {
      setup.fire('keydown', { code: 'KeyQ' });
      const off: Command[] = play(setup, 0.05);
      setup.fire('keyup', { code: 'KeyQ' });
      assert.deepEqual(off.filter((command: Command): boolean => command.type === 'skill'), [], 'the second press only ends the spin');
    } else if (ending === 'another skill') {
      setup.fire('keydown', { code: 'KeyW' });
      play(setup, 0.05);
      setup.fire('keyup', { code: 'KeyW' });
    } else {
      for (let clock: number = 0; clock < 2 && spinning(world); clock += DT) {
        world.player.mana = 0;
        stepWorld(world, setup.input.collect(DT), DT);
      }
    }
    play(setup, 1.5);
    assert.ok(!spinning(world), `${ending}: the spin ended`);
    assert.equal(setup.input.reading.toggled, null, ending);
    assert.deepEqual(world.player.held, [], ending);
  }
});

void test('with held skills on hold, letting go of the key ends the spin as before', (): void => {
  const world: World = spinner(33);
  const setup: Rig = rig(world, (): boolean => false, noPlayers(), (): number | null => null, KEYED_SPIN);
  setup.fire('keydown', { code: 'KeyQ' });
  play(setup, 0.6);
  assert.ok(spinning(world));
  setup.fire('keyup', { code: 'KeyQ' });
  play(setup, 1.5);
  assert.ok(!spinning(world));
  assert.equal(setup.input.reading.toggled, null);
});

const HIGH = { zone: 'under_hall_2', seed: 41, grid: 24, onFloor: 0.3, below: 1, march: 0.05, edgeStep: 2, dropFrom: 3, dropTo: 12 } as const;

interface HighShot {
  readonly screen: Vec2;
  readonly floorHit: Vec2;
  readonly sunk: Vec2;
  readonly lower: Vec2 | null;
}

function highShots(world: World, lens: InputCamera): HighShot[] {
  const heroFloor: number = heightAt(world.zone, world.player.pos.x, world.player.pos.z);
  const shots: HighShot[] = [];
  for (let column: number = 1; column < HIGH.grid; column += 1) {
    for (let row: number = 1; row < HIGH.grid; row += 1) {
      const screen: Vec2 = { x: (column / HIGH.grid) * VIEW.size, z: (row / HIGH.grid) * VIEW.size };
      const pointer: Vector2 = new Vector2((screen.x / VIEW.size) * 2 - 1, 1 - (screen.z / VIEW.size) * 2);
      const hit: Vector3 | null = lens.groundPoint(pointer, clickHeight(world.zone), null, clickFloor(world.zone));
      if (hit === null || Math.abs(hit.y - heroFloor) > HIGH.onFloor) continue;
      const floorHit: Vec2 = { x: hit.x, z: hit.z };
      const top: number = hit.y;
      const plane: Vector3 | null = lens.groundPoint(pointer);
      if (plane === null) continue;
      const sunk: Vec2 = { x: plane.x, z: plane.z };
      const length: number = Math.hypot(sunk.x - floorHit.x, top, sunk.z - floorHit.z);
      let lower: Vec2 | null = null;
      for (let along: number = HIGH.below; along < length && lower === null; along += HIGH.march) {
        const share: number = along / length;
        const x: number = floorHit.x + (sunk.x - floorHit.x) * share;
        const z: number = floorHit.z + (sunk.z - floorHit.z) * share;
        const y: number = top * (1 - share);
        const ground: number = heightAt(world.zone, x, z);
        if (floorAt(world.zone, x, z) && ground < heroFloor - HIGH.below && y <= ground) lower = { x, z };
      }
      shots.push({ screen, floorHit, sunk, lower });
    }
  }
  return shots;
}

function edgeSpot(world: World): Vec2 {
  const zone = world.zone;
  const away: number = Math.SQRT1_2;
  for (let x: number = 1; x < (zone.tiles[0]?.length ?? 0) * zone.cellSize; x += HIGH.edgeStep) {
    for (let z: number = 1; z < zone.tiles.length * zone.cellSize; z += HIGH.edgeStep) {
      if (!floorAt(zone, x, z)) continue;
      const top: number = heightAt(zone, x, z);
      for (let drop: number = HIGH.dropFrom; drop <= HIGH.dropTo; drop += 1) {
        const qx: number = x - away * drop;
        const qz: number = z - away * drop;
        if (floorAt(zone, qx, qz) && heightAt(zone, qx, qz) < top - HIGH.below) return { x, z };
      }
    }
  }
  throw new Error('no edge on the high floor');
}

function highRig(edge: boolean = false): { readonly setup: Rig; readonly monster: MonsterState; readonly shots: readonly HighShot[] } {
  const world: World = worldIn(content, HIGH.zone, HIGH.seed);
  if (edge) Object.assign(world.player.pos, edgeSpot(world));
  const monster: MonsterState = must(world.monsters.find((entry: MonsterState): boolean => entry.alive), 'a monster');
  world.monsters = [monster];
  const lens: InputCamera = heroCamera(world);
  return { setup: rig(world, (): boolean => false, noPlayers(), (): number | null => null, SLOTS, lens), monster, shots: highShots(world, lens) };
}

function hoveredWith(setup: Rig, monster: MonsterState, spot: Vec2, screen: Vec2): number | null {
  monster.pos.x = spot.x;
  monster.pos.z = spot.z;
  setup.fire('pointermove', at(screen, -1, 0));
  setup.input.collect(DT);
  return setup.input.hoveredId;
}

void test('on the high entrance floor of the second cave level, a monster far below the pointer is never picked, and one on the floor under it is', (): void => {
  const { setup, monster, shots } = highRig();
  assert.ok(heightAt(setup.world.zone, setup.world.player.pos.x, setup.world.player.pos.z) > HIGH.below * 10, 'the hero starts on a raised floor');
  assert.ok(shots.length > 0, 'the pointer finds the hero floor');
  for (const shot of shots) {
    assert.equal(hoveredWith(setup, monster, shot.sunk, shot.screen), null, `a monster at ${shot.sunk.x.toFixed(1)},${shot.sunk.z.toFixed(1)} under the floor is picked from ${shot.screen.x},${shot.screen.z}`);
    assert.equal(hoveredWith(setup, monster, shot.floorHit, shot.screen), monster.id, `a monster on the floor under the pointer at ${shot.screen.x},${shot.screen.z}`);
  }
  const shot: HighShot = must(shots[0], 'a shot');
  hoveredWith(setup, monster, shot.sunk, shot.screen);
  clickOn(setup, shot.screen);
  assert.equal(setup.input.reading.click?.kind, 'move');
});

void test('a monster standing on a lower floor that the pointer ray passes after the hero floor is never picked', (): void => {
  const { setup, monster, shots } = highRig(true);
  const behind: HighShot[] = shots.filter((shot: HighShot): boolean => shot.lower !== null);
  assert.ok(behind.length > 0, 'some pointer ray carries on to a lower floor');
  for (const shot of behind) {
    const lower: Vec2 = must(shot.lower, 'lower');
    assert.equal(hoveredWith(setup, monster, lower, shot.screen), null, `a monster on the lower floor at ${lower.x.toFixed(1)},${lower.z.toFixed(1)} is picked from ${shot.screen.x},${shot.screen.z}`);
  }
});

void test('with nothing on the left button, a click on a monster walks toward it and the readout says why', (): void => {
  const { setup, monster, shots } = highRig();
  const { world } = setup;
  world.player.bar = world.player.bar.map((): string | null => null);
  refreshPlayer(world);
  const shot: HighShot = must(shots[Math.floor(shots.length / 2)], 'a shot');
  assert.equal(hoveredWith(setup, monster, shot.floorHit, shot.screen), monster.id);
  const commands: Command[] = clickOn(setup, shot.screen);
  assert.deepEqual(commands.filter((command: Command): boolean => command.type === 'skill'), []);
  const move: Command = must(commands.find((command: Command): boolean => command.type === 'move'), 'a move');
  assert.ok(move.type === 'move' && Math.hypot(move.dest.x - monster.pos.x, move.dest.z - monster.pos.z) < 1, JSON.stringify(move));
  assert.deepEqual(setup.input.reading.click, { kind: 'move', reason: 'monster under pointer, no skill on the left button' });
});
