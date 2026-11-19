import type { AffixDef, DropLean, MonsterDef, FamilyDef, ItemBaseDef, ItemSlot, RarityDef, SkillDef, StatId, WeaponGroup, ZoneDef } from '../../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../../sim/content/types.ts';
import { statLabel } from '../../../sim/stat-text.ts';
import { ARMOUR_HALF_POINT, armourReduction } from '../../../sim/stats.ts';
import type { GuideData } from '../data.ts';
import { capPercent, SLOT_NAMES, statAmount, statCap } from '../facts.ts';
import { decimal, esc, link, list, para, percent, section, table } from '../html.ts';
import { familyPieces, leanWeapons, leanZones, legendaryShare, placesFor } from '../legendaries.ts';
import { whereLikely } from './build-page.ts';
import type { PageBody } from '../layout.ts';

const STAT_MEANINGS: Readonly<Record<StatId, string>> = {
  maxLife: '쓰러지기 전까지 버틸 수 있는 양.',
  maxMana: '기다리기 전까지 스킬에 쓸 수 있는 양.',
  lifeRegen: '싸우는 중이든 아니든 매초 돌아오는 생명력.',
  manaRegen: '매초 돌아오는 마나.',
  damageMin: '피해 범위의 낮은 쪽. 모든 스킬의 모든 적중에 더해진다.',
  damageMax: '피해 범위의 높은 쪽. 모든 스킬의 모든 적중에 더해진다.',
  damagePercent: '모든 스킬의 모든 피해에 적용되는 보너스.',
  attackSpeed: '휘두르고 쏘는 속도. 주문은 이것으로 더 빨리 시전되지 않는다.',
  critChance: '적중이 치명타가 될 확률.',
  critMultiplier: '치명타가 얼마나 더 세게 떨어지는지.',
  moveSpeed: '걷는 속도.',
  armour: '받는 모든 적중에서 일정 비율을 깎는다.',
  goldFind: '모든 더미에서 더 많은 골드.',
  stormResist: '방어구 다음에 폭풍 적중에서 비율을 깎는다.',
  frostResist: '방어구 다음에 냉기 적중에서 비율을 깎는다.',
};

function capNote(data: GuideData, stat: StatId): string {
  if (stat === 'armour') return `최대 ${percent(data.content.player.resistance.armourCap)}까지 감소; 방어구 ${ARMOUR_HALF_POINT}가 ${percent(armourReduction(ARMOUR_HALF_POINT, data.content.player.resistance.armourCap))}`;
  if (stat === 'stormResist' || stat === 'frostResist') return `${percent(data.content.player.resistance.cap)}에서 멈춤`;
  const cap: number | null = statCap(data, stat);
  if (cap === null) return '';
  if (stat === 'moveSpeed') return '최고 속도가 있음';
  return `${capPercent(data, stat)}에서 멈춤`;
}

function rarityRows(data: GuideData): string[][] {
  const total: number = data.content.rarities.reduce((sum: number, rarity: RarityDef): number => sum + rarity.weight, 0);
  return data.content.rarities.map((rarity: RarityDef): string[] => [
    `<span style="color: ${esc(rarity.color)}">${esc(rarity.name)}</span>`,
    percent(rarity.weight / total),
    rarity.affixMax === 0 ? '없음' : rarity.affixMin === rarity.affixMax ? String(rarity.affixMin) : `${rarity.affixMin}~${rarity.affixMax}`,
  ]);
}

function familyName(data: GuideData, id: string): string {
  return data.content.families.get(id)?.name ?? '';
}

function legendaryRows(data: GuideData): string[][] {
  return [...data.content.families.values()].flatMap((family: FamilyDef): string[][] =>
    familyPieces(data.content, family.id).map((base: ItemBaseDef): string[] => [esc(familyName(data, family.id)), `<b>${esc(base.name)}</b>`, base.slot === null ? '' : SLOT_NAMES[base.slot], esc(base.power?.text ?? ''), esc(whereLikely(placesFor(data.content, base)))]),
  );
}

function favouredWeapons(data: GuideData, lean: DropLean): string {
  const groups: string[] = leanWeapons(data.content, lean).map((group: WeaponGroup): string => group.needs);
  const slots: string[] = lean.slots.map((slot: ItemSlot): string => `${SLOT_NAMES[slot]} 부위`);
  return esc(list([...groups, ...slots]));
}

function favouredFamilies(data: GuideData, lean: DropLean): string {
  return esc(list(lean.families.map((id: string): string => familyName(data, id))));
}

function levelsOf(data: GuideData, lean: DropLean): string {
  const levels: number[] = leanZones(data.content, lean).map((zone: ZoneDef): number => zone.level);
  const low: number = Math.min(...levels);
  const high: number = Math.max(...levels);
  return low === high ? String(low) : `${low}~${high}`;
}

