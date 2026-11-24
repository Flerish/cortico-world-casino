/**
 * 月下牌桌的状态与持久化(双游戏:21 点 / 抽鬼牌)。
 * 文件固定名以 World id 开头(casino-table.json),存 ctx.dataDir。
 * 每次落子后原子写(tmp+rename);读不到、读坏或形状对不上(旧版本存档)当作新桌,不抛错。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Card } from './cards.ts';
import { formatCard } from './cards.ts';

/** 庄闲角色(21 点);AI 与玩家各执一个,互为对家。庄家是机械的银行,按固定规则自动打。 */
export type Role = 'dealer' | 'player';

/** 21 点进行到哪一步。 */
export type BlackjackPhase = 'betting' | 'insurance' | 'playerActing';

export type Outcome = 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | 'surrender';

/** 21 点的一手:分牌后会有两手。 */
export interface IdlerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  stood: boolean;
  fromSplit: boolean;
  outcome: Outcome | null;
}

/** 筹码口袋与战绩(21 点用;抽鬼牌不动它)。 */
export interface SeatState {
  chips: number;
  wins: number;
  losses: number;
  pushes: number;
  net: number;
  bankruptcies: number;
}

export interface HandRecord {
  dealer: 'ai' | 'player';
  round: number;
  bet: number;
  hands: Array<{ cards: string[]; bet: number; outcome: Outcome }>;
  dealerCards: string[];
  insurance: number;
  insuranceWon: boolean;
  delta: number;
  surrendered: boolean;
  at: string;
}

/** 21 点对局状态;null = 桌上没有 21 点对局。 */
export interface BlackjackState {
  phase: BlackjackPhase;
  aiRole: Role;
  round: number;
  bet: number;
  insurance: number;
  insuranceOutcome: 'none' | 'won' | 'lost';
  hands: IdlerHand[];
  activeHand: number;
  dealerCards: Card[];
  holeRevealed: boolean;
  dealerActing: boolean;
  history: HandRecord[];
}

/** 抽鬼牌对局状态;null = 桌上没有抽鬼牌对局。 */
export interface OldMaidState {
  aiHand: Card[];
  playerHand: Card[];
  /** 已弃掉的对子(每次弃一对追加一项)。 */
  discards: Card[][];
  /** 开局从整副 52 张里藏起的一张;它的同点同伴就是鬼牌。对局中不下发快照,终局才亮。 */
  hiddenCard: Card | null;
  /** 轮到谁抽牌。 */
  turnOwner: 'ai' | 'player';
  /** 局结束:null = 进行中;非空 = 手空者赢,另一方手里剩同点落单的鬼牌。 */
  winner: 'ai' | 'player' | null;
  /** 场次胜场数。 */
  score: { ai: number; player: number };
  history: OldMaidRecord[];
}

export interface OldMaidRecord {
  at: string;
  /** 本局抽牌总次数(双方)。 */
  draws: number;
  /** 弃掉的对子数。 */
  discardPairs: number;
  /** 开局藏起来的那张牌(终局亮牌)。 */
  hidden: string;
  winner: 'ai' | 'player';
}

/** 德州扑克进行到哪一步。 */
export type HoldemPhase = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'runout';

/** 德州一人一侧的手牌与投入(筹码不动账,投入只在结算时划转)。 */
export interface HoldemSeat {
  cards: Card[];
  /** 本手累计投入(参与底池)。 */
  committed: number;
  /** 本街已投入(街清后归零)。 */
  street: number;
  /** 本街是否已行动过(决定街何时结束)。 */
  acted: boolean;
  folded: boolean;
  allIn: boolean;
}

/** 德州扑克对局状态;null = 桌上没有德州对局。 */
export interface HoldemState {
  phase: HoldemPhase;
  round: number;
  /** 庄位(=小盲,翻牌前先行动、翻牌后后行动);每手轮换。 */
  button: 'ai' | 'player';
  /** 轮到谁;null = 引擎发牌/结清中。 */
  toAct: 'ai' | 'player' | null;
  /** 本街当前最高投入额(跟注目标)。 */
  currentBet: number;
  /** 本街最小加注增量(至少加到 currentBet + minRaise)。 */
  minRaise: number;
  community: Card[];
  ai: HoldemSeat;
  player: HoldemSeat;
  /** 手结束才有值;'split' = 平分底池;null = 进行中。 */
  winner: 'ai' | 'player' | 'split' | null;
  /** 以弃牌结束时不亮弃牌方的底牌;摊牌局双方都亮。 */
  revealHole: boolean;
  byFold: boolean;
  history: HoldemRecord[];
}

export interface HoldemRecord {
  at: string;
  round: number;
  winner: 'ai' | 'player' | 'split';
  /** 'fold' = 弃牌收池;'showdown' = 摊牌比牌。 */
  by: 'fold' | 'showdown';
  pot: number;
  /** 从 AI 视角的本手净变化。 */
  delta: number;
  board: string[];
  playerHole: string[];
  aiHole: string[];
  /** 摊牌局双方的成牌名(弃牌局为空)。 */
  aiMade?: string;
  playerMade?: string;
}

export interface TableState {
  /** 每次写盘 +1;面板据此丢弃旧帧。 */
  version: number;
  /** 当前对局类型;null = 空桌等选游戏。 */
  game: 'blackjack' | 'oldmaid' | 'holdem' | null;
  blackjack: BlackjackState | null;
  oldmaid: OldMaidState | null;
  holdem: HoldemState | null;
  ai: SeatState;
  player: SeatState;
  shoe: Card[];
  drawn: number;
  /** 每个游戏独立的座位(筹码+战绩,互不干涉);ai/player 是当前活动局的实时副本。 */
  gameSeats: Partial<Record<'blackjack' | 'oldmaid' | 'holdem', { ai: SeatState; player: SeatState }>>;
  /** 全局 ai/player 座位属于哪个游戏(筹码按游戏分开计的归属标记)。 */
  seatsOwner: 'blackjack' | 'oldmaid' | 'holdem' | null;
}

