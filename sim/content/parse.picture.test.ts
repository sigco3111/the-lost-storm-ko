import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { shipped } from '../../test/parse-support.ts';
import { loadContent } from './content.ts';
import { parseContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { AttachmentDef, Content, ItemBaseDef } from './types.ts';

const raw: readonly unknown[] = Array.isArray(shipped.attachments) ? shipped.attachments : [];

void test('an attachment that names no view is pictured from the side', (): void => {
  const content: Content = parseContent({ ...shipped, attachments: [...raw, { id: 'plain_stick', model: 'models/weapons/rusted_blade.glb', socket: 'hand_r', surfaces: {} }] });
  assert.equal(must(content.attachments.get('plain_stick'), 'stick').view, 'side');
});

void test('an attachment may be pictured from above', (): void => {
  const content: Content = parseContent({ ...shipped, attachments: [...raw, { id: 'flat_bow', model: 'models/weapons/plain_crossbow.glb', socket: 'hand_r', view: 'above', surfaces: {} }] });
  assert.equal(must(content.attachments.get('flat_bow'), 'bow').view, 'above');
});

void test('an attachment view must be one the picture studio knows', (): void => {
  assert.throws((): Content => parseContent({ ...shipped, attachments: [...raw, { id: 'odd_bow', model: 'models/weapons/plain_crossbow.glb', socket: 'hand_r', view: 'below', surfaces: {} }] }), ContentError);
});

void test('every crossbow is pictured from above, so its prod spans the picture', (): void => {
  const content: Content = loadContent();
  const crossbows: readonly ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.weaponKind === 'crossbow');
  assert.ok(crossbows.length > 0);
  for (const base of crossbows) {
    const held: AttachmentDef = must(content.attachments.get(must(base.visual, `${base.id} visual`)), `${base.id} attachment`);
    assert.equal(held.view, 'above', `${base.id} is pictured from ${held.view}`);
  }
});
