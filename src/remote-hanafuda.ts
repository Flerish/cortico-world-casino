/**
 * 联机花札引擎(庄家端权威):整副 48 张(12 月 × 4 张,配对只看月份)、开局场 4 同月重发;
 * 轮流「打一张手牌 + 翻一张山札」,配对收进收集区(场同月 2 张选收、3 张整摞);役分有增时
 * 该方决策:こいこい(继续)或 yame(收手,协议词避开会话 stop)。收手按文差划筹码:
 * 七文翻倍按役分判定,こいこい翻倍独立相乘(与本地同口径)。先后手逐局轮换。
 * 联机单局制:一手=一局,庄家每手轮换(比分累计为本地模式专属)。
 * 庄家侧回合由引擎自动推进(bankRunTurn 内用 AI 启发式);客座侧经协议显式动作。
 */
import { shuffled, type Card } from './cards.ts';
import {
  evaluateYaku,
  freshHanafudaDeck,
  hanafudaAiKoikoi,
  hanafudaAiPick,
  hanafudaAiPlay,
  HANAFUDA_LIGHT,
  HANAFUDA_TANE,
  type HanaCard,
  type YakuOptions,
} from './hanafuda.ts';

export interface RemoteHanafudaOptions {
  bankChips: number;
  playerChips: number;
  rng?: () => number;
  /** 收手 7 文以上翻倍(与本地配置同源;缺省开)。 */
  sevenDouble?: boolean;
  /** 测试注入固定牌序(数组尾部先发)。 */
  deck?: HanaCard[];
}

export interface RemoteHanafudaCollect {
  light: HanaCard[];
  tane: HanaCard[];
  tan: HanaCard[];
  kasu: HanaCard[];
}

export interface RemoteHanafudaState {
  bankHand: HanaCard[];
  playerHand: HanaCard[];
  field: HanaCard[];
  deck: HanaCard[];
  bankCollect: RemoteHanafudaCollect;
  playerCollect: RemoteHanafudaCollect;
  /** play = 打手牌;decide = 成役后等 koikoi/yame。pick 用 pickOwner 表达。 */
  phase: 'play' | 'decide';
  turn: 'bank' | 'player';
  pickOwner: 'bank' | 'player' | null;
  pickCards: HanaCard[];
  pendingCard: HanaCard | null;
  pendingDraw: boolean;
  bankScore: number;
  playerScore: number;
  turnStartScore: number;
  bankKoikoi: boolean;
  playerKoikoi: boolean;
  /** 最近成役的役名列表( decide 阶段下发;换手后清空)。 */
  newYaku: string[];
  /** 本局收手者的最终文数(流局 0);done 后有效。 */
  score: number;
  done: boolean;
  winner: 'bank' | 'player' | 'draw' | null;
}

export interface RemoteHanafudaSettle {
  winner: 'player' | 'bank' | 'push';
  delta: number;
  reason: string;
  playerChips: number;
  bankChips: number;
  score: number;
}

const emptyCollect = (): RemoteHanafudaCollect => ({ light: [], tane: [], tan: [], kasu: [] });

export class RemoteHanafuda {
  chips: { bank: number; player: number };
  handsPlayed = 0;
  lastSettle: RemoteHanafudaSettle | null = null;
  state: RemoteHanafudaState | null = null;
  private readonly opts: RemoteHanafudaOptions;
  private readonly rng: () => number;
  private readonly yakuOpts: YakuOptions;
  private firstMover: 'bank' | 'player' = 'player';

  constructor(opts: RemoteHanafudaOptions) {
    this.opts = opts;
    this.rng = opts.rng ?? Math.random;
    this.chips = { bank: opts.bankChips, player: opts.playerChips };
    this.yakuOpts = { lightExclusive: true }; // 分值固定 fudawiki 档;联机双方口径必须一致
  }

  /** 开一局:整副 48 张洗匀,手 8 / 场 8 / 山 32;场 4 同月重发(上限 10 次)。 */
  startHand(): void {
    if (this.state && !this.state.done) throw new Error('上一局还没结束');
    let deck = this.opts.deck ? [...this.opts.deck] : shuffled(freshHanafudaDeck(), this.rng);
    for (let attempt = 0; attempt < 10; attempt++) {
      const field = deck.slice(16, 24);
      const four = field.some((f) => field.filter((x) => x.rank === f.rank).length === 4);
      if (!four) break;
      deck = this.opts.deck ? [...this.opts.deck] : shuffled(freshHanafudaDeck(), this.rng);
    }
    const firstMover: 'bank' | 'player' = this.handsPlayed % 2 === 0 ? 'player' : 'bank';
    this.firstMover = firstMover;
    this.state = {
      bankHand: deck.slice(0, 8),
      playerHand: deck.slice(8, 16),
      field: deck.slice(16, 24),
      deck: deck.slice(24),
      bankCollect: emptyCollect(),
      playerCollect: emptyCollect(),
      phase: 'play',
      turn: firstMover,
      pickOwner: null,
      pickCards: [],
      pendingCard: null,
      pendingDraw: false,
      bankScore: 0,
      playerScore: 0,
      turnStartScore: 0,
      bankKoikoi: false,
      playerKoikoi: false,
      newYaku: [],
      score: 0,
      done: false,
      winner: null,
    };
    this.refreshScore();
  }

