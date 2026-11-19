import type { SaveData } from '../../sim/save.ts';
import type { CloudCopy, CloudState } from './api.ts';
import type { SyncRecord } from './sync-record.ts';

export type Side = 'local' | 'cloud';

export interface Decision {
  readonly side: Side;
  readonly reason: string;
}

export type LoadDecision = Decision | { readonly side: 'none' };

export interface LoadInput {
  readonly local: SaveData | null;
  readonly record: SyncRecord | null;
  readonly cloud: CloudState;
}

export interface ConflictInput {
  readonly local: SaveData;
  readonly current: CloudState;
  readonly overwriteCloud: boolean;
}

export function describe(save: SaveData): string {
  return `level ${save.level}, ${Math.floor(save.xp)} xp`;
}

export function compareProgress(left: SaveData, right: SaveData): number {
  return left.level !== right.level ? left.level - right.level : left.xp - right.xp;
}

function timeOf(text: string | null): number {
  const parsed: number = text === null ? Number.NaN : Date.parse(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function diverged(local: SaveData, cloud: CloudCopy, record: SyncRecord | null): Decision {
  const ahead: number = compareProgress(local, cloud.save);
  if (ahead > 0) return { side: 'local', reason: `this device is further along (${describe(local)}) than the cloud copy (${describe(cloud.save)})` };
  if (ahead < 0) return { side: 'cloud', reason: `the cloud copy is further along (${describe(cloud.save)}) than this device (${describe(local)})` };
  const localLater: boolean = timeOf(record?.savedAt ?? null) > timeOf(cloud.updatedAt);
  return localLater ? { side: 'local', reason: `both copies are at ${describe(local)}, this device saved last` } : { side: 'cloud', reason: `both copies are at ${describe(local)}, the cloud saved last` };
}

export function chooseOnLoad(input: LoadInput): LoadDecision {
  const { local, record, cloud } = input;
  if (record?.overwriteCloud === true) return local === null ? { side: 'none' } : { side: 'local', reason: '이 기기의 초기화가 아직 클라우드에 닿지 않았다' };
  if (cloud.save === null) return local === null ? { side: 'none' } : { side: 'local', reason: '클라우드에 아직 저장이 없다' };
  if (local === null) return { side: 'cloud', reason: '이 기기에는 저장이 없다' };
  const known: number = record?.revision ?? 0;
  if (cloud.revision === known && record !== null) return { side: 'local', reason: '이 기기는 클라우드와 최신 상태다' };
  if (cloud.revision > known && record !== null && !record.pending) return { side: 'cloud', reason: '클라우드에 더 새 저장본이 있고 이 기기에는 동기화되지 않은 변경이 없다' };
  return diverged(local, cloud, record);
}

export function chooseOnConflict(input: ConflictInput): Decision {
  const { local, current, overwriteCloud } = input;
  if (overwriteCloud) return { side: 'local', reason: '이 기기의 초기화가 아직 클라우드에 닿지 않았다' };
  if (current.save === null) return { side: 'local', reason: '클라우드 저장본이 사라졌다' };
  const ahead: number = compareProgress(local, current.save);
  if (ahead > 0) return { side: 'local', reason: `this device is further along (${describe(local)}) than the cloud copy (${describe(current.save)})` };
  if (ahead === 0) return { side: 'local', reason: `both copies are at ${describe(local)}` };
  return { side: 'cloud', reason: `the cloud copy is further along (${describe(current.save)}) than this device (${describe(local)})` };
}
