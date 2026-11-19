import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMEPIX, INERT_ADDRESSES, PORTAL, PORTAL_TARGETS, STILL_CLASS, refuseWithheld, checkLimits, describeReport, dropOutside, liftPage, localRefs, outsideAddresses, portalTarget, sealPage, shipsInPortal, siteAnchors, withheldSet } from './portal.ts';

const LIMITS = { files: 3, totalBytes: 100, fileBytes: 60 } as const;

void test('the game page moves to the root: parent and root-relative URLs become relative to it', (): void => {
  const html: string = '<link rel="icon" href="/favicon.svg" /><script type="module" src="../assets/play-1.js"></script><link rel="stylesheet" href="../assets/play-2.css">';
  assert.equal(liftPage(html), '<link rel="icon" href="./favicon.svg" /><script type="module" src="./assets/play-1.js"></script><link rel="stylesheet" href="./assets/play-2.css">');
});

void test('absolute and protocol-relative URLs are left alone when the page moves', (): void => {
  const html: string = '<link rel="canonical" href="https://theloststorm.com/play/" /><script src="//cdn.example/x.js"></script>';
  assert.equal(liftPage(html), html);
});

void test('a page that would still point above its folder is refused', (): void => {
  assert.throws((): string => liftPage('<img src="../../x.png">'), /above its own folder/);
});

void test('the files the page points at are listed without query or fragment', (): void => {
  assert.deepEqual(localRefs('<link href="./favicon.svg"><script src="./assets/a.js?v=1"></script><a href="https://x.test/">x</a>'), ['favicon.svg', 'assets/a.js']);
});

void test('site pages linked from the title open on the site in a new tab', (): void => {
  const html: string = '<p><a href="/guide/">Guide</a><a class="l" href="/terms.html">Terms</a><a href="https://discord.gg/abc">D</a></p>';
  assert.equal(siteAnchors(html, 'https://theloststorm.com/'), '<p><a href="https://theloststorm.com/guide/" target="_blank" rel="noopener">Guide</a><a class="l" href="https://theloststorm.com/terms.html" target="_blank" rel="noopener">Terms</a><a href="https://discord.gg/abc">D</a></p>');
});

void test('local-only assets and site-only pages stay out of the portal', (): void => {
  assert.equal(shipsInPortal('models/local/fab/hero.glb'), false);
  assert.equal(shipsInPortal('audio/local/rain.ogg'), false);
  assert.equal(shipsInPortal('privacy.html'), false);
  assert.equal(shipsInPortal('og.jpg'), false);
  assert.equal(shipsInPortal('google0123456789abcdef.html'), false);
  assert.equal(shipsInPortal('favicon.ico'), true);
  assert.equal(shipsInPortal('icon-192.png'), true);
  assert.equal(shipsInPortal('models/characters/man.glb'), true);
  assert.equal(shipsInPortal('favicon.svg'), true);
});

void test('a server address or an asset base set for the build is reported', (): void => {
  assert.deepEqual(withheldSet({ VITE_SERVER_URL: 'https://api.example', VITE_ASSET_BASE: ' ', VITE_BUILD_ID: 'x' }), ['VITE_SERVER_URL']);
  assert.deepEqual(withheldSet({}), []);
  assert.deepEqual(PORTAL.withheldEnv, ['VITE_SERVER_URL', 'VITE_ASSET_BASE']);
});

void test('a build inside the limits passes with its count and size', (): void => {
  const report = checkLimits([{ path: 'index.html', bytes: 40 }, { path: 'a.js', bytes: 50 }], LIMITS);
  assert.deepEqual(report, { files: 2, totalBytes: 90, problems: [] });
  assert.equal(describeReport({ files: 453, totalBytes: 44_564_480, problems: [] }), '453 files, 42.5 MB');
});

void test('too many files, too many bytes and one file too large are each reported', (): void => {
  const report = checkLimits(
    [
      { path: 'a', bytes: 10 },
      { path: 'b', bytes: 10 },
      { path: 'c', bytes: 10 },
      { path: 'big.glb', bytes: 80 },
    ],
    LIMITS,
  );
  assert.equal(report.problems.length, 3);
  assert.match(report.problems[0] ?? '', /^4 files/);
  assert.match(report.problems[1] ?? '', /in all/);
  assert.match(report.problems[2] ?? '', /^big\.glb/);
});

