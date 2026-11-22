/**
 * 月下牌桌:一个 World,两种棋牌游戏——标准 21 点与抽鬼牌。
 * AI 与玩家对坐;开局在面板选游戏。
 * 21 点:庄家是机械的银行,闲家先行动先爆先输;支持分牌/保险/投降。
 * 抽鬼牌:53 张含鬼牌,轮流从对方手中背面抽一张,同点成对即弃;先空手的赢,最后剩鬼牌的输。
 * 所有面向模型的文字(事件、回执、错误)按部署语言出中英两份,见 model-text.ts;
 * 面板文字按浏览器语言,见 webui/strings.ts。
 */
import { fileURLToPath } from 'node:url';
import type { ToolCallContext, ToolDef, World, WorldHost, WorldStreamSocket, WorldWebUiDecl } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { nowIso } from 'cortico/core/util.ts';
import {
  dealerShouldHit,
  extractPairs,
  formatCard,
  handSummary,
  handValue,
  freshDeck,
  isJoker,
  shuffled,
  type Card,
} from './cards.ts';
import { casinoConfigGroup, type CasinoConfigSection } from './config.ts';
import { modelText, readModelLanguage, readOwnerLabel, type ModelText } from './model-text.ts';
import { loadMatches, MATCHES_LIMIT, saveMatches, type MatchRecord } from './matches.ts';
import {
  formatHand,
  loadTable,
  newSeat,
  newBlackjackState,
  newOldMaidState,
  newTable,
  recordHand,
  recordOldMaid,
  saveTable,
  type BlackjackState,
  type HandRecord,
  type IdlerHand,
  type OldMaidRecord,
  type Outcome,
  type SeatState,
  type TableState,
} from './table.ts';

const ENV_PROMPT_FILES: Record<'zh' | 'en', string> = {
  zh: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)),
  en: fileURLToPath(new URL('./ENV_PROMPT.en.md', import.meta.url)),
};

