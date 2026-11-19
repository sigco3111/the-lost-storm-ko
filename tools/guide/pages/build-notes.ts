import type { GuideData } from '../data.ts';
import { guideData, item, path, place, skill } from '../data.ts';
import {
  affixLine,
  afterRouteText,
  bossLevels,
  bossSpeedRank,
  carelessBossShare,
  carelessDeaths,
  deathWords,
  groupNeeds,
  groupWeapons,
  manaWeapons,
  modShare,
  placeLevel,
  speedRank,
  steadyBossShare,
  steadyBossLife,
  steadyDeaths,
  weaponNames,
} from '../facts.ts';
import { esc, percent } from '../html.ts';
import type { BuildNotes } from './build-page.ts';
import { buildName } from './build-page.ts';

function name(data: GuideData, id: string): string {
  return esc(place(data, id).name);
}

function skillName(data: GuideData, id: string): string {
  return esc(skill(data, id).name);
}

function pathName(data: GuideData, id: string): string {
  return esc(path(data, id).name);
}

function tank(data: GuideData): BuildNotes {
  const id: string = 'bulwark';
  const keystone: number = placeLevel(data, id, 'the_unmoved');
  const slow: string = percent(modShare(data, 'the_unmoved', 'moveSpeed'));
  const armour: string = percent(modShare(data, 'the_unmoved', 'armour'));
  const heave: number = placeLevel(data, id, 'heaving_cleave');
  const [first = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: null,
    forWho: '큰 무기와 느리고 무거운 일격을 원하고, 모든 싸움에서 살아 걸어 나오고 싶은 플레이어를 위해.',
    plays: [
      `무리 한가운데 서서 불타게 놔둬라. 잿불 파수꾼은 화염과 생명력, 방어구의 길인 ${pathName(data, 'stone')}(을)를 걷는다. 손에는 ${groupNeeds(data, 'heavy')}: 길의 모든 장소는 그것을 쥐고 있을 때만 반응한다. 죽이기 어려워질 때까지는 피해에 적게 쓰고, 나중에는 무리 전체를 때리는 스킬을 위해 ${pathName(data, 'echo')}(으)로 넘어간다.`,
      `${skillName(data, 'thunderclap')}이(가) 첫 포인트다: 무리가 당신을 에워싸면 땅을 내리쳐라. 모두 뒤로 날아가 비틀거리며 불붙는다. ${skillName(data, 'held_breath')}은(는) 레벨 ${placeLevel(data, id, 'stone_held_breath')}에 온다. 둘러싸였거나 큰 적이 공격을 모을 때 써라: 주변의 모든 것이 기어가듯 느려지고 당신은 아니다.`,
      `레벨 ${placeLevel(data, id, 'shoulder_through')}에 ${name(data, 'shoulder_through')}(이)가 구르기를 화염 폭발로 끝나는 돌진으로 바꾸므로, 무리에서 빠져나가는 길이 곧 한 방이 된다. ${skillName(data, 'banked_fire')}은(는) 레벨 ${placeLevel(data, id, 'stone_banked_fire')}에 온다: 적들이 머무를수록 매초 더 뜨겁게 타는, 당신 주위의 불.`,
      `레벨 ${heave}에 ${name(data, 'heaving_cleave')}(이)가 ${skillName(data, 'cleave')}을(를) 모을 수 있게 해준다: 놓으면 한 번의 무거운 휩쓸기가 앞의 모든 것을 멀리 날린다. 이어서 레벨 ${placeLevel(data, id, 'stone_fire_burst')}에 ${skillName(data, 'fire_burst')}: 닿는 거리에서 가장 큰 적을 위한 가까운 화염 강타.`,
      `레벨 ${keystone}에 ${name(data, 'the_unmoved')}을(를) 찍는다: 방어구 ${armour} 증가, 생명력과 피해도 늘고, 이동은 ${slow} 느려진다. 빠르기를 포기하는 대신, 위험도 포기하게 된다.`,
    ],
    lean: [
      `모은 ${skillName(data, 'cleave')}에 의지하라. ${name(data, 'heaving_cleave')}의 모은 휩쓸기는 빠른 베기보다 훨씬 세게 때리고 무리를 당신에게서 떨쳐낸다.`,
      `${skillName(data, 'thunderclap')}은(는) 피해용이 아니라 휩쓸기를 모으는 동안 맞지 않게 해주는 수단이다. ${skillName(data, 'banked_fire')}을(를) 붙이고 그 안에 서 있어라: 점화 직후에는 약하고 끝날 때쯤 두 배로 뜨겁다. ${skillName(data, 'held_breath')}은(는) 대기가 기니 싸움이 뒤집히는 순간을 위해 아껴둬라.`,
    ],
    lookFor: [
      `중량 무기: ${weaponNames(groupWeapons(data, 'heavy'))}. 더 느리게 휘두르고 훨씬 세게 때려서, 모은 휩쓸기에 잘 맞는다.`,
      affixLine(data, 'hale'),
      affixLine(data, 'vital'),
      affixLine(data, 'plated'),
      affixLine(data, 'sturdy'),
      affixLine(data, 'mending'),
    ],
    avoid: [
      `중량 무기가 아닌 모든 무기. 도검, 지팡이, 쇠뇌를 쥐면 ${pathName(data, 'stone')}은(는) 생명력, 방어구, 화염은 유지하지만 무기에 주는 피해는 사라지고, ${name(data, 'heaving_cleave')}와 ${name(data, 'shoulder_through')}이(가) 스킬을 바꾸지 못하며, 스킬 트리에서 그 줄에 취소선이 그어진다.`,
      '장비에서 생명력이나 방어구를 피해와 맞바꾸는 것. 피해는 트리가 나중에 준다. 장비는 당신을 서 있게 한다.',
      '빠른 적을 지도 가로질러 쫓아가는 것. 오게 둬라.',
    ],
    legendaries: [
      { item: 'groundbreaker', changes: `무리를 향한 휘두르기마다 ${skillName(data, 'thunderclap')}이(가) 터지고, 그 안에 오래 설수록 더 잘 다치지 않는다.` },
      { item: 'anvilback_hauberk', changes: `모은 강타가 양쪽으로 때린다: 앞의 휩쓸기와 사방의 ${skillName(data, 'thunderclap')}, 닿은 적마다 방어구를 준다.` },
      { item: 'bellwether_helm', changes: '맞는 것이 무기가 된다. 무리 속에 서 있으면 투구가 대신 응수한다.' },
    ],
    chase: `무기라서 방어구 슬롯을 잡아먹지 않고, 항상 누르는 ${skillName(data, 'cleave')}에서 ${skillName(data, 'thunderclap')}이(가) 나온다.`,
    strengths: [
      `생존. 측정에서 차분하게 플레이하면 ${deathWords(steadyDeaths(data, id))}, 부주의하게 플레이하면 ${deathWords(carelessDeaths(data, id))}.`,
      `실수를 해도 이기는 우두머리전. 부주의하게 플레이해도 레벨 ${first} 우두머리와의 싸움에서 ${percent(carelessBossShare(data, id, first))}를 이겼다.`,
    ],
    weakSpots: [
      `빠른 우두머리전. 레벨 ${first} 우두머리를 ${bossSpeedRank(data, id, first)} 잡은 빌드다: 이기긴 하지만 시간을 들인다.`,
      '도망치거나 멀리서 던지는 적. 천천히 걸어가야 한다.',
    ],
    thin: [
      `게임에는 엄밀한 양손 무기가 없다. 중량 무기란 철퇴, 대형 망치, 대검이다: 더 느리게 휘두르고 더 세게 때린다.`,
      '시뮬레이션 플레이어는 항상 중량 무기가 아니라 피해와 생존을 가장 올려주는 장비를 입으므로, 여기 수치는 무기가 아니라 경로에 대한 것이다.',
    ],
    marks: {
      stone_thunderclap: '첫 포인트. 첫 싸움부터 공간을 벌어준다.',
      tempered_body: '초반 생명력과 생명력 재생. 여기서부터 빌드가 단단해지기 시작한다.',
      shoulder_through: '구르기가 화염으로 끝나는 돌진이 된다.',
      stone_banked_fire: '적들이 머무는 동안 점점 뜨거워지는, 당신 주위의 불.',
      heaving_cleave: '휘두르기를 모아 큰 휩쓸기로. 빌드는 여기서 시작된다.',
      the_unmoved: `방어구 ${armour} 증가, 생명력·피해 증가, 이동 ${slow} 감소.`,
      worn_groove: '여기서부터 경로는 범위 피해로 향한다.',
    },
    afterRoute: afterRouteText(data, id, '생명력과 범위를 더. 여기 너머에 당신을 더 약하게 만드는 것은 없다.'),
  };
}

