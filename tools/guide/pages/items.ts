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
  maxLife: 'How much you can take before you fall.',
  maxMana: 'How much you can spend on skills before you wait.',
  lifeRegen: 'Life that comes back every second, in a fight or out of it.',
  manaRegen: 'Mana that comes back every second.',
  damageMin: 'The low end of the damage range. Adds to every hit of every skill.',
  damageMax: 'The high end of the damage range. Adds to every hit of every skill.',
  damagePercent: 'A bonus on all your damage, from every skill.',
  attackSpeed: 'How quickly you swing and shoot. Spells do not cast faster for it.',
  critChance: 'The chance that a hit is a critical strike.',
  critMultiplier: 'How much harder a critical strike lands.',
  moveSpeed: 'How fast you walk.',
  armour: 'Takes a share off every hit you take.',
  goldFind: 'More gold from every pile.',
  stormResist: 'Takes a share off storm hits, after armour.',
  frostResist: 'Takes a share off frost hits, after armour.',
};

function capNote(data: GuideData, stat: StatId): string {
  if (stat === 'armour') return `Up to ${percent(data.content.player.resistance.armourCap)} off; ${ARMOUR_HALF_POINT} armour is ${percent(armourReduction(ARMOUR_HALF_POINT, data.content.player.resistance.armourCap))}`;
  if (stat === 'stormResist' || stat === 'frostResist') return `Stops at ${percent(data.content.player.resistance.cap)}`;
  const cap: number | null = statCap(data, stat);
  if (cap === null) return '';
  if (stat === 'moveSpeed') return 'Has a top speed';
  return `Stops at ${capPercent(data, stat)}`;
}

