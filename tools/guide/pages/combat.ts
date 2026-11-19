import type { BossDef, BossPhase, MonsterDef, RarityDef, SkillDef } from '../../../sim/content/types.ts';
import type { MonsterModDef } from '../../../sim/content/combat-types.ts';
import type { PackRankDef, RankModChoice, RankScale } from '../../../sim/content/rank-types.ts';
import { gapBand, gapScale } from '../../../sim/progression.ts';
import { ARMOUR_HALF_POINT, armourReduction } from '../../../sim/stats.ts';
import type { GuideData } from '../data.ts';
import { monster, skill, zone } from '../data.ts';
import { capPercent } from '../facts.ts';
import { bullets, decimal, esc, link, list, note, para, percent, section, subsection, table, terms } from '../html.ts';
import type { PageBody } from '../layout.ts';
import { gateLevel } from './start.ts';

export const COMBAT_PAGE = {
  armourSamples: [10, 25, 50, 100, 200, 300],
  gapHero: 10,
  gapSteps: [0, 4, 5, 6, 7, 8, 10],
  boss: 'timekeeper_gatekeeper',
} as const;

function times(scale: number): string {
  return `×${decimal(scale, 2)}`;
}

function more(scale: number): string {
  return scale >= 1 ? `${percent(scale - 1)} 증가` : `${percent(1 - scale)} 감소`;
}

function rank(data: GuideData, id: string): PackRankDef {
  const found: PackRankDef | undefined = data.content.packRanks.ranks.find((entry: PackRankDef): boolean => entry.id === id);
  if (found === undefined) throw new Error(`no pack rank ${id}`);
  return found;
}

function scaleLine(scale: RankScale): string {
  return `생명력 ${more(scale.life)}, 피해 ${more(scale.damage)}, 경험치 ${times(scale.xp)}`;
}

function modEffect(data: GuideData, mod: MonsterModDef): string {
  const parts: string[] = [];
  if (mod.speedScale !== 1) parts.push(`이동 속도 ${percent(Math.abs(mod.speedScale - 1))} ${mod.speedScale > 1 ? '빠름' : '느림'}`);
  if (mod.lifeScale !== 1) parts.push(`생명력 ${more(mod.lifeScale)}`);
  if (mod.damageScale !== 1) parts.push(`공격이 ${percent(Math.abs(mod.damageScale - 1))} ${mod.damageScale > 1 ? '더 강함' : '더 약함'}`);
  if (mod.sizeScale > 1) parts.push('덩치가 더 큼');
  if (mod.staggerScale < 1) parts.push(`비틀거림이 ${percent(1 - mod.staggerScale)} 덜함`);
  if (mod.regen > 0) parts.push(`한동안 맞지 않으면 초당 생명력의 ${percent(mod.regen)}를 회복함`);
  if (mod.deathSkill !== null) parts.push(`죽은 뒤 잠시 후 쓰러진 자리에서 폭발함(${esc(skill(data, mod.deathSkill).name)}). 물러나라`);
  return parts.join(', ');
}

function poolMods(data: GuideData): MonsterModDef[] {
  return data.content.packRanks.pool.map((choice: RankModChoice): MonsterModDef => {
    const found: MonsterModDef | undefined = data.content.monsterMods.get(choice.mod);
    if (found === undefined) throw new Error(`no monster mod ${choice.mod}`);
    return found;
  });
}

function rarityName(data: GuideData, id: string): string {
  const found: RarityDef | undefined = data.content.rarities.find((rarity: RarityDef): boolean => rarity.id === id);
  if (found === undefined) throw new Error(`the guide names the unknown rarity ${id}`);
  return found.name;
}

function bossOf(data: GuideData): { readonly monster: MonsterDef; readonly boss: BossDef } {
  const found: MonsterDef = monster(data, COMBAT_PAGE.boss);
  if (found.boss === null) throw new Error(`${found.id} is not a boss`);
  return { monster: found, boss: found.boss };
}