function whirlwind(data: GuideData): BuildNotes {
  const id: string = 'whirlwind';
  const whirl: number = placeLevel(data, id, 'whirling_cleave');
  const endless: number = placeLevel(data, id, 'endless_turn');
  const wake: number = placeLevel(data, id, 'long_wake');
  const undertow: number = placeLevel(data, id, 'wind_downdraught');
  const riptide: number = placeLevel(data, id, 'riptide');
  const race: number = placeLevel(data, id, 'blade_millrace');
  const echoes: number = placeLevel(data, id, 'twice_swung');
  const wheel: string = skillName(data, 'cleave_millwheel');
  const millwheel: string = esc(item(data, 'the_millwheel').name);
  const [first = 0, second = 0, top = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: wheel,
    forWho: '멈추지 않고 무리 속을 회전하며 지나가고, 무리를 끌어가두고, 싸움으로부터 생명을 빨아들이고 싶은 플레이어를 위해.',
    plays: [
      `소용돌이 빌드는 ${pathName(data, 'blade')}을(를) 걷는다. 손에는 ${groupNeeds(data, 'blade')}: 회전과 그 주변 스킬들이 그것을 쥐고 있을 때 더 강해진다. 레벨 ${whirl}에 ${name(data, 'whirling_cleave')}(이)가 ${skillName(data, 'cleave')}을(를) 주위 모든 것을 때리는 완전한 회전으로 바꾼다. 레벨 ${endless}에 ${name(data, 'endless_turn')}(이)가 그것을 ${wheel}(으)로 바꾼다: 누르고 있으면 달리면서 계속 회전한다.`,
      `${wheel}(이)가 때리는 적마다 탄력이 쌓인다: 더 빨리 회전하고, 더 넓게 닿고, 어떤 것도 당신을 넘어뜨리지 못한다. 바로 다음의 ${name(data, 'millstone')}은(는) 탄력이 더 높이 쌓이게 하고 피해가 생명으로 돌아오는 비율을 두 배 이상으로 올리므로, 무리 속 회전이 당신을 서 있게 한다.`,
      `레벨 ${undertow}에 ${skillName(data, 'downdraught')}을(를) 배운다: 조준한 곳에 소용돌이가 생겨 무리를 한데 끌어모아, 한 회전이 전부를 때린다.`,
      `레벨 ${riptide}에 구르기가 ${skillName(data, 'dodge_roll_riptide')}(으)로 바뀐다: 더 긴 구르기로 착지한 곳에 이안류를 남겨 무리를 당신 뒤로 끌어들인다. 레벨 ${race}에 ${skillName(data, 'millrace')}을(를) 배운다: ${wheel}을(를) 놓아 그 탄력을 하나의 파도로 던져 무리를 꿰뚫는다. 오래 모을수록 더 세게, 더 넓게, 더 멀리 나가고 닿은 모든 것을 더 오래 기절시킨다. 무리에 던진 뒤, 멈춰 선 사이 회전으로 지나가라. 그 후부터 ${wheel}(이)가 적 넷을 때릴 때마다 각 물약에 충전 하나가 돌아온다.`,
      `레벨 ${wake}의 ${name(data, 'long_wake')}은(는) 마지막 타격 후 탄력을 더 오래 유지해 다음 무리까지 이어준다. 그 앞에는 쇠뇌 장소인 ${name(data, 'racing_cloud')}이(가) 있다: 도검으로는 이동 속도만 주며, 경로는 그 너머를 위해 지나간다.`,
      `레벨 ${echoes}에 경로는 ${name(data, 'twice_swung')}을(를) 위해 ${pathName(data, 'echo')}(으)로 넘어간다. 모은 회전은 메아리치지 않는다. 대신 매 회전 더 세게 때린다.`,
    ],
    lean: [
      `${wheel}은(는) 누르고 있는 버튼이다. 적중마다 마나가 조금 돌아오고 허공 회전은 마나만 쓰니, 적 사이를 돌지 말고 적 속을 돌아라.`,
      `무기를 휘두르는 스킬이라 무기 피해가 당신 피해의 대부분이다. 경로에서 "무기 스킬", "피해", "공격 속도"라고 적힌 모든 장소가 매 회전을 더 세게 또는 더 빨리 만든다.`,
      `전설 도검 ${millwheel}은(는) ${name(data, 'endless_turn')}보다 한참 전에 그것만으로 ${skillName(data, 'cleave')}을(를) ${wheel}(으)로 만든다. 도검이므로 쥐고 있는 동안 ${pathName(data, 'blade')}의 모든 장소가 그대로 유효하다.`,
    ],
    lookFor: [
      `더 느려지지 않으면서 피해가 높은 도검: ${weaponNames(groupWeapons(data, 'blade'))}. 피해 범위부터 봐라.`,
      affixLine(data, 'quick'),
      affixLine(data, 'honed'),
      affixLine(data, 'fleet'),
      affixLine(data, 'hale'),
      affixLine(data, 'jagged'),
    ],
    avoid: [
      `도검이 아닌 모든 무기. 중량 무기, 지팡이, 쇠뇌를 쥐면 ${skillName(data, 'cleave')}이(가) 회전을 멈추고 ${wheel}은(는) 사라지며, ${pathName(data, 'blade')}은(는) ${skillName(data, 'downdraught')}, ${skillName(data, 'millrace')}, 생명력, 속도는 유지하지만 무기 피해는 사라진다.`,
      '멈추는 것. 탄력은 마지막 적중 직후 사라지고, 식은 상태에서 시작한 회전은 느리다.',
    ],
    legendaries: [
      { item: 'the_millwheel', changes: `${skillName(data, 'cleave')}이(가) 달리면서 누르고 있는 회전이 되어, 휘두르려고 멈출 일이 없다.` },
      { item: 'gyre_stitched_breeches', changes: `회전이 무리를 끌어들이고, 세 번째 회전마다 중심에서 ${skillName(data, 'thunderclap')}이(가) 터진다.` },
      { item: 'grinders_bracers', changes: '베고 있는 적이 많을수록 더 빠르고 세게 때린다.' },
    ],
    chase: `다른 둘도 ${skillName(data, 'cleave_whirl')}과(와) 함께 작동하지만, 물레방아야말로 그 둘이 만들어진 회전이다: 누르고 있는 동안 끝나지 않는다.`,
    strengths: [
      '무리. 매 회전이 주위 모든 것을 때리고, 많이 때릴수록 더 빨리 돈다.',
      `레벨링. 레벨 ${second}에 ${speedRank(data, id, second)} 도달한 빌드였다.`,
      '이동. 달리면서 계속 회전하므로, 이 무리와 다음 무리가 한 번의 싸움이다.',
      `성장한 뒤의 우두머리. 레벨 ${top}에서 차분하게 플레이해 ${percent(steadyBossShare(data, id, top))}를 이겼고, 평균 생명력 ${percent(steadyBossLife(data, id, top))}가 남았다.`,
    ],
    weakSpots: [
      `초반 우두머리. 레벨 ${first}에서 차분하게 ${percent(steadyBossShare(data, id, first))}, 부주의하게 ${percent(carelessBossShare(data, id, first))}를 이겼다: 우두머리는 적 하나고, 무리용 회전은 하나에서 탄력이 잘 안 쌓인다.`,
      `실수. 당신과 일격 사이에 막아줄 것이 적다: 부주의하게 플레이하면 ${deathWords(carelessDeaths(data, id))}.`,
    ],
    thin: [],
    marks: {
      heavy_hands: '초반 최대의 피해 장소.',
      whirling_cleave: '빌드는 여기서 시작된다.',
      endless_turn: `당신의 회전이 ${wheel}(이)가 된다.`,
      millstone: '더 많은 탄력, 피해가 생명으로 돌아오는 비율 증가.',
      blade_millrace: `${wheel}을(를) 놓아 탄력을 무리를 기절시키는 하나의 파도로 소비한다.`,
      racing_cloud: '쇠뇌 장소: 도검으로는 이동 속도만 준다. 다음 장소로 이어진다.',
      long_wake: '한 무리에서 다음 무리까지 이어지는 탄력.',
      twice_swung: '모은 회전은 메아리치지 않고 대신 더 세게 때린다.',
    },
    afterRoute: afterRouteText(data, id, '더 많은 피해와 더 많은 이동 수단.'),
  };
}

