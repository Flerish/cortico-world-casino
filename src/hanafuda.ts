/** 花札(こいこい)纯逻辑:48 张牌构造、役识别与流派配置;只做机械事实,不做启发式。
 *  映射方案(见 E:\ai\coo\花札玩法研究与扑克牌呈现方案-2026-11-28.md):
 *  月份→点数(1月=A…10月=10、11月=J、12月=Q,K 全弃),类别→花色(沿用 cards.ts 编码:
 *  0♠=光,1♥=种,2♣=粕,3♦=短册——注意 ♣ 在 2、♦ 在 3)。同月配对 = 同点数配对。 */
import type { Card } from './cards.ts';

/** 花札牌:在扑克牌上补 id——同月可有 2~3 张粕(同点同花色),用 id 区分。 */
export type HanaCard = Card & { id: number };

export const HANAFUDA_LIGHT = 0; // ♠ 光(松鹤/樱幕/芒月/柳雨/桐凰)
export const HANAFUDA_TANE = 1; // ♥ 种(动物/器物)
export const HANAFUDA_KASU = 2; // ♣ 粕(纯植物)
export const HANAFUDA_TAN = 3; // ♦ 短册(赤短/青短/无字)

/** 菊上杯(9♥)双属性:既是种,也可当粕计数。 */
export function isKikuKasutori(card: Card): boolean {
  return card.rank === 9 && card.suit === HANAFUDA_TANE;
}

/** 构造整副 48 张花札牌(程序化映射表,与研究文档 48 张映射表一比一)。 */
export function freshHanafudaDeck(): HanaCard[] {
  const deck: HanaCard[] = [];
  // 每月的构成:[光?, 种?, 短册?, 粕张数]。11 月为 光+种+短册+粕 各 1(研究文档曾漏记,已修正)。
  const layout: Array<{ light?: boolean; tane?: boolean; tan?: boolean; kasu: number }> = [
    { light: true, tan: true, kasu: 2 }, // 1 松:鹤/赤短/粕×2
    { tane: true, tan: true, kasu: 2 }, // 2 梅:莺/赤短/粕×2
    { light: true, tan: true, kasu: 2 }, // 3 樱:幕/赤短/粕×2
    { tane: true, tan: true, kasu: 2 }, // 4 藤:杜鹃/无字短/粕×2
    { tane: true, tan: true, kasu: 2 }, // 5 菖蒲:八桥/无字短/粕×2
    { tane: true, tan: true, kasu: 2 }, // 6 牡丹:蝶/青短/粕×2
    { tane: true, tan: true, kasu: 2 }, // 7 萩:猪/无字短/粕×2
    { light: true, tane: true, kasu: 2 }, // 8 芒:月/雁/粕×2(8 月无短册)
    { tane: true, tan: true, kasu: 2 }, // 9 菊:酒杯(兼粕)/青短/粕×2
    { tane: true, tan: true, kasu: 2 }, // 10 红叶:鹿/青短/粕×2
    { light: true, tane: true, tan: true, kasu: 1 }, // 11 柳:雨/燕/无字短/粕×1
    { light: true, kasu: 3 }, // 12 桐:凤凰/粕×3(12 月无种无短册)
  ];
  layout.forEach((spec, i) => {
    const rank = i + 1;
    const nextId = (r: number, s: number) => {
      // 同 rank+suit 可能多张(粕),id 递增保证整副唯一。
      return deck.filter((c) => c.rank === r && c.suit === s).length;
    };
    if (spec.light) deck.push({ rank, suit: HANAFUDA_LIGHT, id: nextId(rank, HANAFUDA_LIGHT) });
    if (spec.tane) deck.push({ rank, suit: HANAFUDA_TANE, id: nextId(rank, HANAFUDA_TANE) });
    if (spec.tan) deck.push({ rank, suit: HANAFUDA_TAN, id: nextId(rank, HANAFUDA_TAN) });
    for (let k = 0; k < spec.kasu; k++) deck.push({ rank, suit: HANAFUDA_KASU, id: k });
  });
  return deck;
}

