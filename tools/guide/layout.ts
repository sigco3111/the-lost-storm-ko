import { esc } from './html.ts';

export interface NavEntry {
  readonly href: string;
  readonly label: string;
}

export interface PageBody {
  readonly kicker: string;
  readonly title: string;
  readonly lede: string;
  readonly description: string;
  readonly body: string;
}

export interface PageFrame {
  readonly href: string;
  readonly kicker: string;
  readonly title: string;
  readonly lede: string;
  readonly body: string;
  readonly nav: readonly NavEntry[];
  readonly next: NavEntry | null;
  readonly current: string;
}

function navLink(entry: NavEntry, current: string): string {
  const here: boolean = entry.href === current;
  return `<a href="${esc(entry.href)}"${here ? ' aria-current="page"' : ''}>${esc(entry.label)}</a>`;
}

export function frame(page: PageFrame): string {
  const next: string = page.next === null ? '' : `<nav class="next" aria-label="Next page"><a href="${esc(page.next.href)}"><span>Next</span>${esc(page.next.label)}</a></nav>`;
  return `<header class="bar">
<div class="bar-inner">
<a class="brand" href="/the-lost-storm-ko/">폭풍의 잔향</a>
<a class="play" href="/the-lost-storm-ko/play/">플레이</a>
</div>
<nav class="pages" aria-label="Guide">${page.nav.map((entry: NavEntry): string => navLink(entry, page.current)).join('')}</nav>
</header>
<main class="page">
<header class="intro">
<p class="kicker">${esc(page.kicker)}</p>
<h1>${esc(page.title)}</h1>
<p class="lede">${page.lede}</p>
</header>
${page.body}
${next}
</main>
<footer class="foot">
<p>Written for the alpha. Every number on these pages is read from the game itself when the site is built, so a change to the game changes the guide with it.</p>
<p><a href="/the-lost-storm-ko/guide/">Guide</a><span aria-hidden="true">·</span><a href="/the-lost-storm-ko/privacy.html">Privacy</a><span aria-hidden="true">·</span><a href="/the-lost-storm-ko/terms.html">Terms</a><span aria-hidden="true">·</span><a href="https://mergestorm.ai">원작 Mergestorm</a></p>
</footer>`;
}
