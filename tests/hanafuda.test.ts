/** 花札纯逻辑测试:牌组构成校验 + 役表全覆盖(口径按 fudawiki,配置项切 Nintendo)。 */
import { describe, it, expect } from 'vitest';
import {
  freshHanafudaDeck,
  evaluateYaku,
  isKikuKasutori,
  HANAFUDA_LIGHT,
  HANAFUDA_TANE,
  HANAFUDA_KASU,
  HANAFUDA_TAN,
  YAKU_PRESET_NINTENDO,
  type HanaCard,
} from '../src/hanafuda.ts';

/** 收集区构造器:按 [rank, suit] 对生成无重复牌(粕同点多张时用不同 id)。 */
function hand(...cards: Array<[number, number]>): HanaCard[] {
  const out: HanaCard[] = [];
  for (const [rank, suit] of cards) {
    out.push({ rank, suit, id: out.filter((c) => c.rank === rank && c.suit === suit).length });
  }
  return out;
}

describe('花札牌组构成', () => {
  it('整副 48 张,每月恰 4 张,整副无重复牌', () => {
    const deck = freshHanafudaDeck();
    expect(deck.length).toBe(48);
    for (let rank = 1; rank <= 12; rank++) {
      expect(deck.filter((c) => c.rank === rank).length).toBe(4);
    }
    const keys = new Set(deck.map((c) => `${c.rank}-${c.suit}-${c.id}`));
    expect(keys.size).toBe(48);
  });

  it('类别计数:光 5 / 种 9 / 短册 10 / 粕 24', () => {
    const deck = freshHanafudaDeck();
    expect(deck.filter((c) => c.suit === HANAFUDA_LIGHT).length).toBe(5);
    expect(deck.filter((c) => c.suit === HANAFUDA_TANE).length).toBe(9);
    expect(deck.filter((c) => c.suit === HANAFUDA_TAN).length).toBe(10);
    expect(deck.filter((c) => c.suit === HANAFUDA_KASU).length).toBe(24);
  });

  it('光牌恰为 1/3/8/J/Q 的 ♠;8 月无短册;12 月无种无短册;11 月光种短册粕各 1', () => {
    const deck = freshHanafudaDeck();
    expect(deck.filter((c) => c.suit === HANAFUDA_LIGHT).map((c) => c.rank).sort((a, b) => a - b))
      .toEqual([1, 3, 8, 11, 12]);
    expect(deck.filter((c) => c.rank === 8 && c.suit === HANAFUDA_TAN).length).toBe(0);
    expect(deck.filter((c) => c.rank === 12 && (c.suit === HANAFUDA_TANE || c.suit === HANAFUDA_TAN)).length).toBe(0);
    expect(deck.filter((c) => c.rank === 11).length).toBe(4);
  });

  it('粕分布:1~10 月各 2 张,11 月 1 张,12 月 3 张', () => {
    const deck = freshHanafudaDeck();
    for (let rank = 1; rank <= 10; rank++) {
      expect(deck.filter((c) => c.rank === rank && c.suit === HANAFUDA_KASU).length).toBe(2);
    }
    expect(deck.filter((c) => c.rank === 11 && c.suit === HANAFUDA_KASU).length).toBe(1);
    expect(deck.filter((c) => c.rank === 12 && c.suit === HANAFUDA_KASU).length).toBe(3);
  });

  it('菊上杯 9♥ 双属性判定', () => {
    expect(isKikuKasutori({ rank: 9, suit: HANAFUDA_TANE })).toBe(true);
    expect(isKikuKasutori({ rank: 9, suit: HANAFUDA_KASU })).toBe(false);
    expect(isKikuKasutori({ rank: 8, suit: HANAFUDA_TANE })).toBe(false);
  });
});

