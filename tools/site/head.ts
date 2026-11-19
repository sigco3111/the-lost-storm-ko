import links from '../../data/links.json' with { type: 'json' };
import { esc } from '../guide/html.ts';
import type { Links, OutboundLink } from '../../src/launch/links.ts';
import { outboundLinks, readLinks } from '../../src/launch/links.ts';

export type Json = string | number | boolean | null | readonly Json[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: Json;
}

export interface ShareImage {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface Organization {
  readonly name: string;
  readonly url: string;
}

export interface SitePicture {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly caption: string;
}

export interface SiteVideo {
  readonly path: string;
  readonly poster: string;
  readonly width: number;
  readonly height: number;
  readonly duration: string;
  readonly uploaded: string;
  readonly name: string;
  readonly description: string;
}

export interface SiteLogo {
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

export interface SiteFacts {
  readonly origin: string;
  readonly name: string;
  readonly alternateNames: readonly string[];
  readonly language: string;
  readonly description: string;
  readonly genres: readonly string[];
  readonly platform: string;
  readonly operatingSystem: string;
  readonly category: string;
  readonly currency: string;
  readonly playPath: string;
  readonly image: ShareImage;
  readonly logo: SiteLogo;
  readonly manifestPath: string;
  readonly publisher: Organization;
  readonly screenshots: readonly SitePicture[];
  readonly trailer: SiteVideo;
}

export const SITE: SiteFacts = {
  origin: 'https://sigco3111.github.io/the-lost-storm-ko',
  name: '폭풍의 잔향',
  alternateNames: ['The Lost Storm 한국어판', 'Lost Storm'],
  language: 'ko',
  description: '폭풍의 잔향은 브라우저에서 바로 즐기는 무료 핵앤슬래시 액션 RPG의 비공식 한국어판이다. 밤의 폭풍 속에서 싸우고, 전리품을 찾고, 레벨을 올려라. 얼리 알파, 다운로드 불필요.',
  genres: ['Action role-playing game', 'Hack and slash'],
  platform: 'Web browser',
  operatingSystem: 'Any',
  category: 'GameApplication',
  currency: 'USD',
  playPath: '/play/',
  image: { path: '/og.jpg', width: 1200, height: 630, alt: '영웅이 안개 속 창백한 빛줄기 아래 검을 들고 서 있다.' },
  logo: { path: '/icon-512.png', width: 512, height: 512 },
  manifestPath: '/site.webmanifest',
  publisher: { name: 'Mergestorm', url: 'https://mergestorm.ai' },
  screenshots: [
    { path: '/landing/tree-1200.webp', width: 1200, height: 675, caption: '스킬 트리. 다섯 갈래 길이 중심에서 나선으로 뻗어 나가고, 번개 빌드가 모이는 폭풍을 밝힌다.' },
    { path: '/landing/hideout-1200.webp', width: 1200, height: 675, caption: '밤의 은신처. 모닥불과 등불, 거래와 경매, 웨이포인트를 지키는 관리인들.' },
  ],
  trailer: {
    path: '/landing/fight.mp4',
    poster: '/landing/fight-poster.webp',
    width: 1280,
    height: 720,
    duration: 'PT6.6S',
    uploaded: '2026-11-14T23:50:53Z',
    name: '폭풍의 잔향 플레이: 시간의 전당에서의 전투',
    description: '시간의 전당의 검은 기슭에 내리는 비 속에서, 영웅이 창백한 메아리 무리를 베어 넘긴다. 피해 숫자가 오르고 그 자리에 장비가 떨어진다.',
  },
};

export type ShareKind = 'website' | 'article';

export interface SharePage {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly kind: ShareKind;
}

export interface Crumb {
  readonly name: string;
  readonly path: string;
}

export interface ArticlePage {
  readonly path: string;
  readonly headline: string;
  readonly description: string;
}

export const HOME_LD_MARK: string = '<script type="application/ld+json" data-ld="home"></script>';

export function absolute(path: string): string {
  return `${SITE.origin}${path}`;
}

function meta(attribute: 'name' | 'property', key: string, value: string): string {
  return `<meta ${attribute}="${key}" content="${esc(value)}" />`;
}

export function shareTags(page: SharePage): readonly string[] {
  const image: string = absolute(SITE.image.path);
  return [
    meta('property', 'og:type', page.kind),
    meta('property', 'og:site_name', SITE.name),
    meta('property', 'og:url', absolute(page.path)),
    meta('property', 'og:title', page.title),
    meta('property', 'og:description', page.description),
    meta('property', 'og:image', image),
    meta('property', 'og:image:width', String(SITE.image.width)),
    meta('property', 'og:image:height', String(SITE.image.height)),
    meta('property', 'og:image:alt', SITE.image.alt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', page.title),
    meta('name', 'twitter:description', page.description),
    meta('name', 'twitter:image', image),
    meta('name', 'twitter:image:alt', SITE.image.alt),
  ];
}

const SITE_LINKS: Links = readLinks(links);

export function socialProfiles(): readonly string[] {
  return outboundLinks(SITE_LINKS).map((link: OutboundLink): string => link.href);
}

function organization(): JsonObject {
  return { '@type': 'Organization', name: SITE.publisher.name, url: SITE.publisher.url };
}

function siteRef(): JsonObject {
  return { '@type': 'WebSite', name: SITE.name, url: absolute('/') };
}

function gameRef(): JsonObject {
  return { '@type': 'VideoGame', name: SITE.name, url: absolute('/') };
}

function picture(entry: SitePicture): JsonObject {
  return { '@type': 'ImageObject', contentUrl: absolute(entry.path), url: absolute(entry.path), width: entry.width, height: entry.height, caption: entry.caption };
}

function video(entry: SiteVideo): JsonObject {
  return {
    '@type': 'VideoObject',
    name: entry.name,
    description: entry.description,
    thumbnailUrl: [absolute(entry.poster)],
    uploadDate: entry.uploaded,
    duration: entry.duration,
    contentUrl: absolute(entry.path),
    width: entry.width,
    height: entry.height,
    inLanguage: SITE.language,
  };
}

export function webSite(): JsonObject {
  return { ...siteRef(), '@id': absolute('/#website'), alternateName: [...SITE.alternateNames], description: SITE.description, inLanguage: SITE.language, publisher: organization() };
}

export function brand(): JsonObject {
  const logo: string = absolute(SITE.logo.path);
  return {
    '@type': 'Organization',
    '@id': absolute('/#brand'),
    name: SITE.name,
    alternateName: [...SITE.alternateNames],
    url: absolute('/'),
    logo: { '@type': 'ImageObject', url: logo, contentUrl: logo, width: SITE.logo.width, height: SITE.logo.height },
    image: absolute(SITE.image.path),
    sameAs: [...socialProfiles()],
    parentOrganization: organization(),
  };
}

export function videoGame(): JsonObject {
  return {
    ...gameRef(),
    '@id': absolute('/#game'),
    description: SITE.description,
    image: absolute(SITE.image.path),
    genre: [...SITE.genres],
    gamePlatform: SITE.platform,
    operatingSystem: SITE.operatingSystem,
    applicationCategory: SITE.category,
    inLanguage: SITE.language,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: SITE.currency, url: absolute(SITE.playPath) },
    screenshot: SITE.screenshots.map(picture),
    trailer: video(SITE.trailer),
    sameAs: [...socialProfiles()],
    publisher: organization(),
  };
}

export function breadcrumbList(crumbs: readonly Crumb[]): JsonObject {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb: Crumb, index: number): JsonObject => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: absolute(crumb.path) })),
  };
}

export function article(page: ArticlePage): JsonObject {
  const url: string = absolute(page.path);
  return {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: page.headline,
    description: page.description,
    url,
    mainEntityOfPage: url,
    image: [absolute(SITE.image.path)],
    inLanguage: SITE.language,
    author: organization(),
    publisher: organization(),
    isPartOf: siteRef(),
    about: gameRef(),
  };
}

export function ldScript(nodes: readonly JsonObject[]): string {
  const text: string = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${text}</script>`;
}

export function fillHome(html: string): string {
  return html.replace(HOME_LD_MARK, ldScript([webSite(), brand(), videoGame()]));
}
