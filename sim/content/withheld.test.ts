import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../../test/support.ts';
import { loadContent } from './content.ts';
import type { Content, ZoneDef, ZoneExit } from './types.ts';
import { exitWithheld, withheldZones } from './withheld.ts';

const content: Content = loadContent();

void test('the shipped world withholds nothing, and holding back the flag on the way down withholds the cave, every level below it down through the columned hall and its court, and hides every way in from the open world', (): void => {
  assert.deepEqual(content.world.withheld, []);
  assert.deepEqual([...withheldZones(content)], []);
  const held: Content = { ...content, world: { ...content.world, withheld: ['keeper_defeated'] } };
  const shut: ReadonlySet<string> = withheldZones(held);
  assert.deepEqual([...shut], ['under_hall', 'ledger_hall', 'under_hall_2', 'under_hall_3', 'ledger_hall_2', 'ledger_hall_3', 'lava_depths', 'lava_depths_2', 'lava_depths_3', 'ledger_court']);
  const into: ZoneExit[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => !shut.has(zone.id)).flatMap((zone: ZoneDef): ZoneExit[] => zone.exits.filter((exit: ZoneExit): boolean => shut.has(exit.to)));
  assert.ok(into.length > 0);
  for (const exit of into) {
    assert.ok(exitWithheld(held, exit), exit.id);
    assert.equal(exit.hiddenWhenLocked, true, exit.id);
  }
});

void test('with nothing withheld every zone is open, and the lair keeps its own ways out unwithheld', (): void => {
  const opened: Content = { ...content, world: { ...content.world, withheld: [] } };
  assert.deepEqual([...withheldZones(opened)], []);
  const lair: ZoneDef = zoneOf(content, 'keepers_gate');
  const back: ZoneExit = must(lair.exits.find((exit: ZoneExit): boolean => exit.to === 'hall_of_time'), 'back to the hall');
  assert.equal(exitWithheld(content, back), false);
});
