import assert from 'node:assert/strict';
import { test } from 'node:test';
import hourfall from '../../data/kits/hourfall.json' with { type: 'json' };
import lava from '../../data/kits/lava.json' with { type: 'json' };
import ledgerHall from '../../data/kits/ledger_hall.json' with { type: 'json' };
import footprintData from '../../data/footprints.json' with { type: 'json' };
import { must } from '../../test/support.ts';
import type { CaveKit } from '../cave/kit.ts';
import { readKit } from '../cave/kit.ts';
import { blockerGap, buildNavGrid, isWalkable, propBlockers } from '../nav/grid.ts';
import type { Blocker, NavGrid } from '../nav/grid.ts';
import { shipped } from '../../test/parse-support.ts';
import { loadContent, RAW_CONTENT } from './content.ts';
import { parseContent } from './parse.ts';
import { modelFootprints, STANDS, standsInTheWay } from './footprints.ts';
import type { ModelFootprint } from './footprints.ts';
import type { Content, PropDef, ZoneDef, ZoneProp } from './types.ts';

const content: Content = loadContent();
const measured: ReadonlyMap<string, ModelFootprint> = modelFootprints(footprintData, 'footprints');
const kits: readonly CaveKit[] = [readKit(hourfall, 'hourfall'), readKit(lava, 'lava'), readKit(ledgerHall, 'ledger_hall')];

function standsUp(def: PropDef, size: number = 1): boolean {
  const model: ModelFootprint | undefined = measured.get(def.footprint);
  return model !== undefined && standsInTheWay(def.scale * size, model);
}

function blocks(def: PropDef): boolean {
  return def.footprints.length > 0 || def.blockRadius > 0;
}

function placedBlockers(zone: ZoneDef, skip: number): Blocker[] {
  return zone.props.flatMap((placed: ZoneProp, at: number): Blocker[] => {
    const def: PropDef | undefined = content.props.get(placed.prop);
    return at === skip || def === undefined || placed.when.length > 0 ? [] : propBlockers(def, placed.x, placed.z, placed.rotationDegrees);
  });
}

function restsOnSolid(zone: ZoneDef, placed: ZoneProp, at: number): boolean {
  return placed.y > 0 && placedBlockers(zone, at).some((blocker: Blocker): boolean => blockerGap(blocker, placed.x, placed.z) < 0);
}

void test('a model stands in the way when it is taller than the hip and wider than a foot', (): void => {
  const square: ModelFootprint = { height: 1, outlines: [[{ x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }]] };
  assert.equal(standsInTheWay(1, square), true);
  assert.equal(standsInTheWay((STANDS.height / square.height) * 0.9, square), false);
  assert.equal(standsInTheWay(1, { height: 1, outlines: [[{ x: 0, z: 0 }, { x: 0.3, z: 0 }, { x: 0, z: 0.3 }]] }), false);
});

void test('a prop the hero walks on never blocks, and cannot also say whether it is solid', (): void => {
  const stair: PropDef = must(content.props.get('wide_stair'), 'wide_stair');
  assert.equal(stair.walkOn, true);
  assert.equal(stair.footprints.length, 0);
  const props: readonly unknown[] = Array.isArray(RAW_CONTENT.props) ? RAW_CONTENT.props : [];
  const step = { id: 'step', model: stair.model, scale: 1, blockRadius: 0, walkOn: true, solid: false, light: null, surfaces: {} };
  assert.throws((): Content => parseContent({ ...shipped, props: [...props, step] }), /walks on/);
});

void test('every prop placed in a zone that stands in the way blocks the hero, unless he walks on it or it rests on something solid', (): void => {
  const walkable: string[] = [];
  for (const zone of content.zones.values()) {
    zone.props.forEach((placed: ZoneProp, at: number): void => {
      const def: PropDef = must(content.props.get(placed.prop), placed.prop);
      if (!standsUp(def) || blocks(def) || def.walkOn || restsOnSolid(zone, placed, at)) return;
      walkable.push(`${zone.id} ${placed.prop} at ${String(placed.x)}, ${String(placed.z)}`);
    });
  }
  assert.deepEqual(walkable, []);
});

void test('every prop a kit or a cliff rule dresses a level with that stands in the way blocks the hero', (): void => {
  const named: string[] = [];
  for (const kit of kits) {
    named.push(kit.stairs.prop, ...kit.caches);
    for (const row of kit.rows) named.push(row.prop);
    for (const cluster of kit.clusters) for (const piece of cluster) named.push(piece.prop);
  }
  for (const zone of content.zones.values()) for (const rule of zone.terrain?.cliffs ?? []) named.push(...rule.props);
  const walkable: string[] = [...new Set<string>(named)].filter((id: string): boolean => {
    const def: PropDef = must(content.props.get(id), id);
    return standsUp(def) && !blocks(def) && !def.walkOn;
  });
  assert.deepEqual(walkable.toSorted(), []);
});

void test('scattered props never block, so every one of them is small enough to walk through', (): void => {
  const tall: string[] = [];
  for (const zone of content.zones.values()) {
    for (const rule of zone.scatter) {
      for (const id of rule.props) {
        const def: PropDef = must(content.props.get(id), id);
        if (standsUp(def, rule.size.most)) tall.push(`${zone.id} ${id}`);
      }
    }
  }
  assert.deepEqual([...new Set<string>(tall)], []);
});

void test('the ruined wall in the Hideout stops the hero at its stone', (): void => {
  const hideout: ZoneDef = must(content.zones.get('hideout'), 'hideout');
  const wall: ZoneProp = must(hideout.props.find((placed: ZoneProp): boolean => placed.prop === 'hideout_scaffold'), 'wall');
  const grid: NavGrid = buildNavGrid(hideout, content.props, content.surfaces, content.player.radius);
  assert.equal(isWalkable(grid, wall.x, wall.z), false);
  assert.equal(isWalkable(grid, wall.x - 1.5, wall.z), false);
  assert.equal(isWalkable(grid, wall.x + 1.5, wall.z), false);
  assert.equal(isWalkable(grid, wall.x, wall.z + 3), true);
});
