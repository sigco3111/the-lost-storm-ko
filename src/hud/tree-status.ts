import type { Content, SkillTreeNodeDef, SpecialtyDef } from '../../sim/content/types.ts';
import { canAllocate, joinBlock } from '../../sim/progression.ts';
import { closingSpecialty } from '../../sim/specialty.ts';
import type { JoinBlock, RefundBlock } from '../../sim/progression.ts';
import { promptText, use } from './prompts.ts';

export const TREE_NODE_COST: number = 1;

export type TreeNodeStatus =
  | { readonly kind: 'allocated' }
  | { readonly kind: 'available' }
  | { readonly kind: 'no_points' }
  | { readonly kind: 'locked'; readonly needs: JoinBlock }
  | { readonly kind: 'closed'; readonly chosen: string };

export function treeNodeStatus(content: Content, allocated: readonly string[], skillPoints: number, node: SkillTreeNodeDef): TreeNodeStatus {
  if (allocated.includes(node.id)) return { kind: 'allocated' };
  const closing: SpecialtyDef | null = closingSpecialty(content, allocated, node);
  if (closing !== null) return { kind: 'closed', chosen: closing.name };
  const needs: JoinBlock | null = joinBlock(content, allocated, node);
  if (needs !== null) return { kind: 'locked', needs };
  return canAllocate(content, allocated, skillPoints, node.id) ? { kind: 'available' } : { kind: 'no_points' };
}

export function costLine(): string {
  return `스킬 포인트 ${TREE_NODE_COST} 소모`;
}

const SETTLED_LINES: Readonly<Record<Exclude<TreeNodeStatus['kind'], 'locked' | 'closed'>, string>> = {
  allocated: '배분됨',
  available: 'allocate',
  no_points: '쓸 수 있는 스킬 포인트가 없다',
};

const LOCKED_LINES: Readonly<Record<JoinBlock, string>> = {
  begin: '먼저 시작하는 곳에서 시작하라',
  connect: '가진 곳에 이어 붙여라',
  branch: '가장 큰 무리의 장소만 키울 수 있다',
};

export function closedLine(chosen: string): string {
  return `닫힘 · 선택: ${chosen} · 다시 고르려면 초기화`;
}

export function statusLine(status: TreeNodeStatus, touch: boolean): string {
  if (status.kind === 'locked') return LOCKED_LINES[status.needs];
  if (status.kind === 'closed') return closedLine(status.chosen);
  if (status.kind === 'available') return promptText(touch, use(SETTLED_LINES.available));
  return SETTLED_LINES[status.kind];
}

const TAKEN_LINES: Readonly<Record<RefundBlock, string>> = {
  not_held: '찍음',
  split: '찍음 · 되돌리면 그 너머의 장소가 끊긴다',
  root: '찍음 · 가진 모든 것이 여기서 자란다',
};

export function takenLine(block: RefundBlock | null): string {
  return block === null ? '찍음' : TAKEN_LINES[block];
}

export function lockedLine(status: TreeNodeStatus, steps: number, touch: boolean): string {
  const line: string = statusLine(status, touch);
  return steps > 0 && status.kind !== 'closed' ? `${line} · 밝은 경로 따라 ${steps * TREE_NODE_COST} 포인트` : line;
}

export function pointsPrompt(points: number, held: number): string {
  if (held === 0) return '시작할 곳을 골라라';
  return `${points} 포인트: 장소 선택`;
}
