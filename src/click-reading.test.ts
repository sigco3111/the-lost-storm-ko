import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClickFacts, ClickKind } from './click-reading.ts';
import { describeInput, resolveClick } from './click-reading.ts';

const GROUND: ClickFacts = { fresh: true, player: false, dialogue: false, ground: true, target: false, shift: false, person: 'none', item: false, chest: false, station: false, portal: false, heldExit: false, exit: false, travelling: false, keys: false, armed: true };

void test('a fresh press on open ground is a move with no reason', (): void => {
  assert.deepEqual(resolveClick(GROUND), { kind: 'move', reason: null });
});

void test('each fact decides the press in the order collect acts on it', (): void => {
  const cases: readonly { readonly facts: Partial<ClickFacts>; readonly kind: ClickKind; readonly reason: string }[] = [
    { facts: { player: true, dialogue: true }, kind: 'player', reason: 'another player under pointer or their menu open' },
    { facts: { dialogue: true, ground: false }, kind: 'advance', reason: 'dialogue open' },
    { facts: { ground: false, target: true }, kind: 'none', reason: 'no ground under pointer' },
    { facts: { target: true, shift: true, person: 'body' }, kind: 'skill', reason: 'monster under pointer' },
    { facts: { shift: true, person: 'body' }, kind: 'skill', reason: 'shift held' },
    { facts: { target: true, armed: false, person: 'body' }, kind: 'move', reason: 'monster under pointer, no skill on the left button' },
    { facts: { target: true, armed: false, keys: true }, kind: 'skill', reason: 'monster under pointer' },
    { facts: { shift: true, armed: false, person: 'body' }, kind: 'talk', reason: 'person under pointer' },
    { facts: { person: 'body', item: true }, kind: 'talk', reason: 'person under pointer' },
    { facts: { person: 'label' }, kind: 'talk', reason: 'label hover' },
    { facts: { item: true, chest: true }, kind: 'pickup', reason: 'item under pointer' },
    { facts: { fresh: false, item: true }, kind: 'pickup', reason: 'item press held' },
    { facts: { chest: true, station: true }, kind: 'open', reason: 'chest under pointer' },
    { facts: { station: true, portal: true }, kind: 'use', reason: 'station under pointer' },
    { facts: { portal: true, exit: true }, kind: 'portal', reason: 'portal under pointer' },
    { facts: { fresh: false, heldExit: true }, kind: 'swallowed', reason: 'exit press held' },
    { facts: { heldExit: true, exit: true }, kind: 'exit', reason: 'exit under pointer' },
    { facts: { exit: true, travelling: true }, kind: 'exit', reason: 'exit under pointer' },
    { facts: { fresh: false, exit: true, travelling: true }, kind: 'none', reason: 'already travelling' },
    { facts: { fresh: false, exit: true }, kind: 'move', reason: 'held over exit' },
  ];
  for (const { facts, kind, reason } of cases) assert.deepEqual(resolveClick({ ...GROUND, ...facts }), { kind, reason }, JSON.stringify(facts));
});

void test('with the keys moving the hero, a press on the ground attacks, and a press on a thing still acts on it', (): void => {
  const cases: readonly { readonly facts: Partial<ClickFacts>; readonly kind: ClickKind }[] = [
    { facts: {}, kind: 'skill' },
    { facts: { fresh: false }, kind: 'skill' },
    { facts: { fresh: false, exit: true }, kind: 'skill' },
    { facts: { item: true }, kind: 'pickup' },
    { facts: { person: 'body' }, kind: 'talk' },
    { facts: { chest: true }, kind: 'open' },
    { facts: { station: true }, kind: 'use' },
    { facts: { portal: true }, kind: 'portal' },
    { facts: { exit: true }, kind: 'exit' },
    { facts: { fresh: false, heldExit: true }, kind: 'swallowed' },
    { facts: { dialogue: true }, kind: 'advance' },
  ];
  for (const { facts, kind } of cases) assert.equal(resolveClick({ ...GROUND, keys: true, ...facts }).kind, kind, JSON.stringify(facts));
});

void test('the readout line names the last press, the held buttons and where the pointer counts', (): void => {
  assert.equal(describeInput({ click: null, held: [], inside: false, overUi: false, toggled: null, movement: 'click' }), 'no click yet · held none · off canvas · moves by click');
  assert.equal(describeInput({ click: { kind: 'talk', reason: 'label hover' }, held: ['left', 'right'], inside: true, overUi: true, toggled: null, movement: 'keys' }), 'click talk: label hover · held left+right · in canvas · over UI · moves by keys');
  assert.equal(describeInput({ click: { kind: 'move', reason: null }, held: ['left'], inside: true, overUi: false, toggled: null, movement: 'click' }), 'click move · held left · in canvas · moves by click');
  assert.equal(describeInput({ click: { kind: 'move', reason: 'held over exit' }, held: [], inside: true, overUi: false, toggled: 'Millwheel', movement: 'keys' }), 'click move: held over exit · held none · in canvas · Millwheel toggled on · moves by keys');
});
