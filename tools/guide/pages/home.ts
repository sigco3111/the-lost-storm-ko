import type { GuideData } from '../data.ts';
import { esc, link, para, section } from '../html.ts';
import type { PageBody } from '../layout.ts';
import { BUILD_NOTES } from './build-notes.ts';
import { buildCards } from './builds.ts';

export interface GuideTopic {
  readonly href: string;
  readonly name: string;
  readonly line: string;
}

export const GUIDE_TOPICS: readonly GuideTopic[] = [
  { href: '/guide/start/', name: 'Getting started', line: 'The keys, the first ten minutes, flasks, the Hideout, the trader and the auction house.' },
  { href: '/guide/combat/', name: 'How combat works', line: 'Damage, critical strikes, armour, resistances, stagger, experience, packs and the first boss.' },
  { href: '/guide/skills/', name: 'Skills', line: 'Every skill: what it does, what it costs, how you get it and what changes it.' },
  { href: '/guide/tree/', name: 'The Skill Tree', line: 'Points, the five paths, keystones, and what it costs to change your mind.' },
  { href: '/guide/items/', name: 'Items', line: 'Slots, rarities, every rolled line, every weapon and the legendaries.' },
  { href: '/guide/builds/', name: 'Builds', line: 'Five builds with routes and measured numbers, side by side.' },
];

function topicCard(topic: GuideTopic): string {
  return `<li><a href="${esc(topic.href)}"><span class="card-name">${esc(topic.name)}</span><span class="card-line">${esc(topic.line)}</span></a></li>`;
}

export function homePage(data: GuideData): PageBody {
  return {
    kicker: 'The Lost Storm',
    title: 'Player\'s guide',
    lede: 'Everything the game does not stop to explain, and five ways to build a character, measured in the game itself.',
    description: 'The player\'s guide to The Lost Storm: getting started, how combat works, every skill, the Skill Tree, items and five measured builds.',
    body: [
      section('contents', 'In this guide', `<ul class="cards">${GUIDE_TOPICS.map(topicCard).join('')}</ul>`),
      section('builds', 'Builds', [para(`Not sure where to put your points? Pick the build that sounds like you and follow its route. ${link('/guide/builds/', 'Compare all five')}.`), buildCards(data, BUILD_NOTES)].join('\n')),
      section('alpha', 'About this guide', para('The Lost Storm is in alpha, and it changes often. This guide only describes what is in the game today. Every number, name, cost and route in it is read from the game when the site is built, so when the game changes, the guide changes with it.')),
    ].join('\n'),
  };
}
