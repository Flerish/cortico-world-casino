/**
 * 月下牌桌:一个本地 21 点牌桌。AI 通过工具自己打,主人在 WebUI 面板坐同桌。
 * 筹码是游戏内数字。回执与事件只陈述机械事实(点数、结果、余额),不做启发式推断。
 */
import { fileURLToPath } from 'node:url';
import type { ToolCallContext, ToolDef, World, WorldHost, WorldStreamSocket, WorldWebUiDecl } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { nowIso } from 'cortico/core/util.ts';
import { dealerShouldHit, formatCard, handValue, freshDeck, shuffled, type Card } from './cards.ts';
import { casinoConfigGroup, type CasinoConfigSection } from './config.ts';
import {
  formatHand,
  loadTable,
  newTable,
  recordHand,
  saveTable,
  type Outcome,
  type Seat,
  type SeatState,
  type TableState,
} from './table.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

export interface CasinoWorldOptions {
  /** `worlds.casino` 的活引用;startChips 等现读即生效。 */
  cfg: CasinoConfigSection;
  timezone: string;
  /** 部署数据目录;桌面存档写这里的 casino-table.json。 */
  dataDir: string;
  /** 可注入的随机源;测试用它定牌。缺省 Math.random。 */
  rng?: () => number;
}

/** 一次落座操作的结果:ok=false 时 text 是给界面或模型的拒绝理由。 */
interface SeatPlayResult {
  ok: boolean;
  text: string;
}

/** 全部工具的声明;definition 的 describe 与 tools() 都取它。 */
export const CASINO_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'casino_play',
    description:
      'Play one blackjack hand on the Moonlit Table against the dealer. Actions: "deal" (place a bet and get two cards; the receipt holds your cards, the dealer upcard and your remaining chips), "hit" (draw one card; busting settles the hand at once), "stand" (the dealer then draws to 17 and settles), "double" (double the stake on your first two cards, draw exactly one card and stand). One hand must be settled before the next "deal".',
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['deal', 'hit', 'stand', 'double'], description: 'The action to take.' },
        bet: { type: 'number', description: 'Stake for "deal", an integer within [minBet, maxBet] and your chip balance. Required for "deal", ignored otherwise.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'casino_history',
    description: "Read recent settled hands on the Moonlit Table (yours and the owner's) with per-seat totals.",
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'number', description: 'How many recent hands to list, 1-50. Default 10.' },
      },
    },
  },
  {
    name: 'casino_bank',
    description:
      'Read your chip account on the Moonlit Table, or take bankruptcy relief. Actions: "status" (chips, hand totals, net, bankruptcy count), "relief" (only when your balance is below minBet: the balance resets to the configured startChips and one bankruptcy is recorded).',
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['status', 'relief'], description: 'What to do.' },
      },
      required: ['action'],
    },
  },
];

const OUTCOME_TEXT: Record<Outcome, string> = {
  win: '赢',
  lose: '输',
  push: '平',
  blackjack: '黑杰克',
  bust: '爆牌',
};

export class CasinoWorld implements World {
  readonly id = 'casino';
  private host: WorldHost | null = null;
  private state: TableState | null = null;
  private readonly sockets = new Set<WorldStreamSocket>();

  constructor(private readonly opts: CasinoWorldOptions) {}

  /** 只报值;前缀文本一律来自 ENV_PROMPT.md 模板。 */
  envPromptVars(): Record<string, string> {
    return {
      'casino.startChips': String(this.opts.cfg.startChips),
      'casino.minBet': String(this.opts.cfg.minBet),
      'casino.maxBet': String(this.opts.cfg.maxBet),
    };
  }

  tools(): ToolDef[] {
    return CASINO_TOOL_DECLS.map((decl) => ({
      ...decl,
      handler: (args: Record<string, unknown>, _ctx: ToolCallContext) => this.handleTool(decl.name, args),
    }));
  }

