import type { BlockResult, BlocksResult } from '../backend/hideout-api.ts';

export interface BlocksState {
  readonly names: ReadonlySet<string>;
  readonly available: boolean;
  readonly loaded: boolean;
}

export const NO_BLOCKS: BlocksState = { names: new Set<string>(), available: true, loaded: false };

function keyOf(name: string): string {
  return name.trim().toLowerCase().replaceAll(' ', '');
}

export function isBlocked(state: BlocksState, name: string): boolean {
  return state.names.has(keyOf(name));
}

export function blocksFetched(state: BlocksState, result: BlocksResult): BlocksState {
  switch (result.kind) {
    case 'ok':
      return { names: new Set<string>(result.names.map(keyOf)), available: true, loaded: true };
    case 'unsupported':
      return { names: new Set<string>(), available: false, loaded: true };
    case 'failed':
      return state;
  }
  return state;
}

export function blockSettled(state: BlocksState, name: string, result: BlockResult): BlocksState {
  switch (result.kind) {
    case 'ok': {
      const names: Set<string> = new Set<string>(state.names);
      if (result.blocked) names.add(keyOf(name));
      else names.delete(keyOf(name));
      return { ...state, names };
    }
    case 'unsupported':
      return { names: new Set<string>(), available: false, loaded: true };
    case 'refused':
    case 'failed':
      return state;
  }
  return state;
}

export function blockText(result: BlockResult, name: string, blocking: boolean): string | null {
  switch (result.kind) {
    case 'ok':
      return null;
    case 'unsupported':
      return '여기서는 차단할 수 없다.';
    case 'failed':
      return blocking ? `${name} could not be blocked.` : `${name} could not be unblocked.`;
    case 'refused':
      switch (result.reason) {
        case 'own_name':
          return '그것은 그대의 캐릭터다.';
        case 'no_such_character':
          return `${name}이라는 이는 없다.`;
        case 'block_limit':
          return '차단 목록이 가득 찼다.';
      }
  }
  return null;
}
