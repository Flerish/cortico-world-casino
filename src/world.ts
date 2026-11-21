/**
 * 月下牌桌(对战版):AI 与玩家同桌对打 21 点,开局选庄,庄闲对位。
 * 玩家动作走面板 invoke,AI 动作走工具;轮到 AI 时推 casino.turn 事件。
 * 回执与事件只陈述机械事实(点数、结果、余额),不做启发式推断。
 */
import { fileURLToPath } from 'node:url';
import type { ToolCallContext, ToolDef, World, WorldHost, WorldStreamSocket, WorldWebUiDecl } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { nowIso } from 'cortico/core/util.ts';
import { formatCard, handValue, freshDeck, shuffled, type Card } from './cards.ts';
import { casinoConfigGroup, type CasinoConfigSection } from './config.ts';
import {
  formatHand,
  loadTable,
  newTable,
  newSeat,
  recordHand,
  saveTable,
  type HandRecord,
  type Outcome,
  type Phase,
  type Role,
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

/** 一次操作的结果:ok=false 时 text 是给界面或模型的拒绝理由。 */
interface OpResult {
  ok: boolean;
  text: string;
}

/** 全部工具的声明;definition 的 describe 与 tools() 都取它。 */
export const CASINO_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'casino_table',
    description:
      'Read the Moonlit Table state: who is dealer, the phase, the visible cards and totals, the current bet and both chip balances. Actions: "status", "history" (recent settled hands).',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['status', 'history'], description: 'What to read.' },
        limit: { type: 'number', description: 'For "history": how many recent hands, 1-50. Default 10.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'casino_player',
    description:
      'Act as the player (闲家) on the Moonlit Table; only valid when the table shows you are the player. Actions: "bet" (place a stake within [minBet, maxBet] and both balances to start the hand; the receipt holds your two cards and the dealer upcard), "hit", "stand", "double" (first two cards only, stake doubles, one card, then you stand).',
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['bet', 'hit', 'stand', 'double'], description: 'The action to take.' },
        amount: { type: 'number', description: 'Stake for "bet", an integer. Required for "bet", ignored otherwise.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'casino_dealer',
    description:
      'Act as the dealer (庄家) on the Moonlit Table; only valid when the table shows you are the dealer and the hole card is already revealed. Actions: "hit" (draw one card; busting pays the player at once), "stand" (settle against the player total you can see).',
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['hit', 'stand'], description: 'The action to take.' },
      },
      required: ['action'],
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
          description: '与 AI 同桌对打 21 点:选庄、下注、要牌、停牌,绿呢桌面实时显示双方的牌。',
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
    if (name === 'casino_table') return this.toolTable(args);
    if (name === 'casino_player') return this.toolPlayer(args);
    if (name === 'casino_dealer') return this.toolDealer(args);
    if (name === 'casino_bank') return this.toolBank(args);
    return `未知的工具 ${name}。`;
  }

  private toolTable(args: Record<string, unknown>): string {
    const state = this.state!;
    if (String(args.action ?? '') === 'history') {
      const limit = Math.min(Math.max(Math.floor(Number(args.limit ?? 10)) || 10, 1), 50);
      const lines = state.history.slice(0, limit).map((r, i) =>
        `${i + 1}. 第${r.round}手 庄:${r.dealer === 'ai' ? '你' : '主人'} 押 ${r.bet},闲家 ${r.playerCards.join(' ')} 对 庄家 ${r.dealerCards.join(' ')},${OUTCOME_TEXT[r.outcome]},闲家净 ${r.delta >= 0 ? '+' : ''}${r.delta}`,
      );
      return lines.length ? `最近 ${lines.length} 手:\n${lines.join('\n')}` : '还没有记录。';
    }
    const aiDealer = state.aiRole === 'dealer';
    const roleText = state.aiRole === null ? '还没开局(主人在面板选庄后开始)' : aiDealer ? '你是庄家,主人是闲家' : '你是闲家,主人是庄家';
    const phaseText: Record<Phase, string> = {
      idle: '等开下一手',
      betting: aiDealer ? '等主人(闲家)下注' : '等你(闲家)下注',
      playerActing: aiDealer ? '等主人(闲家)要牌/停牌' : '等你(闲家)要牌/停牌/加倍',
      dealerActing: aiDealer ? '等你(庄家)要牌/停牌' : '等主人(庄家)要牌/停牌',
    };
    const lines = [
      `第 ${state.round} 手(${state.round === 0 ? '还没打过' : `上一手押 ${state.bet}`})。${roleText},${phaseText[state.phase]}。`,
      `你的筹码:${state.ai.chips};主人筹码:${state.player.chips}(起始 ${this.opts.cfg.startChips},最小注 ${this.opts.cfg.minBet},单手上限 ${this.opts.cfg.maxBet})。`,
    ];
    if (state.phase === 'betting' || state.phase === 'playerActing' || state.phase === 'dealerActing') {
      lines.push(`当前押注 ${state.bet}。`);
      lines.push(`闲家手:${this.cards(state.playerCards)}(${state.playerCards.length ? String(handValue(state.playerCards).total) : '未发'})。`);
      if (state.holeRevealed) {
        lines.push(`庄家手(已亮):${this.cards(state.dealerCards)}(${handValue(state.dealerCards).total})。`);
      } else if (state.dealerCards.length) {
        lines.push(`庄家明牌:${formatCard(state.dealerCards[0] ?? { rank: 0, suit: 0 })},暗牌未亮。`);
      }
    }
    return lines.join('\n');
  }

  private toolPlayer(args: Record<string, unknown>): string {
    const state = this.state!;
    if (state.aiRole !== 'player') return state.aiRole === null ? '还没开局,主人在面板选庄后才有你的角色。' : '这一桌你是庄家,闲家动作轮不到你;等主人的牌。';
    const result = this.playerAction(args);
    return result.text;
  }

  private toolDealer(args: Record<string, unknown>): string {
    const state = this.state!;
    if (state.aiRole !== 'dealer') return '这一桌你是闲家,庄家动作轮不到你。';
    if (state.phase !== 'dealerActing') return '现在不是庄家行动的阶段。';
    const action = String(args.action ?? '');
    if (action === 'hit') {
      state.dealerCards.push(this.draw());
      if (handValue(state.dealerCards).total > 21) return this.settle();
      this.save();
      this.broadcast();
      return `庄家手:${this.cards(state.dealerCards)}(${handValue(state.dealerCards).total})。继续 hit / stand。`;
    }
    if (action === 'stand') return this.settle();
    return `未知动作 ${action};取 hit / stand。`;
  }

  private toolBank(args: Record<string, unknown>): string {
    const state = this.state!;
    const seat = state.ai;
    if (String(args.action ?? '') === 'relief') {
      if (seat.chips >= this.opts.cfg.minBet) {
        return `救济只给破产的人:你的余额 ${seat.chips} 还够最小注 ${this.opts.cfg.minBet}。`;
      }
      seat.chips = this.opts.cfg.startChips;
      seat.bankruptcies++;
      this.save();
      this.broadcast();
      return `救济金 ${this.opts.cfg.startChips} 已到账,余额 ${seat.chips};这是你第 ${seat.bankruptcies} 次破产。牌桌不记账外的东西。`;
    }
    return [
      `你的余额:${seat.chips}(累计 ${seat.wins} 胜 / ${seat.losses} 负 / ${seat.pushes} 平,净 ${seat.net >= 0 ? '+' : ''}${seat.net},破产 ${seat.bankruptcies} 次)。`,
      `主人余额:${state.player.chips}(${state.player.wins} 胜 / ${state.player.losses} 负 / ${state.player.pushes} 平)。`,
    ].join('\n');
  }

  // ---------------------------------------------------------------- 对局

  /** 面板或工具共用的闲家动作;调用方已保证角色与阶段(错误以 ok=false 返回)。 */
  private playerAction(args: Record<string, unknown>): OpResult {
    const state = this.state!;
    const action = String(args.action ?? '');
    if (state.phase === 'idle') {
      return { ok: false, text: '还没有进行中的手;在面板选庄开一手。' };
    }
    if (action === 'bet') {
      if (state.phase !== 'betting') return { ok: false, text: '这一手已经开了,别重复下注。' };
      const amount = this.readBet(args.amount);
      if (typeof amount === 'string') return { ok: false, text: amount };
      const settled = this.deal(amount);
      this.save();
      this.broadcast();
      if (settled) return { ok: true, text: settled };
      return { ok: true, text: this.playerActingReceipt() };
    }
    if (state.phase !== 'playerActing') {
      return { ok: false, text: state.phase === 'dealerActing' ? '闲家的牌已经停了,现在是庄家行动。' : '现在没有进行中的手。' };
    }
    if (action === 'hit') {
      state.playerCards.push(this.draw());
      if (handValue(state.playerCards).total > 21) return { ok: true, text: this.settle() };
      this.save();
      this.broadcast();
      return { ok: true, text: this.playerActingReceipt() };
    }
    if (action === 'stand') {
      this.toDealerActing();
      if (state.aiRole === 'dealer') {
        this.save();
        this.notifyDealerTurn();
        this.broadcast();
      } else {
        this.save();
        this.broadcast();
      }
      return { ok: true, text: this.dealerActingReceipt() };
    }
    if (action === 'double') {
      if (state.playerCards.length !== 2) return { ok: false, text: '只有首两张牌能加倍。' };
      const doubled = state.bet * 2;
      if (doubled > this.opts.cfg.maxBet) return { ok: false, text: `加倍后会超过单手上限 ${this.opts.cfg.maxBet}。` };
      if (doubled > Math.min(state.player.chips, state.ai.chips)) {
        return { ok: false, text: `加倍到 ${doubled} 超出了某一方赔得起的余额(你的 ${state.player.chips} / 对方 ${state.ai.chips})。` };
      }
      state.bet = doubled;
      state.doubled = true;
      state.playerCards.push(this.draw());
      if (handValue(state.playerCards).total > 21) return { ok: true, text: this.settle() };
      this.toDealerActing();
      if (state.aiRole === 'dealer') {
        this.save();
        this.notifyDealerTurn();
        this.broadcast();
      } else {
        this.save();
        this.broadcast();
      }
      return { ok: true, text: this.dealerActingReceipt() };
    }
    return { ok: false, text: `未知动作 ${action};取 bet / hit / stand / double。` };
  }

  /** 发一手牌:闲家两张明牌,庄家一亮一暗;自然黑杰克立即结算并返回结算文本。 */
  private deal(bet: number): string | null {
    const state = this.state!;
    state.bet = bet;
    state.playerCards = [this.draw(), this.draw()];
    state.dealerCards = [this.draw(), this.draw()];
    state.holeRevealed = false;
    state.doubled = false;
    const playerNatural = handValue(state.playerCards).natural;
    const dealerNatural = handValue(state.dealerCards).natural;
    if (playerNatural || dealerNatural) {
      state.holeRevealed = true;
      return this.settle();
    }
    state.phase = 'playerActing';
    return null;
  }

  /** 闲家停牌(或加倍后未爆):亮暗牌,进入庄家阶段。 */
  private toDealerActing(): void {
    const state = this.state!;
    state.holeRevealed = true;
    state.phase = 'dealerActing';
  }

  /** 结算:比点、转账、记档、推事件、回 idle。 */
  private settle(): string {
    const state = this.state!;
    const player = handValue(state.playerCards);
    const dealer = handValue(state.dealerCards);
    let outcome: Outcome;
    let delta: number;
    if (player.total > 21) {
      outcome = 'bust';
      delta = -state.bet;
    } else if (dealer.total > 21) {
      outcome = 'win';
      delta = state.bet;
    } else if (player.natural && dealer.natural) {
      outcome = 'push';
      delta = 0;
    } else if (player.natural) {
      outcome = 'blackjack';
      delta = Math.round(state.bet * 1.5);
    } else if (dealer.natural) {
      outcome = 'lose';
      delta = -state.bet;
    } else if (player.total > dealer.total) {
      outcome = 'win';
      delta = state.bet;
    } else if (player.total < dealer.total) {
      outcome = 'lose';
      delta = -state.bet;
    } else {
      outcome = 'push';
      delta = 0;
    }
    const playerIsIdler = state.aiRole === 'player';
    const idlerSeat: SeatState = playerIsIdler ? state.ai : state.player;
    const dealerSeat: SeatState = playerIsIdler ? state.player : state.ai;
    idlerSeat.chips += delta;
    idlerSeat.net += delta;
    dealerSeat.chips -= delta;
    dealerSeat.net -= delta;
    if (outcome === 'win' || outcome === 'blackjack') {
      idlerSeat.wins++;
      dealerSeat.losses++;
    } else if (outcome === 'push') {
      idlerSeat.pushes++;
      dealerSeat.pushes++;
    } else {
      idlerSeat.losses++;
      dealerSeat.wins++;
    }
    const record: HandRecord = {
      dealer: state.aiRole === 'dealer' ? 'ai' : 'player',
      round: state.round,
      bet: state.bet,
      playerCards: formatHand(state.playerCards),
      dealerCards: formatHand(state.dealerCards),
      outcome,
      delta,
      at: nowIso(this.opts.timezone),
    };
    recordHand(state, record);
    state.phase = 'idle';
    state.round++;
    state.bet = 0;
    state.playerCards = [];
    state.dealerCards = [];
    state.holeRevealed = false;
    state.doubled = false;
    this.save();
    this.broadcast();
    const line = [
      `第 ${record.round} 手结算(庄:${record.dealer === 'ai' ? '你' : '主人'},押 ${record.bet})。`,
      `闲家 ${record.playerCards.join(' ')} 对 庄家 ${record.dealerCards.join(' ')}(${player.total} 对 ${dealer.total}${dealer.total > 21 ? ',庄爆' : ''}${player.total > 21 ? ',闲爆' : ''})。`,
      `闲家${OUTCOME_TEXT[outcome]},净 ${delta >= 0 ? '+' : ''}${delta}。你的筹码 ${state.ai.chips},主人 ${state.player.chips}。`,
    ].join(' ');
    void this.host?.pushEvent({
      type: 'casino.result',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: line,
    }, { trigger: 'debounce' });
    return line;
  }

  /** 闲家视角的手进行中回执。 */
  private playerActingReceipt(): string {
    const state = this.state!;
    const value = handValue(state.playerCards);
    const aiIsIdler = state.aiRole === 'player';
    const ownChips = aiIsIdler ? state.ai.chips : state.player.chips;
    return [
      aiIsIdler ? '手还在进行。' : '主人的手还在进行。',
      `闲家手:${this.cards(state.playerCards)}(${value.total}${value.soft ? ' 软' : ''}),押注 ${state.bet}${state.doubled ? '(已加倍)' : ''}。`,
      `庄家明牌:${formatCard(state.dealerCards[0] ?? { rank: 0, suit: 0 })},暗牌未亮。${aiIsIdler ? `你的余额 ${ownChips}。接下来用 casino_player 的 hit / stand / double。` : ''}`,
    ].join(' ');
  }

  /** 庄家阶段回执:暗牌已亮,庄家看得到闲家点数。 */
  private dealerActingReceipt(): string {
    const state = this.state!;
    const dealerTotal = handValue(state.dealerCards).total;
    const playerTotal = handValue(state.playerCards).total;
    const aiIsDealer = state.aiRole === 'dealer';
    return [
      aiIsDealer ? '轮到你做庄(暗牌已亮)。' : '主人做庄(暗牌已亮)。',
      `庄家手:${this.cards(state.dealerCards)}(${dealerTotal});闲家停在 ${playerTotal} 点,押注 ${state.bet}${state.doubled ? '(已加倍)' : ''}。`,
      aiIsDealer ? `用 casino_dealer 的 hit / stand;爆牌按押注赔付。你的银行 ${state.ai.chips}。` : '',
    ].filter(Boolean).join(' ');
  }

  /** 轮到 AI 了:下注或做庄决定,推 flush 事件。 */
  private notifyBettingTurn(): void {
    const state = this.state!;
    void this.host?.pushEvent({
      type: 'casino.turn',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: `轮到你下注。你是闲家,主人坐庄。最小注 ${this.opts.cfg.minBet},单手上限 ${this.opts.cfg.maxBet},你的余额 ${state.ai.chips},庄家银行 ${state.player.chips};押注不能超过两边较小的那个。用 casino_player 的 bet 开手。`,
    }, { trigger: 'flush' });
  }

  private notifyDealerTurn(): void {
    void this.host?.pushEvent({
      type: 'casino.turn',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: `轮到你做庄。${this.dealerActingReceipt()}`,
    }, { trigger: 'flush' });
  }

  // ---------------------------------------------------------------- 面板

  private async handleInvoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel !== 'table') throw new Error(`unknown panel ${panel}`);
    if (!this.state) this.state = loadTable(this.opts.dataDir) ?? newTable(this.opts.cfg.startChips);
    if (method === 'state') return this.snapshot();
    if (method === 'history') return { history: this.state.history };
    if (method !== 'action') throw new Error(`unknown method ${method}`);
    const arg = (args[0] ?? {}) as Record<string, unknown>;
    const action = String(arg.action ?? '');
    const state = this.state;

    if (action === 'newgame') {
      const dealer = String(arg.dealer ?? '');
      if (dealer !== 'ai' && dealer !== 'player') throw new Error('庄家要写 ai 或 player。');
      if (state.phase !== 'idle') throw new Error('这一手还没打完。');
      state.aiRole = dealer === 'ai' ? 'dealer' : 'player';
      state.round++;
      state.phase = 'betting';
      this.save();
      this.broadcast();
      if (state.aiRole === 'player') this.notifyBettingTurn();
      return this.snapshot();
    }
    if (action === 'relief') {
      if (state.player.chips >= this.opts.cfg.minBet) throw new Error('救济只给破产的人。');
      state.player.chips = this.opts.cfg.startChips;
      state.player.bankruptcies++;
      this.save();
      this.broadcast();
      return this.snapshot();
    }
    if (action === 'nudge') {
      if (state.phase === 'betting' && state.aiRole === 'player') {
        this.notifyBettingTurn();
        return this.snapshot();
      }
      if (state.phase === 'dealerActing' && state.aiRole === 'dealer') {
        this.notifyDealerTurn();
        return this.snapshot();
      }
      throw new Error('现在没有在等 AI。');
    }

    if (action === 'bet') {
      if (state.aiRole !== 'dealer') throw new Error('你现在是庄家,不用下注;等闲家(自动)下注。');
      const result = this.playerAction({ action: 'bet', amount: arg.amount });
      if (!result.ok) throw new Error(result.text);
      return this.snapshot();
    }
    if (action === 'hit' || action === 'stand' || action === 'double') {
      if (state.aiRole !== 'dealer') throw new Error('闲家是自动的(AI),你做庄时不用替它出牌。');
      const result = this.playerAction({ action });
      if (!result.ok) throw new Error(result.text);
      return this.snapshot();
    }
    if (action === 'dealer_hit' || action === 'dealer_stand') {
      if (state.aiRole !== 'player') throw new Error('这一手庄家是 AI,轮不到你做庄。');
      if (state.phase !== 'dealerActing') throw new Error('现在不是庄家行动的阶段。');
      if (action === 'dealer_hit') {
        state.dealerCards.push(this.draw());
        if (handValue(state.dealerCards).total > 21) {
          this.settle();
          return this.snapshot();
        }
        this.save();
        this.broadcast();
        return this.snapshot();
      }
      this.settle();
      return this.snapshot();
    }
    throw new Error(`未知动作 ${action}`);
  }

  private handleStream(_panel: string, socket: WorldStreamSocket): void {
    this.sockets.add(socket);
    socket.onClose(() => {
      this.sockets.delete(socket);
    });
    socket.send(JSON.stringify(this.snapshot()));
  }

  private broadcast(): void {
    if (!this.sockets.size) return;
    const frame = JSON.stringify(this.snapshot());
    for (const socket of this.sockets) socket.send(frame);
  }

  /** 面板视图:闲家牌全亮;庄家暗牌只在 dealerActing 与结算后亮。 */
  private snapshot(): unknown {
    const state = this.state!;
    const dealerVisible = state.holeRevealed ? state.dealerCards : state.dealerCards.slice(0, 1);
    const seatView = (seat: SeatState, role: Role | null) => ({
      chips: seat.chips,
      wins: seat.wins,
      losses: seat.losses,
      pushes: seat.pushes,
      net: seat.net,
      bankruptcies: seat.bankruptcies,
      role,
    });
    return {
      version: state.version,
      phase: state.phase,
      round: state.round,
      aiRole: state.aiRole,
      bet: state.bet,
      doubled: state.doubled,
      holeRevealed: state.holeRevealed,
      playerCards: formatHand(state.playerCards),
      playerTotal: state.playerCards.length ? handValue(state.playerCards).total : null,
      dealerCards: formatHand(dealerVisible),
      dealerTotal: dealerVisible.length ? handValue(dealerVisible).total : null,
      holeCount: state.dealerCards.length - dealerVisible.length,
      ai: seatView(state.ai, state.aiRole === null ? null : state.aiRole),
      player: seatView(state.player, state.aiRole === null ? null : state.aiRole === 'dealer' ? 'player' : 'dealer'),
      minBet: this.opts.cfg.minBet,
      maxBet: this.opts.cfg.maxBet,
      startChips: this.opts.cfg.startChips,
      lastResult: state.history[0] ?? null,
      history: state.history.slice(0, 10),
    };
  }

  // ---------------------------------------------------------------- 底层

  /** 校验下注:整数、范围内、不超过闲家与庄家余额的较小值。 */
  private readBet(raw: unknown): number | string {
    const bet = Math.floor(Number(raw));
    if (!Number.isFinite(bet)) return `下注要是整数,收到 ${JSON.stringify(raw ?? null)}。`;
    const state = this.state!;
    if (bet < this.opts.cfg.minBet) return `最小下注 ${this.opts.cfg.minBet}。`;
    if (bet > this.opts.cfg.maxBet) return `单手上限 ${this.opts.cfg.maxBet}。`;
    const backing = Math.min(state.player.chips, state.ai.chips);
    if (bet > backing) return `押注不能超过双方余额的较小值 ${backing}(你 ${state.player.chips} / 对方 ${state.ai.chips})。`;
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