const OUTCOME_KEYS = {
  win: 'outcomeWin',
  lose: 'outcomeLose',
  push: 'outcomePush',
  blackjack: 'outcomeBlackjack',
  bust: 'outcomeBust',
  surrender: 'outcomeSurrender',
} as const;

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
      'Read the Moonlit Table state: which game is on the table (blackjack or Old Maid), whose turn, all visible cards and counts, and the running score. Actions: "status", "history".',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['status', 'history'], description: 'What to read.' },
        limit: { type: 'number', description: 'For "history": how many recent records, 1-20. Default 10.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'casino_player',
    description:
      'Act as the player in a blackjack hand; only valid while a blackjack hand is on the table and you are the player. Actions: "bet", "hit", "stand", "double", "split", "insurance", "surrender".',
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['bet', 'hit', 'stand', 'double', 'split', 'insurance', 'surrender'], description: 'The action to take.' },
        amount: { type: 'number', description: 'Stake for "bet" or "insurance".' },
      },
      required: ['action'],
    },
  },
  {
    name: 'casino_bank',
    description:
      'Read your blackjack chip account, or take bankruptcy relief. Actions: "status" (chips, hand totals, net, bankruptcy count), "relief" (only when your balance is below minBet: the balance resets to startChips and one bankruptcy is recorded).',
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
  {
    name: 'oldmaid_draw',
    description:
      "Draw one face-down card from the owner's hand in an Old Maid game; only valid when it is your turn to draw. The receipt tells you which card you drew and whether it formed a pair that was discarded.",
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
];

export class CasinoWorld implements World {
  readonly id = 'casino';
  private host: WorldHost | null = null;
  private state: TableState | null = null;
  private matches: MatchRecord[] = [];
  private readonly sockets = new Set<WorldStreamSocket>();

  constructor(private readonly opts: CasinoWorldOptions) {}

  /** 模型文字:按部署 config.json 的 language 与称呼配置每次现读,改语言/称呼无需重启。 */
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
          title: language === 'en' ? 'Moonlit Table' : '月下牌桌',
          description: language === 'en'
            ? 'Two games against your AI on the green felt: standard blackjack and Old Maid.'
            : '与 AI 同桌的绿呢牌桌:标准 21 点与抽鬼牌,两个游戏。',
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
    if (this.state.game === 'blackjack' && this.state.blackjack?.dealerActing) {
      // 进程在庄家打牌途中重启:把这一手按规则打完再交给面板。
      await this.dealerPlayAndSettle();
    }
    if (this.state.game === 'oldmaid' && this.state.oldmaid?.turnOwner === 'ai' && !this.state.oldmaid.winner) {
      // 进程在 AI 抽牌回合重启:继续 AI 的回合。
      await this.aiDrawsCard();
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
    if (name === 'oldmaid_draw') return await this.toolOldMaidDraw();
    return `Unknown tool ${name}.`;
  }

  private toolTable(args: Record<string, unknown>): string {
    const mt = this.mt();
    const state = this.state!;
    if (String(args.action ?? '') === 'history') {
      const limit = Math.min(Math.max(Math.floor(Number(args.limit ?? 10)) || 10, 1), 20);
      const out: string[] = [];
      if (state.blackjack && state.blackjack.history.length) {
        const lines = state.blackjack.history.slice(0, limit).map((r, i) =>
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
        out.push(mt.historyTitle(lines.length), ...lines);
      }
      if (state.oldmaid && state.oldmaid.history.length) {
        const lines = state.oldmaid.history.slice(0, limit).map((r, i) =>
          mt.oldMaidHistoryLine(i + 1, r.winner === 'ai' ? mt.matchYouWin : mt.matchOwnerWins),
        );
        out.push(mt.oldMaidHistoryTitle(lines.length), ...lines);
      }
      return out.length ? out.join('\n') : mt.noHistoryYet;
    }
    if (state.game === null) {
      return mt.statusNoGame;
    }
    if (state.game === 'blackjack') {
      return this.toolBlackjackStatus(mt, state.blackjack!);
    }
    return this.toolOldMaidStatus(mt, state.oldmaid!);
  }

  private toolBlackjackStatus(mt: ModelText, bj: BlackjackState): string {
    const aiDealer = bj.aiRole === 'dealer';
    const roleText = aiDealer ? mt.statusYouDealer : mt.statusYouPlayer;
    const phaseText: Record<string, string> = {
      betting: aiDealer ? mt.statusBettingOwner : mt.statusBettingYou,
      insurance: aiDealer ? mt.statusInsuranceOwner : mt.statusInsuranceYou,
      playerActing: aiDealer ? mt.statusActingOwner : mt.statusActingYou,
    };
    const lines = [
      `${mt.statusGameBlackjack} ${mt.statusRound(bj.round, bj.bet)} ${roleText} ${phaseText[bj.phase]}`,
      mt.statusChips(this.state!.ai.chips, this.state!.player.chips, this.opts.cfg.startChips, this.opts.cfg.minBet, this.opts.cfg.maxBet, this.opts.cfg.dealerHitsSoft17 ? mt.dealerSoftHits : mt.dealerSoftStands),
    ];
    const resolved = bj.insuranceOutcome === 'won' ? mt.insuranceWonNote : bj.insuranceOutcome === 'lost' ? mt.insuranceLostNote : mt.insurancePending;
    lines.push(mt.statusBet(bj.bet) + mt.statusInsuranceNote(bj.insurance, resolved));
    for (const [i, hand] of bj.hands.entries()) {
      const mark = i === bj.activeHand && bj.hands.some((h) => !h.stood) ? mt.statusHandCurrentMark : '';
      const value = handValue(hand.cards);
      lines.push(mt.statusHandLine(mark, this.cards(hand.cards), value.total, value.soft, hand.bet, hand.doubled, hand.stood));
    }
    if (bj.holeRevealed) {
      lines.push(mt.statusDealerRevealed(this.cards(bj.dealerCards), handValue(bj.dealerCards).total));
    } else if (bj.dealerCards.length) {
      lines.push(mt.statusDealerUpcard(formatCard(bj.dealerCards[0] ?? { rank: 0, suit: 0 })));
    }
    return lines.join('\n');
  }

  private toolOldMaidStatus(mt: ModelText, om: NonNullable<TableState['oldmaid']>): string {
    const state = this.state!;
    const turnText = om.winner
      ? mt.oldMaidOver(om.winner === 'ai' ? mt.matchYouWin : mt.matchOwnerWins)
      : om.turnOwner === 'ai'
        ? mt.oldMaidTurnYou(om.playerHand.length)
        : mt.oldMaidTurnOwner(om.aiHand.length);
    return [
      `${mt.statusGameOldMaid} ${turnText}`,
      mt.oldMaidYourHand(this.handSummaryOf(om.aiHand), om.aiHand.length),
      mt.oldMaidOwnerHand(om.playerHand.length),
      mt.oldMaidDiscards(om.discards.length),
      mt.oldMaidScore(om.score.ai, om.score.player),
    ].join('\n');
  }

  private async toolPlayer(args: Record<string, unknown>): Promise<string> {
    const state = this.state!;
    if (state.game !== 'blackjack' || !state.blackjack) {
      return state.game === 'oldmaid' ? this.mt().youAreDealerNote : this.mt().noGameYet;
    }
    if (state.blackjack.aiRole !== 'player') {
      return this.mt().youAreDealerNote;
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

  private async toolOldMaidDraw(): Promise<string> {
    const mt = this.mt();
    const state = this.state!;
    if (state.game !== 'oldmaid' || !state.oldmaid) return mt.noGameYet;
    if (state.oldmaid.winner) return mt.oldMaidOver(mt.oldMaidOverAlready);
    if (state.oldmaid.turnOwner !== 'ai') return mt.oldMaidNotYourTurn;
    return await this.aiDrawsCard();
  }

  // ---------------------------------------------------------------- 21 点对局

  /** 闲家动作(AI 经工具、玩家经面板都汇到这里)。庄家自动打牌时逐张停顿,让面板看得清。 */
  private async playerAction(args: Record<string, unknown>): Promise<OpResult> {
    const mt = this.mt();
    const bj = this.state!.blackjack!;
    const action = String(args.action ?? '');
    if (action === 'bet') {
      if (bj.phase !== 'betting') return { ok: false, text: mt.handAlreadyOpen };
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
      if (bj.phase !== 'insurance') return { ok: false, text: mt.notInsuranceTime };
      const amount = Math.floor(Number(args.amount ?? 0));
      if (!Number.isFinite(amount) || amount < 0) return { ok: false, text: mt.insuranceNotInteger };
      const maxIns = Math.floor(bj.bet / 2);
      if (amount > maxIns) return { ok: false, text: mt.insuranceMaxIs(maxIns) };
      const idlerChips = bj.aiRole === 'player' ? this.state!.ai.chips : this.state!.player.chips;
      if (amount > idlerChips) return { ok: false, text: mt.cannotAffordInsurance(idlerChips, amount) };
      bj.insurance = amount;
      this.notifyAction(amount > 0 ? mt.insuranceBought(amount) : mt.insuranceDeclined);
      return await this.resolveInsurance();
    }
    if (bj.phase !== 'playerActing') {
      return { ok: false, text: bj.phase === 'betting' ? mt.betFirst : bj.phase === 'insurance' ? mt.insuranceDecideFirst : mt.noHandDeal };
    }
    if (bj.dealerActing) {
      return { ok: false, text: mt.dealerTurnInProgress };
    }
    const hand = bj.hands[bj.activeHand]!;
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
      const idlerChips = bj.aiRole === 'player' ? this.state!.ai.chips : this.state!.player.chips;
      const otherBets = bj.hands.reduce((sum, h) => sum + h.bet, 0) - hand.bet;
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
      if (bj.hands.length > 1) return { ok: false, text: mt.splitOnceOnly };
      if (hand.cards.length !== 2) return { ok: false, text: mt.splitTwoCardsOnly };
      if (hand.cards[0]!.rank !== hand.cards[1]!.rank) return { ok: false, text: mt.splitSameRank };
      const idlerChips = bj.aiRole === 'player' ? this.state!.ai.chips : this.state!.player.chips;
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
      bj.hands = [hand0, hand1];
      bj.activeHand = 0;
      this.notifyAction(mt.ownerSplits(hand.bet, this.cards(hand0.cards), this.cards(hand1.cards), isAce ? mt.splitAcesNote : ''));
      if (hand0.stood && hand1.stood) {
        return { ok: true, text: await this.dealerPlayAndSettle() };
      }
      this.save();
      this.broadcast();
      return { ok: true, text: this.actingReceipt() };
    }
    if (action === 'surrender') {
      if (bj.hands.length > 1 || hand.cards.length !== 2 || hand.fromSplit) {
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
    if (this.state!.blackjack!.aiRole !== 'dealer') return;
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
    const bj = this.state!.blackjack!;
    if (handValue(hand.cards).total > 21) hand.stood = true;
    const next = bj.hands.findIndex((h) => !h.stood);
    if (next >= 0) {
      bj.activeHand = next;
      this.save();
      this.broadcast();
      return { ok: true, text: this.actingReceipt() };
    }
    const anyLive = bj.hands.some((h) => handValue(h.cards).total <= 21 && h.outcome !== 'surrender');
    if (anyLive) return { ok: true, text: await this.dealerPlayAndSettle() };
    bj.holeRevealed = true;
    return { ok: true, text: this.settle() };
  }

  /** 发一手牌:闲家两张明牌,庄家一亮一暗。 */
  private async deal(bet: number): Promise<string | null> {
    const mt = this.mt();
    const bj = this.state!.blackjack!;
    bj.bet = bet;
    bj.insurance = 0;
    bj.insuranceOutcome = 'none';
    bj.hands = [{ cards: [this.draw(), this.draw()], bet, doubled: false, stood: false, fromSplit: false, outcome: null }];
    bj.activeHand = 0;
    bj.dealerCards = [this.draw(), this.draw()];
    bj.holeRevealed = false;
    const idlerNatural = handValue(bj.hands[0]!.cards).natural;
    const dealerNatural = handValue(bj.dealerCards).natural;
    const upcard = bj.dealerCards[0]!;
    if (idlerNatural || (upcard.rank > 9 && dealerNatural)) {
      bj.holeRevealed = true;
      // 先离开 betting 阶段:停顿期间重复下注会导致双重结算。
      bj.phase = 'playerActing';
      this.save();
      this.broadcast();
      await this.sleep();
      // 停顿期间可能被「返回大厅」清桌:此时不再结算,收口即可。
      if (this.state?.blackjack !== bj || this.state?.game !== 'blackjack') return mt.returnedToLobby;
      return this.settle();
    }
    if (upcard.rank === 1) {
      bj.phase = 'insurance';
      // AI 当闲家时必须被叫到,否则它会卡在保险阶段(催一下是兜底,不是正常路径)。
      if (bj.aiRole === 'player') this.notifyInsuranceTurn();
      return null;
    }
    bj.phase = 'playerActing';
    return null;
  }

  /** 保险决定:庄家私下查暗牌(不翻开);买了且庄 BJ 赔 2:1,没买或庄没 BJ 就继续打。 */
  private async resolveInsurance(): Promise<OpResult> {
    const bj = this.state!.blackjack!;
    if (bj.insurance > 0 && handValue(bj.dealerCards).natural) {
      bj.insuranceOutcome = 'won';
    } else if (bj.insurance > 0) {
      bj.insuranceOutcome = 'lost';
    }
    // 先离开 insurance 阶段:停顿期间重复决定会导致双重结算。
    bj.phase = 'playerActing';
    if (handValue(bj.dealerCards).natural) {
      bj.holeRevealed = true;
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
    const bj = this.state!.blackjack!;
    bj.holeRevealed = true;
    bj.dealerActing = true;
    this.save();
    this.broadcast();
    await this.sleep();
    while (dealerShouldHit(bj.dealerCards, this.opts.cfg.dealerHitsSoft17)) {
      bj.dealerCards.push(this.draw());
      this.save();
      this.broadcast();
      await this.sleep();
    }
    bj.dealerActing = false;
    return this.settle();
  }

  /** 发牌节奏:翻暗牌与每张补牌之间的停顿,由配置 dealDelayMs 控制。 */
  private sleep(): Promise<void> {
    const ms = Math.max(0, Math.floor(this.opts.cfg.dealDelayMs));
    if (!ms) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 结算:逐手比点、保险并账、转账、记档、推事件、回 betting(牌留在桌面上)。 */
  private settle(): string {
    const mt = this.mt();
    // 返回大厅等清桌操作落在发牌/停顿窗口时,这里会拿到空桌:直接收口,不再结算。
    const bj = this.state?.blackjack;
    if (this.state?.game !== 'blackjack' || !bj) return mt.returnedToLobby;
    const dealer = handValue(bj.dealerCards);
    const playerIsIdler = bj.aiRole === 'player';
    const idlerSeat: SeatState = playerIsIdler ? this.state!.ai : this.state!.player;
    const dealerSeat: SeatState = playerIsIdler ? this.state!.player : this.state!.ai;
    let delta = 0;
    let idlerWins = 0;
    let idlerLosses = 0;
    let idlerPushes = 0;
    const handViews: HandRecord['hands'] = [];
    for (const hand of bj.hands) {
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
    const insuranceNet = bj.insuranceOutcome === 'won' ? bj.insurance * 2 : bj.insuranceOutcome === 'lost' ? -bj.insurance : 0;
    delta += insuranceNet;
    idlerSeat.chips += delta;
    idlerSeat.net += delta;
    dealerSeat.chips -= delta;
    dealerSeat.net -= delta;
    idlerSeat.wins += idlerWins;
    idlerSeat.losses += idlerLosses;
    idlerSeat.pushes += idlerPushes;
    const record: HandRecord = {
      dealer: bj.aiRole === 'dealer' ? 'ai' : 'player',
      round: bj.round,
      bet: bj.bet,
      hands: handViews,
      dealerCards: formatHand(bj.dealerCards),
      insurance: bj.insurance,
      insuranceWon: bj.insuranceOutcome === 'won',
      delta,
      surrendered: bj.hands.some((h) => h.outcome === 'surrender'),
      at: nowIso(this.opts.timezone),
    };
    recordHand(this.state!, record);
    bj.phase = 'betting';
    bj.round++;
    bj.bet = 0;
    this.save();
    this.broadcast();
    const handsText = handViews
      .map((h) => `${h.cards.join(' ')}(${mt[OUTCOME_KEYS[h.outcome]]})`)
      .join(' / ');
    const insText = bj.insurance > 0 ? `,${mt.insuranceBought(bj.insurance)}${bj.insuranceOutcome === 'won' ? ' (2:1)' : ''}` : '';
    const line = mt.settleLine(
      record.round,
      record.dealer === 'ai' ? mt.historyDealerYou : mt.historyDealerOwner,
      handsText,
      record.dealerCards.join(' '),
      dealer.total,
      dealer.total > 21 ? mt.dealerBustNote : '',
      `${delta >= 0 ? '+' : ''}${delta}`,
      this.state!.ai.chips,
      this.state!.player.chips,
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
    const bj = this.state!.blackjack!;
    const aiIsIdler = bj.aiRole === 'player';
    const ownChips = aiIsIdler ? this.state!.ai.chips : this.state!.player.chips;
    const hands = bj.hands.map((hand, i) => {
      const mark = i === bj.activeHand && bj.hands.some((h) => !h.stood) ? mt.statusHandCurrentMark : '';
      const value = handValue(hand.cards);
      return mt.statusHandLine(mark, this.cards(hand.cards), value.total, value.soft, hand.bet, hand.doubled, hand.stood);
    });
    const insuranceNote = bj.phase === 'insurance' ? mt.insurancePrompt(Math.floor(bj.bet / 2)) : '';
    return [
      aiIsIdler ? mt.handInProgress : mt.ownersHandInProgress,
      ...hands,
      `${mt.statusDealerUpcard(formatCard(bj.dealerCards[0] ?? { rank: 0, suit: 0 }))} ${mt.statusBet(bj.bet)} ${mt.holeHiddenNote} ${mt.bankStatusOwn(ownChips)}`,
      insuranceNote,
      aiIsIdler ? mt.playerNextHint : '',
    ].filter(Boolean).join('\n');
  }

  /** 轮到 AI(闲家):下注或保险决定,推 flush 事件。 */
  private notifyBettingTurn(): void {
    const mt = this.mt();
    const bj = this.state!.blackjack!;
    void this.host?.pushEvent({
      type: 'casino.turn',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: mt.bettingTurn(this.opts.cfg.minBet, this.opts.cfg.maxBet, this.state!.ai.chips, this.state!.player.chips),
    }, { trigger: 'flush' });
  }

  private notifyInsuranceTurn(): void {
    const mt = this.mt();
    const bj = this.state!.blackjack!;
    void this.host?.pushEvent({
      type: 'casino.turn',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: mt.insuranceTurn(Math.floor(bj.bet / 2), this.state!.ai.chips, this.state!.player.chips),
    }, { trigger: 'flush' });
  }

  // ---------------------------------------------------------------- 抽鬼牌对局

  /** 开一局抽鬼牌:53 张轮流发完,双方自动弃初始对子,玩家先抽。 */
  private startOldMaid(): void {
    const state = this.state!;
    state.game = 'oldmaid';
    state.oldmaid = newOldMaidState();
    const om = state.oldmaid;
    // 抽鬼牌每局都用整副 52 张(21 点剩下的牌靴不续用,保证恰好凑出一张同点落单的鬼牌)。
    // 测试 rig 走预写路径:drawn=0 且整副 52 张时按原序当牌堆用,发牌结果可预测。
    if (!(state.drawn === 0 && state.shoe.length === 52)) {
      state.shoe = shuffled(freshDeck(), this.opts.rng ?? Math.random);
      state.drawn = 0;
    }
    // 开局藏一张:谁也不给;它同点的同伴就是鬼牌,双方都不知道是哪张,终局才亮。
    const rng = this.opts.rng ?? Math.random;
    const hiddenIdx = Math.floor(rng() * state.shoe.length);
    om.hiddenCard = state.shoe.splice(Math.min(Math.max(hiddenIdx, 0), state.shoe.length - 1), 1)[0]!;
    state.drawn = 0;
    // 轮流发完剩下的 51 张:先玩家,再 AI。
    while (state.drawn < state.shoe.length) {
      om.playerHand.push(this.draw());
      if (state.drawn < state.shoe.length) om.aiHand.push(this.draw());
    }
    // 双方弃初始对子。
    for (const hand of [om.playerHand, om.aiHand] as Card[][]) {
      const { singles, pairs } = extractPairs(hand);
      hand.length = 0;
      hand.push(...singles);
      om.discards.push(...pairs);
    }
    // 极端:发完弃完就有一方空手(全部成对)——空手者赢。
    if (om.aiHand.length === 0) {
      this.endOldMaid('ai');
      return;
    }
    if (om.playerHand.length === 0) {
      this.endOldMaid('player');
      return;
    }
    om.turnOwner = 'player';
    this.save();
    this.broadcast();
  }

  /** 从对方手中抽一张给抽牌者;index 缺省时随机(随机范围受 rng 约束,便于测试)。成对自动弃入弃牌堆。 */
  private drawFrom(opponentHand: Card[], drawerHand: Card[], index?: number): { card: Card; newPairs: Card[][] } {
    const rng = this.opts.rng ?? Math.random;
    const raw = index ?? Math.floor(rng() * opponentHand.length);
    const card = opponentHand.splice(Math.min(Math.max(raw, 0), opponentHand.length - 1), 1)[0]!;
    drawerHand.push(card);
    const { singles, pairs } = extractPairs(drawerHand);
    drawerHand.length = 0;
    drawerHand.push(...singles);
    if (pairs.length) this.state!.oldmaid!.discards.push(...pairs);
    return { card, newPairs: pairs };
  }

  /** AI 抽牌回合:从对面手中抽一张;结束后轮回{{owner}}或终局。 */
  private aiDrawsCard(): string {
    const mt = this.mt();
    const state = this.state!;
    const om = state.oldmaid!;
    const { card, newPairs } = this.drawFrom(om.playerHand, om.aiHand);
    const receipt = mt.oldMaidDrawReceipt(formatCard(card), this.handSummaryOf(om.aiHand), om.aiHand.length, om.playerHand.length, newPairs.length);
    // 结束判定:任一方手空即终局——空手者赢,另一方手里剩着鬼牌。
    if (om.playerHand.length === 0) {
      return `${receipt}\n${this.endOldMaid('player')}`;
    }
    if (om.aiHand.length === 0) {
      return `${receipt}\n${this.endOldMaid('ai')}`;
    }
    om.turnOwner = 'player';
    this.save();
    this.broadcast();
    return receipt;
  }

  /** 一局抽鬼牌结束:记档、胜场、事件、回 idle(牌面留在桌上直到下一局)。 */
  private endOldMaid(winner: 'ai' | 'player'): string {
    const mt = this.mt();
    const state = this.state!;
    const om = state.oldmaid!;
    om.winner = winner;
    om.score[winner]++;
    // 终局亮牌:公布开局藏起的那张;输家手里剩的正是它同点的落单鬼牌(输家只剩一张时点名)。
    const hidden = om.hiddenCard ? formatCard(om.hiddenCard) : '?';
    const loserHand = winner === 'ai' ? om.playerHand : om.aiHand;
    const ghost = loserHand.length === 1 ? formatCard(loserHand[0]!) : '';
    const record: OldMaidRecord = {
      at: nowIso(this.opts.timezone),
      draws: 0,
      discardPairs: om.discards.length,
      hidden,
      winner,
    };
    recordOldMaid(state, record);
    state.game = null;
    this.save();
    this.broadcast();
    const line = mt.oldMaidEndLine(
      winner === 'ai' ? mt.matchYouWin : mt.matchOwnerWins,
      om.aiHand.length,
      om.playerHand.length,
      om.score.ai,
      om.score.player,
      hidden,
      ghost,
    );
    void this.host?.pushEvent({
      type: 'oldmaid.result',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: line,
    }, { trigger: 'flush' });
    return line;
  }

  // ---------------------------------------------------------------- 面板

  private async handleInvoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel !== 'table') throw new Error(`unknown panel ${panel}`);
    if (!this.state) this.state = loadTable(this.opts.dataDir) ?? newTable(this.opts.cfg.startChips);
    if (method === 'state') return this.snapshot();
    if (method === 'history') return { history: this.state.blackjack?.history ?? [], matches: this.matches };
    if (method !== 'action') throw new Error(`unknown method ${method}`);
    const arg = (args[0] ?? {}) as Record<string, unknown>;
    const action = String(arg.action ?? '');
    const state = this.state;
    const mt = this.mt();

    if (action === 'newgame') {
      const game = String(arg.game ?? '');
      if (game !== 'blackjack' && game !== 'oldmaid') throw new Error(mt.errNewgameKind);
      if (state.game !== null) throw new Error(mt.handNotFinished);
      if (game === 'blackjack') {
        const dealer = String(arg.dealer ?? '');
        if (dealer !== 'ai' && dealer !== 'player') throw new Error(mt.errNewgameDealerArg);
        state.game = 'blackjack';
        state.blackjack = newBlackjackState(dealer === 'ai' ? 'dealer' : 'player');
        this.save();
        this.broadcast();
        if (state.blackjack.aiRole === 'player') this.notifyBettingTurn();
        return this.snapshot();
      }
      this.startOldMaid();
      return this.snapshot();
    }
    if (action === 'leave') {
      // 返回大厅:弃掉当前对局。筹码在下注时不动、结算时才划账,未结算的手直接作废即无损。
      if (state.game === null) return this.snapshot();
      if (state.blackjack?.dealerActing) throw new Error(mt.dealerTurnInProgress);
      state.game = null;
      state.blackjack = null;
      state.oldmaid = null;
      this.save();
      this.broadcast();
      return this.snapshot();
    }
    if (action === 'relief') {
      if (state.player.chips >= this.opts.cfg.minBet) throw new Error(mt.reliefOnlyWhenBroke(state.player.chips, this.opts.cfg.minBet));
      state.player.chips = this.opts.cfg.startChips;
      state.player.bankruptcies++;
      this.save();
      this.broadcast();
      return this.snapshot();
    }
    if (action === 'resetmatch') {
      if (state.blackjack?.dealerActing) throw new Error(mt.matchResetDealerPlaying);
      this.recordMatchAndReset();
      return this.snapshot();
    }
    if (action === 'nudge') {
      if (state.game === 'blackjack' && state.blackjack!.phase === 'betting' && state.blackjack!.aiRole === 'player') {
        this.notifyBettingTurn();
        return this.snapshot();
      }
      if (state.game === 'blackjack' && state.blackjack!.phase === 'insurance' && state.blackjack!.aiRole === 'player') {
        this.notifyInsuranceTurn();
        return this.snapshot();
      }
      throw new Error(mt.errAINotWaiting);
    }

    if (['bet', 'hit', 'stand', 'double', 'split', 'insurance', 'surrender'].includes(action)) {
      if (state.game !== 'blackjack' || !state.blackjack) throw new Error(mt.errWrongGame);
      if (state.blackjack.aiRole !== 'dealer') throw new Error(mt.youAreDealerNote);
      const result = await this.playerAction(action === 'bet' || action === 'insurance' ? { action, amount: arg.amount } : { action });
      if (!result.ok) throw new Error(result.text);
      return this.snapshot();
    }
    if (action === 'draw') {
      if (state.game !== 'oldmaid' || !state.oldmaid) throw new Error(mt.errWrongGame);
      if (state.oldmaid.winner) throw new Error(mt.handNotFinished);
      if (state.oldmaid.turnOwner !== 'player') throw new Error(mt.oldMaidNotYourTurn);
      const om = state.oldmaid;
      // 玩家在面板上点对方一张背面牌:带 index 指定位置;缺省则随机(兼容旧的调用方式)。
      const raw = arg.index;
      let idx: number;
      if (raw === undefined) {
        idx = Math.floor((this.opts.rng ?? Math.random)() * om.aiHand.length);
      } else {
        const n = Math.floor(Number(raw));
        if (!Number.isInteger(n) || n < 0 || n >= om.aiHand.length) throw new Error(mt.oldMaidBadIndex(om.aiHand.length));
        idx = n;
      }
      const card = om.aiHand.splice(Math.min(Math.max(idx, 0), om.aiHand.length - 1), 1)[0]!;
      om.playerHand.push(card);
      const { singles, pairs } = extractPairs(om.playerHand);
      om.playerHand.length = 0;
      om.playerHand.push(...singles);
      if (pairs.length) om.discards.push(...pairs);
      om.turnOwner = 'ai';
      if (om.aiHand.length === 0) {
        this.endOldMaid('ai');
        return this.snapshot();
      }
      if (om.playerHand.length === 0) {
        this.endOldMaid('player');
        return this.snapshot();
      }
      this.save();
      this.broadcast();
      this.notifyOldMaidTurn();
      return this.snapshot();
    }
    throw new Error(mt.errUnknownActionPanel(action));
  }

  /** 轮到 AI 在抽鬼牌里抽牌:flush 通知。 */
  private notifyOldMaidTurn(): void {
    const mt = this.mt();
    void this.host?.pushEvent({
      type: 'oldmaid.turn',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text: mt.oldMaidTurnNotify(this.state!.oldmaid!.playerHand.length),
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

  /** 面板视图(玩家视角),按当前对局类型给不同字段。 */
  private snapshot(): unknown {
    // webui 可能在 start() 落定前就探测桌面:先垫一张空桌再照常快照,而不是抛 null 错。
    // start() 随后仍会用存档(或新桌)覆盖,垫的这桌不会落盘。
    if (!this.state) this.state = newTable(this.opts.cfg.startChips);
    const state = this.state;
    const seatView = (seat: SeatState) => ({
      chips: seat.chips,
      wins: seat.wins,
      losses: seat.losses,
      pushes: seat.pushes,
      net: seat.net,
      bankruptcies: seat.bankruptcies,
    });
    const base = {
      version: state.version,
      game: state.game,
      ai: seatView(state.ai),
      player: seatView(state.player),
      minBet: this.opts.cfg.minBet,
      maxBet: this.opts.cfg.maxBet,
      startChips: this.opts.cfg.startChips,
      dealerHitsSoft17: this.opts.cfg.dealerHitsSoft17,
      matches: this.matches,
    };
    if (state.game === 'blackjack' && state.blackjack) {
      const bj = state.blackjack;
      const dealerVisible = bj.holeRevealed ? bj.dealerCards : bj.dealerCards.slice(0, 1);
      return {
        ...base,
        game: 'blackjack',
        phase: bj.phase,
        round: bj.round,
        aiRole: bj.aiRole,
        bet: bj.bet,
        insurance: bj.insurance,
        holeRevealed: bj.holeRevealed,
        dealerActing: bj.dealerActing,
        hands: bj.hands.map((hand, i) => ({
          cards: formatHand(hand.cards),
          total: hand.cards.length ? handValue(hand.cards).total : null,
          bet: hand.bet,
          doubled: hand.doubled,
          outcome: hand.outcome,
          active: i === bj.activeHand && bj.hands.some((h) => !h.stood),
        })),
        activeHand: bj.activeHand,
        dealerCards: formatHand(dealerVisible),
        dealerVisibleTotal: dealerVisible.length ? handValue(dealerVisible).total : null,
        dealerTotal: bj.dealerCards.length ? handValue(bj.dealerCards).total : null,
        holeCount: bj.dealerCards.length - dealerVisible.length,
        lastResult: bj.history[0] ?? null,
        history: bj.history.slice(0, 10),
      };
    }
    if (state.game === 'oldmaid' && state.oldmaid) {
      const om = state.oldmaid;
      return {
        ...base,
        game: 'oldmaid',
        turnOwner: om.turnOwner,
        winner: om.winner,
        playerCards: formatHand(om.playerHand),
        playerHandCount: om.playerHand.length,
        aiHandCount: om.aiHand.length,
        discardPairs: om.discards.length,
        lastDiscards: om.discards.slice(-3).map((pair) => formatHand(pair)),
        score: om.score,
        oldmaidHistory: om.history.slice(0, 10),
      };
    }
    // 空桌,或刚结束的对局(牌面留在桌上)。
    const endedOldMaid = state.oldmaid;
    const endedBlackjack = state.blackjack;
    return {
      ...base,
      game: null,
      phase: 'idle',
      blackjack: endedBlackjack
        ? { round: endedBlackjack.round, history: endedBlackjack.history.slice(0, 10) }
        : null,
      oldmaid: endedOldMaid
        ? { winner: endedOldMaid.winner, score: endedOldMaid.score, playerCards: formatHand(endedOldMaid.playerHand), aiHandCount: endedOldMaid.aiHand.length, discards: endedOldMaid.discards.slice(-3).map((pair) => formatHand(pair)), hiddenCard: endedOldMaid.hiddenCard ? formatCard(endedOldMaid.hiddenCard) : null, history: endedOldMaid.history.slice(0, 10) }
        : null,
    };
  }

  // ---------------------------------------------------------------- 底层

  /** 校验下注:整数、范围内、不超过闲家自己的余额——赔付把庄家打成负数是可以接受的。 */
  private readBet(raw: unknown): number | string {
    const bet = Math.floor(Number(raw));
    if (!Number.isFinite(bet)) return this.mt().betNotInteger(JSON.stringify(raw ?? null));
    const state = this.state!;
    const idlerChips = state.blackjack!.aiRole === 'player' ? state.ai.chips : state.player.chips;
    if (bet < this.opts.cfg.minBet) return this.mt().minBetIs(this.opts.cfg.minBet);
    if (bet > this.opts.cfg.maxBet) return this.mt().maxBetIs(this.opts.cfg.maxBet);
    if (bet > idlerChips) return this.mt().cannotAffordBet(idlerChips, bet);
    return bet;
  }

  private cards(cards: readonly Card[]): string {
    return cards.map((card) => formatCard(card)).join(' ');
  }

  /** 一手牌的计数摘要(不暴露具体牌面)。 */
  private handSummaryOf(cards: readonly Card[]): string {
    return handSummary(cards);
  }

  private draw(): Card {
    const state = this.state!;
    if (state.drawn >= state.shoe.length) {
      // 牌抽尽:换整副 52 张新牌靴(抽鬼牌的牌在开局时已藏一张、发完,不会走到这里)。
      state.shoe = shuffled(freshDeck(), this.opts.rng ?? Math.random);
      state.drawn = 0;
    }
    return state.shoe[state.drawn++]!;
  }

  /** 「记录并重来」(21 点):归档当前场次(最多留 10 场),筹码与战绩清零,回选庄。 */
  private recordMatchAndReset(): void {
    const mt = this.mt();
    const state = this.state!;
    const bj = state.blackjack;
    const winner: MatchRecord['winner'] =
      state.ai.chips > state.player.chips ? 'ai' : state.player.chips > state.ai.chips ? 'player' : 'tie';
    const played = bj ? Math.max(0, bj.round - 1) : 0;
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
    state.game = null;
    state.blackjack = null;
    state.oldmaid = null;
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

  private save(): void {
    if (this.state) saveTable(this.opts.dataDir, this.state);
  }
}
