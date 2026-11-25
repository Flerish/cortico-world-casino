/**
 * 联机 21 点的庄家端引擎:主机权威模型下,只有庄家机器跑这个引擎,
 * 客座 bot 通过 @casino 消息收状态、发动作。筹码是会话内的独立账本(不与本地牌桌混用)。
 */
import { dealerShouldHit, formatCard, freshDeck, handValue, shuffled, type Card } from './cards.ts';

export interface RemoteBlackjackOptions {
  bankChips: number;
  playerChips: number;
  minBet: number;
  maxBet: number;
  dealerHitsSoft17: boolean;
  rng?: () => number;
  /** 测试注入固定牌序。 */
  deck?: Card[];
}

export interface RemoteSettle {
  winner: 'player' | 'bank' | 'push';
  delta: number;
  reason: string;
  playerChips: number;
  bankChips: number;
}

export interface RemoteHandState {
  bet: number;
  playerCards: Card[];
  dealerCards: Card[];
  /** 庄家第二张是否仍盖着。 */
  holeHidden: boolean;
  phase: 'player' | 'dealer' | 'done';
}

export class RemoteBlackjack {
  chips: { bank: number; player: number };
  handsPlayed = 0;
  hand: RemoteHandState | null = null;
  lastSettle: RemoteSettle | null = null;
  private deck: Card[];
  private readonly opts: RemoteBlackjackOptions;
  private readonly rng: () => number;

  constructor(opts: RemoteBlackjackOptions) {
    this.opts = opts;
    this.rng = opts.rng ?? Math.random;
    this.chips = { bank: opts.bankChips, player: opts.playerChips };
    this.deck = opts.deck ? [...opts.deck] : shuffled(freshDeck(), this.rng);
  }

  private draw(): Card {
    if (!this.deck.length) this.deck = shuffled(freshDeck(), this.rng);
    return this.deck.pop()!;
  }

  /** 下注校验;返回错误文案或 null。 */
  betError(bet: number): string | null {
    if (!Number.isSafeInteger(bet) || bet <= 0) return '下注须为正整数';
    if (bet < this.opts.minBet) return `下注不能低于 ${this.opts.minBet}`;
    if (bet > this.opts.maxBet) return `下注不能高于 ${this.opts.maxBet}`;
    if (bet > this.chips.player) return `你的会话筹码 ${this.chips.player} 押不起 ${bet}`;
    if (bet > this.chips.bank) return '庄家会话筹码不足';
    return null;
  }

  /** 开新手:庄家闲家各两张;任一方首两张 21 立即结算(自然黑杰克)。 */
  startHand(bet: number): void {
    if (this.hand && this.hand.phase !== 'done') throw new Error('上一手还没结算');
    this.hand = {
      bet,
      playerCards: [this.draw(), this.draw()],
      dealerCards: [this.draw(), this.draw()],
      holeHidden: true,
      phase: 'player',
    };
    const player = handValue(this.hand.playerCards).total;
    const dealer = handValue(this.hand.dealerCards).total;
    if (player === 21 || dealer === 21) {
      this.hand.holeHidden = false;
      this.settle();
    }
  }

  get bet(): number { return this.hand?.bet ?? 0; }
  get phase(): RemoteHandState['phase'] | 'awaitBet' { return this.hand?.phase ?? 'awaitBet'; }
  playerTotal(): number { return this.hand ? handValue(this.hand.playerCards).total : 0; }
  dealerUpTotal(): number { return this.hand ? handValue([this.hand.dealerCards[0]!]).total : 0; }
  dealerTotal(): number { return this.hand ? handValue(this.hand.dealerCards).total : 0; }

  /** 闲家可用的动作列表。 */
  availableActions(): string[] {
    const h = this.hand;
    if (!h || h.phase !== 'player') return [];
    const actions = ['hit', 'stand'];
    if (h.playerCards.length === 2 && this.chips.player >= h.bet * 2 && this.chips.bank >= h.bet * 2) actions.push('double');
    return actions;
  }

  private ensurePlayerTurn(): void {
    if (!this.hand || this.hand.phase !== 'player') throw new Error('现在不是你的行动回合');
  }

