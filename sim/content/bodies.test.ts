import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { wearFrames, wearModel } from '../wear.ts';
import type { BodyHolder } from './bodies.ts';
import { bodyHolders, bodyProblems } from './bodies.ts';
import { loadContent } from './content.ts';
import type { Content, ItemBaseDef, MonsterDef, RigDef, ZoneDef } from './types.ts';
import { clipUrl, rigClipNames } from './clips.ts';
import { fields, items, text } from './read.ts';
import type { Fields } from './read.ts';

const content: Content = loadContent();

function shipped(asset: string): boolean {
  return existsSync(`public/${asset}`);
}

void test('every monster and npc that ships has a body file, a look whose every piece exists for its frame, and the weapons it holds', (): void => {
  const holders: BodyHolder[] = bodyHolders(content);
  assert.ok(holders.length >= content.monsters.size);
  assert.deepEqual(bodyProblems(content, holders, shipped), []);
});

void test('a missing body, a missing piece and a missing weapon are each named', (): void => {
  const brute: MonsterDef = must(content.monsters.get('unfinished_brute'), 'unfinished_brute');
  const rig: RigDef = must(content.rigs.get(brute.rig), brute.rig);
  const mail: string = wearModel(must(content.wearables.get('salvaged_mail'), 'salvaged_mail'), rig.frame);
  const maul: string = must(content.attachments.get('raider_maul'), 'raider_maul').model;
  const gone: Set<string> = new Set<string>([rig.url, mail, maul]);
  const problems: string[] = bodyProblems(content, [brute], (asset: string): boolean => !gone.has(asset));
  assert.ok(problems.some((problem: string): boolean => problem.includes('no body')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('salvaged_mail')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('mismatched_gloves')), 'the gloves share the mail model');
  assert.ok(problems.some((problem: string): boolean => problem.includes('raider_maul')));
});

void test('a head-only body with nothing worn, an unknown rig and an unknown weapon are named', (): void => {
  const brute: MonsterDef = must(content.monsters.get('unfinished_brute'), 'unfinished_brute');
  const bareContent: Content = { ...content, baseLayers: new Map<string, readonly string[]>() };
  const bare: BodyHolder = { id: 'bare', rig: brute.rig, wear: [], gear: ['no_such_weapon'] };
  const lost: BodyHolder = { id: 'lost', rig: 'no_such_rig', wear: [], gear: [] };
  const problems: string[] = bodyProblems(bareContent, [bare, lost], (): boolean => true);
  assert.deepEqual(problems, [`bare wears nothing over the head-only body of frame ${must(content.rigs.get(brute.rig), brute.rig).frame}`, 'bare holds unknown attachment no_such_weapon', 'lost uses unknown rig no_such_rig']);
});

const GLB = { jsonLength: 12, jsonStart: 20 } as const;

function clipNames(path: string): string[] {
  const file: Buffer = readFileSync(path);
  const parsed: unknown = JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8'));
  return items(fields(parsed, path)['animations'], `${path}.animations`).map((entry: unknown): string => text(fields(entry, path), 'name', path));
}

