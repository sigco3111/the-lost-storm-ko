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
  { href: '/guide/start/', name: '시작하기', line: '조작키, 첫 10분, 약병, 은신처, 상인과 경매장.' },
  { href: '/guide/combat/', name: '전투의 작동 방식', line: '피해, 치명타, 방어구, 저항, 비틀거림, 경험치, 무리와 첫 우두머리.' },
  { href: '/guide/skills/', name: '스킬', line: '모든 스킬: 무엇을 하는지, 무엇이 드는지, 어떻게 얻고 무엇이 바꾸는지.' },
  { href: '/guide/tree/', name: '스킬 트리', line: '포인트, 다섯 길, 키스톤, 그리고 초기화 비용.' },
  { href: '/guide/items/', name: '아이템', line: '슬롯, 등급, 모든 부여 옵션, 모든 무기와 전설 아이템.' },
  { href: '/guide/builds/', name: '빌드', line: '다섯 빌드의 성장 경로와 실측 수치를 나란히.' },
];

function topicCard(topic: GuideTopic): string {
  return `<li><a href="${esc(topic.href)}"><span class="card-name">${esc(topic.name)}</span><span class="card-line">${esc(topic.line)}</span></a></li>`;
}

export function homePage(data: GuideData): PageBody {
  return {
    kicker: '폭풍의 잔향',
    title: '플레이어 안내서',
    lede: '게임이 멈춰 서서 설명하지 않는 모든 것, 그리고 게임 안에서 직접 측정한 다섯 가지 캐릭터 빌드.',
    description: '폭풍의 잔향 플레이어 안내서: 시작하기, 전투의 작동 방식, 모든 스킬, 스킬 트리, 아이템과 실측 빌드 다섯 가지.',
    body: [
      section('contents', '이 안내서의 내용', `<ul class="cards">${GUIDE_TOPICS.map(topicCard).join('')}</ul>`),
      section('builds', '빌드', [para(`포인트를 어디에 쓸지 모르겠다면? 나에게 맞아 보이는 빌드를 골라 그 경로를 따라가면 된다. ${link('/guide/builds/', '다섯 빌드 비교하기')}.`), buildCards(data, BUILD_NOTES)].join('\n')),
      section('alpha', '이 안내서에 대해', para('폭풍의 잔향은 알파 단계이고 자주 바뀐다. 이 안내서는 오늘 게임에 있는 것만 다룬다. 모든 수치, 이름, 비용, 경로는 사이트를 빌드할 때 게임에서 직접 읽어 오므로, 게임이 바뀌면 안내서도 함께 바뀐다.')),
    ].join('\n'),
  };
}