function caster(data: GuideData): BuildNotes {
  const id: string = 'stormcaller';
  const lance: number = placeLevel(data, id, 'storm_lance');
  const twice: number = placeLevel(data, id, 'twice_told_bolt');
  const keystone: number = placeLevel(data, id, 'eye_of_the_storm');
  const lifeCut: string = percent(modShare(data, 'eye_of_the_storm', 'maxLife'));
  const bolt: string = skillName(data, 'storm_bolt');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: null,
    forWho: '거리를 두고 싸우며 번개가 일하게 하고 싶은 플레이어를 위해.',
    plays: [
      `폭풍소환사는 ${pathName(data, 'storm')}을(를) 걷는다. 손에는 ${groupNeeds(data, 'staff')}: 길의 거의 모든 장소가 그것을 쥐고 있을 때만 반응하며, 다른 무기로는 번개 장소들이 생명력과 마나만 남기고 피해를 잃는다. 첫 포인트는 ${bolt}. 그 후로 그것이 누르는 버튼이다.`,
      `${name(data, 'forked_bolt')}(이)가 곧 매 시전마다 더 많은 벼락을 던지게 하고, ${skillName(data, 'squall')}도 일찍 온다: 무리가 오는 곳에 깔아두면 계속 시전하는 동안 그 아래 모든 것을 0.5초마다 때린다.`,
      `레벨 ${lance}에 ${name(data, 'storm_lance')}(이)가 ${bolt}을(를) 바꾼다: 그 길 위의 모든 것을 한꺼번에 때리는 곧은 번개 한 줄. 레벨 ${twice}에 ${name(data, 'twice_told_bolt')}(이)가 두 번째 형태를 준다: 잠시 뒤 메아리가 같은 길을 따라 나는 벼락. ${bolt}은(는) 둘 중 하나를 쓴다: 스킬 트리의 그 장소 카드에서, 또는 스킬 바의 스킬을 우클릭(폰에서는 길게 누르기)해 골라라.`,
      `레벨 ${keystone}에 ${name(data, 'eye_of_the_storm')}을(를) 찍는다. 생명력의 ${lifeCut}을(를) 대가로 내고 번개가 훨씬 강해진다. ${skillName(data, 'standing_storm')}은(는) 레벨 ${placeLevel(data, id, 'standing_thunder')}에 온다: 무리가 닿는 순간을 위한, 닿는 적마다 당신을 치유하는 주위의 폭풍. 이어서 ${name(data, 'static_step')}: 구르기가 더 빨리 돌아오고 더 멀리 데려간다.`,
    ],
    lean: [
      `${bolt}은(는) 시전마다 마나를 조금 쓴다. 당신의 한계는 대기가 아니라 마나다. 경로에서 마나를 올리는 장소들이 이를 위해 있고, 2번의 마나 물약도 그렇다.`,
      `스킬은 여전히 무기 피해를 더하므로 피해가 높은 지팡이도 도움이 된다. 초반에는 마나를 올리는 지팡이가 더 도움이 된다.`,
      `줄 지어 오는 무리에는 ${name(data, 'storm_lance')}, 큰 적 하나에는 ${name(data, 'twice_told_bolt')}. 둘 사이는 공짜로 언제든 바꿀 수 있다.`,
    ],
    lookFor: [
      `지팡이: ${weaponNames(groupWeapons(data, 'staff'))}. 마나를 올려주는 것이 가장 도움이 된다: ${weaponNames(manaWeapons(data))}.`,
      affixLine(data, 'brimming'),
      affixLine(data, 'clear'),
      affixLine(data, 'honed'),
      affixLine(data, 'hale'),
      affixLine(data, 'grounded'),
    ],
    avoid: [
      `지팡이가 아닌 모든 무기. ${bolt}은(는) 여전히 시전되고 ${name(data, 'storm_lance')}도 바꾸지만, ${pathName(data, 'storm')}이(가) 피해를 더하지 않고 ${name(data, 'twice_told_bolt')}(이)가 바꾸지 못하며, 스킬 트리에서 그 줄에 취소선이 그어진다.`,
      '장비의 공격 속도. 주문은 그것으로 더 빨리 시전되지 않는다.',
      `무리 안에 서 있는 것. ${name(data, 'storm_lance')}은(는) 직선이다: 물러서서 적들이 그 선을 따라 오게 해라.`,
    ],
    legendaries: [
      { item: 'crown_of_the_struck_hour', changes: `모든 ${skillName(data, 'storm_bolt')}이(가) 둘이 된다: 벼락과, 처음 닿은 적에서 나가는 ${skillName(data, 'forkline')}.` },
      { item: 'lantern_of_second_sounds', changes: '번개가 무리 더 깊이 닿고, 가장 강한 일격이 첫 적이 아닌 마지막 적에게 떨어진다.' },
      { item: 'rainmaker', changes: `깔아두는 ${skillName(data, 'squall')}마다 당신 위에도 쏟아져 폭풍이 함께 움직이고, 남긴 모든 범위가 더 오래 지속된다.` },
    ],
    chase: `${skillName(data, 'storm_bolt')}은(는) 가장 많이 누르는 버튼이고, 왕관은 그 하나하나를 ${skillName(data, 'forkline')}(으)로도 만든다.`,
    strengths: [
      `한쪽에서 몰려오는 무리. ${name(data, 'storm_lance')}이(가) 그 줄 전체를 때린다.`,
      `빌드가 갖춰진 뒤의 우두머리. 레벨 ${second} 우두머리를 ${bossSpeedRank(data, id, second)} 잡은 빌드였다.`,
    ],
    weakSpots: [
      '긴 싸움에서 마나가 마르는 것. 마른 뒤가 아니라 마르기 전에 마나 물약을 마셔라.',
      `붙잡히는 것. ${name(data, 'eye_of_the_storm')}을(를) 찍으면 생명력이 적다. 부주의하게 플레이하면 레벨 ${first} 우두머리와의 싸움에서 ${percent(carelessBossShare(data, id, first))}만 이겼다.`,
      '사방에서 한꺼번에 오는 적. 빠져나와 다시 한쪽에 모으면 된다.',
    ],
    thin: [],
    marks: {
      storm_storm_bolt: '첫 포인트, 이제부터 당신의 주 스킬.',
      storm_lance: '빌드는 여기서 시작된다.',
      eye_of_the_storm: `생명력의 ${lifeCut}을(를) 훨씬 큰 번개 피해와 맞바꾸는 곳.`,
      rolling_thunder: `이 빌드에 없는 ${skillName(data, 'thunderclap')}을(를) 바꾸는 장소. 경로는 핵심 장소로 가는 길에 지나간다.`,
      twice_told_bolt: `${bolt}의 두 번째 형태. 이 장소 카드에서 쓸 것을 골라라.`,
      standing_thunder: '때리면서 당신을 치유하는, 주위의 폭풍.',
    },
    afterRoute: afterRouteText(data, id, '더 많은 번개와 마나, 여전히 지팡이 위에서.'),
  };
}

