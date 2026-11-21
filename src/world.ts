/**
 * 月下牌桌:标准 21 点。AI 与玩家对坐,开局选庄;庄家是机械的银行——不管坐着的是谁,
 * 闲家打完手牌后引擎替庄家翻暗牌、按固定规则补牌(不足 17 必须补,软 17 停/补可配)。
 * 全场唯一的暗牌是庄家的第二张;闲家的牌全部明牌。闲家先行动,先爆先输。
 * 支持分牌(同点首两张,一手变两手)、保险(庄家亮 A 时)、投降(首两张弃一半)。
 * 所有面向模型的文字(事件、回执、错误)按部署语言出中英两份,见 model-text.ts;
 * 面板文字按浏览器语言,见 webui/strings.ts。
 */
import { fileURLToPath } from 'node:url';
import type { ToolCallContext, ToolDef, World, WorldHost, WorldStreamSocket, WorldWebUiDecl } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { nowIso } from 'cortico/core/util.ts';
import { dealerShouldHit, formatCard, handValue, freshDeck, shuffled, type Card } from './cards.ts';
import { casinoConfigGroup, type CasinoConfigSection } from './config.ts';
import { modelText, readModelLanguage, readOwnerLabel, type ModelText } from './model-text.ts';
import { loadMatches, MATCHES_LIMIT, saveMatches, type MatchRecord } from './matches.ts';
import {
  formatHand,
  loadTable,
  newSeat,
  newTable,
  recordHand,
  saveTable,
  type HandRecord,
  type IdlerHand,
  type Outcome,
  type Phase,
  type Role,
  type SeatState,
  type TableState,
} from './table.ts';

const ENV_PROMPT_FILES: Record<'zh' | 'en', string> = {
  zh: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)),
  en: fileURLToPath(new URL('./ENV_PROMPT.en.md', import.meta.url)),
};

export interface CasinoWorldOptions {
  /** `worlds.casino` 的活引用;startChips 等现读即生效。 */
  cfg: CasinoConfigSection;
  timezone: string;
  /** 部署数据目录;桌面存档写这里的 casino-table.json。 */
  dataDir: string;
  /** 部署目录;模型文字的语言读这里的 config.json。 */
  botDir: string;
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
      'Read the Moonlit Table state: who is dealer, the phase, the visible cards and totals (the dealer hole card stays hidden until the hand ends), the current bet, insurance and both chip balances. Actions: "status", "history" (recent settled hands).',
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
      'Act as the player (闲家) on the Moonlit Table; only valid when the table shows you are the player. Actions: "bet" (place a stake within [minBet, maxBet] to start the hand), "hit" (draw one card face up; busting settles that hand), "stand", "double" (first two cards of a hand: stake doubles, one card, then that hand stands), "split" (two equal-rank cards become two hands, each matched-bet and drawn one card; split aces get one card each), "insurance" (only when the dealer shows an Ace: amount 0 declines, up to half the bet pays 2:1 if the dealer has blackjack), "surrender" (first decision on a fresh two-card hand: forfeit half the bet and end it).',
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['bet', 'hit', 'stand', 'double', 'split', 'insurance', 'surrender'], description: 'The action to take.' },
        amount: { type: 'number', description: 'Stake for "bet" or "insurance". Required for those, ignored otherwise.' },
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

const OUTCOME_KEYS = {
  win: 'outcomeWin',
  lose: 'outcomeLose',
  push: 'outcomePush',
  blackjack: 'outcomeBlackjack',
  bust: 'outcomeBust',
  surrender: 'outcomeSurrender',
} as const;

export class CasinoWorld implements World {
  readonly id = 'casino';
  private host: WorldHost | null = null;
  private state: TableState | null = null;
  private matches: MatchRecord[] = [];
  private readonly sockets = new Set<WorldStreamSocket>();

  constructor(private readonly opts: CasinoWorldOptions) {}

  /** 模型文字:语言与称呼都跟桌宠配置对齐,每次现读,改语言/称呼无需重启。 */
  private mt(): ModelText {
    const language = readModelLanguage(this.opts.botDir);
    return modelText(language, readOwnerLabel(this.opts.botDir, language));
  }