function rarityRows(data: GuideData): string[][] {
  const total: number = data.content.rarities.reduce((sum: number, rarity: RarityDef): number => sum + rarity.weight, 0);
  return data.content.rarities.map((rarity: RarityDef): string[] => [
    `<span style="color: ${esc(rarity.color)}">${esc(rarity.name)}</span>`,
    percent(rarity.weight / total),
    rarity.affixMax === 0 ? 'None' : rarity.affixMin === rarity.affixMax ? String(rarity.affixMin) : `${rarity.affixMin} to ${rarity.affixMax}`,
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
  const slots: string[] = lean.slots.map((slot: ItemSlot): string => `${SLOT_NAMES[slot]} pieces`);
  return esc(list([...groups, ...slots]));
}

function favouredFamilies(data: GuideData, lean: DropLean): string {
  return esc(list(lean.families.map((id: string): string => familyName(data, id))));
}

function levelsOf(data: GuideData, lean: DropLean): string {
  const levels: number[] = leanZones(data.content, lean).map((zone: ZoneDef): number => zone.level);
  const low: number = Math.min(...levels);
  const high: number = Math.max(...levels);
  return low === high ? String(low) : `${low} to ${high}`;
}

function leanRows(data: GuideData): string[][] {
  return data.content.leans.map((lean: DropLean): string[] => [
    esc(`${lean.name.charAt(0).toUpperCase()}${lean.name.slice(1)}`),
    levelsOf(data, lean),
    lean.share > 1 ? favouredWeapons(data, lean) : '',
    lean.share > 1 ? favouredFamilies(data, lean) : '',
    lean.legendary > 1 ? `×${decimal(lean.legendary, 0)} legendaries` : '',
  ]);
}

function bossLine(data: GuideData): string {
  const court: DropLean | undefined = data.content.leans.find((lean: DropLean): boolean => lean.legendary > 1);
  if (court === undefined) return '';
  const floorId: string | undefined = [...data.content.monsters.values()].find((monster: MonsterDef): boolean => monster.boss !== null)?.boss?.drop.floor;
  const floor: RarityDef | undefined = data.content.rarities.find((rarity: RarityDef): boolean => rarity.id === floorId);
  const floorName: string = floor?.name.toLowerCase() ?? 'rare';
  return `In ${esc(court.name)} every legendary is ${decimal(court.legendary, 0)} times as likely as anywhere else. A boss always drops ${esc(floorName)} items or better, and there ${percent(legendaryShare(data.content, court, floor?.id ?? null))} of them are legendary, against ${percent(legendaryShare(data.content, null, floor?.id ?? null))} elsewhere.`;
}

function shareWord(data: GuideData): string {
  const shares: number[] = [...new Set(data.content.leans.filter((lean: DropLean): boolean => lean.share > 1).map((lean: DropLean): number => lean.share))];
  return shares.length === 1 ? `${decimal(shares[0] ?? 1, 1)} times` : 'several times';
}

function affixRows(data: GuideData): string[][] {
  return [...data.content.affixes.values()].map((affix: AffixDef): string[] => [
    esc(affix.label),
    esc(affix.op === 'percent' ? `more ${statLabel(affix.stat)}` : statLabel(affix.stat)),
    `+${statAmount(affix.stat, affix.op, affix.min)} to ${statAmount(affix.stat, affix.op, affix.max)}`,
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
      return [esc(base.name), String(base.minLevel), `${low} to ${high}`, speed === 0 ? '' : `${speed > 0 ? '+' : '−'}${percent(Math.abs(speed))}`, changes.length === 0 ? '' : `Cleave becomes ${esc(changes)}`];
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
    kicker: 'Guide',
    title: 'Items',
    lede: 'What you can wear, how rare things are, and what every line on an item does for you.',
    description: 'Items in The Lost Storm: slots, rarities and drop odds, every affix and weapon, the legendaries by family, where each kind drops most, and what each stat does.',
    body: [
      section(
        'slots',
        'What you wear',
        para(
          `You have ${ITEM_SLOTS.length} slots: ${esc(list(ITEM_SLOTS.map((slot: ItemSlot): string => SLOT_NAMES[slot])))}. Your weapon sets your damage range, and every skill you use starts from it, so it is the slot that matters most. Everything else adds life, armour, speed and the rest.`,
          `Every item has a level, about the level you were when it dropped. Its own lines (the ones every item of that kind has) grow by ${growth} for every level above the first, and so do its rolled lines. A drawback, such as the slower swing of a heavy weapon or the slower step of plate, stays the same at every level. A level 15 sword is a much better sword than a level 2 one.`,
        ),
      ),
      section(
        'weapons',
        'Weapons',
        [
          para(`The heavier weapons swing slower and hit harder. ${quarrel === undefined ? '' : `A crossbow turns Cleave into ${esc(quarrel.name)}, a shot.`} The damage below is for a level 1 item; it grows with the item's level.`),
          table({ head: ['Weapon', 'From level', 'Damage', 'Attack speed', 'Changes'], rows: weaponRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'rarity',
        'Rarity',
        [
          para('Most of what drops is common. Magic and rare items carry extra rolled lines on top of what every item of their kind has. Magic and rare packs drop more, and a rare leader always drops something at least magic.'),
          table({ head: ['Rarity', 'Share of drops', 'Rolled lines'], rows: rarityRows(data) }),
        ].join('\n'),
      ),
      section(
        'legendary',
        'Legendaries',
        [
          para(
            `A ${esc(legendary?.name.toLowerCase() ?? 'legendary')} item is one of a handful of named pieces, each with a power no other item has. You can wear ${legendary?.wornLimit ?? 0} at once at most. They come in ${families.length} families, ${esc(list(families.map((family: FamilyDef): string => family.name)))}, whose powers work together.`,
          ),
          table({ head: ['Family', 'Item', 'Slot', 'Power', 'Most likely in'], rows: legendaryRows(data), className: 'wide' }),
          para(`Each ${link('/guide/builds/', 'build page')} lists the legendaries made for it, what each changes, and which to chase first.`),
        ].join('\n'),
      ),
      section(
        'where',
        'Where things drop',
        [
          para(
            `Every area drops every item. Some areas lean toward certain kinds: there, each favoured kind of weapon drops about ${shareWord(data)} as often as it does elsewhere, measured against the other kinds, and a legendary from a favoured family gets the same lift. No area drops more items for it, and none drops rarer ones, except where the table says so.`,
            bossLine(data),
          ),
          table({ head: ['Area', 'Monster levels', 'Favours', 'Legendaries favoured', 'Rarer drops'], rows: leanRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'affixes',
        'Rolled lines',
        [
          para('These are the lines a magic, rare or legendary item can roll. The range is for a level 1 item; higher-level items roll higher. No item rolls the same stat twice.'),
          table({ head: ['Line', 'Gives', 'Range at level 1', 'Can appear on'], rows: affixRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'stats',
        'What each stat does',
        [
          table({ head: ['Stat', 'What it does', 'Limit'], rows: statsInPlay(data).map((stat: StatId): string[] => [esc(statLabel(stat)), esc(STAT_MEANINGS[stat]), esc(capNote(data, stat))]) }),
          para(`How damage, armour and resistances work together is on the ${link('/guide/combat/', 'combat')} page.`),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
