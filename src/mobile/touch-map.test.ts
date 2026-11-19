import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { FLASK_RESOURCES } from '../../sim/content/flasks.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { HudView } from '../../sim/world/hud.ts';
import { hudView } from '../../sim/world/hud.ts';
import type { FlaskState, ItemInstance, PlayerState, World } from '../../sim/world/types.ts';
import { worldIn } from '../../test/support.ts';
import type { ButtonInputs, Candidate } from './touch-map.ts';
import { aimedSkill, autoAimTarget, buttonInputsChanged, buttonKey, createButtonInputs, clampKnob, glideAim, cooldownTurn, isTap, joinsPinch, movedIndex, pinchWheelDelta, planButtons, prefersTouch, readStick, rotateHintShows, sideForPoint, startsStick, stickDirection, stickMove, TOUCH, touchButtons } from './touch-map.ts';

const YAW: number = Math.PI / 4;
const near = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

void test('a query string forces touch on or off, otherwise a coarse pointer decides', (): void => {
  assert.equal(prefersTouch('?touch=1', false, 900, 1440), true);
  assert.equal(prefersTouch('?touch=0', true, 390, 844), false);
  assert.equal(prefersTouch('', true, 900, 1440), true);
  assert.equal(prefersTouch('', false, 900, 1440), false);
});

void test('the stick reads a direction and a magnitude capped at its radius', (): void => {
  const reading = readStick(TOUCH.stickRadius * 2, 0);
  near(reading.x, 1);
  near(reading.magnitude, 1);
  assert.deepEqual(readStick(0, 0), { x: 0, y: 0, magnitude: 0 });
  const knob = clampKnob(0, TOUCH.stickRadius * 3);
  near(knob.z, TOUCH.stickRadius);
});

void test('pushing the stick up walks away from the camera and right walks along the screen right', (): void => {
  const up = stickDirection(readStick(0, -TOUCH.stickRadius), YAW);
  assert.ok(up !== null);
  near(up.x, -Math.sin(YAW));
  near(up.z, -Math.cos(YAW));
  const right = stickDirection(readStick(TOUCH.stickRadius, 0), YAW);
  assert.ok(right !== null);
  near(right.x, Math.cos(YAW));
  near(right.z, -Math.sin(YAW));
});

void test('a small push inside the dead zone moves nothing', (): void => {
  assert.equal(stickDirection(readStick(TOUCH.stickRadius * TOUCH.deadzone * 0.5, 0), YAW), null);
  assert.equal(stickMove({ x: 0, z: 0 }, null, false), null);
});

void test('a stick move heads a fixed reach ahead and is held after the first one', (): void => {
  const first = stickMove({ x: 1, z: 2 }, { x: 1, z: 0 }, false);
  assert.deepEqual(first, { type: 'walk', held: false, dest: { x: 1 + TOUCH.stickReach, z: 2 } });
  assert.equal(stickMove({ x: 1, z: 2 }, { x: 1, z: 0 }, true)?.held, true);
});

void test('auto aim takes the nearest living enemy in front and ignores the dead and the far', (): void => {
  const monsters: Candidate[] = [
    { id: 1, pos: { x: 0, z: 6 }, alive: true },
    { id: 2, pos: { x: 0, z: 3 }, alive: false },
    { id: 3, pos: { x: 0, z: 4 }, alive: true },
    { id: 4, pos: { x: 0, z: TOUCH.aimRange + 1 }, alive: true },
  ];
  assert.equal(autoAimTarget(monsters, { x: 0, z: 0 }, { x: 0, z: 1 })?.id, 3);
});

void test('auto aim ignores an enemy behind unless it is within melee reach', (): void => {
  const behind: Candidate = { id: 7, pos: { x: 0, z: -5 }, alive: true };
  assert.equal(autoAimTarget([behind], { x: 0, z: 0 }, { x: 0, z: 1 }), null);
  const close: Candidate = { id: 8, pos: { x: 0, z: -TOUCH.meleeRange * 0.5 }, alive: true };
  assert.equal(autoAimTarget([behind, close], { x: 0, z: 0 }, { x: 0, z: 1 })?.id, 8);
});

void test('an aimed skill targets the enemy, or swings ahead at full range when there is none', (): void => {
  assert.deepEqual(aimedSkill(0, { x: 0, z: 0 }, { x: 0, z: 1 }, { id: 5, pos: { x: 1, z: 2 }, alive: true }), { type: 'skill', slot: 0, aim: { x: 1, z: 2 }, targetId: 5 });
  assert.deepEqual(aimedSkill(2, { x: 1, z: 1 }, { x: 2, z: 0 }, null), { type: 'skill', slot: 2, aim: { x: 1 + TOUCH.aimRange, z: 1 }, targetId: null });
});

