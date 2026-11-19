import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RAW_CONTENT } from '../../sim/content/content.ts';
import type { RawContent } from '../../sim/content/parse.ts';
import { isFields } from '../../sim/content/read.ts';
import type { StartingKit } from './fingerprint.ts';
import { balanceFingerprint, startingKit } from './fingerprint.ts';

type Patch = (base: Readonly<Record<string, unknown>>) => Record<string, unknown>;

function withBase(id: string, patch: Patch): RawContent {
  const items: unknown = RAW_CONTENT.items;
  assert.ok(isFields(items) && Array.isArray(items['bases']));
  const bases: unknown[] = items['bases'].map((base: unknown): unknown => (isFields(base) && base['id'] === id ? patch(base) : base));
  return { ...RAW_CONTENT, items: { ...items, bases } };
}

function withSkill(id: string, patch: Patch): RawContent {
  const skills: unknown = RAW_CONTENT.skills;
  assert.ok(Array.isArray(skills));
  return { ...RAW_CONTENT, skills: skills.map((skill: unknown): unknown => (isFields(skill) && skill['id'] === id ? patch(skill) : skill)) };
}

function print(raw: RawContent): string {
  return balanceFingerprint(raw, {}, {});
}

const SHIPPED: string = print(RAW_CONTENT);

void test('a new picture, model, name or colour for an item leaves the measured numbers standing', (): void => {
  const restyled: RawContent = withBase('crown_of_the_struck_hour', (base: Readonly<Record<string, unknown>>): Record<string, unknown> => ({ ...base, name: 'Another Crown', icon: 'portal', visual: { kind: 'other' }, wear: ['other_piece'], wornModel: true }));
  assert.equal(print(restyled), SHIPPED);
});

void test('a new name, description, icon or effect colour for a skill leaves the measured numbers standing', (): void => {
  const restyled: RawContent = withSkill('cleave', (skill: Readonly<Record<string, unknown>>): Record<string, unknown> => ({ ...skill, name: 'Chop', description: 'Another line.', icon: 'other', vfx: { color: '#000000' } }));
  assert.equal(print(restyled), SHIPPED);
});

void test('a change to what an item or a skill does moves the fingerprint', (): void => {
  assert.notEqual(print(withBase('crown_of_the_struck_hour', (base: Readonly<Record<string, unknown>>): Record<string, unknown> => ({ ...base, minLevel: 99 }))), SHIPPED);
  assert.notEqual(print(withSkill('cleave', (skill: Readonly<Record<string, unknown>>): Record<string, unknown> => ({ ...skill, cooldown: 99 }))), SHIPPED);
});

function kit(raw: RawContent, id: string): StartingKit | undefined {
  return startingKit(raw).find((entry: StartingKit): boolean => entry.id === id);
}

void test('a starting item that stops being worn moves the fingerprint, because only worn starting items are put on', (): void => {
  assert.equal(kit(RAW_CONTENT, 'traveller_coat')?.worn, true);
  const bare: RawContent = withBase('traveller_coat', (base: Readonly<Record<string, unknown>>): Record<string, unknown> => ({ ...base, wear: [] }));
  assert.equal(kit(bare, 'traveller_coat')?.worn, false);
  assert.notEqual(print(bare), SHIPPED);
});

void test('a starting item that gains or loses its picture moves the fingerprint, because an empty-handed start leaves pictured items behind', (): void => {
  const pictured: boolean = kit(RAW_CONTENT, 'rusted_blade')?.pictured ?? false;
  const toggled: RawContent = withBase('rusted_blade', (base: Readonly<Record<string, unknown>>): Record<string, unknown> => ({ ...base, visual: pictured ? null : { kind: 'other' } }));
  assert.equal(kit(toggled, 'rusted_blade')?.pictured, !pictured);
  assert.notEqual(print(toggled), SHIPPED);
  const repictured: RawContent = withBase('rusted_blade', (base: Readonly<Record<string, unknown>>): Record<string, unknown> => ({ ...base, visual: pictured ? { kind: 'other' } : null }));
  assert.equal(print(repictured), SHIPPED);
});