function echoer(data: GuideData): BuildNotes {
  const id: string = 'echo-weaver';
  const echoes: number = placeLevel(data, id, 'twice_swung');
  const forked: number = placeLevel(data, id, 'forked');
  const keystone: number = placeLevel(data, id, 'twice_remembered');
  const brand: number = placeLevel(data, id, 'blade_static_brand');
  const fork: string = skillName(data, 'forkline');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: '주 공격',
    forWho: '무엇을 쥐든 모든 일격이 두 번 닿기를 원하는 플레이어를 위해.',
    plays: [
      `${pathName(data, 'echo')}은(는) 무기를 요구하지 않고 속성도 없다: 쥐고 있는 것을 그대로 따라간다. 첫 포인트는 ${fork}, 적에서 적으로 튀는 번개. 바로 다음의 ${name(data, 'first_echo')}은(는) 모든 범위 스킬을 더 오래, 더 세게 한다.`,
      `레벨 ${echoes}에 ${name(data, 'twice_swung')}(이)가 주 공격을 두 번 일어나게 한다: 닿은 잠시 뒤, 그 메아리가 절반의 피해로 같은 방식으로 다시 때린다. 주 공격은 무기가 만드는 그대로다: 도검이나 중량 무기의 ${skillName(data, 'cleave')}와 회전, 쇠뇌의 ${skillName(data, 'quarrel')}, 지팡이의 ${skillName(data, 'storm_bolt')}. 모은 회전은 메아리치지 않고 대신 더 세게 때린다.`,
      `레벨 ${forked}에 ${name(data, 'forked')}(이)가 주 공격의 적중마다 맞은 적에서 ${fork}을(를) 던지게 한다. 레벨 ${keystone}에 ${name(data, 'twice_remembered')}(은)는 모든 피해 조금을 더 크고 오래가는 범위 스킬과 ${skillName(data, 'held_breath')}의 짧은 대기로 맞바꾼다.`,
      `${skillName(data, 'static_brand')}은(는) 레벨 ${brand}에 온다: 처음 닿은 적에게 낙인을 새기고, 그 적에 대한 다음 적중이 낙인을 주위 모든 것 위로 터뜨린다. 주 공격이 두 번 때리니 낙인이 오래 기다리는 일은 드물다.`,
    ],
    lean: [
      '주 공격이 누르고 있는 버튼이다. 모든 메아리가 공짜로 한 번 더 때리고 모든 적중이 갈래 번개를 던질 수 있으니, 무리가 이 빌드가 가장 강한 곳이다.',
      `무리에서 가장 큰 적에 ${skillName(data, 'static_brand')}을(를) 새기고 때려라: 폭발이 나머지를 덮친다.`,
      `이 경로의 마지막 장소들은 ${fork}의 번개를 위해 ${pathName(data, 'storm')}에서 온다. 어떤 무기로도 작동하지만, 무기 피해 줄은 ${groupNeeds(data, 'staff')}에만 반응한다.`,
    ],
    lookFor: [
      '지금 쥔 종류의 더 좋은 무기. 메아리가 그 피해를 복사한다.',
      affixLine(data, 'honed'),
      affixLine(data, 'keen'),
      affixLine(data, 'brimming'),
      affixLine(data, 'hale'),
      affixLine(data, 'vital'),
    ],
    avoid: [
      '매 싸움마다 무기를 바꾸는 것. 모든 스킬이 어떤 무기로도 작동하지만, 각 무기 계열의 스킬은 자기 무기로 더 강하고 무기 피해 줄은 그것에만 반응한다.',
      `적 하나에 ${fork}을(를) 던지는 것. 무리가 올 때까지 잠시 기다려라.`,
    ],
    legendaries: [
      { item: 'wirethread_gloves', changes: `메아리가 죽인 적이 ${skillName(data, 'forkline')}을(를) 던지므로, 죽기 시작한 무리는 계속 죽는다.` },
      { item: 'lantern_of_second_sounds', changes: `던지는 ${skillName(data, 'forkline')}마다 더 멀리 튀고 연쇄의 끝에서 가장 세게 때린다.` },
      { item: 'crown_of_the_struck_hour', changes: `지팡이를 쥐면 각 ${skillName(data, 'storm_bolt')}이(가) ${skillName(data, 'forkline')}(으)로도 갈라진다.` },
    ],
    chase: '어떤 무기를 쥐든 메아리 자체에 반응하는 유일한 부위다.',
    strengths: [
      `사냥 속도. 레벨 ${second}에 ${speedRank(data, id, second)} 도달한 빌드였다.`,
      `우두머리. 레벨 ${second} 우두머리를 ${bossSpeedRank(data, id, second)} 잡았고, 차분하게 플레이해 레벨 ${first} 싸움의 ${percent(steadyBossShare(data, id, first))}를 이겼다.`,
      '아무 무기나. 다음 좋은 드롭이 지팡이가 아니라 쇠뇌여도 메아리는 계속 작동한다.',
    ],
    weakSpots: [
      `마나. ${fork}은(는) 시전마다 마나를 쓴다. 마르기 전에 마나 물약을 마셔라.`,
      `초반 실수. 부주의하게 플레이하면 레벨 ${first} 우두머리와의 싸움에서 ${percent(carelessBossShare(data, id, first))}만 이겼다.`,
    ],
    thin: [
      '이 페이지의 수치를 만든 시뮬레이션 플레이어는 한 종류가 아니라 수치를 가장 올려주는 무기를 들므로, 수치는 한 무기가 아니라 경로에 대한 것이다.',
    ],
    marks: {
      echo_forkline: `첫 포인트: ${fork}.`,
      twice_swung: '여기서부터 주 공격이 두 번 일어난다.',
      forked: `주 공격의 모든 적중이 ${fork}을(를) 던질 수 있다.`,
      twice_remembered: '모든 피해 조금을 더 크고 오래가는 범위 스킬로.',
      blade_static_brand: '다시 때리면 터지는 낙인.',
      thunder_in_the_bones: `여기서 경로는 ${fork}을(를) 강하게 하는 ${pathName(data, 'storm')}(으)로 향한다. 이 장소들은 지팡이가 필요하다.`,
    },
    afterRoute: afterRouteText(data, id, '더 많은 번개와 마나, 손에 쥔 지팡이를 위해.'),
  };
}