void test('buttons put the left click skill first as the attack, then every other slot, then the flasks', (): void => {
  const buttons = touchButtons([{ bindings: ['KeyQ'], filled: true }, { bindings: ['mouse_left'], filled: true }, { bindings: ['KeyW', 'mouse_right'], filled: true }], 'mouse_left', [{ name: 'Life Flask' }]);
  assert.deepEqual(buttons, [
    { kind: 'attack', slot: 1, filled: true },
    { kind: 'skill', slot: 0, filled: true },
    { kind: 'skill', slot: 2, filled: true },
    { kind: 'flask', slot: 0, label: 'Life Flask' },
  ]);
});

void test('spreading two fingers zooms in by their ratio', (): void => {
  const step: number = 0.0016;
  const delta: number = pinchWheelDelta(100, 200, step);
  near(1 + delta * step, 0.5);
  assert.equal(pinchWheelDelta(0, 100, step), 0);
});

void test('the left share of the screen moves, the rest touches the world', (): void => {
  assert.equal(sideForPoint(10, 800), 'move');
  assert.equal(sideForPoint(700, 800), 'world');
});

void test('the rotate hint shows only in portrait while playing, until dismissed or timed out', (): void => {
  assert.equal(rotateHintShows(true, 0, false, true), true);
  assert.equal(rotateHintShows(true, 0, false, false), false);
  assert.equal(rotateHintShows(false, 0, false, true), false);
  assert.equal(rotateHintShows(true, 0, true, true), false);
  assert.equal(rotateHintShows(true, TOUCH.rotateHintMs + 1, false, true), false);
});

void test('a short still touch is a tap, a drag or a long press is not', (): void => {
  assert.equal(isTap(3, 4, 100), true);
  assert.equal(isTap(TOUCH.tapSlopPx + 1, 0, 100), false);
  assert.equal(isTap(0, 0, TOUCH.tapMs + 1), false);
});

void test('the cooldown sweep is a full turn when ready and grows as the cooldown runs out', (): void => {
  assert.equal(cooldownTurn(0, 4), TOUCH.fullTurn);
  assert.equal(cooldownTurn(4, 4), 0);
  assert.equal(cooldownTurn(2, 4), TOUCH.fullTurn / 2);
  assert.equal(cooldownTurn(1, 0), TOUCH.fullTurn);
});

void test('the stick starts on the move side only when no other finger is on the world', (): void => {
  assert.equal(startsStick(10, 800, false, 0), true);
  assert.equal(startsStick(10, 800, true, 0), false);
  assert.equal(startsStick(10, 800, false, 1), false);
  assert.equal(startsStick(700, 800, false, 0), false);
});

void test('a still stick finger joins a second finger that lands soon after as a pinch', (): void => {
  assert.equal(joinsPinch(false, TOUCH.pinchJoinMs - 1), true);
  assert.equal(joinsPinch(true, 10), false);
  assert.equal(joinsPinch(false, TOUCH.pinchJoinMs + 1), false);
});

void test('every bar slot keeps its button, and a slot with no usable skill is marked empty, the attack included', (): void => {
  const bar = [{ bindings: ['mouse_left'], filled: false }, { bindings: ['KeyQ'], filled: false }, { bindings: ['KeyW'], filled: true }];
  assert.deepEqual(touchButtons(bar, 'mouse_left', []), [
    { kind: 'attack', slot: 0, filled: false },
    { kind: 'skill', slot: 1, filled: false },
    { kind: 'skill', slot: 2, filled: true },
  ]);
  assert.deepEqual(touchButtons([{ bindings: ['mouse_left'], filled: true }], 'mouse_left', []), [{ kind: 'attack', slot: 0, filled: true }]);
});

void test('a flask the HUD does not show gets no button, and the others keep their own slot', (): void => {
  assert.deepEqual(touchButtons([], 'mouse_left', [null, { name: 'Mana Flask' }]), [{ kind: 'flask', slot: 1, label: 'Mana Flask' }]);
});

void test('a phone-sized screen takes the phone layout even when no coarse pointer is reported', (): void => {
  for (const [short, long] of [[320, 568], [375, 667], [390, 844], [430, TOUCH.phoneLongSide], [TOUCH.phoneShortSide, 800]]) assert.equal(prefersTouch('', false, short ?? 0, long ?? 0), true);
  assert.equal(prefersTouch('', false, TOUCH.phoneShortSide + 1, 800), false);
});

