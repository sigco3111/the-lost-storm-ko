import type { Content, ItemBaseDef, SkillTreeNodeDef, SkillVariant, WeaponGroup } from '../../sim/content/types.ts';
import { findNode, placeLinks, startingPlaces } from '../../sim/progression.ts';
import type { GuideData } from './data.ts';
import { path, place, skill } from './data.ts';
import { droppedWeapons, weaponNames } from './facts.ts';
import { esc, para, section } from './html.ts';

export interface Signature {
  readonly place: string;
  readonly skill: string | null;
}

export const SIGNATURES: Readonly<Record<string, Signature>> = {
  stormcaller: { place: 'twice_told_bolt', skill: 'storm_bolt' },
  bulwark: { place: 'heaving_cleave', skill: 'cleave' },
  whirlwind: { place: 'endless_turn', skill: 'cleave' },
  windrunner: { place: 'fanned_shot', skill: 'cleave' },
  'echo-weaver': { place: 'twice_remembered', skill: null },
};

export function signatureOf(id: string): Signature {
  const found: Signature | undefined = SIGNATURES[id];
  if (found === undefined) throw new Error(`the build ${id} has no signature in the guide`);
  return found;
}

export function shortestRoute(content: Content, goal: string): string[] {
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const before: Map<string, string | null> = new Map<string, string | null>();
  const queue: string[] = [];
  for (const start of startingPlaces(content)) {
    before.set(start, null);
    queue.push(start);
  }
  for (let index: number = 0; index < queue.length && !before.has(goal); index += 1) {
    for (const next of links.get(queue[index] ?? '') ?? []) {
      if (before.has(next)) continue;
      before.set(next, queue[index] ?? null);
      queue.push(next);
    }
  }
  if (!before.has(goal)) throw new Error(`no route reaches ${goal}`);
  const order: string[] = [];
  for (let at: string | null = goal; at !== null; at = before.get(at) ?? null) order.unshift(at);
  return order;
}

export function signatureFamily(content: Content, node: SkillTreeNodeDef): WeaponGroup | null {
  return content.chart.weaponGroups.find((group: WeaponGroup): boolean => group.path === node.path) ?? null;
}

function wornForm(content: Content, family: WeaponGroup | null, held: string): string {
  if (family === null) return held;
  const change: SkillVariant | undefined = [...content.itemBases.values()]
    .filter((base: ItemBaseDef): boolean => base.weaponKind !== null && family.kinds.includes(base.weaponKind))
    .flatMap((base: ItemBaseDef): readonly SkillVariant[] => base.variants)
    .find((variant: SkillVariant): boolean => variant.skill === held);
  return change?.becomes ?? held;
}

export interface SignatureFacts {
  readonly node: SkillTreeNodeDef;
  readonly family: WeaponGroup | null;
  readonly route: readonly string[];
  readonly held: string | null;
  readonly worn: string | null;
  readonly becomes: string | null;
}

export function signatureFacts(content: Content, id: string): SignatureFacts {
  const signature: Signature = signatureOf(id);
  const node: SkillTreeNodeDef | null = findNode(content, signature.place);
  if (node === null) throw new Error(`the signature ${signature.place} is not on the tree`);
  const family: WeaponGroup | null = signatureFamily(content, node);
  const worn: string | null = signature.skill === null ? null : wornForm(content, family, signature.skill);
  const change: SkillVariant | undefined = node.variants.find((variant: SkillVariant): boolean => variant.skill === worn) ?? node.variants[0];
  return { node, family, route: shortestRoute(content, node.id), held: signature.skill, worn, becomes: change?.becomes ?? null };
}

function skillWords(data: GuideData, facts: SignatureFacts): string {
  if (facts.held === null) return '';
  const held: string = esc(skill(data, facts.held).name);
  const worn: string = facts.worn === null || facts.worn === facts.held || facts.family === null ? '' : `, which ${esc(facts.family.needs)} turns into ${esc(skill(data, facts.worn).name)}`;
  return ` and ${held} on the bar${worn}`;
}

function outcome(data: GuideData, facts: SignatureFacts): string {
  if (facts.becomes === null) return `${esc(facts.node.name)} is yours`;
  const from: string = facts.worn === null ? esc(facts.node.name) : esc(skill(data, facts.worn).name);
  return `${from} becomes ${esc(skill(data, facts.becomes).name)}`;
}

export function signatureSection(data: GuideData, id: string): string {
  const facts: SignatureFacts = signatureFacts(data.content, id);
  const arm: string = esc(path(data, facts.node.path).name);
  const weapons: string =
    facts.family === null
      ? `Every place on ${arm} works with any weapon, so wear whatever hits hardest.`
      : `Every skill on ${arm} works with any weapon and is stronger with ${esc(facts.family.needs)} in your hands: ${weaponNames(droppedWeapons(data, (base: ItemBaseDef): boolean => base.weaponKind !== null && (facts.family?.kinds.includes(base.weaponKind) ?? false)))}. Its weapon damage lines answer only to that weapon.`;
  const names: string[] = facts.route.map((step: string): string => esc(place(data, step).name));
  const wear: string = facts.family === null ? 'any weapon' : `${esc(facts.family.needs)} worn`;
  const steps: string = `<ol class="signature-route">${names.map((name: string): string => `<li>${name}</li>`).join('')}</ol>`;
  return section(
    'signature',
    'Weapons and the signature',
    [
      para(weapons),
      para(`The signature of this build is ${esc(facts.node.name)}: ${esc(facts.node.description)}`),
      steps,
      para(`The shortest way there is these ${names.length} places, in this order, with ${wear}${skillWords(data, facts)}. Then ${outcome(data, facts)}.`),
    ].join('\n'),
  );
}
