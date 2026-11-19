import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlaskArt, FlaskLayer } from './flask-glass.ts';
import { buildFlaskArt, liquidEmpty, liquidLine, liquidTop, VIAL, vialInnerRadius, vialRadius } from './flask-glass.ts';

const SCALE: number = 2;
const LIFE_TICKS: readonly number[] = [1 / 3, 2 / 3, 1];

function alphaAt(layer: FlaskLayer, px: number, py: number): number {
  return layer.data[(py * layer.width + px) * 4 + 3] ?? 0;
}

function opaqueRows(layer: FlaskLayer): readonly number[] {
  const rows: number[] = [];
  for (let py = 0; py < layer.height; py++) {
    for (let px = 0; px < layer.width; px++) {
      if (alphaAt(layer, px, py) > 0) {
        rows.push(py);
        break;
      }
    }
  }
  return rows;
}

void test('the vial is narrower than it is tall and the stopper sits above the lip', (): void => {
  const width: number = VIAL.width;
  const height: number = VIAL.height;
  assert.ok(width < height / 2);
  assert.equal(vialRadius(VIAL.lipTop - 1), 0);
  assert.ok(vialRadius(VIAL.lipTop + 1) > 0);
});

void test('the inside of the glass is always narrower than the outside', (): void => {
  const bottom: number = VIAL.bottom;
  for (let y: number = VIAL.lipTop; y <= bottom; y += 0.5) assert.ok(vialInnerRadius(y) <= vialRadius(y));
  assert.equal(vialInnerRadius(VIAL.bottom), 0);
});

void test('the liquid line runs from the floor of the glass up to the full mark', (): void => {
  assert.equal(liquidLine(0), liquidEmpty());
  assert.equal(liquidLine(1), VIAL.full);
  assert.ok(liquidLine(0.5) < liquidLine(0.25));
  assert.equal(liquidLine(2), VIAL.full);
  assert.equal(liquidLine(-1), liquidEmpty());
});

void test('the liquid edge sits level with the line when part full and hides below the floor when empty', (): void => {
  assert.ok(liquidTop(0) > liquidEmpty());
  assert.ok(liquidTop(1) < liquidLine(1));
  assert.ok(liquidTop(0.5) < liquidTop(0.25));
});

void test('every layer has the size of the vial at the chosen scale', (): void => {
  const art: FlaskArt = buildFlaskArt('life', LIFE_TICKS, SCALE);
  for (const layer of [art.body, art.liquid, art.gloss, art.stopper, art.inner]) {
    assert.equal(layer.width, VIAL.width * SCALE);
    assert.equal(layer.height, VIAL.height * SCALE);
  }
  assert.equal(art.surface.width, VIAL.width * SCALE);
  assert.equal(art.surface.height, art.surfaceHeight * SCALE);
});

void test('the liquid stays inside the glass, below the full mark and above the floor', (): void => {
  const art: FlaskArt = buildFlaskArt('mana', LIFE_TICKS, SCALE);
  const rows: readonly number[] = opaqueRows(art.liquid);
  const first: number | undefined = rows[0];
  const last: number | undefined = rows.at(-1);
  assert.ok(first !== undefined && last !== undefined);
  assert.ok(first / SCALE >= VIAL.full - art.lens - 1 / SCALE);
  assert.ok(last / SCALE <= liquidEmpty());
  for (let py = 0; py < art.liquid.height; py++) {
    for (let px = 0; px < art.liquid.width; px++) {
      if (alphaAt(art.liquid, px, py) > 0) assert.ok(alphaAt(art.inner, px, py) > 0);
    }
  }
});

void test('the cork is drawn only above the lip and the glass only from the lip down', (): void => {
  const art: FlaskArt = buildFlaskArt('life', LIFE_TICKS, SCALE);
  const cork: readonly number[] = opaqueRows(art.stopper);
  const glass: readonly number[] = opaqueRows(art.body);
  assert.ok((cork.at(-1) ?? 0) / SCALE <= VIAL.lipTop + 1.5);
  assert.ok((glass[0] ?? 0) / SCALE >= VIAL.lipTop - 0.5);
});

void test('life and mana liquids are different colours and the ticks add marks to the glass', (): void => {
  const life: FlaskArt = buildFlaskArt('life', LIFE_TICKS, SCALE);
  const mana: FlaskArt = buildFlaskArt('mana', LIFE_TICKS, SCALE);
  const bare: FlaskArt = buildFlaskArt('life', [], SCALE);
  const middle: number = (Math.round(liquidLine(0.1) * SCALE) * life.liquid.width + (life.liquid.width >> 1)) * 4;
  assert.notEqual(life.liquid.data[middle], mana.liquid.data[middle]);
  assert.notDeepEqual(life.gloss.data, bare.gloss.data);
  assert.deepEqual(life.body.data, bare.body.data);
});

void test('the same inputs draw the same pictures', (): void => {
  const a: FlaskArt = buildFlaskArt('life', LIFE_TICKS, SCALE);
  const b: FlaskArt = buildFlaskArt('life', LIFE_TICKS, SCALE);
  assert.deepEqual(a.stopper.data, b.stopper.data);
  assert.deepEqual(a.liquid.data, b.liquid.data);
});
