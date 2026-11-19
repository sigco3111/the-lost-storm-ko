import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ItemBaseDef, ZoneDef } from '../../sim/content/types.ts';
import { threatNear } from '../../sim/threat.ts';
import type { Threat } from '../../sim/threat.ts';
import { threatFor, USE_WORDS } from './item-tooltip.ts';

const content: Content = loadContent();

void test('every item that can be used says in its tooltip what it does', (): void => {
  const usable: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.use !== null);
  assert.ok(usable.length > 0);
  for (const base of usable) {
    if (base.use === null) continue;
    assert.ok(USE_WORDS[base.use.type].length > 0, base.id);
  }
});

function zone(id: string): ZoneDef {
  const found: ZoneDef | undefined = content.zones.get(id);
  if (found === undefined) throw new Error(`no zone ${id}`);
  return found;
}

void test('hovering again with the same depth reuses the threat, and a new level, zone or visited zone asks for it again', (): void => {
  const hideout: ZoneDef = zone('hideout');
  const visited: string[] = ['hall_of_time', 'under_hall'];
  const first: Threat = threatFor(content, visited, hideout, 15);
  assert.equal(threatFor(content, [...visited], hideout, 15), first);
  assert.deepEqual(first, threatNear(content, visited, hideout, 15));
  const levelled: Threat = threatFor(content, visited, hideout, 16);
  assert.notEqual(levelled, first);
  assert.deepEqual(levelled, threatNear(content, visited, hideout, 16));
  const further: string[] = [...visited, 'under_hall_2'];
  const deeper: Threat = threatFor(content, further, hideout, 16);
  assert.notEqual(deeper, levelled);
  assert.deepEqual(deeper, threatNear(content, further, hideout, 16));
  const elsewhere: Threat = threatFor(content, further, zone('under_hall_2'), 16);
  assert.notEqual(elsewhere, deeper);
  assert.deepEqual(elsewhere, threatNear(content, further, zone('under_hall_2'), 16));
});