  /** 只报值;前缀文本一律来自 ENV_PROMPT 模板(按模型语言选文件)。 */
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
    const modelLang = readModelLanguage(this.opts.botDir);
    return {
      panels: [
        {
          id: 'table',
          title: language === 'en' ? 'Blackjack table' : '牌桌',
          description: language === 'en'
            ? 'Play standard blackjack against the AI: pick the dealer, bet, hit and stand on the green felt.'
            : '与 AI 同桌打标准 21 点:选庄、下注、要牌、停牌,绿呢桌面实时显示双方的牌。',
          getMethods: ['state', 'history'],
        },
      ],
      invoke: (panel, method, args) => this.handleInvoke(panel, method, args),
      stream: (panel, socket) => this.handleStream(panel, socket),
      config: [casinoConfigGroup(language ?? 'zh')],
      promptDocs: [
        {
          key: 'worlds.casino.envPrompt',
          title: language === 'en' ? 'Moonlit Table · environment prompt' : '月下牌桌 · 环境提示词',
          description: language === 'en'
            ? 'The Moonlit Table section in the system prefix.'
            : '月下牌桌进 system 前缀的那一段。',
          path: ENV_PROMPT_FILES[modelLang],
          role: 'envPrompt',
          vars: [
            { name: 'casino.startChips', description: language === 'en' ? 'The configured starting chips, right now.' : '配置里的起始筹码,此刻的值。' },
            { name: 'casino.minBet', description: language === 'en' ? 'The configured minimum bet, right now.' : '配置里的最小下注,此刻的值。' },
            { name: 'casino.maxBet', description: language === 'en' ? 'The configured maximum bet per hand, right now.' : '配置里的单手最大下注,此刻的值。' },
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
    this.matches = loadMatches(this.opts.dataDir);
    if (this.state.dealerActing) {
      // 进程在庄家打牌途中重启:把这一手按规则打完再交给面板。
      await this.dealerPlayAndSettle();
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
    if (name === 'casino_bank') return this.toolBank(args);
    return `Unknown tool ${name}.`;
  }

  private toolTable(args: Record<string, unknown>): string {
    const mt = this.mt();
    const state = this.state!;
    if (String(args.action ?? '') === 'history') {
      const limit = Math.min(Math.max(Math.floor(Number(args.limit ?? 10)) || 10, 1), 50);
      const lines = state.history.slice(0, limit).map((r, i) =>
        mt.historyLine(
          i + 1,
          r.round,
          r.dealer === 'ai' ? mt.historyDealerYou : mt.historyDealerOwner,
          r.bet,
          r.insurance,
          r.insuranceWon,
          r.hands.map((h) => `${h.cards.join(' ')}(${mt[OUTCOME_KEYS[h.outcome]]})`).join(' / '),
          r.dealerCards.join(' '),
          `${r.delta >= 0 ? '+' : ''}${r.delta}`,
        ),
      );
      return lines.length ? `${mt.historyTitle(lines.length)}\n${lines.join('\n')}` : mt.noHistoryYet;
    }
    const aiDealer = state.aiRole === 'dealer';
    const roleText = state.aiRole === null ? mt.statusNoGame : aiDealer ? mt.statusYouDealer : mt.statusYouPlayer;
    const phaseText: Record<Phase, string> = {
      idle: mt.statusIdle,
      betting: aiDealer ? mt.statusBettingOwner : mt.statusBettingYou,
      insurance: aiDealer ? mt.statusInsuranceOwner : mt.statusInsuranceYou,
      playerActing: aiDealer ? mt.statusActingOwner : mt.statusActingYou,
    };
    const lines = [
      `${mt.statusRound(state.round, state.bet)} ${roleText} ${phaseText[state.phase]}`,
      mt.statusChips(state.ai.chips, state.player.chips, this.opts.cfg.startChips, this.opts.cfg.minBet, this.opts.cfg.maxBet, this.opts.cfg.dealerHitsSoft17 ? mt.dealerSoftHits : mt.dealerSoftStands),
    ];
    if (state.phase !== 'idle') {
      const resolved = state.insuranceOutcome === 'won' ? mt.insuranceWonNote : state.insuranceOutcome === 'lost' ? mt.insuranceLostNote : mt.insurancePending;
      lines.push(mt.statusBet(state.bet) + mt.statusInsuranceNote(state.insurance, resolved));
      for (const [i, hand] of state.hands.entries()) {
        const mark = i === state.activeHand && state.hands.some((h) => !h.stood) ? mt.statusHandCurrentMark : '';
        const value = handValue(hand.cards);
        lines.push(mt.statusHandLine(mark, this.cards(hand.cards), value.total, value.soft, hand.bet, hand.doubled, hand.stood));
      }
      if (state.holeRevealed) {
        lines.push(mt.statusDealerRevealed(this.cards(state.dealerCards), handValue(state.dealerCards).total));
      } else if (state.dealerCards.length) {
        lines.push(mt.statusDealerUpcard(formatCard(state.dealerCards[0] ?? { rank: 0, suit: 0 })));
      }
    }
    return lines.join('\n');
  }

  private async toolPlayer(args: Record<string, unknown>): Promise<string> {
    const state = this.state!;
    if (state.aiRole !== 'player') {
      return state.aiRole === null ? this.mt().noGameYet : this.mt().youAreDealerNote;
    }
    const result = await this.playerAction(args);
    return result.text;
  }

  private toolBank(args: Record<string, unknown>): string {
    const mt = this.mt();
    const state = this.state!;
    const seat = state.ai;
    if (String(args.action ?? '') === 'relief') {
      if (seat.chips >= this.opts.cfg.minBet) {
        return mt.reliefOnlyWhenBroke(seat.chips, this.opts.cfg.minBet);
      }
      seat.chips = this.opts.cfg.startChips;
      seat.bankruptcies++;
      this.save();
      this.broadcast();
      return mt.reliefGranted(this.opts.cfg.startChips, seat.chips, seat.bankruptcies);
    }
    const net = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
    return mt.bankStatus(seat.chips, seat.wins, seat.losses, seat.pushes, net(seat.net), seat.bankruptcies, state.player.chips, state.player.wins, state.player.losses, state.player.pushes);
  }

  // ---------------------------------------------------------------- 对局

  /** 闲家动作(AI 经工具、玩家经面板都汇到这里)。庄家自动打牌时逐张停顿,让面板看得清。 */
  private async playerAction(args: Record<string, unknown>): Promise<OpResult> {
    const mt = this.mt();
    const state = this.state!;
    const action = String(args.action ?? '');
    if (state.phase === 'idle') {
      return { ok: false, text: mt.noHandDeal };
    }
    if (action === 'bet') {
      if (state.phase !== 'betting') return { ok: false, text: mt.handAlreadyOpen };
      const amount = this.readBet(args.amount);
      if (typeof amount === 'string') return { ok: false, text: amount };
      this.notifyAction(mt.betPlaced(amount));
      const settled = await this.deal(amount);
      this.save();
      this.broadcast();
      if (settled) return { ok: true, text: settled };
      return { ok: true, text: this.actingReceipt() };
    }
    if (action === 'insurance') {
      if (state.phase !== 'insurance') return { ok: false, text: mt.notInsuranceTime };
      const amount = Math.floor(Number(args.amount ?? 0));
      if (!Number.isFinite(amount) || amount < 0) return { ok: false, text: mt.insuranceNotInteger };
      const maxIns = Math.floor(state.bet / 2);
      if (amount > maxIns) return { ok: false, text: mt.insuranceMaxIs(maxIns) };
      const idlerChips = state.aiRole === 'player' ? state.ai.chips : state.player.chips;
      if (amount > idlerChips) return { ok: false, text: mt.cannotAffordInsurance(idlerChips, amount) };
      state.insurance = amount;
      this.notifyAction(amount > 0 ? mt.insuranceBought(amount) : mt.insuranceDeclined);
      return await this.resolveInsurance();
    }
    if (state.phase !== 'playerActing') {
      return { ok: false, text: state.phase === 'betting' ? mt.betFirst : state.phase === 'insurance' ? mt.insuranceDecideFirst : mt.noHandDeal };
    }
    if (state.dealerActing) {
      return { ok: false, text: mt.dealerTurnInProgress };
    }
    const hand = state.hands[state.activeHand]!;
    if (action === 'hit') {
      hand.cards.push(this.draw());
      if (handValue(hand.cards).total > 21) hand.stood = true;
      const value = handValue(hand.cards);
      this.notifyAction(mt.ownerHits(formatCard(hand.cards[hand.cards.length - 1] ?? { rank: 0, suit: 0 }), this.cards(hand.cards), value.total, this.bustNote(value.total)));
      return await this.advanceOrPlay(hand);
    }
    if (action === 'stand') {
      hand.stood = true;
      this.notifyAction(mt.ownerStands(handValue(hand.cards).total, this.cards(hand.cards)));
      return await this.advanceOrPlay(hand);
    }
    if (action === 'double') {
      if (hand.cards.length !== 2) return { ok: false, text: mt.doubleTwoCardsOnly };
      const doubled = hand.bet * 2;
      if (doubled > this.opts.cfg.maxBet) return { ok: false, text: mt.doubledOverMax(this.opts.cfg.maxBet) };
      const idlerChips = state.aiRole === 'player' ? state.ai.chips : state.player.chips;
      const otherBets = state.hands.reduce((sum, h) => sum + h.bet, 0) - hand.bet;
      if (doubled + otherBets > idlerChips) {
        return { ok: false, text: mt.doubledOverBalance(doubled + otherBets, idlerChips) };
      }
      hand.bet = doubled;
      hand.doubled = true;
      hand.cards.push(this.draw());
      hand.stood = true;
      const value = handValue(hand.cards);
      this.notifyAction(mt.ownerDoubles(hand.bet, formatCard(hand.cards[hand.cards.length - 1] ?? { rank: 0, suit: 0 }), value.total, this.bustNote(value.total)));
      return await this.advanceOrPlay(hand);
    }
    if (action === 'split') {
      if (state.hands.length > 1) return { ok: false, text: mt.splitOnceOnly };
      if (hand.cards.length !== 2) return { ok: false, text: mt.splitTwoCardsOnly };
      if (hand.cards[0]!.rank !== hand.cards[1]!.rank) return { ok: false, text: mt.splitSameRank };
      const idlerChips = state.aiRole === 'player' ? state.ai.chips : state.player.chips;
      if (hand.bet * 2 > this.opts.cfg.maxBet * 2 || hand.bet * 2 > idlerChips) {
        return { ok: false, text: mt.splitOverLimits(hand.bet * 2, idlerChips) };
      }
      const card0 = hand.cards[0]!;
      const card1 = hand.cards[1]!;
      const isAce = card0.rank === 1;
      const makeHand = (card: Card): IdlerHand => ({ cards: [card], bet: hand.bet, doubled: false, stood: false, fromSplit: true, outcome: null });
      const hand0 = makeHand(card0);
      const hand1 = makeHand(card1);
      hand0.cards.push(this.draw());
      hand1.cards.push(this.draw());
      if (isAce) {
        hand0.stood = true;
        hand1.stood = true;
      }
      state.hands = [hand0, hand1];
      state.activeHand = 0;
      this.notifyAction(mt.ownerSplits(hand.bet, this.cards(hand0.cards), this.cards(hand1.cards), isAce ? mt.splitAcesNote : ''));
      if (hand0.stood && hand1.stood) {
        return { ok: true, text: await this.dealerPlayAndSettle() };
      }
      this.save();
      this.broadcast();
      return { ok: true, text: this.actingReceipt() };
    }
    if (action === 'surrender') {
      if (state.hands.length > 1 || hand.cards.length !== 2 || hand.fromSplit) {
        return { ok: false, text: mt.surrenderFreshOnly };
      }
      hand.outcome = 'surrender';
      hand.stood = true;
      this.notifyAction(mt.ownerSurrendered);
      return { ok: true, text: this.settle() };
    }
    return { ok: false, text: mt.unknownAction(action, 'bet / hit / stand / double / split / insurance / surrender') };
  }

  /** 主人(AI 坐庄时的闲家)做了一个动作:flush 推给 AI,让它即时回应。 */
  private notifyAction(text: string): void {
    if (this.state!.aiRole !== 'dealer') return;
    void this.host?.pushEvent({
      type: 'casino.action',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text,
    }, { trigger: 'flush' });
  }

  /** 点数超过 21 时的附带说明,否则空串。 */
  private bustNote(total: number): string {
    return total > 21 ? this.mt().bustNote : '';
  }

  /** 当前手打完(停/爆/加倍):看后面还有没有手;没有就轮到庄家——但全爆时庄家直接收注,不补牌。 */
  private async advanceOrPlay(hand: IdlerHand): Promise<OpResult> {
    const state = this.state!;
    if (handValue(hand.cards).total > 21) hand.stood = true;
    const next = state.hands.findIndex((h) => !h.stood);
    if (next >= 0) {
      state.activeHand = next;
      this.save();
      this.broadcast();
      return { ok: true, text: this.actingReceipt() };
    }
    const anyLive = state.hands.some((h) => handValue(h.cards).total <= 21 && h.outcome !== 'surrender');
    if (anyLive) return { ok: true, text: await this.dealerPlayAndSettle() };
    state.holeRevealed = true;
    return { ok: true, text: this.settle() };
  }

  /** 发一手牌:闲家两张明牌,庄家一亮一暗。 */
  private async deal(bet: number): Promise<string | null> {
    const mt = this.mt();
    const state = this.state!;
    state.bet = bet;
    state.insurance = 0;
    state.insuranceOutcome = 'none';
    state.hands = [{ cards: [this.draw(), this.draw()], bet, doubled: false, stood: false, fromSplit: false, outcome: null }];
    state.activeHand = 0;
    state.dealerCards = [this.draw(), this.draw()];
    state.holeRevealed = false;
    const idlerNatural = handValue(state.hands[0]!.cards).natural;
    const dealerNatural = handValue(state.dealerCards).natural;
    const upcard = state.dealerCards[0]!;
    if (idlerNatural || (upcard.rank > 9 && dealerNatural)) {
      state.holeRevealed = true;
      // 先离开 betting 阶段:停顿期间重复下注会导致双重结算。
      state.phase = 'playerActing';
      this.save();
      this.broadcast();
      await this.sleep();
      return this.settle();
    }
    if (upcard.rank === 1) {
      state.phase = 'insurance';
      // AI 当闲家时必须被叫到,否则它会卡在保险阶段(催一下是兜底,不是正常路径)。
      if (state.aiRole === 'player') this.notifyInsuranceTurn();
      return null;
    }
    state.phase = 'playerActing';
    return null;
  }

  /** 保险决定:庄家私下查暗牌(不翻开);买了且庄 BJ 赔 2:1,没买或庄没 BJ 就继续打。 */
  private async resolveInsurance(): Promise<OpResult> {
    const state = this.state!;
    if (state.insurance > 0 && handValue(state.dealerCards).natural) {
      state.insuranceOutcome = 'won';
    } else if (state.insurance > 0) {
      state.insuranceOutcome = 'lost';
    }
    // 先离开 insurance 阶段:停顿期间重复决定会导致双重结算。
    state.phase = 'playerActing';
    if (handValue(state.dealerCards).natural) {
      state.holeRevealed = true;
      this.save();
      this.broadcast();
      await this.sleep();
      return { ok: true, text: this.settle() };
    }
    this.save();
    this.broadcast();
    return { ok: true, text: this.actingReceipt() };
  }

  /** 闲家打完:翻暗牌,引擎按固定规则替庄家补牌(逐张停顿),然后结算。 */
  private async dealerPlayAndSettle(): Promise<string> {
    const state = this.state!;
    state.holeRevealed = true;
    state.dealerActing = true;
    this.save();
    this.broadcast();
    await this.sleep();
    while (dealerShouldHit(state.dealerCards, this.opts.cfg.dealerHitsSoft17)) {
      state.dealerCards.push(this.draw());
      this.save();
      this.broadcast();
      await this.sleep();
    }
    state.dealerActing = false;
    return this.settle();
  }

  /** 发牌节奏:翻暗牌与每张补牌之间的停顿,由配置 dealDelayMs 控制。 */
  private sleep(): Promise<void> {
    const ms = Math.max(0, Math.floor(this.opts.cfg.dealDelayMs));
    if (!ms) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 结算:逐手比点、保险并账、转账、记档、推事件、回 idle(牌留在桌面上)。 */
  private settle(): string {
    const mt = this.mt();
    const state = this.state!;
    const dealer = handValue(state.dealerCards);
    const playerIsIdler = state.aiRole === 'player';
    const idlerSeat: SeatState = playerIsIdler ? state.ai : state.player;
    const dealerSeat: SeatState = playerIsIdler ? state.player : state.ai;
    let delta = 0;
    let idlerWins = 0;
    let idlerLosses = 0;
    let idlerPushes = 0;
    const handViews: HandRecord['hands'] = [];
    for (const hand of state.hands) {
      const value = handValue(hand.cards);
      let outcome: Outcome = hand.outcome ?? 'push';
      let handDelta = 0;
      if (outcome !== 'surrender') {
        if (value.total > 21) outcome = 'bust';
        else if (dealer.total > 21) outcome = 'win';
        else if (value.natural && !hand.fromSplit && !dealer.natural) outcome = 'blackjack';
        else if (dealer.natural && !(value.natural && !hand.fromSplit)) outcome = 'lose';
        else if (value.total > dealer.total) outcome = 'win';
        else if (value.total < dealer.total) outcome = 'lose';
        else outcome = 'push';
      }
      hand.outcome = outcome;
      if (outcome === 'surrender') handDelta = -Math.floor(hand.bet / 2);
      else if (outcome === 'bust' || outcome === 'lose') handDelta = -hand.bet;
      else if (outcome === 'blackjack') handDelta = Math.round(hand.bet * 1.5);
      else if (outcome === 'win') handDelta = hand.bet;
      else handDelta = 0;
      delta += handDelta;
      if (outcome === 'win' || outcome === 'blackjack') idlerWins++;
      else if (outcome === 'push') idlerPushes++;
      else idlerLosses++;
      handViews.push({ cards: formatHand(hand.cards), bet: hand.bet, outcome });
    }
    const insuranceNet = state.insuranceOutcome === 'won' ? state.insurance * 2 : state.insuranceOutcome === 'lost' ? -state.insurance : 0;
    delta += insuranceNet;
    idlerSeat.chips += delta;
    idlerSeat.net += delta;
    dealerSeat.chips -= delta;
    dealerSeat.net -= delta;
    idlerSeat.wins += idlerWins;
    idlerSeat.losses += idlerLosses;
    idlerSeat.pushes += idlerPushes;
    const record: HandRecord = {
      dealer: state.aiRole === 'dealer' ? 'ai' : 'player',
      round: state.round,
      bet: state.bet,
      hands: handViews,
      dealerCards: formatHand(state.dealerCards),
      insurance: state.insurance,
      insuranceWon: state.insuranceOutcome === 'won',
      delta,
      surrendered: state.hands.some((h) => h.outcome === 'surrender'),
      at: nowIso(this.opts.timezone),
    };
    recordHand(state, record);
    state.phase = 'idle';
    state.round++;
    state.bet = 0;
    this.save();
    this.broadcast();
    const handsText = handViews
      .map((h) => `${h.cards.join(' ')}(${mt[OUTCOME_KEYS[h.outcome]]})`)
      .join(' / ');
    const insText = state.insurance > 0 ? `,${mt.insuranceBought(state.insurance)}${state.insuranceOutcome === 'won' ? ' (2:1)' : ''}` : '';
    const line = mt.settleLine(
      record.round,
      record.dealer === 'ai' ? mt.historyDealerYou : mt.historyDealerOwner,
      handsText,
      record.dealerCards.join(' '),
      dealer.total,
      dealer.total > 21 ? mt.dealerBustNote : '',
      `${delta >= 0 ? '+' : ''}${delta}`,
      state.ai.chips,
      state.player.chips,
    );
    // 每手结算都推事件(flush):AI 坐庄时这是叫它开口的铃;AI 当闲家时回执里已有同一份
    // 结算,事件让它有机会收尾——重复口径由环境提示词管住。
    void this.host?.pushEvent({
      type: 'casino.result',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: line,
    }, { trigger: 'flush' });
    return line;
  }

  /** 闲家手进行中的回执:每手的牌与点数、庄家明牌、押注与余额;保险阶段附决定提示。 */
  private actingReceipt(): string {
    const mt = this.mt();
    const state = this.state!;
    const aiIsIdler = state.aiRole === 'player';
    const ownChips = aiIsIdler ? state.ai.chips : state.player.chips;
    const hands = state.hands.map((hand, i) => {
      const mark = i === state.activeHand && state.hands.some((h) => !h.stood) ? mt.statusHandCurrentMark : '';
      const value = handValue(hand.cards);
      return mt.statusHandLine(mark, this.cards(hand.cards), value.total, value.soft, hand.bet, hand.doubled, hand.stood);
    });
    const insuranceNote = state.phase === 'insurance' ? mt.insurancePrompt(Math.floor(state.bet / 2)) : '';
    return [
      aiIsIdler ? mt.handInProgress : mt.ownersHandInProgress,
      ...hands,
      `${mt.statusDealerUpcard(formatCard(state.dealerCards[0] ?? { rank: 0, suit: 0 }))} ${mt.statusBet(state.bet)} ${mt.holeHiddenNote} ${mt.bankStatusOwn(ownChips)}`,
      insuranceNote,
      aiIsIdler ? mt.playerNextHint : '',
    ].filter(Boolean).join('\n');
  }

  /** 轮到 AI(闲家):下注或保险决定,推 flush 事件。 */
  private notifyBettingTurn(): void {
    const mt = this.mt();
    const state = this.state!;
    void this.host?.pushEvent({
      type: 'casino.turn',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: mt.bettingTurn(this.opts.cfg.minBet, this.opts.cfg.maxBet, state.ai.chips, state.player.chips),
    }, { trigger: 'flush' });
  }

  private notifyInsuranceTurn(): void {
    const mt = this.mt();
    const state = this.state!;
    void this.host?.pushEvent({
      type: 'casino.turn',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: mt.insuranceTurn(Math.floor(state.bet / 2), state.ai.chips, state.player.chips),
    }, { trigger: 'flush' });
  }

  // ---------------------------------------------------------------- 面板

  private async handleInvoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel !== 'table') throw new Error(`unknown panel ${panel}`);
    if (!this.state) this.state = loadTable(this.opts.dataDir) ?? newTable(this.opts.cfg.startChips);
    if (method === 'state') return this.snapshot();
    if (method === 'history') return { history: this.state.history, matches: this.matches };
    if (method !== 'action') throw new Error(`unknown method ${method}`);
    const arg = (args[0] ?? {}) as Record<string, unknown>;
    const action = String(arg.action ?? '');
    const state = this.state;

    if (action === 'newgame') {
      const dealer = String(arg.dealer ?? '');
      if (dealer !== 'ai' && dealer !== 'player') throw new Error(this.mt().errNewgameDealerArg);
      if (state.phase !== 'idle') throw new Error(this.mt().handNotFinished);
      state.aiRole = dealer === 'ai' ? 'dealer' : 'player';
      state.round++;
      state.phase = 'betting';
      state.hands = [];
      state.dealerCards = [];
      state.holeRevealed = false;
      state.insurance = 0;
      state.insuranceOutcome = 'none';
      state.bet = 0;
      state.dealerActing = false;
      this.save();
      this.broadcast();
      if (state.aiRole === 'player') this.notifyBettingTurn();
      return this.snapshot();
    }
    if (action === 'relief') {
      if (state.player.chips >= this.opts.cfg.minBet) throw new Error(this.mt().reliefOnlyWhenBroke(state.player.chips, this.opts.cfg.minBet));
      state.player.chips = this.opts.cfg.startChips;
      state.player.bankruptcies++;
      this.save();
      this.broadcast();
      return this.snapshot();
    }
    if (action === 'resetmatch') {
      if (state.dealerActing) throw new Error(this.mt().matchResetDealerPlaying);
      this.recordMatchAndReset();
      return this.snapshot();
    }
    if (action === 'nudge') {
      if (state.phase === 'betting' && state.aiRole === 'player') {
        this.notifyBettingTurn();
        return this.snapshot();
      }
      if (state.phase === 'insurance' && state.aiRole === 'player') {
        this.notifyInsuranceTurn();
        return this.snapshot();
      }
      throw new Error(this.mt().errAINotWaiting);
    }

    if (['bet', 'hit', 'stand', 'double', 'split', 'insurance', 'surrender'].includes(action)) {
      if (state.aiRole !== 'dealer') throw new Error(this.mt().youAreDealerNote);
      const result = await this.playerAction(action === 'bet' || action === 'insurance' ? { action, amount: arg.amount } : { action });
      if (!result.ok) throw new Error(result.text);
      return this.snapshot();
    }
    throw new Error(this.mt().errUnknownActionPanel(action));
  }

  /** 「记录并重来」:归档当前场次(最多留 10 场),筹码与战绩清零,重新等选庄。 */
  private recordMatchAndReset(): void {
    const mt = this.mt();
    const state = this.state!;
    const winner: MatchRecord['winner'] =
      state.ai.chips > state.player.chips ? 'ai' : state.player.chips > state.ai.chips ? 'player' : 'tie';
    // round 是"下一手的编号",已打完的手数恒为 round - 1(结算后、进行中都一样)。
    const played = Math.max(0, state.round - 1);
    const record: MatchRecord = {
      at: nowIso(this.opts.timezone),
      rounds: played,
      aiChips: state.ai.chips,
      playerChips: state.player.chips,
      aiNet: state.ai.net,
      playerNet: state.player.net,
      winner,
    };
    this.matches = [record, ...this.matches].slice(0, MATCHES_LIMIT);
    saveMatches(this.opts.dataDir, this.matches);
    const startChips = this.opts.cfg.startChips;
    state.ai = newSeat(startChips);
    state.player = newSeat(startChips);
    state.aiRole = null;
    state.phase = 'idle';
    state.round = 0;
    state.bet = 0;
    state.insurance = 0;
    state.insuranceOutcome = 'none';
    state.hands = [];
    state.activeHand = 0;
    state.dealerCards = [];
    state.holeRevealed = false;
    state.dealerActing = false;
    this.save();
    this.broadcast();
    void this.host?.pushEvent({
      type: 'casino.action',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: mt.matchArchived(played, record.aiChips, record.playerChips, record.winner === 'ai' ? mt.matchYouWin : record.winner === 'player' ? mt.matchOwnerWins : mt.matchTie, startChips),
    }, { trigger: 'flush' });
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

  /** 面板视图(玩家视角):闲家的牌全亮(分牌后多手);庄家第二张在翻开前显示为暗牌。 */
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
      insurance: state.insurance,
      holeRevealed: state.holeRevealed,
      dealerActing: state.dealerActing,
      hands: state.hands.map((hand, i) => ({
        cards: formatHand(hand.cards),
        total: hand.cards.length ? handValue(hand.cards).total : null,
        bet: hand.bet,
        doubled: hand.doubled,
        outcome: hand.outcome,
        active: i === state.activeHand && state.hands.some((h) => !h.stood),
      })),
      activeHand: state.activeHand,
      dealerCards: formatHand(dealerVisible),
      dealerVisibleTotal: dealerVisible.length ? handValue(dealerVisible).total : null,
      dealerTotal: state.dealerCards.length ? handValue(state.dealerCards).total : null,
      holeCount: state.dealerCards.length - dealerVisible.length,
      ai: seatView(state.ai, state.aiRole === null ? null : state.aiRole),
      player: seatView(state.player, state.aiRole === null ? null : state.aiRole === 'dealer' ? 'player' : 'dealer'),
      minBet: this.opts.cfg.minBet,
      maxBet: this.opts.cfg.maxBet,
      startChips: this.opts.cfg.startChips,
      dealerHitsSoft17: this.opts.cfg.dealerHitsSoft17,
      matches: this.matches,
      lastResult: state.history[0] ?? null,
      history: state.history.slice(0, 10),
    };
  }

  // ---------------------------------------------------------------- 底层

  /** 校验下注:整数、范围内、不超过闲家自己的余额——赔付把庄家打成负数是可以接受的。 */
  private readBet(raw: unknown): number | string {
    const bet = Math.floor(Number(raw));
    if (!Number.isFinite(bet)) return this.mt().betNotInteger(JSON.stringify(raw ?? null));
    const state = this.state!;
    const idlerChips = state.aiRole === 'player' ? state.ai.chips : state.player.chips;
    if (bet < this.opts.cfg.minBet) return this.mt().minBetIs(this.opts.cfg.minBet);
    if (bet > this.opts.cfg.maxBet) return this.mt().maxBetIs(this.opts.cfg.maxBet);
    if (bet > idlerChips) return this.mt().cannotAffordBet(idlerChips, bet);
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