void test('a short but wide desktop window keeps the desktop HUD', (): void => {
  assert.equal(prefersTouch('', false, 480, 1440), false);
  assert.equal(prefersTouch('', false, 390, TOUCH.phoneLongSide + 1), false);
});

void test('a new bar keeps every button that is still wanted, adds only the new ones and drops only the gone ones', (): void => {
  const before = touchButtons([{ bindings: ['Mouse0'], filled: false }, { bindings: ['KeyQ'], filled: false }], 'Mouse0', [null]);
  const after = touchButtons([{ bindings: ['Mouse0'], filled: true }, { bindings: ['KeyQ'], filled: false }], 'Mouse0', [{ name: 'Life flask' }]);
  const plan = planButtons(before.map(buttonKey), after);
  assert.deepEqual(plan.kept, ['attack0', 'skill1']);
  assert.deepEqual(plan.added, ['flask0']);
  assert.deepEqual(plan.dropped, []);
  const back = planButtons(after.map(buttonKey), before);
  assert.deepEqual(back.dropped, ['flask0']);
  assert.deepEqual(back.added, []);
});

void test('a held button keeps its finger when the bar moves it, and loses it only when it leaves', (): void => {
  const before = ['attack0', 'skill1', 'flask0', 'flask1'];
  const after = ['attack0', 'skill1', 'flask1'];
  assert.equal(movedIndex(before, after, 3), 2);
  assert.equal(movedIndex(before, after, 2), -1);
  assert.equal(movedIndex(before, after, 0), 0);
  assert.equal(movedIndex(before, after, 9), -1);
});

void test('while a spin carries the hero, the stick points where he goes and a resting stick holds him where he is', (): void => {
  assert.deepEqual(glideAim({ x: 1, z: 2 }, { x: 0, z: 1 }), { x: 1, z: 2 + TOUCH.stickReach });
  assert.deepEqual(glideAim({ x: 1, z: 2 }, null), { x: 1, z: 2 });
});

const SHOWN = (world: World): string => {
  const view: HudView = hudView(world);
  const flasks: string = world.player.flasks.map((flask: FlaskState): string => (view.parts.includes(flask.def.resource) ? flask.def.id : '-')).join(',');
  return `${view.slots.join(',')}#${flasks}#${world.player.bar.join(',')}`;
};

void test('the touch buttons skip their rebuild only while the filled slots, mana, the bar and the flasks they show are unchanged', (): void => {
  assert.deepEqual([...FLASK_RESOURCES], ['life', 'mana']);
  const world: World = worldIn(loadContent(), 'hideout', 7);
  const player: PlayerState = world.player;
  const kept: ButtonInputs = createButtonInputs();
  let last: string = SHOWN(world);
  const check = (expected: boolean): void => {
    const changed: boolean = buttonInputsChanged(kept, player, world.content.player.manaShows);
    assert.equal(changed, expected);
    if (!changed) assert.equal(SHOWN(world), last);
    if (SHOWN(world) !== last) assert.equal(changed, true);
    last = SHOWN(world);
  };
  check(true);
  check(false);
  player.gold += 50;
  player.pos = { x: player.pos.x + 3, z: player.pos.z };
  check(false);
  const first: string | null = player.bar[0] ?? null;
  player.bar[0] = first === null ? 'cleave' : null;
  check(true);
  check(false);
  const skills: (SkillDef | null)[] = [...player.skills];
  const cheap: SkillDef | undefined = [...world.content.skills.values()].find((skill: SkillDef): boolean => skill.manaCost <= 0 && skill.damage.weaponPercent <= 0);
  const dear: SkillDef | undefined = [...world.content.skills.values()].find((skill: SkillDef): boolean => skill.manaCost > 0 && skill.damage.weaponPercent <= 0);
  assert.ok(cheap !== undefined && dear !== undefined);
  player.skills.fill(null);
  check(true);
  player.skills[2] = cheap;
  check(true);
  player.skills[2] = { ...cheap, name: `${cheap.name} again` };
  check(false);
  player.skills[3] = dear;
  check(true);
  player.skills[3] = null;
  check(true);
  player.skills.splice(0, player.skills.length, ...skills);
  check(true);
  const weapon: ItemInstance | null = player.equipped.weapon;
  player.equipped.weapon = null;
  buttonInputsChanged(kept, player, world.content.player.manaShows);
  last = SHOWN(world);
  player.equipped.weapon = weapon;
  check(SHOWN(world) !== last);
  const flask: FlaskState | undefined = player.flasks[0];
  assert.ok(flask !== undefined);
  player.flasks.splice(0, 1);
  check(true);
  player.flasks.unshift(flask);
  check(true);
  check(false);
});
