import type { ItemBaseDef } from '../../sim/content/types.ts';
import { hasPicture } from '../../sim/pictures.ts';
import { el } from './dom.ts';
import { iconSvg } from './icons.ts';

export const PICTURE_ARRIVE = {
  stepMs: 50,
  steps: 6,
} as const;

export function arrivalOrder(uid: number): number {
  return uid % PICTURE_ARRIVE.steps;
}

export function setPicture(target: HTMLElement, image: string | null, base: ItemBaseDef | null, arrival: number | null = null): void {
  if (image === null) {
    if (hasPicture(base)) target.replaceChildren();
    else target.innerHTML = iconSvg(base === null ? '' : base.icon);
    return;
  }
  const picture: HTMLImageElement = el('img', arrival === null ? 'item-picture tick' : 'item-picture arrive', null);
  if (arrival !== null) picture.style.setProperty('--arrive-delay', `${arrival * PICTURE_ARRIVE.stepMs}ms`);
  picture.src = image;
  picture.alt = '';
  picture.draggable = false;
  picture.decoding = 'sync';
  target.replaceChildren(picture);
}
