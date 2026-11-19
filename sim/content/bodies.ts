import type { Look } from '../wear.ts';
import { lookOf, wearModel } from '../wear.ts';
import type { Content, RigDef, WearableDef } from './types.ts';

export interface BodyHolder {
  readonly id: string;
  readonly rig: string;
  readonly wear: readonly string[];
  readonly gear: readonly string[];
}

export function bodyHolders(content: Content): BodyHolder[] {
  return [...content.monsters.values(), ...content.npcs.values()];
}

export function bodyProblems(content: Content, holders: readonly BodyHolder[], exists: (asset: string) => boolean): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  for (const holder of holders) {
    const rig: RigDef | undefined = content.rigs.get(holder.rig);
    need(rig !== undefined, `${holder.id} uses unknown rig ${holder.rig}`);
    if (rig === undefined) continue;
    need(exists(rig.url), `${holder.id} has no body: ${rig.url} is missing`);
    const look: Look = lookOf(content, holder.rig, holder.wear, null);
    need(rig.frame === '' || look.wearables.length > 0, `${holder.id} wears nothing over the head-only body of frame ${rig.frame}`);
    for (const id of look.wearables) {
      const worn: WearableDef | undefined = content.wearables.get(id);
      need(worn !== undefined, `${holder.id} wears unknown wearable ${id}`);
      if (worn !== undefined) need(exists(wearModel(worn, rig.frame)), `${holder.id} wears ${id}, but ${wearModel(worn, rig.frame)} is missing`);
    }
    for (const part of look.hidden) need(look.wearables.some((id: string): boolean => content.wearables.get(id)?.hides.includes(part) ?? false), `${holder.id} hides ${part} with nothing worn over it`);
    for (const id of holder.gear) {
      const model: string | undefined = content.attachments.get(id)?.model;
      need(model !== undefined, `${holder.id} holds unknown attachment ${id}`);
      if (model !== undefined) need(exists(model), `${holder.id} holds ${id}, but ${model} is missing`);
    }
  }
  return problems;
}
