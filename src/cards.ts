/** 21 点牌与点数计算;只做机械事实,不做启发式。 */

export interface Card {
  /** 1=A,11=J,12=Q,13=K。 */
  rank: number;
  /** 0=♠,1=♥,2=♣,3=♦。 */
  suit: number;
}

const SUITS = ['♠', '♥', '♣', '♦'] as const;
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export function formatCard(card: Card): string {
  return `${SUITS[card.suit] ?? '?'}${RANKS[card.rank] ?? '?'}`;
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ rank, suit });
  }
  return deck;
}

export function shuffled<T extends Card>(deck: T[], rng: () => number): T[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface HandValue {
  /** 硬总点:A 记 1。 */
  total: number;
  /** 是否软手(有一张 A 还能记 11 而不爆)。 */
  soft: boolean;
  /** 是否天然黑杰克(首两张 21)。 */
  natural: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += card.rank > 10 ? 10 : card.rank;
    if (card.rank === 1) aces++;
  }
  let soft = false;
  if (aces > 0 && total + 10 <= 21) {
    total += 10;
    soft = true;
  }
  return {
    total,
    soft,
    natural: cards.length === 2 && total === 21,
  };
}

/** 庄家规则:总数不足 17 必须补;到 17 停。软 17 是否再补由桌子规则定(S17/H17)。 */
export function dealerShouldHit(cards: readonly Card[], hitsSoft17: boolean): boolean {
  const value = handValue(cards);
  if (value.total < 17) return true;
  return hitsSoft17 && value.total === 17 && value.soft;
}

// ── 抽鬼牌(Old Maid)扩展:配对与鬼牌判定 ──

/** 旧式鬼牌卡(rank 14 / suit 4);现行规则改用「藏一张普通牌」方案,牌堆里不再有鬼牌卡,保留常量供防御性判断。 */
export const JOKER: Card = { rank: 14, suit: 4 };

export function isJoker(card: Card): boolean {
  return card.suit === 4;
}

/** 同点数两张成对(花色不限);鬼牌永不配对。 */
export function isPair(a: Card, b: Card): boolean {
  return !isJoker(a) && !isJoker(b) && a.rank === b.rank;
}

/** 从一手牌中摘出全部成对的牌,返回剩余单牌与成对组(抽鬼牌的弃对阶段用)。 */
export function extractPairs(cards: readonly Card[]): { singles: Card[]; pairs: Card[][] } {
  const byRank = new Map<number, Card[]>();
  for (const card of cards) {
    if (isJoker(card)) continue;
    const list = byRank.get(card.rank) ?? [];
    list.push(card);
    byRank.set(card.rank, list);
  }
  const singles: Card[] = cards.filter((c) => isJoker(c));
  const pairs: Card[][] = [];
  for (const list of byRank.values()) {
    while (list.length >= 2) {
      const a = list.shift()!;
      const b = list.shift()!;
      pairs.push([a, b]);
    }
    singles.push(...list);
  }
  return { singles, pairs };
}

/** 一手牌的摘要文本(按点数计数,鬼牌单列)。 */
export function handSummary(cards: readonly Card[]): string {
  const jokers = cards.filter((c) => isJoker(c)).length;
  const rest = cards.filter((c) => !isJoker(c));
  const parts: string[] = [];
  if (jokers > 0) parts.push(`鬼牌×${jokers}`);
  const byRank = new Map<number, number>();
  for (const card of rest) byRank.set(card.rank, (byRank.get(card.rank) ?? 0) + 1);
  for (const [rank, count] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    parts.push(`${count}×${RANKS[rank] ?? '?'}`);
  }
  return parts.join(' ');
}

// ── 德州扑克扩展:7 张选最强 5 张的成牌与比较 ──

/** 成牌类别:0 高牌,1 一对,2 两对,3 三条,4 顺子,5 同花,6 葫芦,7 四条,8 同花顺。 */
export const POKER_CATS = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'] as const;
export type PokerCat = (typeof POKER_CATS)[number];

/** 一手(5 张)的牌力:cat 加降序关键点数;比较按元组字典序。 */
export interface PokerRank {
  cat: number;
  /** 决胜负的点数序列(A 记 14;顺子的顶张;奇数平分时的辅助信息也取自这里)。 */
  keys: number[];
}

/** 牌的德州点数:A=14,J..K=11..13,其余原值。 */
function pokerRankOf(card: Card): number {
  return card.rank === 1 ? 14 : card.rank;
}

/** 评一手恰好 5 张的牌;只做机械事实。 */
export function evaluate5(cards: readonly Card[]): PokerRank {
  if (cards.length !== 5) throw new Error('evaluate5 needs exactly 5 cards');
  const ranks = cards.map(pokerRankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0]!.suit);
  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0]! - unique[4]! === 4) straightHigh = unique[0]!;
    // A-2-3-4-5 的轮子:A 在此记 5。
    else if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) straightHigh = 5;
  }
  const byRank = new Map<number, number>();
  for (const r of ranks) byRank.set(r, (byRank.get(r) ?? 0) + 1);
  const groups = [...byRank.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  if (flush && straightHigh) return { cat: 8, keys: [straightHigh] };
  if (groups[0]![1] === 4) return { cat: 7, keys: [groups[0]![0]!, groups[1]![0]!] };
  if (groups[0]![1] === 3 && groups[1]![1] === 2) return { cat: 6, keys: [groups[0]![0]!, groups[1]![0]!] };
  if (flush) return { cat: 5, keys: [...ranks] };
  if (straightHigh) return { cat: 4, keys: [straightHigh] };
  if (groups[0]![1] === 3) {
    const trips = groups[0]![0]!;
    return { cat: 3, keys: [trips, ...ranks.filter((r) => r !== trips)] };
  }
  if (groups[0]![1] === 2 && groups[1]![1] === 2) {
    const [high, low] = groups[0]![0]! > groups[1]![0]! ? [groups[0]![0]!, groups[1]![0]!] : [groups[1]![0]!, groups[0]![0]!];
    return { cat: 2, keys: [high, low, ...ranks.filter((r) => r !== high && r !== low)] };
  }
  if (groups[0]![1] === 2) {
    const pair = groups[0]![0]!;
    return { cat: 1, keys: [pair, ...ranks.filter((r) => r !== pair)] };
  }
  return { cat: 0, keys: [...ranks] };
}

function comparePokerRank(a: PokerRank, b: PokerRank): number {
  if (a.cat !== b.cat) return a.cat - b.cat;
  for (let i = 0; i < Math.max(a.keys.length, b.keys.length); i++) {
    const x = a.keys[i] ?? 0;
    const y = b.keys[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** 从 5..7 张里选最强 5 张(C(7,5)=21 个组合,规模可忽略);返回牌力与入选的 5 张。 */
export function bestPokerHand(cards: readonly Card[]): { rank: PokerRank; five: Card[] } {
  const combos: number[][] = [];
  const pick = (start: number, cur: number[]): void => {
    if (cur.length === 5) {
      combos.push([...cur]);
      return;
    }
    for (let i = start; i < cards.length; i++) pick(i + 1, [...cur, i]);
  };
  pick(0, []);
  let best: { rank: PokerRank; five: Card[] } | null = null;
  for (const combo of combos) {
    const five = combo.map((i) => cards[i]!);
    const rank = evaluate5(five);
    if (!best || comparePokerRank(rank, best.rank) > 0) best = { rank, five };
  }
  return best!;
}

/** 正数为 a 赢,负数为 b 赢,0 平(平分底池)。 */
export function comparePokerHands(a: PokerRank, b: PokerRank): number {
  return comparePokerRank(a, b);
}