  webUi(language?: Language): WorldWebUiDecl {
    return {
      panels: [
        {
          id: 'table',
          title: '牌桌',
          description: '同桌的牌桌:主人从这里开手、要牌、停牌;AI 侧的筹码与战绩同步显示。',
          getMethods: ['state', 'history'],
        },
      ],
      invoke: (panel, method, args) => this.handleInvoke(panel, method, args),
      stream: (panel, socket) => this.handleStream(panel, socket),
      config: [casinoConfigGroup(language ?? 'zh')],
      promptDocs: [
        {
          key: 'worlds.casino.envPrompt',
          title: '月下牌桌 · 环境提示词',
          description: '月下牌桌进 system 前缀的那一段。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [
            { name: 'casino.startChips', description: '配置里的起始筹码,此刻的值。' },
            { name: 'casino.minBet', description: '配置里的最小下注,此刻的值。' },
            { name: 'casino.maxBet', description: '配置里的单手最大下注,此刻的值。' },
          ],
        },
      ],
    };
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.state = loadTable(this.opts.dataDir);
    if (!this.state) {
      this.state = newTable(this.opts.cfg.startChips);
      this.save();
    }
  }

  async stop(): Promise<void> {
    if (this.state) this.save();
    for (const socket of this.sockets) socket.close('world stopped');
    this.sockets.clear();
    this.host = null;
  }

  // ---------------------------------------------------------------- 工具

  private async handleTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.state) this.state = loadTable(this.opts.dataDir) ?? newTable(this.opts.cfg.startChips);
    if (name === 'casino_play') return this.playSeat('ai', args).text;
    if (name === 'casino_history') return this.toolHistory(args);
    if (name === 'casino_bank') return this.toolBank(args);
    return `未知的工具 ${name}。`;
  }

  /** 一个座位的一手:AI 走工具循环,主人的调用来自面板。ok=false 时 text 是拒绝理由。 */
  private playSeat(who: Seat, args: Record<string, unknown>): SeatPlayResult {
    const state = this.state!;
    const seat = who === 'ai' ? state.ai : state.owner;
    const action = String(args.action ?? '');
    if (action === 'deal') {
      if (seat.hand) return { ok: false, text: `${who === 'ai' ? '你' : '主人'}上一手还没结算,先把它打完。` };
      const bet = this.readBet(args.bet, seat);
      if (typeof bet === 'string') return { ok: false, text: bet };
      seat.chips -= bet;
      seat.hand = {
        cards: [this.draw(), this.draw()],
        dealer: [this.draw(), this.draw()],
        bet,
        phase: 'acting',
        doubled: false,
      };
      const player = handValue(seat.hand.cards);
      if (!player.natural) {
        this.save();
        this.broadcast();
        return { ok: true, text: this.actingReceipt(who, seat.hand) };
      }
      return { ok: true, text: this.settle(who) };
    }
    const hand = seat.hand;
    if (!hand) return { ok: false, text: '现在没有进行中的手,先 deal。' };
    if (hand.phase !== 'acting') return { ok: false, text: '这一手已经结算了,先 deal 开新手。' };
    if (action === 'hit') {
      hand.cards.push(this.draw());
      if (handValue(hand.cards).total > 21) return { ok: true, text: this.settle(who) };
      this.save();
      this.broadcast();
      return { ok: true, text: this.actingReceipt(who, hand) };
    }
    if (action === 'stand') {
      return { ok: true, text: this.settle(who) };
    }
    if (action === 'double') {
      if (hand.cards.length !== 2) return { ok: false, text: '只有首两张牌能加倍。' };
      if (seat.chips < hand.bet) return { ok: false, text: `余额 ${seat.chips} 不够加倍(要 ${hand.bet})。` };
      if (hand.bet >= this.opts.cfg.maxBet) return { ok: false, text: `加倍后会超过单手上限 ${this.opts.cfg.maxBet}。` };
      seat.chips -= hand.bet;
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(this.draw());
      return { ok: true, text: this.settle(who) };
    }
    return { ok: false, text: `未知动作 ${action};取 deal / hit / stand / double。` };
  }

  /** 手还在进行时的回执:手牌、点数、庄家明牌、余额。 */
  private actingReceipt(who: Seat, hand: NonNullable<SeatState['hand']>): string {
    const seat = who === 'ai' ? this.state!.ai : this.state!.owner;
    const value = handValue(hand.cards);
    return [
      who === 'ai' ? '手还在进行。' : '主人的手还在进行。',
      `手牌:${this.cards(hand.cards)}(${value.total}${value.soft ? ' 软' : ''})。`,
      `庄家明牌:${formatCard(hand.dealer[0] ?? { rank: 0, suit: 0 })},押注 ${hand.bet},余额 ${seat.chips}。`,
      who === 'ai' ? '接下来用 casino_play 的 hit / stand / double。' : '',
    ].filter(Boolean).join('\n');
  }

  private toolHistory(args: Record<string, unknown>): string {
    const limit = Math.min(Math.max(Math.floor(Number(args.limit ?? 10)) || 10, 1), 50);
    const state = this.state!;
    const mine = state.history.filter((r) => r.who === 'ai');
    const lines = mine.slice(0, limit).map((r, i) =>
      `${i + 1}. ${r.at} 押 ${r.bet},${r.playerCards.join(' ')} 对 ${r.dealerCards.join(' ')},${OUTCOME_TEXT[r.outcome]},${r.delta >= 0 ? '+' : ''}${r.delta}`,
    );
    return [
      `你的累计:${state.ai.wins} 胜 / ${state.ai.losses} 负 / ${state.ai.pushes} 平,净 ${state.ai.net >= 0 ? '+' : ''}${state.ai.net},破产 ${state.bankruptcies} 次。`,
      `主人(同桌玩家)累计:${state.owner.wins} 胜 / ${state.owner.losses} 负 / ${state.owner.pushes} 平,余额 ${state.owner.chips}。`,
      lines.length ? `最近 ${lines.length} 手:\n${lines.join('\n')}` : '还没有记录。',
    ].join('\n');
  }

  private toolBank(args: Record<string, unknown>): string {
    const state = this.state!;
    const seat = state.ai;
    if (String(args.action ?? '') === 'relief') {
      if (seat.chips >= this.opts.cfg.minBet) {
        return `救济只给破产的人:你的余额 ${seat.chips} 还够最小注 ${this.opts.cfg.minBet}。`;
      }
      seat.chips = this.opts.cfg.startChips;
      state.bankruptcies++;
      this.save();
      this.broadcast();
      return `救济金 ${this.opts.cfg.startChips} 已到账,余额 ${seat.chips};这是第 ${state.bankruptcies} 次破产。牌桌不记账外的东西。`;
    }
    return [
      `余额:${seat.chips}(起始 ${this.opts.cfg.startChips},最小注 ${this.opts.cfg.minBet},单手上限 ${this.opts.cfg.maxBet})。`,
      `累计:${seat.wins} 胜 / ${seat.losses} 负 / ${seat.pushes} 平,净 ${seat.net >= 0 ? '+' : ''}${seat.net},破产 ${state.bankruptcies} 次。`,
      `主人余额:${state.owner.chips}。`,
    ].join('\n');
  }

  // ---------------------------------------------------------------- 结算

  /** 结算一个座位的手。AI 的结果进工具回执;主人的结果推 casino.result 事件给模型看。 */
  private settle(who: Seat): string {
    const state = this.state!;
    const seat = who === 'ai' ? state.ai : state.owner;
    const hand = seat.hand;
    if (!hand) return '没有进行中的手。';
    const player = handValue(hand.cards);
    const dealer = [...hand.dealer];
    if (!player.natural) {
      while (dealerShouldHit(dealer)) dealer.push(this.draw());
    }
    hand.phase = 'done';
    const house = handValue(dealer);
    let outcome: Outcome;
    let delta: number;
    if (player.total > 21) {
      outcome = 'bust';
      delta = -hand.bet;
    } else if (player.natural && !house.natural) {
      outcome = 'blackjack';
      delta = Math.round(hand.bet * 1.5);
      seat.chips += hand.bet + delta;
    } else if (house.natural && !player.natural) {
      outcome = 'lose';
      delta = -hand.bet;
    } else if (house.total > 21 || player.total > house.total) {
      outcome = 'win';
      delta = hand.bet;
      seat.chips += hand.bet * 2;
    } else if (player.total === house.total) {
      outcome = 'push';
      delta = 0;
      seat.chips += hand.bet;
    } else {
      outcome = 'lose';
      delta = -hand.bet;
    }
    seat.net += delta;
    if (outcome === 'win' || outcome === 'blackjack') seat.wins++;
    else if (outcome === 'push') seat.pushes++;
    else seat.losses++;
    recordHand(state, {
      who,
      bet: hand.bet,
      playerCards: formatHand(hand.cards),
      dealerCards: formatHand(dealer),
      outcome,
      delta,
      at: nowIso(this.opts.timezone),
    });
    seat.hand = null;
    this.save();
    this.broadcast();
    const line = [
      who === 'ai' ? '你的手' : '主人的手',
      `${this.cards(hand.cards)}(${player.total})对庄家 ${this.cards(dealer)}(${house.total}${house.total > 21 ? ',爆' : ''})。`,
      `结果:${OUTCOME_TEXT[outcome]},${delta >= 0 ? '+' : ''}${delta},余额 ${seat.chips}。`,
    ].join(' ');
    if (who === 'owner') {
      void this.host?.pushEvent({
        type: 'casino.result',
        ts: nowIso(this.opts.timezone),
        source: this.id,
        origin: 'internal',
        senderKey: this.id,
        text: line,
      }, { trigger: 'debounce' });
    }
    return line;
  }

  // ---------------------------------------------------------------- 面板

  private async handleInvoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel !== 'table') throw new Error(`unknown panel ${panel}`);
    if (!this.state) this.state = loadTable(this.opts.dataDir) ?? newTable(this.opts.cfg.startChips);
    if (method === 'state') return this.ownerSnapshot();
    if (method === 'history') return { history: this.state.history };
    if (method !== 'action') throw new Error(`unknown method ${method}`);
    const arg = (args[0] ?? {}) as { action?: string; bet?: number };
    const result = this.playSeat('owner', { action: String(arg.action ?? ''), bet: arg.bet });
    if (!result.ok) throw new Error(result.text);
    return this.ownerSnapshot();
  }

  private handleStream(_panel: string, socket: WorldStreamSocket): void {
    this.sockets.add(socket);
    socket.onClose(() => {
      this.sockets.delete(socket);
    });
    socket.send(JSON.stringify(this.ownerSnapshot()));
  }

  private broadcast(): void {
    if (!this.sockets.size) return;
    const frame = JSON.stringify(this.ownerSnapshot());
    for (const socket of this.sockets) socket.send(frame);
  }

  /** 面板视图:AI 与主人的手牌全亮,各手的庄家暗牌在 acting 时扣下。 */
  private ownerSnapshot(): unknown {
    const state = this.state!;
    const seatView = (who: Seat, seat: SeatState) => {
      const hand = seat.hand;
      return {
        who,
        chips: seat.chips,
        wins: seat.wins,
        losses: seat.losses,
        pushes: seat.pushes,
        net: seat.net,
        hand: hand
          ? {
              cards: formatHand(hand.cards),
              total: handValue(hand.cards).total,
              bet: hand.bet,
              phase: hand.phase,
              doubled: hand.doubled,
              dealerUpcard: formatCard(hand.dealer[0] ?? { rank: 0, suit: 0 }),
            }
          : null,
      };
    };
    return {
      version: state.version,
      minBet: this.opts.cfg.minBet,
      maxBet: this.opts.cfg.maxBet,
      startChips: this.opts.cfg.startChips,
      ai: seatView('ai', state.ai),
      owner: seatView('owner', state.owner),
      bankruptcies: state.bankruptcies,
      history: state.history.slice(0, 10),
    };
  }

  // ---------------------------------------------------------------- 底层

  private readBet(raw: unknown, seat: SeatState): number | string {
    const bet = Math.floor(Number(raw));
    if (!Number.isFinite(bet)) return `下注要是整数,收到 ${JSON.stringify(raw ?? null)}。`;
    if (bet < this.opts.cfg.minBet) return `最小下注 ${this.opts.cfg.minBet}。`;
    if (bet > this.opts.cfg.maxBet) return `单手上限 ${this.opts.cfg.maxBet}。`;
    if (bet > seat.chips) return `余额 ${seat.chips},押不起 ${bet}。`;
    return bet;
  }

  private cards(cards: readonly Card[]): string {
    return cards.map((card) => formatCard(card)).join(' ');
  }

  private draw(): Card {
    const state = this.state!;
    if (state.drawn >= state.shoe.length) {
      state.shoe = shuffled(freshDeck(), this.opts.rng ?? Math.random);
      state.drawn = 0;
    }
    return state.shoe[state.drawn++]!;
  }

  private save(): void {
    if (this.state) saveTable(this.opts.dataDir, this.state);
  }
}
