import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import { heroRig } from '../../sim/hero.ts';
import type { AttachmentDef, Content, HeroDef, ItemBaseDef } from '../../sim/content/types.ts';
import type { CharacterLibrary, LoadedAttachment } from './character-library.ts';
import { groundModelReady, groundTemplate } from './ground-models.ts';

function heldLibrary(content: Content): CharacterLibrary {
  const attachments: Map<string, LoadedAttachment> = new Map<string, LoadedAttachment>();
  for (const [id, def] of content.attachments) attachments.set(id, { def, template: blade(def) });
  return { rigs: new Map(), attachments, wearables: new Map() };
}

function blade(def: AttachmentDef): Group {
  const template: Group = new Group();
  template.name = def.id;
  template.add(new Mesh(new BoxGeometry(0.1, 0.8, 0.05), new MeshStandardMaterial()));
  return template;
}

void test('a ground item counts as ready exactly when its template stops waiting for a model, for every item and both heroes', (): void => {
  const content: Content = loadContent();
  const empty: CharacterLibrary = { rigs: new Map(), attachments: new Map(), wearables: new Map() };
  const held: CharacterLibrary = heldLibrary(content);
  const heroes: readonly string[] = content.player.heroes.map((entry: HeroDef): string => entry.id);
  let checked: number = 0;
  for (const base of content.itemBases.values()) {
    for (const hero of heroes) {
      for (const library of [empty, held]) {
        if (library === held && base.ground.model === 'worn') continue;
        const rig: string = heroRig(content, hero);
        assert.equal(groundModelReady(content, library, base, rig), !groundTemplate(content, library, base, rig).waiting, `${base.id} for ${hero}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 0);
  const anyHeld: ItemBaseDef | undefined = [...content.itemBases.values()].find((base: ItemBaseDef): boolean => base.ground.model === 'held' && base.visual !== null);
  if (anyHeld !== undefined) {
    assert.equal(groundModelReady(content, empty, anyHeld, heroRig(content, null)), false);
    assert.equal(groundModelReady(content, held, anyHeld, heroRig(content, null)), true);
  }
});