function glbJson(path: string): Fields {
  const file: Buffer = readFileSync(path);
  return fields(JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8')), path);
}

function meshNodeNames(path: string): Set<string> {
  const names: Set<string> = new Set<string>();
  for (const entry of items(glbJson(path)['nodes'], `${path}.nodes`)) {
    const node: Fields = fields(entry, path);
    if (node['mesh'] !== undefined) names.add(text(node, 'name', path));
  }
  return names;
}

function clipInterpolations(path: string): Set<string> {
  const found: Set<string> = new Set<string>();
  for (const entry of items(glbJson(path)['animations'], `${path}.animations`)) {
    for (const sampler of items(fields(entry, path)['samplers'], `${path}.samplers`)) {
      const kind: unknown = fields(sampler, path)['interpolation'];
      found.add(typeof kind === 'string' ? kind : 'LINEAR');
    }
  }
  return found;
}

void test('every wearable finds each piece it names in the model of every body frame, so no frame is left undressed', (): void => {
  const frames: string[] = wearFrames(content);
  assert.ok(frames.length > 0, 'no rig has a body frame');
  const known: Map<string, Set<string>> = new Map<string, Set<string>>();
  for (const frame of frames) {
    for (const worn of content.wearables.values()) {
      const path: string = `public/${wearModel(worn, frame)}`;
      assert.ok(existsSync(path), `${worn.id} on ${frame}: ${path} is missing`);
      const names: Set<string> = known.get(path) ?? meshNodeNames(path);
      known.set(path, names);
      assert.ok(names.size > 0, `${path} has no mesh`);
      for (const piece of [...worn.pieces, ...worn.iconWith]) assert.ok(names.has(piece), `${worn.id} on ${frame}: ${path} has no mesh named ${piece}`);
    }
  }
});

void test('no clip a rig plays is keyed with cubic splines, the one kind the loader cannot fit to a body', (): void => {
  const paths: Set<string> = new Set<string>([...content.rigs.values()].flatMap((rig: RigDef): string[] => rigClipNames(rig).map((clip: string): string => `public/${clipUrl(rig, clip)}`)));
  for (const path of paths) assert.ok(!clipInterpolations(path).has('CUBICSPLINE'), path);
});

function clipSeconds(path: string): number {
  const json: Fields = glbJson(path);
  const accessors: readonly unknown[] = items(json['accessors'], `${path}.accessors`);
  let longest: number = 0;
  for (const entry of items(json['animations'], `${path}.animations`)) {
    for (const sampler of items(fields(entry, path)['samplers'], `${path}.samplers`)) {
      const input: unknown = fields(sampler, path)['input'];
      const max: unknown = typeof input === 'number' ? fields(accessors[input], path)['max'] : undefined;
      const end: unknown = Array.isArray(max) ? max[0] : undefined;
      if (typeof end === 'number') longest = Math.max(longest, end);
    }
  }
  return longest;
}

const STRIDE = { tolerance: 0.02, footfallsPerCycle: 2 } as const;

void test('a gait that names a stride names the ground covered between two footfalls of its clip, so step sounds land with the feet', (): void => {
  let checked: number = 0;
  for (const rig of content.rigs.values()) {
    for (const gait of rig.gaits) {
      if (gait.stride === null) continue;
      const seconds: number = clipSeconds(`public/${clipUrl(rig, gait.clip)}`);
      assert.ok(seconds > 0, `${rig.id} ${gait.clip} has no length`);
      const covered: number = (gait.groundSpeed * seconds) / STRIDE.footfallsPerCycle;
      assert.ok(Math.abs(gait.stride - covered) <= covered * STRIDE.tolerance, `${rig.id} ${gait.clip}: stride ${gait.stride} but the clip covers ${covered.toFixed(3)} m a footfall`);
      checked += 1;
    }
  }
  for (const hero of content.player.heroes) assert.ok(must(content.rigs.get(hero.rig), hero.rig).gaits.every((gait): boolean => gait.stride !== null), `${hero.id} has a gait with no stride`);
  assert.ok(checked > 0);
});

const FOOTPRINT = { solid: 1, cover: 0.4 } as const;

function footprint(path: string, scale: number): number {
  const file: Buffer = readFileSync(path);
  const parsed: Fields = fields(JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8')), path);
  const accessors: readonly unknown[] = items(parsed['accessors'], `${path}.accessors`);
  let wide: number = 0;
  for (const mesh of items(parsed['meshes'], `${path}.meshes`)) {
    for (const primitive of items(fields(mesh, path)['primitives'], `${path}.primitives`)) {
      const index: unknown = fields(fields(primitive, path)['attributes'], path)['POSITION'];
      const accessor: Fields = fields(typeof index === 'number' ? accessors[index] : null, `${path}.POSITION`);
      const low: readonly unknown[] = items(accessor['min'], `${path}.min`);
      const high: readonly unknown[] = items(accessor['max'], `${path}.max`);
      for (const axis of [0, 2]) {
        const from: unknown = low[axis];
        const to: unknown = high[axis];
        if (typeof from === 'number' && typeof to === 'number') wide = Math.max(wide, (to - from) * scale);
      }
    }
  }
  return wide;
}

function bareMaterials(path: string): string[] {
  const file: Buffer = readFileSync(path);
  const parsed: Fields = fields(JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8')), path);
  const raw: unknown = parsed['materials'];
  const bare: string[] = [];
  for (const entry of raw === undefined ? [] : items(raw, `${path}.materials`)) {
    const material: Fields = fields(entry, path);
    const pbr: unknown = material['pbrMetallicRoughness'];
    const textured: boolean = pbr !== undefined && fields(pbr, path)['baseColorTexture'] !== undefined;
    const glow: unknown = material['emissiveFactor'];
    const glows: boolean = glow !== undefined && items(glow, `${path}.emissiveFactor`).some((part: unknown): boolean => typeof part === 'number' && part > 0);
    if (!textured && !glows) bare.push(text(material, 'name', path));
  }
  return bare;
}

function morphedMeshes(path: string): number {
  const file: Buffer = readFileSync(path);
  const parsed: Fields = fields(JSON.parse(file.subarray(GLB.jsonStart, GLB.jsonStart + file.readUInt32LE(GLB.jsonLength)).toString('utf8')), path);
  return (parsed['meshes'] === undefined ? [] : items(parsed['meshes'], `${path}.meshes`)).filter((mesh: unknown): boolean => items(fields(mesh, path)['primitives'], path).some((primitive: unknown): boolean => fields(primitive, path)['targets'] !== undefined)).length;
}

void test('no prop model carries morph targets, which instanced props cannot draw', (): void => {
  for (const prop of content.props.values()) assert.equal(morphedMeshes(`public/${prop.model}`), 0, `${prop.id} uses ${prop.model}, which has morph targets`);
});

void test('every prop placed in a zone or a moment dresses each untextured material in a surface, so nothing draws as a flat colour', (): void => {
  const placed: Set<string> = new Set<string>([...content.zones.values()].flatMap((zone: ZoneDef): string[] => zone.props.map((entry) => entry.prop)));
  for (const def of content.moments.defs.values()) for (const entry of def.props) placed.add(entry.prop);
  for (const id of placed) {
    const prop = must(content.props.get(id), id);
    for (const name of bareMaterials(`public/${prop.model}`)) assert.ok(prop.surfaces[name] !== undefined, `${id} leaves its ${name} material undressed`);
  }
});

void test('every moment centrepiece a metre or more across has a collider that covers it, so nobody stands on a rock pile', (): void => {
  const used: Set<string> = new Set<string>([...content.moments.defs.values()].flatMap((def) => def.props.filter((placed) => placed.blocks).map((placed) => placed.prop)));
  for (const id of used) {
    const prop = must(content.props.get(id), id);
    const wide: number = footprint(`public/${prop.model}`, prop.scale);
    if (wide < FOOTPRINT.solid) continue;
    assert.ok(prop.blockRadius > 0, `${id} is ${wide.toFixed(1)} m across but has no collider`);
    assert.ok(prop.blockRadius * 2 + prop.blockLength >= wide * FOOTPRINT.cover, `${id} is ${wide.toFixed(1)} m across but its collider spans ${(prop.blockRadius * 2 + prop.blockLength).toFixed(1)} m`);
  }
});

void test('every zone prop a metre or more across blocks over its ground outline unless the data says it can be walked over', (): void => {
  for (const zone of content.zones.values()) {
    for (const placed of zone.props) {
      if (placed.when.length > 0) continue;
      const prop = must(content.props.get(placed.prop), placed.prop);
      const wide: number = footprint(`public/${prop.model}`, prop.scale);
      if (wide < FOOTPRINT.solid || prop.solid === false || prop.walkOn) continue;
      assert.ok(prop.footprints.length >= 1, `${zone.id} places ${placed.prop}, ${wide.toFixed(1)} m across, with no ground outline`);
    }
  }
});

void test('every rock a zone scatters along its edge is a known prop with a measured footprint', (): void => {
  for (const zone of content.zones.values()) {
    for (const id of zone.outside?.edge?.props ?? []) assert.ok((content.props.get(id)?.footprints.length ?? 0) >= 1, `${zone.id} edges with ${id}, which is not a solid prop`);
  }
});

void test('every rock a zone builds its barrier from is a known prop with a measured footprint', (): void => {
  for (const zone of content.zones.values()) {
    for (const row of zone.outside?.barrier?.rows ?? []) {
      for (const id of [...row.far.props, ...row.near.props]) assert.ok((content.props.get(id)?.footprints.length ?? 0) >= 1, `${zone.id} builds its barrier from ${id}, which is not a solid prop`);
    }
  }
});

void test('every clip a rig names has its own file in the rig clip folder, and the hero dies in more than one way', (): void => {
  for (const rig of content.rigs.values()) {
    for (const clip of rigClipNames(rig)) {
      const path: string = `public/${clipUrl(rig, clip)}`;
      assert.ok(existsSync(path), `${rig.id} names clip ${clip}, but ${path} is missing`);
      assert.deepEqual(clipNames(path), [clip], path);
    }
  }
  const hero = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  assert.ok(new Set<string>(hero.clips.death).size >= 2);
  assert.ok(new Set<string>(hero.clips.hit).size >= 2);
});

void test('every skill on the bar and every monster skill has an action clip on the rig that uses it', (): void => {
  const hero = must(content.rigs.get(content.player.hero.rig), 'hero rig');
  for (const entry of content.player.skillBook) {
    const skill = must(content.skills.get(entry.skill), entry.skill);
    for (const animation of [skill.animation, ...(skill.combo?.steps ?? []).map((step: { readonly animation: string }): string => step.animation)]) assert.ok(hero.clips.actions[animation] !== undefined, `${skill.id} ${animation}`);
  }
  for (const monster of content.monsters.values()) {
    const rig = must(content.rigs.get(monster.rig), monster.rig);
    const used: string[] = [monster.skill, ...(monster.boss?.phases ?? []).flatMap((phase: { readonly skills: readonly { readonly skill: string }[] }): string[] => phase.skills.map((entry: { readonly skill: string }): string => entry.skill))];
    for (const id of used) assert.ok(rig.clips.actions[must(content.skills.get(id), id).animation] !== undefined, `${monster.id} ${id}`);
  }
});

void test('every weapon base shows a model that exists in the attachments', (): void => {
  const weapons: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === 'weapon');
  assert.ok(weapons.length >= 3);
  for (const base of weapons) {
    assert.ok(base.visual !== null, `${base.id} has no visual`);
    assert.ok(content.attachments.has(base.visual), `${base.id} visual ${base.visual} is not in attachments`);
  }
});
