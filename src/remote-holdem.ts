/**
 * 联机德州扑克引擎(庄家端权威,两人桌):52 张、盲注(大盲=配置值,小盲=其半)、
 * 按钮每手轮换(两人桌按钮即小盲);街:preflop/flop/turn/river;下注轮双方匹配且行动过
 * 才进下一街;全押不足时未跟齐部分退回、自动发完摊牌;摊牌七选五比牌(与本地同一套
 * comparePokerHands)。双方 AI 都真实决策:庄家侧动作由本机 AI 经 tool 落到引擎。
 */
import { bestPokerHand, comparePokerHands, formatCard, freshDeck, shuffled, type Card } from './cards.ts';

export interface RemoteHoldemOptions {
  bigBlind: number;
  bankChips: number;
  playerChips: number;
  rng?: () => number;
  /** 测试注入固定牌序(数组尾部先发)。 */
  deck?: Card[];
}

export interface RemoteHoldemSeat {
  cards: Card[];
  chips: number;
  street: number;      // 本街已投入
  committed: number;   // 整手已投入
  allIn: boolean;
  folded: boolean;
}

export interface RemoteHoldemState {
  hole: { bank: Card[]; player: Card[] };
  seats: { bank: RemoteHoldemSeat; player: RemoteHoldemSeat };
  startChips: { bank: number; player: number };
  button: 'bank' | 'player';    // 按钮位(两人桌即小盲)
  street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  community: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  turn: 'bank' | 'player' | null;
  acted: { bank: boolean; player: boolean };
  done: boolean;
}