export function newSeat(startChips: number): SeatState {
  return { chips: startChips, wins: 0, losses: 0, pushes: 0, net: 0, bankruptcies: 0 };
}

export function newBlackjackState(aiRole: Role): BlackjackState {
  return {
    phase: 'betting',
    aiRole,
    round: 1,
    bet: 0,
    insurance: 0,
    insuranceOutcome: 'none',
    hands: [],
    activeHand: 0,
    dealerCards: [],
    holeRevealed: false,
    dealerActing: false,
    history: [],
  };
}

export function newOldMaidState(): OldMaidState {
  return {
    aiHand: [],
    playerHand: [],
    discards: [],
    hiddenCard: null,
    turnOwner: 'player',
    winner: null,
    score: { ai: 0, player: 0 },
    history: [],
  };
}

export function newHoldemSeat(): HoldemSeat {
  return { cards: [], committed: 0, street: 0, acted: false, folded: false, allIn: false };
}

export function newHoldemState(button: 'ai' | 'player'): HoldemState {
  return {
    phase: 'idle',
    round: 0,
    button,
    toAct: null,
    currentBet: 0,
    minRaise: 0,
    community: [],
    ai: newHoldemSeat(),
    player: newHoldemSeat(),
    winner: null,
    revealHole: false,
    byFold: false,
    history: [],
  };
}

export function newTable(startChips: number): TableState {
  return {
    version: 0,
    game: null,
    blackjack: null,
    oldmaid: null,
    holdem: null,
    ai: newSeat(startChips),
    player: newSeat(startChips),
    shoe: [],
    drawn: 0,
    gameSeats: {},
    seatsOwner: null,
  };
}

const MAX_HAND_HISTORY = 50;

export function recordHand(state: TableState, record: HandRecord): void {
  state.blackjack!.history.unshift(record);
  if (state.blackjack!.history.length > MAX_HAND_HISTORY) state.blackjack!.history.length = MAX_HAND_HISTORY;
}

const MAX_MATCH_HISTORY = 10;

export function recordOldMaid(state: TableState, record: OldMaidRecord): void {
  state.oldmaid!.history.unshift(record);
  if (state.oldmaid!.history.length > MAX_MATCH_HISTORY) state.oldmaid!.history.length = MAX_MATCH_HISTORY;
}

const MAX_HELDOM_HISTORY = 30;

export function recordHoldem(state: TableState, record: HoldemRecord): void {
  state.holdem!.history.unshift(record);
  if (state.holdem!.history.length > MAX_HELDOM_HISTORY) state.holdem!.history.length = MAX_HELDOM_HISTORY;
}

export function formatHand(cards: readonly Card[]): string[] {
  return cards.map((card) => formatCard(card));
}

/** 0.5.x 的平面存档结构(没有 blackjack / oldmaid / holdem 子对象键)。 */
type LegacyTableState = Omit<TableState, 'blackjack' | 'oldmaid' | 'holdem' | 'gameSeats' | 'seatsOwner'> & {
  blackjack?: BlackjackState;
  oldmaid?: OldMaidState;
  holdem?: HoldemState;
  gameSeats?: TableState['gameSeats'];
  seatsOwner?: TableState['seatsOwner'];
};

/** 读桌面存档;损坏、不存在或形状对不上(旧版本)时返回 null,由调用方决定开新桌。 */
export function loadTable(dataDir: string): TableState | null {
  const file = join(dataDir, 'casino-table.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as LegacyTableState;
    if (typeof parsed?.version !== 'number' || !parsed.ai || !parsed.player || !('game' in parsed)) return null;
    // 0.5.x 旧存档没有 blackjack/oldmaid 子对象:保留筹码与战绩,清桌重开(进行中的旧局作废)。
    // 注意判定 undefined 而非真值——新格式空桌时子对象本来就是 null。
    if (parsed.blackjack === undefined || parsed.oldmaid === undefined) {
      return {
        version: parsed.version,
        game: null,
        blackjack: null,
        oldmaid: null,
        holdem: null,
        ai: parsed.ai,
        player: parsed.player,
        shoe: Array.isArray(parsed.shoe) ? parsed.shoe : [],
        drawn: typeof parsed.drawn === 'number' ? parsed.drawn : 0,
        gameSeats: {},
        seatsOwner: null,
      };
    }
    // 0.6.x 存档没有 holdem 子对象(0.6.2 及更早):补 null 键,其余原样保留。
    if (parsed.holdem === undefined) {
      return { ...(parsed as TableState), holdem: null, gameSeats: {}, seatsOwner: null };
    }
    // 0.7.0 开发档没有 gameSeats(筹码当时全局共享):把全局座位回填给挂起的筹码游戏。
    if (parsed.gameSeats === undefined) {
      const seats = { ai: parsed.ai, player: parsed.player };
      const gameSeats: TableState['gameSeats'] = {};
      if (parsed.blackjack) gameSeats.blackjack = seats;
      if (parsed.holdem) gameSeats.holdem = seats;
      return {
        ...(parsed as TableState),
        gameSeats,
        seatsOwner: parsed.blackjack ? 'blackjack' : parsed.holdem ? 'holdem' : null,
      };
    }
    return parsed as TableState;
  } catch {
    return null;
  }
}

export function saveTable(dataDir: string, state: TableState): void {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'casino-table.json');
  const tmp = `${file}.tmp`;
  state.version++;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, file);
}
