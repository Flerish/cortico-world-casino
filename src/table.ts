/**
 * 牌桌状态与持久化。文件固定名以 World id 开头(casino-table.json),存 ctx.dataDir。
 * 每次落子后原子写(tmp+rename);读不到、读坏或形状对不上(旧版本存档)当作新桌,不抛错。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Card } from './cards.ts';
import { formatCard } from './cards.ts';

/** 庄闲角色;AI 与玩家各执一个,互为对家。庄家是机械的银行,按固定规则自动打。 */
export type Role = 'dealer' | 'player';

/** 一手进行到哪一步。idle:等选庄/再开;betting:等闲家下注;insurance:庄家亮 A,等闲家决定
 *  保险;playerActing:等闲家动作。闲家结束后庄家由引擎按规则自动打完,直接进入结算。 */
export type Phase = 'idle' | 'betting' | 'insurance' | 'playerActing';

export type Outcome = 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | 'surrender';

/** 闲家的一手:分牌后会有两手。 */
export interface IdlerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  /** 这手已停(停牌/爆牌/加倍后)。 */
  stood: boolean;
  fromSplit: boolean;
  /** 结算时写上;进行中为 null。 */
  outcome: Outcome | null;
}

/** 一名玩家的口袋:筹码、累计战绩、破产次数。 */
export interface SeatState {
  chips: number;
  wins: number;
  losses: number;
  pushes: number;
  /** 累计盈亏(含保险)。 */
  net: number;
  bankruptcies: number;
}

export interface HandRecord {
  dealer: 'ai' | 'player';
  round: number;
  /** 本手的底注。 */
  bet: number;
  /** 闲家的每一手(分牌后多手),outcome 从闲家视角记。 */
  hands: Array<{ cards: string[]; bet: number; outcome: Outcome }>;
  dealerCards: string[];
  /** 保险注额(0 = 没买)。 */
  insurance: number;
  /** 保险是否赢(庄家黑杰克)。 */
  insuranceWon: boolean;
  /** 闲家本手总净变动(含保险)。 */
  delta: number;
  surrendered: boolean;
  at: string;
}

export interface TableState {
  /** 每次写盘 +1;面板据此丢弃旧帧。 */
  version: number;
  ai: SeatState;
  player: SeatState;
  /** AI 的角色(庄/闲);玩家执对家。null = 还没开过局。 */
  aiRole: Role | null;
  phase: Phase;
  /** 手数,从 1 起。 */
  round: number;
  /** 本手的底注(分牌后每手按它起算)。 */
  bet: number;
  insurance: number;
  /** 'none' = 没到保险;'won' = 庄家黑杰克;'lost' = 庄家没有黑杰克。 */
  insuranceOutcome: 'none' | 'won' | 'lost';
  hands: IdlerHand[];
  activeHand: number;
  /** 闲家的手,全部明牌;庄家的手第二张是暗牌,闲家打完后才翻开。 */
  dealerCards: Card[];
  /** 庄家暗牌已翻开。 */
  holeRevealed: boolean;
  /** 引擎正在替庄家按规则打牌(停顿期间面板与工具都要等它)。 */
  dealerActing: boolean;
  history: HandRecord[];
  /** 牌靴(未抽完的牌),耗尽时重洗。 */
  shoe: Card[];
  drawn: number;
}

export function newSeat(startChips: number): SeatState {
  return { chips: startChips, wins: 0, losses: 0, pushes: 0, net: 0, bankruptcies: 0 };
}

export function newTable(startChips: number): TableState {
  return {
    version: 0,
    ai: newSeat(startChips),
    player: newSeat(startChips),
    aiRole: null,
    phase: 'idle',
    round: 0,
    bet: 0,
    insurance: 0,
    insuranceOutcome: 'none',
    hands: [],
    activeHand: 0,
    dealerCards: [],
    holeRevealed: false,
    dealerActing: false,
    history: [],
    shoe: [],
    drawn: 0,
  };
}

const MAX_HISTORY = 50;

export function recordHand(state: TableState, record: HandRecord): void {
  state.history.unshift(record);
  if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
}

export function formatHand(cards: readonly Card[]): string[] {
  return cards.map((card) => formatCard(card));
}

/** 读桌面存档;损坏、不存在或形状对不上(旧版本)时返回 null,由调用方决定开新桌。 */
export function loadTable(dataDir: string): TableState | null {
  const file = join(dataDir, 'casino-table.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as TableState;
    if (typeof parsed?.version !== 'number' || !parsed.ai || !parsed.player || !Array.isArray(parsed.hands)) {
      return null;
    }
    return parsed;
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
