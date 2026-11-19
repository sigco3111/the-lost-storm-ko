import type { ZoneExit } from '../../../sim/content/types.ts';
import type { FlaskDef } from '../../../sim/content/flasks.ts';
import type { ActionDef, SlotDefault } from '../../../src/settings/bindings.ts';
import { actionTable } from '../../../src/settings/bindings.ts';
import type { GuideData } from '../data.ts';
import { item, skill, zone } from '../data.ts';
import { bullets, esc, kbd, link, list, note, para, percent, section, seconds, subsection, table, terms } from '../html.ts';
import type { PageBody } from '../layout.ts';

const KEY_NAMES: Readonly<Record<string, string>> = {
  mouse_left: '마우스 왼쪽',
  mouse_right: '마우스 오른쪽',
  Space: '스페이스',
  Tab: 'Tab',
  Escape: 'Esc',
  AltLeft: 'Alt',
  AltRight: 'Alt',
};

export function keyName(code: string): string {
  const named: string | undefined = KEY_NAMES[code];
  if (named !== undefined) return named;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function keys(codes: readonly string[]): string {
  const names: string[] = [...new Set(codes.map(keyName))];
  return names.map(kbd).join(' or ');
}

function slotDefaults(data: GuideData): SlotDefault[] {
  return data.content.player.skillBar.map((slot): SlotDefault => ({ name: slot.skill === null ? `Skill slot ${slot.label}` : skill(data, slot.skill).name, bindings: slot.bindings }));
}

export function controlRows(data: GuideData): string[][] {
  const actions: readonly ActionDef[] = actionTable(slotDefaults(data), { flasks: data.content.flasks.length, ladder: true });
  return actions.filter((action: ActionDef): boolean => action.defaults.length > 0).map((action: ActionDef): string[] => [esc(action.label), keys(action.defaults)]);
}

function flask(data: GuideData, resource: FlaskDef['resource']): FlaskDef {
  const found: FlaskDef | undefined = data.content.flasks.find((entry: FlaskDef): boolean => entry.resource === resource);
  if (found === undefined) throw new Error(`no ${resource} flask`);
  return found;
}

function flaskLine(entry: FlaskDef, key: number): string {
  const uses: number = Math.floor(entry.maxCharges / entry.chargesPerUse);
  return `<b>${esc(entry.name)}</b>(${kbd(String(key))}): ${seconds(entry.duration)}에 걸쳐 최대치의 ${percent(entry.share)}를 회복하고, 최소 ${entry.amount}는 보장된다. 충전 ${entry.maxCharges}을 담고 한 번 마실 때 ${entry.chargesPerUse}를 쓰므로 가득 찬 약병은 ${uses}번이다. 처치할 때마다 충전 ${entry.chargesPerKill}이 돌아온다.`;
}

export function gateLevel(data: GuideData): number {
  const exit: ZoneExit | undefined = zone(data, 'hall_of_time').exits.find((entry: ZoneExit): boolean => entry.to === 'keepers_gate');
  const level: number | undefined = (exit?.requires ?? []).flatMap((condition): number[] => (condition.type === 'level' ? [condition.atLeast] : []))[0];
  if (level === undefined) throw new Error('the Last Gate has no level');
  return level;
}

function questNames(data: GuideData): string[] {
  return [...data.content.quests.values()].map((quest): string => `<b>${esc(quest.name)}</b>`);
}

function hideoutPeople(data: GuideData): string[] {
  return [...data.content.npcs.values()].map((npc): string => esc(npc.name));
}

export function startPage(data: GuideData): PageBody {
  const life: FlaskDef = flask(data, 'life');
  const mana: FlaskDef = flask(data, 'mana');
  const trade = data.content.trade;
  const penalty: string = percent(data.content.player.deathPenalty.xpPercent);
  const gate: number = gateLevel(data);
  return {
    kicker: '안내서',
    title: '시작하기',
    lede: '조작키, 처음 10분, 그리고 아무도 알려주지 않는 몇 가지.',
    description: '폭풍의 잔향 시작 방법: 데스크톱과 폰에서의 조작, 처음 10분, 약병, 은신처, 상인, 경매장, 웨이포인트와 지도.',
    body: [
      section(
        'controls',
        '조작',
        [
          para('땅을 클릭하면 그곳으로 걷는다. 적을 클릭하면 공격하고, 아이템은 줍고, 사람은 말을 걸고, 출구는 통과한다. 버튼을 누르고 있으면 계속 걷거나 계속 공격한다. Shift를 누른 채 클릭하면 움직이지 않고 제자리에서 공격한다. 마우스 휠로 확대·축소한다.'),
          table({ head: ['동작', '키'], rows: controlRows(data), caption: '새 캐릭터가 가지고 시작하는 키' }),
          para(`마우스 왼쪽 버튼, Shift, Enter를 제외한 모든 키는 ${kbd('Esc')} → 설정 → 조작에서 바꿀 수 있다. 대부분의 스킬 슬롯은 비어서 시작한다: ${link('/guide/tree/', '스킬 트리')}에서 찍은 스킬은 첫 번째 빈 슬롯에 들어간다. 순위표는 게임이 서버에 연결되어 있을 때만 열린다.`),
          subsection(
            '휴대폰에서는',
            bullets([
              '폰을 가로로 돌려라.',
              '화면 왼쪽 아무 데나 끌어서 걷거나, 땅을 눌러라.',
              '적을 누르면 공격한다. 두 손가락으로 확대·축소한다.',
              '스킬 버튼은 앞쪽의 가장 가까운 적을 조준하므로, 직접 조준할 일은 거의 없다.',
              '약병 버튼에 남은 사용 횟수가 보인다.',
              '위쪽 버튼들로 인벤토리, 캐릭터 창, 스킬 트리, 지도, 메뉴를 연다. 이름표 버튼은 Alt를 누른 것처럼 바닥의 모든 이름을 보여준다.',
            ]),
          ),
        ].join('\n'),
      ),
      section(
        'first',
        '처음 10분',
        [
          para(
            `빈손으로 ${esc(zone(data, 'between').name)}에서 깨어난다. ${esc(item(data, 'worn_journal').name)}을(를) 읽으면 무기가 나타난다: 남자는 ${esc(item(data, 'rusted_blade').name)}을(를), 여자는 ${esc(item(data, 'worn_crossbow').name)}을(를) 찾는다. 둘을 가지면 나가는 길이 열린다.`,
            `${esc(zone(data, 'hall_of_time').name)}은(는) 싸움이 있는 곳이다. ${kbd('Space')}로 구르는 법을 가르쳐 준다: ${esc(skill(data, 'dodge_roll').description)} 써라. 타이밍 맞는 구르기는 어떤 약병보다 많은 생명력을 아껴준다.`,
            '적은 무리로 몰려오고 레벨이 당신을 따라오므로, 시간의 전당은 성장하는 내내 정정당당한 싸움이다. 어딘가에서 첫 순간을 찾게 된다: 공중의 거품. 들어서면 당신을 두르고 닫히고, 안의 것들이 달려든다. 정리해야 나갈 수 있다. 일찍 나가면 사라졌다가 몇 초 뒤 다시 나타난다.',
            `첫 순간과 관리인의 첫 가르침은 각각 레벨 포인트에 더해 ${link('/guide/tree/', '스킬 트리')} 포인트를 하나씩 준다. 써라. 아껴둘 이유가 없다.`,
            `전당 동쪽에는 ${esc(zone(data, 'hideout').name)}이(가) 있다. 우두머리가 기다리는 ${esc(zone(data, 'keepers_gate').name)}(으)로 가는 길은 레벨 ${gate}까지 열리지 않는다.`,
          ),
          para(`퀘스트 순서: ${list(questNames(data))}. 금색 ${kbd('!')}이 현재 단계가 가리키는 사람이나 장소를 표시한다. 관리인에게 다시 말을 걸면 놓친 말을 다시 들려준다.`),
        ].join('\n'),
      ),
      section(
        'flasks',
        '약병',
        [
          para('누구나 같은 약병 두 개를 지닌다. 떨어뜨리지도, 가방을 차지하지도, 교체할 필요도 없다.'),
          bullets([flaskLine(life, 1), flaskLine(mana, 2)]),
          para(`이미 가득 찼을 때 약병은 아무것도 하지 않으므로 낭비되지 않는다. 사용 사이에는 ${seconds(life.cooldown)}의 간격이 있다. 은신처에 도착하거나 웨이포인트를 밟을 때마다 둘 다 가득 채워진다.`),
          note('필요해지기 전에 마셔라. 생명력은 한 번에가 아니라 몇 초에 걸쳐 찬다.'),
        ].join('\n'),
      ),
      section(
        'hideout',
        '은신처',
        [
          para(`${esc(zone(data, 'hideout').name)}은(는) 유일하게 안전한 곳이다. 적은 닿지 못한다. ${list(hideoutPeople(data))}이(가) 있고, 아이템 ${trade.stashSize}개를 넣는 보관함과 웨이포인트가 있다. 게임이 서버에 연결되어 있으면 다른 플레이어들도 보이고 대화할 수 있다: ${kbd('Enter')}를 눌러 대화하라.`),
          para(`죽으면 다음 레벨까지 필요한 경험치의 ${penalty}를 잃고(레벨 자체는 절대 내려가지 않는다) 잠시 후 돌아오며, ${seconds(data.content.player.respawnInvulnerability)} 동안은 아무것도 당신을 해칠 수 없다. 마지막으로 지난 체크포인트나 은신처 모닥불 곁에서 되살아날 수 있다.`),
        ].join('\n'),
      ),
      section(
        'trader',
        '상인',
        [
          para(`관리인 상인은 항상 당신의 레벨쯤 되는 상품 ${trade.stockSize}개를 판다. 대부분 일반이고 약간의 마법, 가끔 희귀도 있다. 다른 지역에서 돌아올 때마다 상품이 바뀌니 여행 후마다 다시 봐라.`),
          para(`상인에게 팔면 그 아이템 구매 가격의 ${percent(trade.price.sellRatio)}를 받는다. 실수로 팔았다면? 마지막으로 판 ${trade.buybackSize}개는 받은 값 그대로 되살 수 있다. 이야기에 속한 아이템은 아예 팔 수 없다.`),
        ].join('\n'),
      ),
      section(
        'auction',
        '경매장',
        [
          para('관리인 경매인이 플레이어들이 서로 팔고 사는 경매장을 운영한다. 게임이 서버에 연결되어 있고 캐릭터가 그곳에 저장되어 있어야 한다.'),
          terms([
            ['둘러보기', '판매 중인 모든 것을 슬롯, 등급, 레벨, 가격으로 거른다.'],
            ['판매', '가방의 아이템을 올린다.'],
            ['내 물건', '올린 물건과 팔린 물건.'],
            ['기록', '완료된 모든 거래.'],
          ]),
          para('세상에서 직접 찾은 것만 다른 플레이어에게 팔 수 있다. 상인에게 산 물건은 안 되고, 이야기에 속한 아이템도 안 된다. 경매인이 팔 수 없는 이유를 미리 알려준다.'),
        ].join('\n'),
      ),
      section(
        'map',
        '웨이포인트와 지도',
        [
          para(`웨이포인트를 밟으면 당신의 것이 된다: 약병을 채워주고 돌아올 수 있는 장소가 된다. 지금은 ${esc(zone(data, 'hideout').name)}에만 있다.`),
          para(`${kbd('M')}은 찾은 모든 장소의 지도를 연다. ${kbd('Tab')}은 구석의 미니맵을 전체 화면 큰 지도로 바꾸고, 미니맵을 클릭하면 그곳으로 걸어간다.`),
          para(`${kbd('Alt')}를 누르고 있으면 바닥의 모든 아이템 이름이 보인다. 클릭하기 전까지는 아무것도 줍지 않는다.`),
        ].join('\n'),
      ),
      section('next', '다음에 읽을 것', para(`${link('/guide/combat/', '전투의 작동 방식')}을 읽고, ${link('/guide/builds/', '빌드')}를 골라 경로를 따라가라. 문은 레벨 ${gate}에 열리지만, 우두머리는 한두 레벨 뒤가 더 쉽다.`)),
    ].join('\n'),
  };
}
