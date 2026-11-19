import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { FlaskDef, FlaskTier } from '../../sim/content/flasks.ts';
import type { Content } from '../../sim/content/types.ts';
import { flaskOffer } from '../../sim/world/flask-tiers.ts';
import { flaskOfferView } from './flask-offer.ts';
import type { FlaskOfferView } from './flask-offer.ts';
import { goldShortText } from './gold-short.ts';

const content: Content = loadContent();
const life: FlaskDef = must(content.flasks[0], 'life');
const first: FlaskTier = must(life.tiers[0], 'first');
const third: FlaskTier = must(life.tiers[2], 'third');

void test('the next tier is told in plain numbers for this hero, beside what the flask gives now', (): void => {
  const view: FlaskOfferView = flaskOfferView(life, flaskOffer(life, 0, first.level, first.price), 1000, first.price);
  assert.equal(view.state, 'ready');
  assert.equal(view.name, 'Life Flask');
  assert.equal(view.tier, `Base, ${life.tiers.length} upgrades`);
  assert.equal(view.next, `Restores ${Math.round(first.share * 1000)} life over ${first.duration} s (now ${Math.round(life.share * 1000)} life over ${life.duration} s)`);
  assert.equal(view.price, first.price);
  assert.equal(view.need, 'Upgrade ready');
});

void test('a short purse says how much is missing, and a locked tier names its level', (): void => {
  const short: FlaskOfferView = flaskOfferView(life, flaskOffer(life, 0, first.level, 40), 300, 40);
  assert.equal(short.state, 'short');
  assert.equal(short.need, `${first.price - 40} gold short`);
  assert.equal(goldShortText(first.price, 40), short.need);
  const locked: FlaskOfferView = flaskOfferView(life, flaskOffer(life, 0, 1, 1e6), 300, 1e6);
  assert.equal(locked.need, `Needs level ${first.level}`);
});

void test('a tier that adds charges says so, and the top tier offers nothing more', (): void => {
  const more: FlaskOfferView = flaskOfferView(life, flaskOffer(life, 2, third.level, third.price), 1000, third.price);
  assert.match(more.next, new RegExp(`${third.maxCharges} charges, ${third.chargesPerKill} a kill`));
  const top: FlaskOfferView = flaskOfferView(life, flaskOffer(life, life.tiers.length, 99, 0), 1000, 0);
  assert.equal(top.state, 'top');
  assert.equal(top.price, null);
  assert.equal(top.need, 'Fully upgraded');
  assert.equal(top.tier, `Tier ${life.tiers.length} of ${life.tiers.length}`);
});
