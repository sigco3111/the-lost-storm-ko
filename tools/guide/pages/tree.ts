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
    kicker: 'Guide',
    title: 'The Skill Tree',
    lede: 'Where your points go, how the five paths fit together, and what it costs to change your mind.',
    description: 'How the Skill Tree in The Lost Storm works: points per level, the five paths, notables and keystones, the one rule about changing a skill, and what a respec costs.',
    body: [
      section(
        'whole',
        'The whole tree',
        [
          `<figure class="tree">${treePicture(data.content, [], 'The whole Skill Tree')}<figcaption>Every place on the tree. Big circles are notables, the biggest are keystones.</figcaption></figure>`,
          para(`Press ${kbd('T')} to open it in the game. There are ${minors + notables + keystones} places: ${minors} small ones that add a little, ${notables} notables that teach a skill or change one, and ${keystones} keystones that change how you play and always cost you something for it.`),
        ].join('\n'),
      ),
      section(
        'points',
        'Points',
        [
          para(`You get ${per} points with every level. ${grants} more come early, from clearing your first moment and from the Warden's first lesson. A point spent is a place taken; there is nothing else to spend them on, so spend them as they come.`),
          table({ head: ['Level', 'Points by then'], rows: TREE_PAGE.pointLevels.map((level: number): string[] => [String(level), String(pointsAtLevel(data.content, level))]) }),
        ].join('\n'),
      ),
      section(
        'paths',
        'The five paths',
        [
          para('The tree is five paths around a centre. Each path begins with a notable that teaches a skill, and you may start at any of the five. From then on you can only take a place next to one you already have, so a build is a line walked outward, with a branch here and there into the next path.'),
          table({ head: ['Path', 'What it is for', 'Starts with', 'Skills it teaches', 'Keystone'], rows: data.content.chart.paths.map((entry: ChartPath): string[] => pathRow(data, entry)), className: 'wide' }),
          para('Between neighbouring paths there are small bridge places, which is how a build crosses from one path into the next.'),
        ].join('\n'),
      ),
      section(
        'keystones',
        'Keystones',
        [para('A keystone sits at the far end of its path. Each one gives you a lot and takes something away. Read the cost before you take one.'), table({ head: ['Keystone', 'What it does'], rows: keystoneRows(data) })].join('\n'),
      ),
      section(
        'one-change',
        'One change per skill',
        [
          para(`${variantCount(data)} notables change a skill into something else. A skill can only be changed by one of them at a time: once you hold one, the others that change the same skill are closed to you until you give it back. These share a skill:`),
          `<ul>${sharedChanges(data).map((line: string): string => `<li>${line}</li>`).join('')}</ul>`,
          para(`Every change is listed with its skill on the ${link('/guide/skills/', 'Skills')} page.`),
        ].join('\n'),
      ),
      section(
        'respec',
        'Changing your mind',
        [
          para(`You can give back a single place, as long as everything you hold still connects, or clear the whole tree at once. Either costs gold: ${respec.goldPerPoint} for each point, plus ${respec.goldPerLevel} for each point for every level you have. The points come back to spend again.`),
          table({
            head: ['Level', 'One place', 'The whole tree'],
            rows: TREE_PAGE.respecLevels.map((level: number): string[] => [String(level), `${respecCost(data, level, 1)} gold`, `${respecCost(data, level, pointsAtLevel(data.content, level))} gold`]),
          }),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
