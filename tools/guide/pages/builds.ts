import type { GuideData } from '../data.ts';
import { esc, link, para, section } from '../html.ts';
import type { PageBody } from '../layout.ts';
import type { BuildNotes } from './build-page.ts';
import { buildHref, BUILD_PAGE, comparison, mainSkillName, measuredMethod, namedMeasures } from './build-page.ts';
import { BUILD_NOTES } from './build-notes.ts';
import { measuredTable } from './measured-view.ts';

export const BUILDS_PAGE = {
  leading: 4,
} as const;

export function buildCard(data: GuideData, notes: BuildNotes): string {
  return `<li><a href="${esc(buildHref(notes.id))}"><span class="card-kind">${esc(notes.kind)} · ${esc(mainSkillName(data, notes))}</span><span class="card-name">${esc(notes.name)}</span><span class="card-line">${notes.forWho}</span></a></li>`;
}

export function buildCards(data: GuideData, all: readonly BuildNotes[]): string {
  return `<ul class="cards">${all.map((notes: BuildNotes): string => buildCard(data, notes)).join('')}</ul>`;
}

export function buildsPage(data: GuideData): PageBody {
  const top: number = Math.max(...data.spec.levels);
  const bossLevel: number = data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? top;
  return {
    kicker: '안내서',
    title: '빌드',
    lede: '캐릭터를 키우는 다섯 가지 방법: 무기 종류별로 하나씩, 그리고 손에 쥔 것 무엇이든 따르는 하나. 각각 스킬 트리 경로와 게임 안에서 직접 측정한 수치가 있다.',
    description: '폭풍의 잔향의 다섯 빌드: 지팡이, 중량 무기, 도검, 쇠뇌, 그리고 어떤 무기에도 맞는 메아리. 각 빌드가 맞는 사람, 성장 경로, 측정된 속도와 사망, 우두머리 전투.',
    body: [
      section(
        'pick',
        '하나를 골라라',
        [
          para(
            `각 빌드 페이지는 그 빌드가 누구에게 맞는지, 어떻게 플레이하는지, 레벨 ${top}까지 순서대로 찍을 장소, 의지할 스킬, 입을 것과 피할 것을 알려준다. 모든 빌드는 게임 자체의 시뮬레이션 플레이어가 여러 번 직접 플레이한 것이라, 수치는 추측이 아니라 측정값이다.`,
            '앞의 네 빌드는 각각 무기 하나, 속성 하나, 스킬 트리의 한 길이다. 길의 대부분은 그 무기를 손에 쥐고 있을 때만 반응하므로, 빌드와 무기를 함께 골라라.',
          ),
          buildCards(data, BUILD_NOTES.slice(0, BUILDS_PAGE.leading)),
          para('그리고 어떤 무기에도 맞는 하나: 주 공격이 두 번씩 적중하게 만든다.'),
          buildCards(data, BUILD_NOTES.slice(BUILDS_PAGE.leading)),
        ].join('\n'),
      ),
      section(
        'numbers',
        '나란히 비교',
        [
          para(`다섯 빌드의 비교. 빌드 이름을 누르면 그 페이지가 열린다. 우두머리는 대부분의 플레이어가 처음 만나는 레벨인 ${bossLevel}레벨에서 측정했다.`),
          comparison(data, ''),
          measuredTable(namedMeasures(data), data.spec.levels, bossLevel),
          measuredMethod(data),
        ].join('\n'),
      ),
      section('new', '게임이 처음이라면?', para(`${link('/guide/start/', '시작하기')}와 ${link('/guide/tree/', '스킬 트리의 작동 방식')}부터 읽어라. 이 빌드들은 모두 1레벨부터 시작할 수 있다.`)),
    ].join('\n'),
  };
}