/** 役识别配置;缺省即 fudawiki 常见口径。雨四光两流派均记 8,不做配置。 */
export interface YakuOptions {
  /** 五光分值:fudawiki 15 / Nintendo 10。 */
  fiveLight?: number;
  /** 四光(不含雨)分值:fudawiki 8 / Nintendo 7。 */
  fourLight?: number;
  /** 三光(不含雨)分值:fudawiki 6 / Nintendo 5。 */
  threeLight?: number;
  /** 光系包含关系是否只计最高(五光成立不再计雨四光/四光/三光);fudawiki = true。 */
  lightExclusive?: boolean;
}

/** fudawiki 常见口径(项目默认)。 */
export const YAKU_PRESET_FUDAWIKI: Required<YakuOptions> = { fiveLight: 15, fourLight: 8, threeLight: 6, lightExclusive: true };
/** Nintendo 口径(仅光系分值不同)。 */
export const YAKU_PRESET_NINTENDO: Required<YakuOptions> = { fiveLight: 10, fourLight: 7, threeLight: 5, lightExclusive: true };

export interface YakuHit {
  /** 稳定键,面板/回执/联机协议都用它。 */
  key: 'goko' | 'ameShiko' | 'shiko' | 'sanko' | 'inoshikacho' | 'akatan' | 'aotan' | 'hanamiZake' | 'tsukimiZake' | 'tan' | 'tane' | 'kasu';
  name: string;
  points: number;
}

export interface YakuResult {
  hits: YakuHit[];
  total: number;
}

/** 役识别纯函数:对收集区全量重算(引擎层自行对比前后两次结果判定"新增/增分")。
 *  口径(fudawiki):光系包含关系只计最高;猪鹿蝶/赤短/青短的加笔按"超出役基数的同类别张数";
 *  种役/短册役的基数张数包含子役成员;菊上杯(9♥)同时计入种与粕。 */