  private collectOf(who: 'bank' | 'player'): RemoteHanafudaCollect {
    return who === 'bank' ? this.state!.bankCollect : this.state!.playerCollect;
  }

  private handOf(who: 'bank' | 'player'): HanaCard[] {
    return who === 'bank' ? this.state!.bankHand : this.state!.playerHand;
  }

  private scoreOf(who: 'bank' | 'player'): number {
    return who === 'bank' ? this.state!.bankScore : this.state!.playerScore;
  }

  private takeFor(who: 'bank' | 'player', card: HanaCard): void {
    const collect = this.collectOf(who);
    if (card.suit === HANAFUDA_LIGHT) collect.light.push(card);
    else if (card.suit === HANAFUDA_TANE) collect.tane.push(card);
    else if (card.suit === 3) collect.tan.push(card);
    else collect.kasu.push(card);
  }

  private collectAll(who: 'bank' | 'player'): HanaCard[] {
    const c = this.collectOf(who);
    return [...c.light, ...c.tane, ...c.tan, ...c.kasu];
  }

  private refreshScore(): void {
    const st = this.state!;
    st.bankScore = evaluateYaku(this.collectAll('bank'), this.yakuOpts).total;
    st.playerScore = evaluateYaku(this.collectAll('player'), this.yakuOpts).total;
  }

