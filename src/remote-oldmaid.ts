/**
 * 联机抽鬼牌引擎(庄家端权威):整副 52 张、开局藏一张(它是鬼牌的同伴,终局才亮)、
 * 轮流发完 51 张、双方弃初始对子;轮流从对方手中背面抽牌,成对即弃;先空手者赢,
 * 输家手里剩着落单的鬼牌同伴。先后手每局轮换(主人要求)。
 */
import { extractPairs, formatCard, freshDeck, shuffled, type Card } from './cards.ts';

export interface RemoteOldMaidOptions {
  stake: number;
  bankChips: number;
  playerChips: number;
  rng?: () => number;
  /** 测试注入固定牌序(数组尾部先发)。 */
  deck?: Card[];
}

export interface RemoteOldMaidState {
  bankHand: Card[];
  playerHand: Card[];
  discards: Card[][];
  /** 本局先手(先抽的一方)。 */
  firstDrawer: 'bank' | 'player';
  /** 当前轮到谁抽。 */
  turn: 'bank' | 'player';
  hidden: Card;
  done: boolean;
}

/** 抽牌结果:抽到的牌与新增对子数(drawer 视角)。 */
export interface DrawOutcome {
  card: Card;
  newPairs: number;
}

export class RemoteOldMaid {
  chips: { bank: number; player: number };
  handsPlayed = 0;
  lastSettle: { winner: 'player' | 'bank' | 'push'; delta: number; reason: string; playerChips: number; bankChips: number } | null = null;
  state: RemoteOldMaidState | null = null;
  private readonly opts: RemoteOldMaidOptions;
  private readonly rng: () => number;

  constructor(opts: RemoteOldMaidOptions) {
    this.opts = opts;
    this.rng = opts.rng ?? Math.random;
    this.chips = { bank: opts.bankChips, player: opts.playerChips };
  }

  /** 开一局:整副 52 张藏一张,轮流发完 51 张(先手先摸),弃初始对子;空手即胜。 */
  startHand(): void {
    if (this.state && !this.state.done) throw new Error('上一局还没结束');
    const deck = this.opts.deck ? [...this.opts.deck] : shuffled(freshDeck(), this.rng);
    const hidden = deck.pop()!; // 藏一张(数组尾部)
    const firstDrawer: 'bank' | 'player' = this.handsPlayed % 2 === 0 ? 'player' : 'bank'; // 先后手逐局轮换
    const bankHand: Card[] = [];
    const playerHand: Card[] = [];
    // 发完剩下的 51 张:先手先摸。
    const order: Array<'bank' | 'player'> = firstDrawer === 'player' ? ['player', 'bank', 'player', 'bank'] : ['bank', 'player', 'bank', 'player'];
    while (deck.length) {
      for (const who of order) {
        if (!deck.length) break;
        const card = deck.pop()!;
        (who === 'bank' ? bankHand : playerHand).push(card);
      }
    }
    // 双方弃初始对子。
    for (const hand of [bankHand, playerHand]) {
      const { singles, pairs } = extractPairs(hand);
      hand.length = 0;
      hand.push(...singles);
      this.discards.push(...pairs);
    }
    this.state = { bankHand, playerHand, discards: this.discards, firstDrawer, turn: firstDrawer, hidden, done: false };
    // 极端:发完弃完就有一方空手——空手者赢。
    if (bankHand.length === 0 || playerHand.length === 0) {
      this.state.done = true;
      this.settle(bankHand.length === 0 ? 'bank' : 'player', '开局即空手');
    }
  }

  private readonly discards: Card[][] = [];

  /** 从对手手中抽一张(随机,受 rng 约束);成对自动弃。 */
  private drawFrom(opponentHand: Card[], drawerHand: Card[]): DrawOutcome {
    const raw = Math.floor(this.rng() * opponentHand.length);
    const card = opponentHand.splice(Math.min(Math.max(raw, 0), opponentHand.length - 1), 1)[0]!;
    drawerHand.push(card);
    const { singles, pairs } = extractPairs(drawerHand);
    drawerHand.length = 0;
    drawerHand.push(...singles);
    if (pairs.length) this.state!.discards.push(...pairs);
    return { card, newPairs: pairs.length };
  }

  /** 闲家(客座 AI)在自己回合抽牌。 */
  playerDraws(): DrawOutcome {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.turn !== 'player') throw new Error('现在不是你的抽牌回合');
    const out = this.drawFrom(st.bankHand, st.playerHand);
    this.afterDraw();
    return out;
  }

  /** 庄家(本机 AI)在自己回合抽牌。 */
  bankDraws(): DrawOutcome {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.turn !== 'bank') throw new Error('现在不是庄家的抽牌回合');
    const out = this.drawFrom(st.playerHand, st.bankHand);
    this.afterDraw();
    return out;
  }

  /** 抽牌后:判定终局;否则轮到对方。 */
  private afterDraw(): void {
    const st = this.state!;
    if (st.bankHand.length === 0 || st.playerHand.length === 0) {
      st.done = true;
      this.settle(st.bankHand.length === 0 ? 'bank' : 'player', '先空手者胜');
      return;
    }
    st.turn = st.turn === 'player' ? 'bank' : 'player';
  }

  private settle(winner: 'player' | 'bank', reason: string): void {
    const stake = this.opts.stake;
    const delta = winner === 'player' ? stake : -stake;
    this.chips.player += delta;
    this.chips.bank -= delta;
    this.handsPlayed++;
    this.lastSettle = { winner, delta, reason, playerChips: this.chips.player, bankChips: this.chips.bank };
  }

  get phase(): string {
    if (!this.state) return 'awaitStart';
    return this.state.done ? 'done' : this.state.turn === 'player' ? 'player' : 'bank';
  }

  /** 闲家视角的 state 参数体:自己的手牌、对方张数、弃牌堆数、轮到谁。 */
  stateParts(): string[] {
    const st = this.state;
    if (!st) return [];
    const parts = [
      `turn=${st.turn === 'player' ? 'you' : 'bank'}`,
      `yourCount=${st.playerHand.length}`,
      `oppCount=${st.bankHand.length}`,
      `pairs=${st.discards.length}`,
      `cards=${st.playerHand.map((c) => formatCard(c)).join(',') || 'none'}`,
    ];
    return parts;
  }

  settleParts(): string[] | null {
    if (!this.lastSettle) return null;
    const s = this.lastSettle;
    const st = this.state!;
    // 终局亮牌:落单的鬼牌同伴归输家。
    return [`result=${s.winner}`, `delta=${s.delta >= 0 ? '+' : ''}${s.delta}`, `chips=${s.bankChips}:${s.playerChips}`, `hands=${this.handsPlayed}`, `hidden=${formatCard(st.hidden)}`, `reason=${encodeURIComponent(s.reason)}`];
  }

  handDetail(): string {
    const st = this.state;
    if (!st) return '(未开局)';
    return `庄家 ${st.bankHand.length} 张 / 闲家 ${st.playerHand.length} 张 / 弃牌对 ${st.discards.length}`;
  }
}