export function evaluateYaku(collected: readonly HanaCard[], opts: YakuOptions = {}): YakuResult {
  const cfg = { ...YAKU_PRESET_FUDAWIKI, ...opts };
  const isLight = (c: Card) => c.suit === HANAFUDA_LIGHT;
  const isTan = (c: Card) => c.suit === HANAFUDA_TAN;
  const isTane = (c: Card) => c.suit === HANAFUDA_TANE;
  const isKasu = (c: Card) => c.suit === HANAFUDA_KASU || isKikuKasutori(c);

  const lights = collected.filter(isLight);
  const hasRain = lights.some((c) => c.rank === 11);
  const taneCount = collected.filter(isTane).length;
  const tanCount = collected.filter(isTan).length;
  const kasuCount = collected.filter(isKasu).length;

  const hits: YakuHit[] = [];
  // ── 光系:条件用"至少 N 张"表达;互斥开(默认,fudawiki)取最高一档,关则全部成立档都计。
  //    雨四光与四光因"是否含雨"天然互斥;三光按口径不含雨。
  const lightHits: YakuHit[] = [];
  if (lights.length === 5) lightHits.push({ key: 'goko', name: '五光', points: cfg.fiveLight });
  if (lights.length >= 4 && hasRain) lightHits.push({ key: 'ameShiko', name: '雨四光', points: 8 });
  if (lights.length >= 4 && !hasRain) lightHits.push({ key: 'shiko', name: '四光', points: cfg.fourLight });
  if (lights.length >= 3 && !hasRain) lightHits.push({ key: 'sanko', name: '三光', points: cfg.threeLight });
  if (lightHits.length) {
    if (cfg.lightExclusive) hits.push(lightHits[0]!);
    else hits.push(...lightHits);
  }
  // ── 猪鹿蝶(7♥猪 + 10♥鹿 + 6♥蝶),每多 1 张种 +1 ──
  const hasIno = collected.some((c) => c.rank === 7 && c.suit === HANAFUDA_TANE);
  const hasShika = collected.some((c) => c.rank === 10 && c.suit === HANAFUDA_TANE);
  const hasCho = collected.some((c) => c.rank === 6 && c.suit === HANAFUDA_TANE);
  if (hasIno && hasShika && hasCho) hits.push({ key: 'inoshikacho', name: '猪鹿蝶', points: 5 + Math.max(0, taneCount - 3) });
  // ── 赤短(A♦2♦3♦)/ 青短(6♦9♦10♦),各自每多 1 张短册 +1;两者可并存 ──
  const hasAkatan = [1, 2, 3].every((r) => collected.some((c) => c.rank === r && c.suit === HANAFUDA_TAN));
  if (hasAkatan) hits.push({ key: 'akatan', name: '赤短', points: 5 + Math.max(0, tanCount - 3) });
  const hasAotan = [6, 9, 10].every((r) => collected.some((c) => c.rank === r && c.suit === HANAFUDA_TAN));
  if (hasAotan) hits.push({ key: 'aotan', name: '青短', points: 5 + Math.max(0, tanCount - 3) });
  // ── 花见酒(3♠+9♥)/ 月见酒(8♠+9♥),可并存 ──
  const hasSake = collected.some(isKikuKasutori);
  if (hasSake && collected.some((c) => c.rank === 3 && isLight(c))) hits.push({ key: 'hanamiZake', name: '花见酒', points: 5 });
  if (hasSake && collected.some((c) => c.rank === 8 && isLight(c))) hits.push({ key: 'tsukimiZake', name: '月见酒', points: 5 });
  // ── 集数役:短册 5 张 / 种 5 张 / 粕 10 张起,每多 1 张 +1(子役成员计入张数;菊上杯双属性) ──
  if (tanCount >= 5) hits.push({ key: 'tan', name: '短册', points: 1 + (tanCount - 5) });
  if (taneCount >= 5) hits.push({ key: 'tane', name: '种', points: 1 + (taneCount - 5) });
  if (kasuCount >= 10) hits.push({ key: 'kasu', name: '粕', points: 1 + (kasuCount - 10) });

  return { hits, total: hits.reduce((sum, h) => sum + h.points, 0) };
}

// ── AI 决策(简单启发式,纯函数;轮 2 单机用,联机可复用) ──

const KIND_VALUE = [4, 3, 1, 2]; // 收牌价值按 suit 编码:0♠光 4 > 1♥种 3 > 2♣粕 1 > 3♦短册 2

/** AI 打牌:能配对的牌里选收牌价值最高的;无配对时打价值最低的(先丢粕)。返回手牌索引。 */
export function hanafudaAiPlay(aiHand: readonly HanaCard[], field: readonly HanaCard[]): number {
  let best = 0;
  let bestGain = -Infinity;
  aiHand.forEach((c, i) => {
    const matches = field.filter((f) => f.rank === c.rank).length;
    // 有配对收益远高于无配对;无配对的牌按价值取负——越没用越先丢。
    const gain = matches > 0 ? 10 + KIND_VALUE[c.suit]! * matches : -KIND_VALUE[c.suit]!;
    if (gain > bestGain) {
      bestGain = gain;
      best = i;
    }
  });
  return best;
}

/** AI 选场牌:同月 2 张里收类别价值更高的那张。 */
export function hanafudaAiPick(options: readonly HanaCard[]): number {
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    if (KIND_VALUE[options[i]!.suit]! > KIND_VALUE[options[best]!.suit]!) best = i;
  }
  return best;
}

/** AI こいこい 决策:分不落后且到 4 文就搏更高役;落后则收手落袋。 */
export function hanafudaAiKoikoi(myScore: number, oppScore: number): boolean {
  if (myScore >= 4 && myScore >= oppScore) return true;
  return myScore > oppScore;
}