function phaseSkills(data: GuideData, phase: BossPhase): SkillDef[] {
  return phase.skills.map((entry): SkillDef => skill(data, entry.skill));
}

function phaseText(data: GuideData, phase: BossPhase, index: number, all: readonly BossPhase[]): string {
  const skills: readonly SkillDef[] = phaseSkills(data, phase);
  const before: ReadonlySet<string> = new Set<string>(index === 0 ? [] : phaseSkills(data, all[index - 1] ?? phase).map((entry: SkillDef): string => entry.id));
  const now: ReadonlySet<string> = new Set<string>(skills.map((entry: SkillDef): string => entry.id));
  const added: SkillDef[] = skills.filter((entry: SkillDef): boolean => !before.has(entry.id));
  const dropped: SkillDef[] = index === 0 ? [] : phaseSkills(data, all[index - 1] ?? phase).filter((entry: SkillDef): boolean => !now.has(entry.id));
  const when: string = index === 0 ? '처음부터' : `생명력이 ${percent(phase.below)} 아래로`;
  const what: string = added.map((entry: SkillDef): string => `<b>${esc(entry.name)}</b>: ${esc(entry.description)}`).join(' ');
  const gone: string = dropped.length === 0 ? '' : ` ${esc(list(dropped.map((entry: SkillDef): string => entry.name)))}은 더 이상 쓰지 않는다.`;
  return `${when}. ${index === 0 ? '사용하는 기술' : '추가되는 기술'}: ${what}${gone}`;
}

function typedSkills(data: GuideData, type: 'storm' | 'frost'): string[] {
  const { boss } = bossOf(data);
  const fromBoss: SkillDef[] = boss.phases.flatMap((phase: BossPhase): SkillDef[] => phaseSkills(data, phase));
  const fromMods: SkillDef[] = poolMods(data).flatMap((mod: MonsterModDef): SkillDef[] => (mod.deathSkill === null ? [] : [skill(data, mod.deathSkill)]));
  const names: string[] = [...fromBoss, ...fromMods].filter((entry: SkillDef): boolean => entry.damage.type === type).map((entry: SkillDef): string => entry.name);
  return [...new Set(names)];
}

export function gapRows(data: GuideData): string[][] {
  const gap = data.content.player.xp.gap;
  const hero: number = COMBAT_PAGE.gapHero;
  return COMBAT_PAGE.gapSteps.map((step: number): string[] => [step === 0 ? '내 레벨' : `${step}레벨 차이`, percent(gapScale(gap, hero, hero - step))]);
}

