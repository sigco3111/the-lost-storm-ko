import type { ChartPath, SkillTreeNodeDef, TreeNodeKind } from '../../../sim/content/types.ts';
import { isStartingPlace } from '../../../sim/progression.ts';
import type { GuideData } from '../data.ts';
import { pointsAtLevel, respecCost, skill } from '../data.ts';
import { esc, kbd, link, list, para, section, table } from '../html.ts';
import type { PageBody } from '../layout.ts';
import { treePicture } from '../tree-picture.ts';

export const TREE_PAGE = {
  pointLevels: [2, 5, 8, 10, 15, 20],
  respecLevels: [5, 10, 15, 20],
} as const;

function count(data: GuideData, kind: TreeNodeKind): number {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.kind === kind).length;
}

function pathPlaces(data: GuideData, pathId: string): readonly SkillTreeNodeDef[] {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.path === pathId);
}

function pathRow(data: GuideData, entry: ChartPath): string[] {
  const places: readonly SkillTreeNodeDef[] = pathPlaces(data, entry.id);
  const start: string = places.filter(isStartingPlace).map((node: SkillTreeNodeDef): string => node.name).join(', ');
  const keystone: string = places.filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone').map((node: SkillTreeNodeDef): string => node.name).join(', ');
  const unlocks: string[] = places.flatMap((node: SkillTreeNodeDef): string[] => (node.unlock === null ? [] : [skill(data, node.unlock).name]));
  return [`<span style="color: ${esc(entry.tint)}">${esc(entry.name)}</span>`, esc(entry.description), esc(start), esc(list(unlocks)), esc(keystone)];
}

function keystoneRows(data: GuideData): string[][] {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone').map((node: SkillTreeNodeDef): string[] => [esc(node.name), esc(node.description)]);
}

function sharedChanges(data: GuideData): string[] {
  const bySkill: Map<string, string[]> = new Map<string, string[]>();
  for (const node of data.content.skillTree) {
    for (const variant of node.variants) {
      const names: string[] = bySkill.get(variant.skill) ?? [];
      names.push(node.name);
      bySkill.set(variant.skill, names);
    }
  }
  return [...bySkill.entries()].filter(([, names]: [string, string[]]): boolean => names.length > 1).map(([skillId, names]: [string, string[]]): string => `<b>${esc(skill(data, skillId).name)}</b>: ${esc(list(names))}`);
}

function variantCount(data: GuideData): number {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.variants.length > 0).length;
}

export function treePage(data: GuideData): PageBody {
  const per: number = data.content.chart.pointsPerLevel;
  const grants: number = data.content.chart.grants.reduce((sum: number, grant): number => sum + grant.points, 0);
  const respec = data.content.chart.respec;
  const minors: number = count(data, 'minor');
  const notables: number = count(data, 'notable');
  const keystones: number = count(data, 'keystone');
  return {
    kicker: '안내서',
    title: '스킬 트리',
    lede: '포인트가 어디로 가는지, 다섯 길이 어떻게 맞물리는지, 그리고 초기화에 무엇이 드는지.',
    description: '폭풍의 잔향의 스킬 트리 작동 방식: 레벨당 포인트, 다섯 길, 노터블과 키스톤, 스킬 변경의 한 가지 규칙, 초기화 비용.',
    body: [
      section(
        'whole',
        '트리 전체',
        [
          `<figure class="tree">${treePicture(data.content, [], '스킬 트리 전체')}<figcaption>트리의 모든 장소. 큰 원이 노터블, 가장 큰 것이 키스톤이다.</figcaption></figure>`,
          para(`게임에서 ${kbd('T')}를 눌러 열 수 있다. 장소는 모두 ${minors + notables + keystones}곳: 조금씩 더해주는 작은 장소 ${minors}곳, 스킬을 가르치거나 바꾸는 노터블 ${notables}곳, 플레이 방식을 바꾸되 항상 대가를 요구하는 키스톤 ${keystones}곳이다.`),
        ].join('\n'),
      ),
      section(
        'points',
        '포인트',
        [
          para(`레벨이 오를 때마다 포인트 ${per}개를 얻는다. 초반에는 첫 순간을 해결하고 관리인의 첫 가르침을 받으며 ${grants}개를 더 얻는다. 쓴 포인트는 곧 차지한 장소다. 달리 쓸 곳이 없으니 생기는 대로 써라.`),
          table({ head: ['레벨', '그때까지의 포인트'], rows: TREE_PAGE.pointLevels.map((level: number): string[] => [String(level), String(pointsAtLevel(data.content, level))]) }),
        ].join('\n'),
      ),
      section(
        'paths',
        '다섯 길',
        [
          para('트리는 중심을 둘러싼 다섯 길이다. 각 길은 스킬을 가르치는 노터블에서 시작하며, 다섯 곳 중 어디에서든 시작할 수 있다. 그 후로는 이미 가진 장소에 이웃한 장소만 차지할 수 있으므로, 빌드란 바깥으로 걸어 나간 하나의 선이고 여기저기 다음 길로 가지를 치기도 한다.'),
          table({ head: ['길', '역할', '시작 장소', '가르치는 스킬', '키스톤'], rows: data.content.chart.paths.map((entry: ChartPath): string[] => pathRow(data, entry)), className: 'wide' }),
          para('이웃한 길 사이에는 작은 다리 장소가 있어, 빌드가 한 길에서 다음 길로 넘어갈 수 있다.'),
        ].join('\n'),
      ),
      section(
        'keystones',
        '키스톤',
        [para('키스톤은 각 길의 가장 먼 끝에 있다. 하나하나가 많은 것을 주고 무언가를 빼앗는다. 찍기 전에 대가를 읽어라.'), table({ head: ['키스톤', '효과'], rows: keystoneRows(data) })].join('\n'),
      ),
      section(
        'one-change',
        '스킬당 하나의 변경',
        [
          para(`노터블 ${variantCount(data)}곳이 스킬을 다른 것으로 바꾼다. 하나의 스킬은 한 번에 그중 하나로만 바뀐다: 하나를 가지고 있으면, 같은 스킬을 바꾸는 나머지는 되돌리기 전까지 닫혀 있다. 같은 스킬을 공유하는 장소들:`),
          `<ul>${sharedChanges(data).map((line: string): string => `<li>${line}</li>`).join('')}</ul>`,
          para(`모든 변경은 ${link('/guide/skills/', '스킬')} 페이지에서 해당 스킬과 함께 볼 수 있다.`),
        ].join('\n'),
      ),
      section(
        'respec',
        '마음 바꾸기',
        [
          para(`가진 장소가 여전히 모두 연결되어 있다면 장소 하나를 되돌릴 수도 있고, 트리 전체를 한 번에 초기화할 수도 있다. 어느 쪽이든 골드가 든다: 포인트당 ${respec.goldPerPoint}, 여기에 레벨마다 포인트당 ${respec.goldPerLevel}씩 더한다. 포인트는 돌려받아 다시 쓸 수 있다.`),
          table({
            head: ['레벨', '장소 하나', '트리 전체'],
            rows: TREE_PAGE.respecLevels.map((level: number): string[] => [String(level), `골드 ${respecCost(data, level, 1)}`, `골드 ${respecCost(data, level, pointsAtLevel(data.content, level))}`]),
          }),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