describe('光系役', () => {
  it('五光:5 张光全收,默认 15 分', () => {
    const res = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [11, HANAFUDA_LIGHT], [12, HANAFUDA_LIGHT]));
    expect(res.hits.map((h) => h.key)).toEqual(['goko']);
    expect(res.total).toBe(15);
  });

  it('四光不含雨:1/3/8/12 四光 8 分,不与三光重复结算', () => {
    const res = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [12, HANAFUDA_LIGHT]));
    expect(res.hits.map((h) => h.key)).toEqual(['shiko']);
    expect(res.total).toBe(8);
  });

  it('雨四光:4 张光含 J♠,8 分', () => {
    const res = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [11, HANAFUDA_LIGHT], [12, HANAFUDA_LIGHT]));
    expect(res.hits.map((h) => h.key)).toEqual(['ameShiko']);
    expect(res.total).toBe(8);
  });

  it('三光:3 张光不含雨,6 分;3 张含雨不算三光', () => {
    const ok = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT]));
    expect(ok.hits.map((h) => h.key)).toEqual(['sanko']);
    expect(ok.total).toBe(6);
    const rain3 = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [11, HANAFUDA_LIGHT]));
    expect(rain3.hits).toEqual([]);
    expect(rain3.total).toBe(0);
  });

  it('光系互斥(默认):五光只计五光,不再计雨四光/四光/三光', () => {
    const res = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [11, HANAFUDA_LIGHT], [12, HANAFUDA_LIGHT]));
    expect(res.hits.filter((h) => h.key !== 'goko').length).toBe(0);
  });

  it('光系互斥关闭(lightExclusive=false):成立档全部结算——含雨时三光/四光不成立,故只有五光+雨四光', () => {
    const res = evaluateYaku(
      hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [11, HANAFUDA_LIGHT], [12, HANAFUDA_LIGHT]),
      { lightExclusive: false },
    );
    expect(res.hits.map((h) => h.key)).toEqual(['goko', 'ameShiko']);
    expect(res.total).toBe(15 + 8);
  });

  it('Nintendo 口径:五光 10 / 四光 7 / 三光 5', () => {
    const goko = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [11, HANAFUDA_LIGHT], [12, HANAFUDA_LIGHT]), YAKU_PRESET_NINTENDO);
    expect(goko.total).toBe(10);
    const shiko = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [12, HANAFUDA_LIGHT]), YAKU_PRESET_NINTENDO);
    expect(shiko.total).toBe(7);
    const sanko = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT]), YAKU_PRESET_NINTENDO);
    expect(sanko.total).toBe(5);
  });
});

