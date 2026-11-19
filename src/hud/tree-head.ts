import { el, label } from './dom.ts';
import { TREE_NODES } from './tree-nodes.ts';

export interface TreeHead {
  readonly points: HTMLDivElement;
  readonly pointCount: HTMLSpanElement;
  readonly pointWord: HTMLSpanElement;
  readonly search: HTMLInputElement;
  readonly zoomOut: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly recentre: HTMLButtonElement;
  readonly restart: HTMLButtonElement;
}

export function createTreeHead(element: HTMLDivElement, title: string, close: () => void): TreeHead {
  element.style.setProperty('--socket', `${TREE_NODES.minor}px`);
  element.style.setProperty('--notable', `${TREE_NODES.notable}px`);
  element.style.setProperty('--keystone', `${TREE_NODES.keystone}px`);
  element.style.setProperty('--ability', `${TREE_NODES.ability}px`);
  element.style.setProperty('--ability-rim', `${TREE_NODES.abilityRim}px`);
  element.style.setProperty('--variant-rim', `${TREE_NODES.variantRim}px`);
  const head: HTMLDivElement = el('div', 'tree-head', element);
  label('tree-title', title, head);
  const points: HTMLDivElement = el('div', 'tree-points', head);
  const pointCount: HTMLSpanElement = el('span', 'tree-points-count', points);
  const pointWord: HTMLSpanElement = el('span', 'tree-points-word', points);
  const search: HTMLInputElement = el('input', 'chart-search', head);
  search.type = 'search';
  search.placeholder = '장소 찾기';
  search.setAttribute('aria-label', '스킬 트리에서 장소 찾기');
  const zoomOut: HTMLButtonElement = el('button', 'chart-zoom', head);
  zoomOut.type = 'button';
  zoomOut.textContent = '−';
  zoomOut.setAttribute('aria-label', '축소');
  const zoomIn: HTMLButtonElement = el('button', 'chart-zoom', head);
  zoomIn.type = 'button';
  zoomIn.textContent = '+';
  zoomIn.setAttribute('aria-label', '확대');
  const recentre: HTMLButtonElement = el('button', 'chart-zoom chart-centre', head);
  recentre.type = 'button';
  recentre.textContent = '중앙';
  recentre.setAttribute('aria-label', '스킬 트리를 현재 위치로 맞추기');
  const restart: HTMLButtonElement = el('button', 'chart-restart', head);
  restart.type = 'button';
  const shut: HTMLButtonElement = el('button', 'chart-close', head);
  shut.type = 'button';
  shut.textContent = '×';
  shut.setAttribute('aria-label', '스킬 트리 닫기');
  shut.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    close();
  });
  return { points, pointCount, pointWord, search, zoomOut, zoomIn, recentre, restart };
}
