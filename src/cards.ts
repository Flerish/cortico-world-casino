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

/** 庄家规则:总数小于 17 补牌,17 及以上停(含软 17)。 */
export function dealerShouldHit(cards: readonly Card[]): boolean {
  return handValue(cards).total < 17;
}