  hit(): void {
    this.ensurePlayerTurn();
    this.hand!.playerCards.push(this.draw());
    if (handValue(this.hand!.playerCards).total > 21) this.stand(); // 爆牌直接进庄家回合与结算
  }

  double(): void {
    this.ensurePlayerTurn();
    const h = this.hand!;
    if (h.playerCards.length !== 2) throw new Error('只有首两张牌可以加倍');
    if (this.chips.player < h.bet * 2 || this.chips.bank < h.bet * 2) throw new Error('筹码不足以加倍');
    h.bet *= 2;
    h.playerCards.push(this.draw());
    this.stand();
  }

  stand(): void {
    this.ensurePlayerTurn();
    this.hand!.phase = 'dealer';
    this.playDealer();
  }

  /** 庄家按规则打完并结算;结算后 hand.phase = 'done'。 */
  private playDealer(): void {
    const h = this.hand!;
    h.holeHidden = false;
    while (dealerShouldHit(h.dealerCards, this.opts.dealerHitsSoft17) && handValue(h.dealerCards).total < 21) {
      h.dealerCards.push(this.draw());
    }
    this.settle();
  }

  private settle(): void {
    const h = this.hand!;
    h.phase = 'done';
    const player = handValue(h.playerCards).total;
    const dealer = handValue(h.dealerCards).total;
    const playerNatural = h.playerCards.length === 2 && handValue(h.playerCards).natural;
    const dealerNatural = h.dealerCards.length === 2 && handValue(h.dealerCards).natural;
    const playerBust = player > 21;
    const dealerBust = dealer > 21;
    let winner: RemoteSettle['winner'];
    let delta = 0;
    let reason: string;
    if (playerBust) { winner = 'bank'; delta = -h.bet; reason = '闲家爆牌'; }
    else if (dealerBust) { winner = 'player'; delta = h.bet; reason = '庄家爆牌'; }
    else if (playerNatural && !dealerNatural) { winner = 'player'; delta = Math.floor(h.bet * 1.5); reason = '自然黑杰克(1.5 倍)'; }
    else if (dealerNatural && !playerNatural) { winner = 'bank'; delta = -h.bet; reason = '庄家自然黑杰克'; }
    else if (player > dealer) { winner = 'player'; delta = h.bet; reason = '点数更大'; }
    else if (player < dealer) { winner = 'bank'; delta = -h.bet; reason = '庄家点数更大'; }
    else { winner = 'push'; reason = '平局退注'; }
    if (winner === 'player') { this.chips.player += delta; this.chips.bank -= delta; }
    else if (winner === 'bank') { this.chips.player += delta; this.chips.bank -= delta; }
    this.handsPlayed++;
    this.lastSettle = { winner, delta, reason, playerChips: this.chips.player, bankChips: this.chips.bank };
  }

  /** 闲家视角的手牌摘要(庄家只亮明牌)——即协议 state 消息的参数体。 */
  stateParts(): string[] {
    const h = this.hand!;
    return [`total=${handValue(h.playerCards).total}`, `dealerUp=${handValue([h.dealerCards[0]!]).total}`, `bet=${h.bet}`, `cards=${h.playerCards.map((c) => formatCard(c)).join(',')}`, `actions=${this.availableActions().join(',') || 'none'}`];
  }

  /** 结算通报——协议 settle 消息的参数体(settle 即亮庄家牌,观战可见)。 */
  settleParts(): string[] | null {
    if (!this.lastSettle || !this.hand) return null;
    const s = this.lastSettle;
    const h = this.hand;
    return [`result=${s.winner}`, `delta=${s.delta >= 0 ? '+' : ''}${s.delta}`, `chips=${s.bankChips}:${s.playerChips}`, `hands=${this.handsPlayed}`, `dealer=${h.dealerCards.map((c) => formatCard(c)).join(',')}`, `reason=${encodeURIComponent(s.reason)}`];
  }

  /** 手牌明细(庄家端事件文本用)。 */
  handDetail(): string {
    const h = this.hand!;
    return `闲家 ${h.playerCards.map((c) => formatCard(c)).join(' ')}(${handValue(h.playerCards).total} 点) vs 庄家 ${h.dealerCards.map((c) => formatCard(c)).join(' ')}(${handValue(h.dealerCards).total} 点)`;
  }
}