export type RemoteHoldemAct = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export class RemoteHoldem {
  handsPlayed = 0;
  lastSettle: { winner: 'player' | 'bank' | 'push'; delta: number; reason: string; playerChips: number; bankChips: number } | null = null;
  chips: { bank: number; player: number };
  state: RemoteHoldemState | null = null;
  private deck: Card[];
  private readonly opts: RemoteHoldemOptions;
  private readonly rng: () => number;

  constructor(opts: RemoteHoldemOptions) {
    this.opts = opts;
    this.rng = opts.rng ?? Math.random;
    this.chips = { bank: opts.bankChips, player: opts.playerChips };
    this.deck = opts.deck ? [...opts.deck] : shuffled(freshDeck(), this.rng);
  }

  private draw(): Card {
    if (!this.deck.length) this.deck = shuffled(freshDeck(), this.rng);
    return this.deck.pop()!;
  }

  private seat(who: 'bank' | 'player'): RemoteHoldemSeat { return this.state!.seats[who]; }
  private other(who: 'bank' | 'player'): 'bank' | 'player' { return who === 'bank' ? 'player' : 'bank'; }

  /** 开一手:按钮轮换、发底牌、自动盲注;盲注阶段全押直接发完摊牌。 */
  startHand(): void {
    if (this.state && !this.state.done) throw new Error('上一手还没结束');
    const button: 'bank' | 'player' = this.handsPlayed % 2 === 0 ? 'bank' : 'player'; // 按钮每手轮换
    const bb = this.opts.bigBlind;
    const sb = Math.max(1, Math.floor(bb / 2));
    const mkSeat = (chips: number): RemoteHoldemSeat => ({ cards: [], chips, street: 0, committed: 0, allIn: false, folded: false });
    this.state = {
      hole: { bank: [], player: [] },
      seats: { bank: mkSeat(this.chips.bank), player: mkSeat(this.chips.player) },
      startChips: { bank: this.chips.bank, player: this.chips.player },
      button,
      street: 'preflop',
      community: [],
      pot: 0,
      currentBet: 0,
      minRaise: bb,
      turn: null,
      acted: { bank: false, player: false },
      done: false,
    };
    this.state.hole[button].push(this.draw(), this.draw());
    this.state.hole[this.other(button)].push(this.draw(), this.draw());
    const post = (who: 'bank' | 'player', blind: number): void => {
      const seat = this.seat(who);
      const pay = Math.min(blind, seat.chips);
      seat.chips -= pay; seat.street += pay; seat.committed += pay;
      this.state!.pot += pay;
      if (seat.chips === 0) seat.allIn = true;
    };
    post(button, sb);
    post(this.other(button), bb);
    this.state.currentBet = Math.max(this.state.seats.bank.street, this.state.seats.player.street);
    if (this.state.seats.bank.allIn || this.state.seats.player.allIn) { this.runOut('盲注全押'); return; }
    this.state.turn = button; // 两人桌翻牌前:按钮(小盲)先行动
  }

  /** 玩家侧动作(客座 AI);非法动作抛错。 */
  playerAct(act: RemoteHoldemAct, amount?: number): void { this.act('player', act, amount); }
  /** 庄家侧动作(本机 AI)。 */
  bankAct(act: RemoteHoldemAct, amount?: number): void { this.act('bank', act, amount); }

  private act(who: 'bank' | 'player', act: RemoteHoldemAct, amount?: number): void {
    const st = this.state!;
    if (st.done) throw new Error('本手已结束');
    if (st.turn !== who) throw new Error('现在不是你的行动回合');
    const seat = this.seat(who);
    if (seat.folded) throw new Error('你已经弃牌');
    const toCall = st.currentBet - seat.street;
    const commit = (n: number): void => {
      const pay = Math.min(n, seat.chips);
      seat.chips -= pay; seat.street += pay; seat.committed += pay;
      st.pot += pay;
      if (seat.chips === 0) seat.allIn = true;
    };
    switch (act) {
      case 'fold': {
        seat.folded = true;
        this.settleFold(this.other(who), `${who === 'player' ? '闲家' : '庄家'}弃牌`);
        return;
      }
      case 'check': {
        if (toCall > 0) throw new Error('有人下注,不能过牌');
        break;
      }
      case 'call': {
        if (toCall <= 0) throw new Error('无需跟注,可以过牌');
        commit(toCall);
        break;
      }
      case 'bet': {
        if (toCall > 0) throw new Error('有人已下注,应跟注或加注');
        if (!Number.isSafeInteger(amount) || (amount as number) < st.minRaise) throw new Error(`下注至少 ${st.minRaise}`);
        commit(amount as number);
        st.currentBet = seat.street;
        st.acted[this.other(who)] = false;
        break;
      }
      case 'raise': {
        if (toCall <= 0) throw new Error('无人下注,应下注(bet)');
        if (!Number.isSafeInteger(amount) || (amount as number) < st.minRaise) throw new Error(`加注至少 ${st.minRaise}`);
        commit(toCall + (amount as number));
        st.minRaise = amount as number;
        st.currentBet = seat.street;
        st.acted[this.other(who)] = false;
        break;
      }
      default:
        throw new Error(`未知动作 ${act}`);
    }
    st.acted[who] = true;
    this.afterAction();
  }

  /** 动作后推进:处理全押退回、街轮转、摊牌;否则轮到对方。 */
  private afterAction(): void {
    const st = this.state!;
    const bank = this.seat('bank');
    const player = this.seat('player');
    const bothAllIn = bank.allIn && player.allIn;
    const shortAllIn = (bank.allIn && bank.street < st.currentBet) || (player.allIn && player.street < st.currentBet);
    if (bothAllIn || shortAllIn) {
      // 全押不足当前注:把未跟齐部分退回另一方。
      if (shortAllIn) {
        const allInStreet = bank.allIn ? bank.street : player.street;
        const other = bank.allIn ? player : bank;
        const refund = st.currentBet - allInStreet;
        if (refund > 0) { other.chips += refund; other.street -= refund; st.pot -= refund; }
        st.currentBet = allInStreet;
      }
      this.runOut('全押摊牌');
      return;
    }
    const matched = bank.street === player.street;
    const bothActed = st.acted.bank && st.acted.player;
    if (matched && bothActed) {
      if (st.street === 'river') { this.showdown('摊牌'); return; }
      if (bank.allIn || player.allIn) { this.runOut('全押摊牌'); return; }
      this.nextStreet();
      return;
    }
    st.turn = this.other(st.turn!);
  }

  private nextStreet(): void {
    const st = this.state!;
    st.street = st.street === 'preflop' ? 'flop' : st.street === 'flop' ? 'turn' : 'river';
    if (st.street === 'flop') st.community.push(this.draw(), this.draw(), this.draw());
    else st.community.push(this.draw());
    for (const who of ['bank', 'player'] as const) this.seat(who).street = 0;
    st.currentBet = 0;
    st.minRaise = this.opts.bigBlind;
    st.acted = { bank: false, player: false };
    const first = this.other(st.button);
    st.turn = first;
  }

  /** 全押:发完公共牌直接摊牌。 */
  private runOut(reason: string): void {
    const st = this.state!;
    while (st.community.length < 5) st.community.push(this.draw());
    this.showdown(reason);
  }

  /** 摊牌:七选五比牌;平局分池。delta = 玩家整手筹码变动。 */
  private showdown(reason: string): void {
    const st = this.state!;
    st.street = 'showdown';
    while (st.community.length < 5) st.community.push(this.draw());
    const bankRank = bestPokerHand([...st.hole.bank, ...st.community]).rank;
    const playerRank = bestPokerHand([...st.hole.player, ...st.community]).rank;
    const cmp = comparePokerHands(playerRank, bankRank);
    const pot = st.pot;
    let winner: 'player' | 'bank' | 'push';
    if (cmp > 0) { winner = 'player'; st.seats.player.chips += pot; }
    else if (cmp < 0) { winner = 'bank'; st.seats.bank.chips += pot; }
    else {
      winner = 'push';
      const half = Math.floor(pot / 2);
      st.seats.player.chips += half;
      st.seats.bank.chips += pot - half;
    }
    st.done = true;
    this.handsPlayed++;
    this.chips.bank = st.seats.bank.chips;
    this.chips.player = st.seats.player.chips;
    const delta = st.seats.player.chips - st.startChips.player;
    this.lastSettle = { winner, delta, reason, playerChips: this.chips.player, bankChips: this.chips.bank };
  }

  /** 弃牌结算:胜者收整池。 */
  private settleFold(winner: 'bank' | 'player', reason: string): void {
    const st = this.state!;
    const pot = st.pot;
    st.seats[winner].chips += pot;
    st.done = true;
    this.handsPlayed++;
    this.chips.bank = st.seats.bank.chips;
    this.chips.player = st.seats.player.chips;
    const delta = st.seats.player.chips - st.startChips.player;
    this.lastSettle = { winner, delta, reason, playerChips: this.chips.player, bankChips: this.chips.bank };
  }

  get phase(): string {
    if (!this.state) return 'awaitStart';
    if (this.state.done) return 'done';
    return this.state.turn === 'player' ? 'player' : 'bank';
  }

  get bet(): number { return this.state?.currentBet ?? 0; }

  /** 闲家视角 state 参数体:底牌、公共牌、池、需跟、街、轮到谁。 */
  stateParts(): string[] {
    const st = this.state;
    if (!st) return [];
    return [
      `turn=${st.turn === 'player' ? 'you' : 'bank'}`,
      `street=${st.street}`,
      `pot=${st.pot}`,
      `toCall=${Math.max(0, st.currentBet - st.seats.player.street)}`,
      `minRaise=${st.minRaise}`,
      `hole=${st.hole.player.map((c) => formatCard(c)).join(',') || 'none'}`,
      `board=${st.community.map((c) => formatCard(c)).join(',') || 'none'}`,
      `button=${st.button}`,
    ];
  }

  settleParts(): string[] | null {
    if (!this.lastSettle || !this.state) return null;
    const s = this.lastSettle;
    return [`result=${s.winner}`, `delta=${s.delta >= 0 ? '+' : ''}${s.delta}`, `chips=${s.bankChips}:${s.playerChips}`, `hands=${this.handsPlayed}`, `dealer=${this.state.hole.bank.map((c) => formatCard(c)).join(',') || 'none'}`, `board=${this.state.community.map((c) => formatCard(c)).join(',') || 'none'}`, `reason=${encodeURIComponent(s.reason)}`];
  }

  handDetail(): string {
    const st = this.state;
    if (!st) return '(未开局)';
    return `池 ${st.pot} / 庄家筹码 ${st.seats.bank.chips} / 闲家筹码 ${st.seats.player.chips} / ${st.street}`;
  }
}
