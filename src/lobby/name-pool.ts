import type { NameStyle } from '../../sim/content/types.ts';
import type { NameMood } from '../backend/api.ts';
import { nameProblem } from './lobby-model.ts';

export type NameBody = NameStyle;

export const MOODS: readonly NameMood[] = ['night', 'small-hours', 'dawn', 'day', 'dusk'];

export const MOOD_HOURS: { readonly dawn: number; readonly day: number; readonly dusk: number; readonly night: number; readonly smallHours: number } = { smallHours: 0, dawn: 5, day: 8, dusk: 17, night: 21 };

export const MOOD_LINES: Readonly<Record<NameMood, string>> = {
  night: '밤의 이름, 혹은 그대의 이름.',
  'small-hours': '새벽녘의 이름, 혹은 그대의 이름.',
  dawn: '새벽빛의 이름, 혹은 그대의 이름.',
  day: '낮의 이름, 혹은 그대의 이름.',
  dusk: '황혼의 이름, 혹은 그대의 이름.',
};

export const EITHER_NAMES: readonly string[] = ['Wynn', 'Rook', 'Osk', 'Ash', 'Sorrel', 'Rowan', 'Linden', 'Hollis', 'Reed', 'Wren', 'Ellery', 'Merritt'];

export const GIVEN_NAMES: Readonly<Record<NameBody, readonly string[]>> = {
  man: [
    'Tavin',
    'Garrick',
    'Bram',
    'Calder',
    'Joren',
    'Teodor',
    'Halden',
    'Corvin',
    'Edrik',
    'Tobin',
    'Aldric',
    'Anselm',
    'Arlo',
    'Aurel',
    'Baird',
    'Barnaby',
    'Bertil',
    'Casimir',
    'Cedric',
    'Clement',
    'Conrad',
    'Cormac',
    'Dunstan',
    'Egil',
    'Emeric',
    'Erland',
    'Ewan',
    'Fenwick',
    'Florian',
    'Gideon',
    'Gunnar',
    'Hale',
    'Hamish',
    'Haskel',
    'Henrik',
    'Hobb',
    'Ivo',
    'Jarek',
    'Jasper',
    'Jory',
    'Leander',
    'Lorne',
    'Lothar',
    'Lucan',
    'Magnus',
    'Mattis',
    'Merrick',
    'Milo',
    'Nevin',
    'Nils',
    'Odo',
    'Olaf',
    'Orrin',
    'Oswin',
    'Pell',
    'Piers',
    'Radek',
    'Rufus',
    'Sander',
    'Silas',
    'Stellan',
    'Stig',
    'Teague',
    'Tomas',
    'Torvald',
    'Ulf',
    'Ulric',
    'Valen',
    'Wendel',
    'Wystan',
  ],
  woman: [
    'Sefa',
    'Edda',
    'Liesl',
    'Ilse',
    'Anwen',
    'Mirel',
    'Runa',
    'Tilde',
    'Ysolde',
    'Brenna',
    'Agathe',
    'Agna',
    'Alma',
    'Aveline',
    'Beata',
    'Berit',
    'Briony',
    'Carys',
    'Clara',
    'Clemence',
    'Dagny',
    'Dorte',
    'Elin',
    'Elske',
    'Embla',
    'Ester',
    'Fenna',
    'Gisela',
    'Greta',
    'Gwen',
    'Helka',
    'Hester',
    'Hilde',
    'Ida',
    'Imke',
    'Inga',
    'Jessamy',
    'Jutta',
    'Katrin',
    'Kerensa',
    'Lenka',
    'Linnea',
    'Lisbet',
    'Lotte',
    'Mabyn',
    'Maren',
    'Marit',
    'Merle',
    'Nell',
    'Nessa',
    'Oda',
    'Orla',
    'Petra',
    'Ragna',
    'Rhosyn',
    'Saskia',
    'Signe',
    'Sigrid',
    'Tamsin',
    'Thora',
    'Tova',
    'Ulla',
    'Una',
    'Wenna',
    'Wilda',
    'Zora',
  ],
};

export const BYNAMES: Readonly<Record<NameMood, readonly string[]>> = {
  night: ['Lantern', 'Starling', 'Nightjar', 'Moonley', 'Owlett', 'Darkmere', 'Blackwell', 'Hallow', 'Murrow', 'Starrow', 'Mothley', 'Nightly'],
  'small-hours': ['Vigil', 'Wake', 'Hush', 'Stillman', 'Candle', 'Lowe', 'Watchman', 'Hollow', 'Greylock', 'Sleepless', 'Waking', 'Lately'],
  dawn: ['Morrow', 'Lark', 'Dewhurst', 'Dawnley', 'Early', 'Mornay', 'Greymorn', 'Linnet', 'Dayspring', 'Ashby', 'Brightwell', 'Firstwood'],
  day: ['Hayward', 'Fairfield', 'Sunley', 'Fletcher', 'Thatcher', 'Miller', 'Tanner', 'Whitlock', 'Meadow', 'Cooper', 'Fieldman', 'Haywood'],
  dusk: ['Evensong', 'Vesper', 'Eventide', 'Ashdown', 'Greyling', 'Duskin', 'Embers', 'Gloaming', 'Sundown', 'Lowfield', 'Endicott', 'Rookhaven'],
};

export interface PickedName {
  readonly name: string;
  readonly mood: NameMood | null;
}

export function moodAt(hour: number): NameMood {
  if (hour >= MOOD_HOURS.night) return 'night';
  if (hour >= MOOD_HOURS.dusk) return 'dusk';
  if (hour >= MOOD_HOURS.day) return 'day';
  if (hour >= MOOD_HOURS.dawn) return 'dawn';
  return hour >= MOOD_HOURS.smallHours ? 'small-hours' : 'night';
}

export function nameKey(name: string): string {
  return name.toLowerCase().replaceAll(' ', '');
}

function fits(name: string): readonly string[] {
  return nameProblem(name) === null ? [name] : [];
}

export function givenFor(body: NameBody | null): readonly string[] {
  return body === null ? EITHER_NAMES : [...GIVEN_NAMES[body], ...EITHER_NAMES];
}

export function localNames(body: NameBody | null, mood: NameMood): readonly string[] {
  return givenFor(body).flatMap((given: string): readonly string[] => BYNAMES[mood].flatMap((byname: string): readonly string[] => fits(`${given} ${byname}`)));
}

export function nearNames(typed: string, mood: NameMood): readonly string[] {
  return BYNAMES[mood].flatMap((byname: string): readonly string[] => fits(`${typed} ${byname}`));
}

export function drawFree(names: readonly string[], random: () => number, refused: ReadonlySet<string>): string | null {
  const open: readonly string[] = names.filter((name: string): boolean => !refused.has(nameKey(name)));
  if (open.length === 0) return null;
  return open[Math.min(open.length - 1, Math.floor(random() * open.length))] ?? null;
}