describe('种系与短册系役', () => {
  it('猪鹿蝶:5 分 + 每多 1 张种 +1(额外种会同时点亮种役)', () => {
    const base = evaluateYaku(hand([7, HANAFUDA_TANE], [10, HANAFUDA_TANE], [6, HANAFUDA_TANE]));
    expect(base.hits.map((h) => h.key)).toEqual(['inoshikacho']);
    expect(base.total).toBe(5);
    // 3 张猪鹿蝶 + 2 张额外种(2♥莺、4♥杜鹃):役分 5+2=7;种役并存 1 分 → 总 8
    const extra = evaluateYaku(hand([7, HANAFUDA_TANE], [10, HANAFUDA_TANE], [6, HANAFUDA_TANE], [2, HANAFUDA_TANE], [4, HANAFUDA_TANE]));
    expect(extra.hits.find((h) => h.key === 'inoshikacho')!.points).toBe(7);
    expect(extra.hits.map((h) => h.key)).toEqual(['inoshikacho', 'tane']);
    expect(extra.total).toBe(8);
  });

  it('猪鹿蝶与种役并存:总种 5 张 → 猪鹿蝶 5+2(超基数 2 张)+ 种役 1', () => {
    const res = evaluateYaku(hand([7, HANAFUDA_TANE], [10, HANAFUDA_TANE], [6, HANAFUDA_TANE], [2, HANAFUDA_TANE], [4, HANAFUDA_TANE]));
    expect(res.hits.map((h) => h.key)).toEqual(['inoshikacho', 'tane']);
    expect(res.total).toBe(7 + 1);
  });

  it('赤短:A♦2♦3♦ 5 分;青短:6♦9♦10♦ 5 分;两者并存加短册役(6 张短册)', () => {
    const aka = evaluateYaku(hand([1, HANAFUDA_TAN], [2, HANAFUDA_TAN], [3, HANAFUDA_TAN]));
    expect(aka.hits.map((h) => h.key)).toEqual(['akatan']);
    expect(aka.total).toBe(5);
    // 赤短 + 青短共 6 张短册:加笔口径 = 每役 5 分 + (短册总数 - 役基数 3) → 各 8;短册役 1+(6-5)=2
    const both = evaluateYaku(hand([1, HANAFUDA_TAN], [2, HANAFUDA_TAN], [3, HANAFUDA_TAN], [6, HANAFUDA_TAN], [9, HANAFUDA_TAN], [10, HANAFUDA_TAN]));
    expect(both.hits.map((h) => h.key)).toEqual(['akatan', 'aotan', 'tan']);
    expect(both.total).toBe(8 + 8 + 2);
  });

  it('短册役:5 张 1 分,7 张 3 分(7 张用无字 4 张+A♦2♦6♦,避开赤短/青短成役)', () => {
    const five = evaluateYaku(hand([4, HANAFUDA_TAN], [5, HANAFUDA_TAN], [7, HANAFUDA_TAN], [11, HANAFUDA_TAN], [9, HANAFUDA_TAN]));
    expect(five.hits.map((h) => h.key)).toEqual(['tan']);
    expect(five.total).toBe(1);
    const seven = evaluateYaku(hand([4, HANAFUDA_TAN], [5, HANAFUDA_TAN], [7, HANAFUDA_TAN], [11, HANAFUDA_TAN], [1, HANAFUDA_TAN], [2, HANAFUDA_TAN], [6, HANAFUDA_TAN]));
    expect(seven.hits.map((h) => h.key)).toEqual(['tan']);
    expect(seven.total).toBe(1 + 2);
  });

  it('种役:5 张起 1 分,每多 1 张 +1(9♥ 计入)', () => {
    const five = evaluateYaku(hand([2, HANAFUDA_TANE], [4, HANAFUDA_TANE], [5, HANAFUDA_TANE], [8, HANAFUDA_TANE], [9, HANAFUDA_TANE]));
    expect(five.hits.map((h) => h.key)).toEqual(['tane']);
    expect(five.total).toBe(1);
  });
});

describe('酒役与粕役', () => {
  it('花见酒:3♠ + 9♥;月见酒:8♠ + 9♥;可并存(10 分)', () => {
    const hanami = evaluateYaku(hand([3, HANAFUDA_LIGHT], [9, HANAFUDA_TANE]));
    expect(hanami.hits.map((h) => h.key)).toEqual(['hanamiZake']);
    expect(hanami.total).toBe(5);
    const both = evaluateYaku(hand([3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [9, HANAFUDA_TANE]));
    expect(both.hits.map((h) => h.key)).toEqual(['hanamiZake', 'tsukimiZake']);
    expect(both.total).toBe(10);
  });

  it('只有酒杯没有樱幕/芒月:无酒役;光系役与酒役并存(三光 + 月见酒)', () => {
    const sakeOnly = evaluateYaku(hand([9, HANAFUDA_TANE], [1, HANAFUDA_KASU]));
    expect(sakeOnly.hits).toEqual([]);
    const withSanko = evaluateYaku(hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [9, HANAFUDA_TANE]));
    expect(withSanko.hits.map((h) => h.key)).toEqual(['sanko', 'hanamiZake', 'tsukimiZake']);
    expect(withSanko.total).toBe(6 + 10);
  });

  it('粕役:10 张起 1 分;9♥ 双属性计入粕(9 张粕 + 9♥ → 成立);9 张纯粕不成立', () => {
    const ninePure = hand([1, HANAFUDA_KASU], [1, HANAFUDA_KASU], [2, HANAFUDA_KASU], [2, HANAFUDA_KASU], [3, HANAFUDA_KASU], [3, HANAFUDA_KASU], [4, HANAFUDA_KASU], [4, HANAFUDA_KASU], [5, HANAFUDA_KASU]);
    const nine = evaluateYaku(ninePure);
    expect(nine.hits).toEqual([]);
    // 加上 9♥(双属性,既算种也算粕)→ 粕 10 张成立
    const withKiku = evaluateYaku([...ninePure, { rank: 9, suit: HANAFUDA_TANE, id: 0 }]);
    expect(withKiku.hits.map((h) => h.key)).toEqual(['kasu']);
    expect(withKiku.total).toBe(1);
  });
});

