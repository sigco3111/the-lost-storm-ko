import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OutboundLink } from './links.ts';
import { LINK_SET } from './link-set.ts';
import { LINK_SET as NO_LINKS } from './link-set-none.ts';

void test('the shipped links lead to the Discord and the repository, and the site is the address to share', (): void => {
  assert.deepEqual(
    LINK_SET.outbound.map((link: OutboundLink): readonly string[] => [link.id, link.href]),
    [
      ['discord', 'https://discord.gg/XTRePF4HJs'],
      ['github', 'https://github.com/marginsystems/the-lost-storm'],
    ],
  );
  assert.equal(LINK_SET.share, 'https://theloststorm.com');
});

void test('a build that links nowhere has no link out and no address to share', (): void => {
  assert.deepEqual(NO_LINKS, { outbound: [], share: null });
});
