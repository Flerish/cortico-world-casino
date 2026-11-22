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

export function shuffled(deck: Card[], rng: () => number): Card[] {
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