function leanRows(data: GuideData): string[][] {
  return data.content.leans.map((lean: DropLean): string[] => [
    esc(`${lean.name.charAt(0).toUpperCase()}${lean.name.slice(1)}`),
    levelsOf(data, lean),
    lean.share > 1 ? favouredWeapons(data, lean) : '',
    lean.share > 1 ? favouredFamilies(data, lean) : '',
    lean.legendary > 1 ? `전설 ×${decimal(lean.legendary, 0)}` : '',
  ]);
}

function bossLine(data: GuideData): string {
  const court: DropLean | undefined = data.content.leans.find((lean: DropLean): boolean => lean.legendary > 1);
  if (court === undefined) return '';
  const floorId: string | undefined = [...data.content.monsters.values()].find((monster: MonsterDef): boolean => monster.boss !== null)?.boss?.drop.floor;
  const floor: RarityDef | undefined = data.content.rarities.find((rarity: RarityDef): boolean => rarity.id === floorId);
  const floorName: string = floor?.name ?? '희귀';
  return `${esc(court.name)}에서는 모든 전설 아이템이 다른 곳보다 ${decimal(court.legendary, 0)}배 잘 나온다. 우두머리는 항상 ${esc(floorName)} 등급 이상의 아이템을 떨어뜨리고, 그중 전설 비율은 ${percent(legendaryShare(data.content, court, floor?.id ?? null))}로 다른 곳의 ${percent(legendaryShare(data.content, null, floor?.id ?? null))}와 비교된다.`;
}

function shareWord(data: GuideData): string {
  const shares: number[] = [...new Set(data.content.leans.filter((lean: DropLean): boolean => lean.share > 1).map((lean: DropLean): number => lean.share))];
  return shares.length === 1 ? `${decimal(shares[0] ?? 1, 1)}배` : '몇 배';
}

function affixRows(data: GuideData): string[][] {
  return [...data.content.affixes.values()].map((affix: AffixDef): string[] => [
    esc(affix.label),
    esc(statLabel(affix.stat)),
    `+${statAmount(affix.stat, affix.op, affix.min)}~${statAmount(affix.stat, affix.op, affix.max)}`,
    esc(list(affix.slots.map((slot: ItemSlot): string => SLOT_NAMES[slot]))),
  ]);
}

function statsInPlay(data: GuideData): StatId[] {
  const seen: Set<StatId> = new Set<StatId>();
  for (const affix of data.content.affixes.values()) seen.add(affix.stat);
  for (const base of data.content.itemBases.values()) for (const mod of base.implicit) seen.add(mod.stat);
  return [...seen];
}

function weaponRows(data: GuideData): string[][] {
  return [...data.content.itemBases.values()]
    .filter((base: ItemBaseDef): boolean => base.slot === 'weapon' && base.dropWeight > 0 && base.power === null)
    .toSorted((a: ItemBaseDef, b: ItemBaseDef): number => a.minLevel - b.minLevel)
    .map((base: ItemBaseDef): string[] => {
      const low: number = base.implicit.find((mod): boolean => mod.stat === 'damageMin')?.value ?? 0;
      const high: number = base.implicit.find((mod): boolean => mod.stat === 'damageMax')?.value ?? 0;
      const speed: number = base.implicit.find((mod): boolean => mod.stat === 'attackSpeed')?.value ?? 0;
      const changes: string = base.variants.map((variant): string => data.content.skills.get(variant.becomes)?.name ?? '').filter((name: string): boolean => name.length > 0).join(', ');
      return [esc(base.name), String(base.minLevel), `${low} to ${high}`, speed === 0 ? '' : `${speed > 0 ? '+' : '−'}${percent(Math.abs(speed))}`, changes.length === 0 ? '' : `휘두르기가 ${esc(changes)}(으)로`];
    });
}

function powered(data: GuideData): RarityDef | undefined {
  return data.content.rarities.find((rarity: RarityDef): boolean => rarity.powers);
}