export function combatPage(data: GuideData): PageBody {
  const base = data.content.player.baseStats;
  const per = data.content.player.perLevel;
  const rules = data.content.player.resistance;
  const gap = data.content.player.xp.gap;
  const magic: PackRankDef = rank(data, 'magic');
  const rare: PackRankDef = rank(data, 'rare');
  const { monster: boss, boss: bossDef } = bossOf(data);
  const manaPerLevel: number = per.find((mod): boolean => mod.stat === 'maxMana')?.value ?? 0;
  const lifePerLevel: number = per.find((mod): boolean => mod.stat === 'maxLife')?.value ?? 0;
  return {
    kicker: '안내서',
    title: '전투의 작동 방식',
    lede: '얼마나 세게 때리는지, 얼마나 맞게 되는지, 그리고 어떤 싸움이 왜 나쁘게 흘러가는지를 결정하는 것들.',
    description: '폭풍의 잔향의 전투 작동 방식: 피해, 치명타, 방어구, 저항, 마나, 비틀거림, 경험치, 마법·희귀 무리와 첫 우두머리.',
    body: [
      section(
        'damage',
        '피해',
        [
          para(
            '쓰는 모든 스킬은 무기에서 출발한다. 한 번의 적중은 무기의 피해 범위 안에서 수치를 뽑고, 피해 보너스를 더한 뒤, 스킬이 사용하는 비율만큼을 취한다. 어떤 스킬은 자체 피해를 조금 얹기도 한다. 그 다음 그 적중은 치명타가 될 수 있다.',
            '그래서 더 좋은 무기는 주문을 포함해 모든 스킬을 강하게 만든다. 트리와 장비의 "피해"는 전부에 적용되는 보너스이고, "무기 스킬 피해"나 "번개 스킬 피해"는 그 종류의 스킬에만 적용된다.',
            `처음에는 ${decimal(base.damageMin, 0)}~${decimal(base.damageMax, 0)}의 자체 피해 범위를 가지고 시작하고, 레벨마다 조금씩 늘어난다. 무기가 훨씬 더 많이 더해준다.`,
          ),
          subsection(
            '치명타',
            para(`치명타는 적중을 배가한다. 처음에는 ${percent(base.critChance)}의 확률과 ${times(base.critMultiplier)}의 배율을 가진다. 확률은 ${capPercent(data, 'critChance')}에서 더 이상 오르지 않고, 배율에는 상한이 없다.`),
          ),
        ].join('\n'),
      ),
      section(
        'defence',
        '방어구와 저항',
        [
          para(`방어구는 받는 모든 적중에서 일정 비율을 깎는다. 처음 몇 점이 가장 크게 작용한다: 방어구 ${ARMOUR_HALF_POINT}가 ${percent(armourReduction(ARMOUR_HALF_POINT, rules.armourCap))}를 깎고, 아무리 올려도 ${percent(rules.armourCap)} 이상은 깎이지 않는다.`),
          table({ head: ['방어구', '적중마다 감소'], rows: COMBAT_PAGE.armourSamples.map((value: number): string[] => [String(value), percent(armourReduction(value, rules.armourCap))]) }),
          para(
            `폭풍과 냉기 저항은 방어구 다음에 그 종류의 적중에서 추가로 비율을 깎는다. ${percent(rules.cap)}에서 멈춘다. 만나게 될 폭풍 적중은 ${esc(list(typedSkills(data, 'storm')))}이고, 냉기는 ${esc(list(typedSkills(data, 'frost')))}이다. 나머지는 모두 평범한 물리 피해로, 방어구로만 낮출 수 있다.`,
          ),
          para(`생명력은 살아남기의 나머지 절반이다. ${decimal(base.maxLife, 0)}로 시작해 레벨마다 ${decimal(lifePerLevel, 0)}씩 오른다.`),
        ].join('\n'),
      ),
      section(
        'mana',
        '마나',
        para(
          `스킬은 마나가 든다. ${esc(skill(data, 'cleave').name)}과 ${esc(skill(data, 'dodge_roll').name)}은 들지 않는다. ${decimal(base.maxMana, 0)}로 시작해 레벨마다 ${decimal(manaPerLevel, 0)}씩 오르고, 초당 ${decimal(base.manaRegen, 1)}씩 회복된다. 2번의 마나 약병이 더 빨리 채워준다. 주문 빌드는 재사용 대기보다 마나가 훨씬 먼저 바닥나므로, 장비와 트리의 마나가 중요하다.`,
        ),
      ),
      section(
        'stagger',
        '비틀거림과 밀쳐내기',
        [
          para(
            '모든 적중은 적을 조금 밀쳐내고 잠시 비틀거리게 한다. 공격을 모으다가 비틀거린 적은 그 공격을 잃는다. 더 무거운 스킬은 더 멀리 밀고 더 오래 비틀거리게 한다: 모아서 치는 일격이나 내려찍기는 빠른 베기로는 못 멈출 큰 휘두르기를 멈출 수 있다.',
            '어떤 큰 공격은 가벼운 타격으로는 더 이상 멈출 수 없는 지점을 넘어선다. 그때는 무거운 타격만이 끊을 수 있다. 불굴의 적은 덜 비틀거리고, 우두머리는 절대 비틀거리지 않으며 맞아도 거의 움직이지 않는다.',
          ),
          note(`모으는 동작을 봐라. 공격이 클수록 모으는 시간이 길고, 떨어지기 전에 구르거나 무거운 것을 맞혀 끊는 이득이 커진다.`),
        ].join('\n'),
      ),
      section(
        'xp',
        '경험치와 레벨 차이',
        [
          para(
            `${esc(zone(data, 'hall_of_time').name)}과 ${esc(zone(data, 'keepers_gate').name)}의 적은 당신의 레벨과 같으므로, 항상 정정당당한 싸움이 앞에 놓여 있다. 위든 아래든 레벨이 멀어진 적은 경험치를 적게 준다. ${gapBand(gap, COMBAT_PAGE.gapHero)}레벨 차이까지는(성장하면 조금 더) 손실이 없고, 그 너머는 급격히 줄어든다.`,
          ),
          table({ head: ['적 레벨', '받는 경험치'], rows: gapRows(data), caption: `레벨 ${COMBAT_PAGE.gapHero} 캐릭터 기준` }),
          para(`죽으면 다음 레벨에 필요한 경험치의 ${percent(data.content.player.deathPenalty.xpPercent)}를 잃는다. 레벨 자체는 절대 내려가지 않는다.`),
        ].join('\n'),
      ),
      section(
        'packs',
        '마법·희귀 무리',
        [
          para(`대부분의 무리는 평범하다. 어떤 것은 빛난다: 마법은 파랗게, 희귀는 금빛으로. 레벨이 깊어질수록 더 많이 나온다.`),
          terms([
            [
              `<span style="color: ${esc(magic.color)}">${esc(magic.name)}</span>`,
              `처음에는 무리의 ${percent(magic.chance?.base ?? 0)} 정도, 최대 ${percent(magic.chance?.max ?? 0)}. 모든 구성원이 ${scaleLine(magic.members)}이고, 아래 목록의 특성 하나를 가진다. 아이템을 더 많이 떨어뜨린다.`,
            ],
            [
              `<span style="color: ${esc(rare.color)}">${esc(rare.name)}</span>`,
              `처음에는 무리의 ${percent(rare.chance?.base ?? 0)} 정도, 최대 ${percent(rare.chance?.max ?? 0)}. 구성원은 ${scaleLine(rare.members)}이다. 우두머리는 두 단어 이름을 가지고, ${scaleLine(rare.leader ?? rare.members)}, 특성 ${rare.leader?.mods ?? 0}개를 가지며, 항상 최소 마법 등급 이상의 아이템 ${rare.leader?.items ?? 0}개를 추가로 떨어뜨린다.`,
            ],
          ]),
          subsection('특성', bullets(poolMods(data).map((mod: MonsterModDef): string => `<b>${esc(mod.prefix)}</b>: ${modEffect(data, mod)}.`))),
        ].join('\n'),
      ),
      section(
        'boss',
        `우두머리: ${boss.name}`,
        [
          para(
            `${esc(boss.name)}은(는) 레벨 ${gateLevel(data)}에 열리는 문 너머, ${esc(zone(data, 'keepers_gate').name)}에서 기다리고 있다. 느리고, 당신을 따라오며, 생명력을 잃을수록 싸우는 방식을 두 번 바꾼다. 아무것도 모르고 만나고 싶다면 여기서 읽기를 멈춰라.`,
          ),
          bullets(bossDef.phases.map((phase: BossPhase, index: number): string => phaseText(data, phase, index, bossDef.phases))),
          para(
            `쓰러뜨릴 때마다 아이템 ${bossDef.drop.items}개를 떨어뜨리고, 각각 ${esc(rarityName(data, bossDef.drop.floor))} 등급 이상이며 골드도 준다. 처음에는 레벨의 ${percent(bossDef.firstKill?.xpShare ?? 0)}에 해당하는 경험치도 준다.`,
            `도움이 되는 것: 휩쓸기에서 계속 빠져나오고, 느려지는 바닥 안에 가만히 서 있지 말고, 붙잡는 선은 구르기로 통과하라. 각 ${link('/guide/builds/', '빌드 페이지')}에 그 빌드가 얼마나 자주 이겼는지 나와 있다.`,
          ),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