describe('综合场景与纯函数性', () => {
  it('复合场景:三光 + 花见酒 + 月见酒 + 种役(役并存全部计分,种役 5 张起)', () => {
    const res = evaluateYaku(hand(
      [1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT],
      [9, HANAFUDA_TANE], [2, HANAFUDA_TANE], [4, HANAFUDA_TANE], [7, HANAFUDA_TANE], [5, HANAFUDA_TANE],
    ));
    // 种 5 张(9♥2♥4♥7♥5♥)→ 种役 1 分;光 3 张不含雨 → 三光 6;樱幕+菊杯 → 花见酒;芒月+菊杯 → 月见酒
    expect(res.hits.map((h) => h.key)).toEqual(['sanko', 'hanamiZake', 'tsukimiZake', 'tane']);
    expect(res.total).toBe(6 + 5 + 5 + 1);
  });

  it('大满贯场景:五光 + 猪鹿蝶带加笔 + 赤短青短 + 短册 + 粕役并存', () => {
    const res = evaluateYaku([
      ...hand([1, HANAFUDA_LIGHT], [3, HANAFUDA_LIGHT], [8, HANAFUDA_LIGHT], [11, HANAFUDA_LIGHT], [12, HANAFUDA_LIGHT]),
      ...hand([7, HANAFUDA_TANE], [10, HANAFUDA_TANE], [6, HANAFUDA_TANE], [2, HANAFUDA_TANE]),
      ...hand([1, HANAFUDA_TAN], [2, HANAFUDA_TAN], [3, HANAFUDA_TAN], [6, HANAFUDA_TAN], [9, HANAFUDA_TAN], [10, HANAFUDA_TAN]),
      ...hand([4, HANAFUDA_KASU], [5, HANAFUDA_KASU], [4, HANAFUDA_KASU], [5, HANAFUDA_KASU], [1, HANAFUDA_KASU], [2, HANAFUDA_KASU], [3, HANAFUDA_KASU], [1, HANAFUDA_KASU], [2, HANAFUDA_KASU], [3, HANAFUDA_KASU]),
    ]);
    const keys = res.hits.map((h) => h.key);
    expect(keys).toEqual(['goko', 'inoshikacho', 'akatan', 'aotan', 'tan', 'kasu']);
    // 逐项核对:五光 15;种总数 = 7/10/6/2 ♥ 共 4 张 → 猪鹿蝶 5+(4-3)=6;
    // 短册 6 张:赤 5+(6-3)=8、青 5+(6-3)=8、短册役 1+(6-5)=2;粕 10 张 → 1
    const by = Object.fromEntries(res.hits.map((h) => [h.key, h.points]));
    expect(by.goko).toBe(15);
    expect(by.inoshikacho).toBe(6);
    expect(by.akatan).toBe(8);
    expect(by.aotan).toBe(8);
    expect(by.tan).toBe(2);
    expect(by.kasu).toBe(1);
    expect(res.total).toBe(15 + 6 + 8 + 8 + 2 + 1);
  });

  it('纯函数:evaluateYaku 不修改输入数组', () => {
    const input = hand([1, HANAFUDA_LIGHT], [9, HANAFUDA_TANE], [2, HANAFUDA_KASU]);
    const snapshot = JSON.stringify(input);
    evaluateYaku(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('空收集区:无役零分', () => {
    expect(evaluateYaku([])).toEqual({ hits: [], total: 0 });
  });
});
