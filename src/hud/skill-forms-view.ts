import type { PressDef } from '../../sim/content/shape-types.ts';
import type { Content, SkillDef, WeaponGroup } from '../../sim/content/types.ts';
import { formsText, skillForms } from '../../sim/skill-forms.ts';
import type { SkillForms } from '../../sim/skill-forms.ts';
import { weaponGroup } from '../../sim/weapons.ts';
import { el, label } from './dom.ts';
import { familyMark } from './weapon-family.ts';

export const FORMS_WORDS = {
  anyWeapon: '모든 무기',
  channel: '누르고 있으면 계속된다',
  channelMoving: '누르고 있으면 계속된다. 누른 채로 움직일 수 있다',
} as const;

export function pressLine(press: PressDef | null): string | null {
  if (press === null) return null;
  if (press.hint !== null) return press.hint;
  switch (press.type) {
    case 'charge':
      return `눌러서 모으기, 최대 ${press.max.toFixed(1)}초 후 놓기`;
    case 'channel':
      return press.move > 0 ? FORMS_WORDS.channelMoving : FORMS_WORDS.channel;
  }
  return null;
}

export interface FormRow {
  readonly family: WeaponGroup | null;
  readonly text: string;
  readonly held: boolean;
}

export function formRows(content: Content, base: string, wielding: string | null): FormRow[] {
  return skillForms(content, base).map((forms: SkillForms): FormRow => {
    const family: WeaponGroup | null = forms.family === null ? null : weaponGroup(content, forms.family);
    return { family, text: `${family?.name ?? FORMS_WORDS.anyWeapon}: ${formsText(content, forms)}`, held: family !== null && family.id === wielding };
  });
}

export function formFamilies(content: Content, base: string): WeaponGroup[] {
  return formRows(content, base, null).flatMap((row: FormRow): WeaponGroup[] => (row.family === null ? [] : [row.family]));
}

export function appendForms(root: HTMLElement, content: Content, base: SkillDef | null, wielding: string | null): void {
  if (base === null) return;
  const rows: readonly FormRow[] = formRows(content, base.id, wielding);
  if (rows.length === 0) return;
  const block: HTMLDivElement = el('div', 'tip-forms', root);
  label('tip-forms-title', `무기마다 ${base.name}`, block);
  for (const row of rows) {
    const line: HTMLDivElement = el('div', row.held ? 'tip-form held' : 'tip-form', block);
    if (row.family === null) el('span', 'family-mark tip-form-mark', line);
    else familyMark(row.family, 'tip-form-mark', line);
    label('tip-form-text', row.text, line);
  }
}