  /** 打出手牌并处理配对(0 留场 / 1 收走 / 2 待选 / 3 整摞),随后翻山札。 */
  private playFor(who: 'bank' | 'player', index: number): void {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.phase !== 'play' || st.turn !== who) throw new Error('现在不是你的出牌回合');
    if (st.pickOwner) throw new Error('先完成场牌选择');
    const hand = this.handOf(who);
    if (!Number.isInteger(index) || index < 0 || index >= hand.length) throw new Error(`index 要在 0 到 ${hand.length - 1} 之间`);
    const card = hand.splice(index, 1)[0]!;
    const matched = st.field.filter((f) => f.rank === card.rank);
    if (matched.length === 2) {
      st.pickOwner = who;
      st.pickCards = [...matched];
      st.pendingCard = card;
      st.pendingDraw = true;
      this.refreshScore();
      return;
    }
    if (matched.length === 1) {
      st.field.splice(st.field.indexOf(matched[0]!), 1);
      this.takeFor(who, card);
      this.takeFor(who, matched[0]!);
    } else {
      st.field.push(card);
    }
    this.refreshScore();
    this.drawPhaseFor(who);
  }

  /** 翻山札并处理配对;回合末按役分增量决定进决策还是换手。 */
  private drawPhaseFor(who: 'bank' | 'player'): void {
    const st = this.state!;
    if (st.deck.length > 0) {
      const card = st.deck.pop()!;
      const matched = st.field.filter((f) => f.rank === card.rank);
      if (matched.length === 2) {
        st.pickOwner = who;
        st.pickCards = [...matched];
        st.pendingCard = card;
        st.pendingDraw = false;
        return;
      }
      if (matched.length === 1) {
        st.field.splice(st.field.indexOf(matched[0]!), 1);
        this.takeFor(who, card);
        this.takeFor(who, matched[0]!);
      } else {
        st.field.push(card);
      }
      this.refreshScore();
    }
    this.finishTurnFor(who);
  }

  /** 场牌选择:收走所选(与挂起牌一起),另一张留场;继续被挂起的下一步。 */
  private pickFor(who: 'bank' | 'player', index: number): void {
    const st = this.state!;
    if (st.pickOwner !== who || !st.pendingCard) throw new Error('现在没有场牌选择要做');
    if (!Number.isInteger(index) || index < 0 || index >= st.pickCards.length) throw new Error(`index 要在 0 到 ${st.pickCards.length - 1} 之间`);
    const chosen = st.pickCards[index]!;
    const keep = st.pickCards[1 - index]!;
    st.field = st.field.filter((f) => f !== chosen && f !== keep);
    st.field.push(keep);
    this.takeFor(who, chosen);
    this.takeFor(who, st.pendingCard);
    st.pickOwner = null;
    st.pickCards = [];
    const wasDraw = st.pendingDraw;
    st.pendingCard = null;
    st.pendingDraw = false;
    this.refreshScore();
    if (wasDraw) this.drawPhaseFor(who);
    else this.finishTurnFor(who);
  }

  /** 回合末:役分有增 → 决策;否则换手(双方手牌与山札打空 → 流局)。 */
  private finishTurnFor(who: 'bank' | 'player'): void {
    const st = this.state!;
    this.refreshScore();
    const now = this.scoreOf(who);
    const yaku = evaluateYaku(this.collectAll(who), this.yakuOpts);
    if (now > st.turnStartScore && yaku.hits.length > 0) {
      st.phase = 'decide';
      st.newYaku = yaku.hits.map((x) => `${x.name} ${x.points}文`);
      return;
    }
    st.newYaku = [];
    if (st.bankHand.length === 0 && st.playerHand.length === 0 && st.deck.length === 0) {
      this.settleDraw();
      return;
    }
    const other: 'bank' | 'player' = who === 'bank' ? 'player' : 'bank';
    st.turn = other;
    st.turnStartScore = this.scoreOf(other);
    st.phase = 'play';
    // 残局修复(实测死锁):收对激进时一方手牌可比山札先空——轮到空手方无牌可打,reject 循环卡死。
    // 规则自洽:空手方从山札暗补一张作为出牌资本;山札也空则流局(双方都无法再行动)。
    const otherHand = other === 'bank' ? st.bankHand : st.playerHand;
    if (otherHand.length === 0) {
      if (st.deck.length > 0) otherHand.push(st.deck.pop()!);
      else { this.settleDraw(); return; }
    }
  }

  // ── 客座(协议动作) ──

  playerPlay(index: number): void {
    this.playFor('player', index);
  }

  playerPick(index: number): void {
    this.pickFor('player', index);
  }

  playerKoikoi(): void {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.phase !== 'decide' || st.turn !== 'player') throw new Error('现在没有成役决策要做');
    st.playerKoikoi = true;
    this.endTurnAfterDecide('player');
  }

  playerYame(): void {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.phase !== 'decide' || st.turn !== 'player') throw new Error('现在没有成役决策要做');
    this.settle('player');
  }

  // ── 庄家(本机 AI;world 层循环驱动) ──

  // ── 庄家(本机 AI;联机时由 AI 自主动作,世界层超时兜底) ──

  /** 庄家显式打出一张手牌(与客座 playerPlay 对称)。 */
  bankPlay(index: number): void { this.playFor('bank', index); }
  /** 庄家显式选收场牌(两张同月时)。 */
  bankPickAt(index: number): void { this.pickFor('bank', index); }
  /** 庄家成役继续(こいこい)。 */
  bankKoikoi(): void {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.phase !== 'decide' || st.turn !== 'bank') throw new Error('现在没有庄家的成役决策');
    st.bankKoikoi = true;
    this.endTurnAfterDecide('bank');
  }
  /** 庄家成役收手结算。 */
  bankYame(): void {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.phase !== 'decide' || st.turn !== 'bank') throw new Error('现在没有庄家的成役决策');
    this.settle('bank');
  }

  /** 庄家回合自动打牌 + 翻山札(打哪张用启发式)。 */
  bankRunTurn(): void {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.phase !== 'play' || st.turn !== 'bank' || st.pickOwner) throw new Error('现在不是庄家的出牌回合');
    const index = hanafudaAiPlay(st.bankHand, st.field);
    this.playFor('bank', index);
  }

  bankPick(): void {
    const st = this.state!;
    if (st.pickOwner !== 'bank') throw new Error('现在没有庄家的场牌选择');
    this.pickFor('bank', hanafudaAiPick(st.pickCards));
  }

  /** 庄家决策(世界层按启发式结果传入)。 */
  bankDecide(koikoi: boolean): void {
    const st = this.state!;
    if (st.done) throw new Error('本局已结束');
    if (st.phase !== 'decide' || st.turn !== 'bank') throw new Error('现在没有庄家的成役决策');
    if (koikoi) st.bankKoikoi = true;
    else this.settle('bank');
    if (!st.done) this.endTurnAfterDecide('bank');
  }

  private endTurnAfterDecide(who: 'bank' | 'player'): void {
    const st = this.state!;
    st.phase = 'play';
    st.newYaku = [];
    if (st.bankHand.length === 0 && st.playerHand.length === 0 && st.deck.length === 0) {
      this.settleDraw();
      return;
    }
    const other: 'bank' | 'player' = who === 'bank' ? 'player' : 'bank';
    st.turn = other;
    st.turnStartScore = this.scoreOf(other);
    st.phase = 'play';
    // 残局修复(实测死锁):收对激进时一方手牌可比山札先空——轮到空手方无牌可打,reject 循环卡死。
    // 规则自洽:空手方从山札暗补一张作为出牌资本;山札也空则流局(双方都无法再行动)。
    const otherHand = other === 'bank' ? st.bankHand : st.playerHand;
    if (otherHand.length === 0) {
      if (st.deck.length > 0) otherHand.push(st.deck.pop()!);
      else { this.settleDraw(); return; }
    }
  }

  private settleDraw(): void {
    const st = this.state!;
    st.done = true;
    st.winner = 'draw';
    st.score = 0;
    this.handsPlayed++;
    this.lastSettle = { winner: 'push', delta: 0, reason: '双方都没收手,流局', playerChips: this.chips.player, bankChips: this.chips.bank, score: 0 };
  }

  /** 收手结算:役分 → 七文翻倍(按役分)→ こいこい翻倍(独立相乘);文差划筹码。 */
  private settle(winner: 'bank' | 'player'): void {
    const st = this.state!;
    st.done = true;
    st.winner = winner;
    const oppKoikoi = winner === 'bank' ? st.playerKoikoi : st.bankKoikoi;
    let score = evaluateYaku(this.collectAll(winner), this.yakuOpts).total;
    if (this.opts.sevenDouble !== false && score >= 7) score *= 2;
    if (oppKoikoi) score *= 2;
    st.score = score;
    const delta = winner === 'player' ? score : -score;
    this.chips.player += delta;
    this.chips.bank -= delta;
    this.handsPlayed++;
    this.lastSettle = { winner, delta, reason: oppKoikoi ? '收手(对方喊过こいこい,翻倍)' : '收手', playerChips: this.chips.player, bankChips: this.chips.bank, score };
  }

  get phase(): string {
    if (!this.state) return 'awaitStart';
    if (this.state.done) return 'done';
    if (this.state.pickOwner) return `pick-${this.state.pickOwner}`;
    if (this.state.phase === 'decide') return `decide-${this.state.turn}`;
    return this.state.turn === 'player' ? 'player' : 'bank';
  }

  /** 客座视角的 state 参数体:手牌(顺序即 play 的 index)、场牌、计数、役分、决策提示。 */
  stateParts(): string[] {
    const st = this.state;
    if (!st) return [];
    const me = st.playerCollect;
    const opp = st.bankCollect;
    const parts = [
      `turn=${st.turn === 'player' ? 'you' : 'bank'}`,
      `stage=${st.phase === 'decide' ? 'decide' : st.pickOwner ? 'pick' : 'play'}`,
      `yourHand=${st.playerHand.map((c) => cardText(c)).join(',') || 'none'}`,
      `oppCount=${st.bankHand.length}`,
      `field=${st.field.map((c) => cardText(c)).join(',') || 'none'}`,
      `deck=${st.deck.length}`,
      `myScore=${st.playerScore}`,
      `oppScore=${st.bankScore}`,
      `myCollect=${[...me.light, ...me.tane, ...me.tan, ...me.kasu].map((c) => cardText(c)).join(',') || 'none'}`,
      `oppCollect=${[...opp.light, ...opp.tane, ...opp.tan, ...opp.kasu].map((c) => cardText(c)).join(',') || 'none'}`,
      `myKoikoi=${st.playerKoikoi}`,
      `oppKoikoi=${st.bankKoikoi}`,
      // 役名含中文与空格(如「赤短 5文」),必须 URI 编码——空格会破坏协议分词,整条 state 被解析器丢弃(decide 卡死根因)。
      `newYaku=${encodeURIComponent(st.newYaku.join('·')) || 'none'}`,
    ];
    if (st.pickOwner === 'player') parts.push(`pick=2`, `pickCards=${st.pickCards.map((c) => cardText(c)).join(',')}`);
    if (st.phase === 'decide' && st.turn === 'player') parts.push('decide=1');
    return parts;
  }

  settleParts(): string[] | null {
    if (!this.lastSettle) return null;
    const s = this.lastSettle;
    return [`result=${s.winner}`, `delta=${s.delta >= 0 ? '+' : ''}${s.delta}`, `chips=${s.bankChips}:${s.playerChips}`, `hands=${this.handsPlayed}`, `score=${s.score}`, `reason=${encodeURIComponent(s.reason)}`];
  }

  handDetail(): string {
    const st = this.state;
    if (!st) return '(未开局)';
    return `庄家 ${st.bankHand.length} 张 / 闲家 ${st.playerHand.length} 张 / 场牌 ${st.field.length} / 山札 ${st.deck.length} / 役分 我 ${st.bankScore} — 对方 ${st.playerScore}`;
  }
}

/** 花札牌的协议文本(月→点数、类→花色,与本地映射一致;粕同月同观感)。 */
function cardText(card: HanaCard | Card): string {
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['♠', '♥', '♣', '♦'];
  return `${SUITS[card.suit] ?? '?'}${RANKS[card.rank] ?? '?'}`;
}
