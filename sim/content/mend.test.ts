import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { mendProblems, reachesAllies, skillMend } from './mend.ts';
import type { BossDef, BossPhase, Content, MonsterDef, SkillDef } from './types.ts';

const content: Content = loadContent();
const pulse: SkillDef = must(content.skills.get('mending_pulse'), 'mending_pulse');
const clap: SkillDef = must(content.skills.get('thunderclap'), 'thunderclap');

function withSkills(...skills: readonly SkillDef[]): Content {
  return { ...content, skills: new Map<string, SkillDef>([...content.skills, ...skills.map((skill: SkillDef): [string, SkillDef] => [skill.id, skill])]) };
}

void test('a mend reads its flat life and its share of most life, and must restore something', (): void => {
  assert.equal(skillMend(undefined, 's.mend'), null);
  assert.deepEqual(skillMend({ flat: 10 }, 's.mend'), { flat: 10, lifeShare: 0 });
  assert.deepEqual(skillMend({ lifeShare: 0.2 }, 's.mend'), { flat: 0, lifeShare: 0.2 });
  assert.throws(() => skillMend({}, 's.mend'), /restore some life/);
  assert.throws(() => skillMend({ flat: -1 }, 's.mend'), /zero or more/);
  assert.throws(() => skillMend({ lifeShare: 1.5 }, 's.mend'), /from 0 to 1/);
});

void test('a nova strikes foes unless it says it reaches allies, and Mending Pulse is a nova that reaches allies and mends', (): void => {
  assert.deepEqual(clap.delivery, { type: 'nova', radius: clap.delivery.type === 'nova' ? clap.delivery.radius : 0, side: 'foes' });
  assert.ok(!reachesAllies(clap));
  assert.equal(clap.mend, null);
  assert.ok(reachesAllies(pulse));
  assert.deepEqual(pulse.mend, { flat: 10, lifeShare: 0.12 });
  assert.equal(pulse.damage.weaponPercent + pulse.damage.flatMax, 0);
});

void test('the shipped content has no mend problems, and a skill-tree node unlocks Mending Pulse', (): void => {
  assert.deepEqual(mendProblems(content), []);
  assert.ok(content.skillTree.some((node): boolean => node.unlock === 'mending_pulse'));
});

void test('a mend needs a nova that reaches allies, an allies nova needs a mend, and a mend neither echoes nor leaps', (): void => {
  const empty: SkillDef = { ...pulse, id: 'test_empty', mend: null };
  const struck: SkillDef = { ...clap, id: 'test_struck', mend: { flat: 5, lifeShare: 0 } };
  const echoed: SkillDef = { ...pulse, id: 'test_echoed', echo: 0.5 };
  const leaping: SkillDef = { ...pulse, id: 'test_leaping', leap: { distance: 4, stopShort: 0.5, airTime: 0.2, lane: false } };
  assert.deepEqual(mendProblems(withSkills(empty, struck, echoed, leaping)), [
    'skill test_empty reaches allies but mends nothing',
    'skill test_struck mends, but only a nova that reaches allies can carry a mend',
    'skill test_echoed mends, and a mend cannot echo',
    'skill test_leaping mends, and a mend cannot leap',
  ]);
});

void test('no monster attacks or bursts with a heal', (): void => {
  const thrall: MonsterDef = must(content.monsters.get('mended'), 'mended');
  const healer: MonsterDef = { ...thrall, id: 'test_healer', skill: 'mending_pulse', deathSkill: 'mending_pulse' };
  const changed: Content = { ...content, monsters: new Map<string, MonsterDef>([...content.monsters, [healer.id, healer]]) };
  assert.deepEqual(mendProblems(changed), ['monster test_healer attacks with mending_pulse, which only mends allies', 'monster test_healer bursts with mending_pulse, which only mends allies']);
});

void test('no boss phase casts a heal, from its weighted skills or its measure', (): void => {
  const lord: MonsterDef = must([...content.monsters.values()].find((monster: MonsterDef): boolean => monster.boss !== null), 'a boss');
  const boss: BossDef = must(lord.boss, 'boss');
  const phase: BossPhase = must(boss.phases[0], 'first phase');
  const mending: BossPhase = { ...phase, below: 0.5, skills: [...phase.skills, { skill: 'mending_pulse', weight: 1 }], measure: ['mending_pulse'] };
  const healer: MonsterDef = { ...lord, id: 'test_mending_boss', boss: { ...boss, phases: [mending] } };
  const changed: Content = { ...content, monsters: new Map<string, MonsterDef>([...content.monsters, [healer.id, healer]]) };
  const problem: string = 'boss test_mending_boss casts mending_pulse below 0.5, which only mends allies';
  assert.deepEqual(mendProblems(changed), [problem, problem]);
});