export function itemsPage(data: GuideData): PageBody {
  const legendary: RarityDef | undefined = powered(data);
  const families: readonly FamilyDef[] = [...data.content.families.values()];
  const growth: string = percent(data.content.itemScaling.implicitPerLevel);
  const quarrel: SkillDef | undefined = data.content.skills.get('quarrel');
  return {
    kicker: '안내서',
    title: '아이템',
    lede: '무엇을 입을 수 있는지, 얼마나 드문지, 그리고 아이템의 각 옵션이 무엇을 해주는지.',
    description: '폭풍의 잔향의 아이템: 슬롯, 등급과 드롭 확률, 모든 부여 옵션과 무기, 가문별 전설 아이템, 각 종류가 잘 나오는 곳, 각 능력치의 역할.',
    body: [
      section(
        'slots',
        '착용 슬롯',
        para(
          `슬롯은 ${ITEM_SLOTS.length}개: ${esc(list(ITEM_SLOTS.map((slot: ItemSlot): string => SLOT_NAMES[slot])))}. 무기가 피해 범위를 정하고 쓰는 모든 스킬이 거기서 출발하므로 가장 중요한 슬롯이다. 나머지는 생명력, 방어구, 속도 등을 더한다.`,
          `모든 아이템에는 레벨이 있고, 대략 떨어졌을 때의 당신의 레벨이다. 고유 옵션(그 종류의 모든 아이템이 가진 것)은 첫 레벨 이후 레벨마다 ${growth}씩 커지고, 부여 옵션도 마찬가지다. 중량 무기의 느린 휘두르기나 판금의 느린 걸음 같은 단점은 레벨과 관계없이 같다. 15레벨 검은 2레벨 검보다 훨씬 좋은 검이다.`,
        ),
      ),
      section(
        'weapons',
        '무기',
        [
          para(`무거운 무기일수록 느리게 휘두르고 더 세게 때린다. ${quarrel === undefined ? '' : `쇠뇌는 휘두르기를 사격인 ${esc(quarrel.name)}(으)로 바꾼다.`} 아래 피해는 1레벨 아이템 기준이며, 아이템 레벨에 따라 커진다.`),
          table({ head: ['무기', '등장 레벨', '피해', '공격 속도', '변경'], rows: weaponRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'rarity',
        '등급',
        [
          para('떨어지는 것의 대부분은 일반 등급이다. 마법·희귀 아이템은 그 종류가 공통으로 가진 것 위에 추가 부여 옵션을 얹는다. 마법·희귀 무리는 더 많이 떨어뜨리고, 희귀 우두머리는 항상 최소 마법 등급 이상을 떨어뜨린다.'),
          table({ head: ['등급', '드롭 비율', '부여 옵션 수'], rows: rarityRows(data) }),
        ].join('\n'),
      ),
      section(
        'legendary',
        '전설 아이템',
        [
          para(
            `${esc(legendary?.name ?? '전설')} 아이템은 각각 다른 아이템에 없는 고유한 힘을 가진 몇 안 되는 이름 있는 장비다. 최대 ${legendary?.wornLimit ?? 0}개까지 동시에 착용할 수 있다. 힘이 서로 맞물리는 ${families.length}개 가문, ${esc(list(families.map((family: FamilyDef): string => family.name)))}으로 나뉜다.`,
          ),
          table({ head: ['가문', '아이템', '슬롯', '고유 힘', '잘 나오는 곳'], rows: legendaryRows(data), className: 'wide' }),
          para(`각 ${link('/guide/builds/', '빌드 페이지')}에 그 빌드를 위한 전설 아이템, 각각이 바꾸는 것, 먼저 노릴 것이 정리되어 있다.`),
        ].join('\n'),
      ),
      section(
        'where',
        '드롭 지역',
        [
          para(
            `모든 지역에서 모든 아이템이 나온다. 어떤 지역은 특정 종류를 더 선호한다: 그곳에서는 선호 무기 종류가 다른 종류와 비교해 약 ${shareWord(data)} 더 자주 나오고, 선호 가문의 전설 아이템도 같은 혜택을 받는다. 그렇다고 아이템이 더 많이 나오거나 더 높은 등급이 나오는 지역은 없다. 표에 적힌 경우만 예외다.`,
            bossLine(data),
          ),
          table({ head: ['지역', '몬스터 레벨', '선호 무기', '선호 전설', '높은 등급'], rows: leanRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'affixes',
        '부여 옵션',
        [
          para('마법·희귀·전설 아이템에 붙을 수 있는 옵션들이다. 범위는 1레벨 아이템 기준이고, 높은 레벨 아이템은 더 높게 붙는다. 같은 능력치가 두 번 붙는 아이템은 없다.'),
          table({ head: ['옵션', '효과', '1레벨 범위', '붙는 부위'], rows: affixRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'stats',
        '각 능력치의 역할',
        [
          table({ head: ['능력치', '역할', '한계'], rows: statsInPlay(data).map((stat: StatId): string[] => [esc(statLabel(stat)), esc(STAT_MEANINGS[stat]), esc(capNote(data, stat))]) }),
          para(`피해, 방어구, 저항이 어떻게 함께 작동하는지는 ${link('/guide/combat/', '전투')} 페이지에 있다.`),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