void test('the portal limits are the ones itch.io sets', (): void => {
  assert.deepEqual(PORTAL.limits, { files: 1000, totalBytes: 500 * 1024 * 1024, fileBytes: 200 * 1024 * 1024 });
});

void test('each portal build is found by its Vite mode, and the site build is not a portal', (): void => {
  assert.equal(portalTarget(PORTAL.mode)?.outDir, PORTAL.outDir);
  assert.equal(portalTarget(PORTAL.mode)?.sealed, false);
  assert.deepEqual(portalTarget(PORTAL.mode)?.swaps, {});
  assert.equal(portalTarget(GAMEPIX.mode), GAMEPIX);
  assert.equal(portalTarget('production'), null);
});

void test('the GamePix build leaves out the landing films and swaps each module for a quiet one beside it', (): void => {
  assert.equal(shipsInPortal('landing/spin.mp4', GAMEPIX.leftOut), false);
  assert.equal(shipsInPortal('landing/spin.mp4'), true);
  assert.equal(shipsInPortal('models/characters/man.glb', GAMEPIX.leftOut), true);
  for (const [from, to] of Object.entries(GAMEPIX.swaps)) {
    assert.match(from, /^src\/.+\.ts$/);
    assert.equal(to.slice(0, to.lastIndexOf('/')), from.slice(0, from.lastIndexOf('/')));
    assert.notEqual(from, to);
  }
});

void test('an address is outside unless it is a namespace or a citation that is never fetched', (): void => {
  const text: string = 'createElementNS(`http://www.w3.org/2000/svg`,e);fetch("https://api.example/x?y=1");// https://jcgt.org/published/0007/04/01/\n<a href=\'http://a.test/b\'>';
  assert.deepEqual(outsideAddresses(text), ['https://api.example/x?y=1', 'http://a.test/b']);
  assert.deepEqual(outsideAddresses('no address here, and ./assets/a.js is local'), []);
  for (const address of Object.keys(INERT_ADDRESSES)) assert.deepEqual(outsideAddresses(` ${address} `), []);
});

void test('a sealed page loses the elements that only lead out and every absolute meta and link, and holds the body still', (): void => {
  const html: string = [
    '<head><meta name="viewport" content="width=device-width, user-scalable=no" />',
    '<link rel="canonical" href="https://theloststorm.com/play/" />',
    '<meta property="og:image" content="https://theloststorm.com/og.jpg" />',
    '<link rel="icon" href="./favicon.svg" /></head>',
    '<body class="hud-away"><footer><p class="title-foot-legal" data-outside><a href="/guide/">Guide</a><span>·</span><a href="/terms.html">Terms</a></p><p class="keep">Credits</p></footer></body>',
  ].join('\n');
  const sealed: string = sealPage(html);
  assert.equal(sealed, '<head><meta name="viewport" content="width=device-width, user-scalable=no" />\n<link rel="icon" href="./favicon.svg" /></head>\n<body class="hud-away ' + STILL_CLASS + '"><footer><p class="keep">Credits</p></footer></body>');
});

void test('a sealed page that still names an outside address, or has no body class to hold still, is refused', (): void => {
  assert.throws((): string => sealPage('<body class="a"><a href="https://discord.gg/abc">D</a></body>'), /discord\.gg/);
  assert.throws((): string => sealPage('<body><p>x</p></body>'), /body class/);
});

void test('an element that only leads out goes whole, with every element nested in it, and its neighbours stay', (): void => {
  const html: string = '<div class="a"><div class="account" data-outside><div><div id="m"></div></div><p>x</p></div><div class="b">keep</div></div><span data-outside>s</span>';
  assert.equal(dropOutside(html), '<div class="a"><div class="b">keep</div></div>');
  assert.throws((): string => dropOutside('<div data-outside><div></div>'), /never closed/);
});

void test('every portal build, GamePix included, ships nothing local-only or site-only and refuses a server or an asset base', (): void => {
  for (const target of PORTAL_TARGETS) {
    for (const path of ['models/local/fab/hero.glb', 'audio/local/rain.ogg', 'audio/local/voice/line.mp3', 'privacy.html', 'terms.html', 'og.jpg']) assert.equal(shipsInPortal(path, target.leftOut), false, `${target.mode} ships ${path}`);
    for (const key of PORTAL.withheldEnv) assert.throws((): void => refuseWithheld({ [key]: 'https://api.example' }), /no server/, `${target.mode} takes ${key}`);
  }
  assert.doesNotThrow((): void => refuseWithheld({ VITE_BUILD_ID: 'x' }));
});