function windrunner(data: GuideData): BuildNotes {
  const id: string = 'windrunner';
  const keystone: number = placeLevel(data, id, 'never_still');
  const armourCut: string = percent(modShare(data, 'never_still', 'armour'));
  const quarrel: string = skillName(data, 'quarrel');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: skill(data, 'quarrel').name,
    forWho: '원거리에서 싸우고, 무리 사이를 빠져나와 그림자 속에서 쏘아대는 것을 좋아하는 플레이어를 위해.',
    plays: [
      `밤의 사수는 ${pathName(data, 'wind')}을(를) 걷는다. 손에는 ${groupNeeds(data, 'crossbow')}: ${skillName(data, 'cleave')}을(를) ${quarrel}(으)로 바꾼다. 길의 거의 모든 장소가 그것을 쥐고 있을 때만 반응한다. 첫 포인트는 ${skillName(data, 'ghost_wave')}: 줄 전체를 굴러가는 창백한 파도.`,
      `${name(data, 'shadow_veil')}은(는) 레벨 ${placeLevel(data, id, 'shadow_veil')}에 온다: 구르기 후 2초 동안 사격이 더 세게 때리고 적 하나를 더 꿰뚫는다. 레벨 ${placeLevel(data, id, 'slip_through')}에 ${name(data, 'slip_through')}(이)가 구르기를 조준한 곳으로 그림자를 가로지르는 걸음으로 바꾸고, 구르기처럼 당신을 가린다.`,
      `${skillName(data, 'umbra')}은(는) 레벨 ${placeLevel(data, id, 'wind_umbra')}에 온다: 그 안의 적이 약한 피해를 주는, 당신 주위의 그림자. 레벨 ${keystone}에 ${name(data, 'never_still')}을(를) 찍는다: 더 빠른 공격과 발걸음, 이동 기술의 짧은 대기, 그리고 방어구 ${armourCut} 감소.`,
      `레벨 ${placeLevel(data, id, 'fanned_shot')}에 ${name(data, 'fanned_shot')}(이)가 ${quarrel}을(를) 앞길 가득 펼쳐지는 부채꼴 화살로 바꾸고, 레벨 ${placeLevel(data, id, 'heavy_shot')}에 ${name(data, 'heavy_shot')}(이)가 두 번째 형태를 준다: 모았다 놓는 무거운 화살 한 발. ${quarrel}은(는) 한 번에 하나를 쓴다: 스킬 트리의 그 장소 카드에서, 또는 스킬 바의 스킬을 우클릭(폰에서는 길게 누르기)해 골라라.`,
    ],
    lean: [
      `구르고, 쏴라. ${skillName(data, 'quarrel')}은(는) 구르기나 걸음 직후 2초에 가장 강하니 자주 움직이고 바로 쏴라.`,
      `무리의 선을 따라 ${skillName(data, 'ghost_wave')}(으)로 시작하고, 적들이 닿으면 ${skillName(data, 'umbra')}을(를) 깔아라.`,
    ],
    lookFor: [
      `쇠뇌: ${weaponNames(groupWeapons(data, 'crossbow'))}.`,
      affixLine(data, 'quick'),
      affixLine(data, 'honed'),
      affixLine(data, 'hale'),
    ],
    avoid: [
      `쇠뇌가 아닌 모든 무기. 쇠뇌가 없으면 ${quarrel}은(는) 다시 ${skillName(data, 'cleave')}(이)가 되고, ${pathName(data, 'wind')}은(는) 생명력, 속도, ${skillName(data, 'ghost_wave')}, ${skillName(data, 'umbra')}은(는) 유지하지만 사격에 주는 피해는 사라진다.`,
      '가만히 서 있는 것. 장막은 움직인 뒤에만 작동한다.',
      '핵심 장소를 메우려는 방어구. 생명력이 더 큰 도움이 된다.',
    ],
    legendaries: [
      { item: 'quietshot', changes: '쏘기 전 구르기가 장비의 어떤 옵션보다 가치 있고, 화살 하나가 적 한 줄을 꿰뚫는다.' },
      { item: 'nightjar_gloves', changes: `구를 때마다 다음 사격이 세 발의 부채꼴이 되므로, 무리 속 구르기가 곧 공격이다.` },
      { item: 'longsight_coat', changes: '훨씬 먼 곳에서 쏘고, 닿아오는 것은 다시 날려보낸다.' },
      { item: 'mist_treader_boots', changes: `더 자주 구르고, 구를 때마다 ${skillName(data, 'downdraught')}을(를) 남긴다. 어떤 빌드든 신을 수 있지만 이 빌드가 가장 많이 구른다.` },
    ],
    chase: '무기이고, 나머지 부위는 모두 그것이 보상하는 구르기 위에 쌓인다. 전설은 세 점까지 착용할 수 있으니, 조용한 사수 세 부위를 모두 갖추면 장화는 벗어라.',
    strengths: [
      `시작 속도. 레벨 ${first}에 ${speedRank(data, id, first)} 도달한 빌드였다.`,
      '위험 탈출. 이만큼 많이, 자주 움직이는 빌드는 없다.',
      `성장한 뒤의 우두머리. 차분하게 플레이해 레벨 ${second} 싸움의 ${percent(steadyBossShare(data, id, second))}를 이겼다.`,
    ],
    weakSpots: [
      `레벨 ${first} 우두머리. 차분하게 플레이해도 그 싸움의 ${percent(steadyBossShare(data, id, first))}만 이겼다. 가기 전에 레벨을 조금 더 올려라.`,
      '빠져나올 수 없는 싸움. 자리에 묶이면 낮은 방어구가 드러난다.',
    ],
    thin: [],
    marks: {
      wind_ghost_wave: '첫 포인트: 무리의 선을 따라 굴러가는 파도.',
      shadow_veil: '이제 구를 때마다 다음 사격이 강해진다.',
      slip_through: '이제 구르기가 조준한 곳으로 간다.',
      never_still: `모든 것이 빨라지고, 방어구 ${armourCut} 감소.`,
      fanned_shot: `${quarrel}이(가) 부채꼴 화살을 쏜다.`,
      heavy_shot: `${quarrel}의 두 번째 형태. 이 장소 카드에서 쓸 것을 골라라.`,
    },
    afterRoute: afterRouteText(data, id, '돌 길에서 생명력을 더: 방어구를 포기한 빌드에 대한 정답.'),
  };
}

export function buildNotes(data: GuideData): readonly BuildNotes[] {
  return [caster(data), tank(data), whirlwind(data), windrunner(data), echoer(data)];
}

export const BUILD_NOTES: readonly BuildNotes[] = buildNotes(guideData());
