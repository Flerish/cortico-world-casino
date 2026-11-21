/**
 * 牌桌状态与持久化(对战版)。文件固定名以 World id 开头(casino-table.json),存 ctx.dataDir。
 * 每次落子后原子写(tmp+rename);读不到或读坏了当作新桌,不抛错。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Card } from './cards.ts';
import { formatCard } from './cards.ts';

/** 庄闲角色;AI 与玩家各执一个,互为对家。 */
export type Role = 'dealer' | 'player';

/** 一手进行到哪一步。idle:等选庄/再开;betting:等闲家下注;playerActing:等闲家动作;
 *  dealerActing:庄家已亮暗牌,等庄家动作。 */
export type Phase = 'idle' | 'betting' | 'playerActing' | 'dealerActing';

export type Outcome = 'win' | 'lose' | 'push' | 'blackjack' | 'bust';

/** 一名玩家的口袋:筹码、累计战绩、破产次数。 */
export interface SeatState {
  chips: number;
  wins: number;
  losses: number;
  pushes: number;
  /** 累计盈亏。 */
  net: number;
  bankruptcies: number;
}

export interface HandRecord {
  /** 谁坐庄。 */
  dealer: 'ai' | 'player';
  round: number;
  bet: number;
  playerCards: string[];
  dealerCards: string[];
  /** 从闲家视角记输赢。 */
  outcome: Outcome;
  /** 闲家的净变动(赢为正)。 */
  delta: number;
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
  bet: number;
  playerCards: Card[];
  dealerCards: Card[];
  holeRevealed: boolean;
  doubled: boolean;
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
    playerCards: [],
    dealerCards: [],
    holeRevealed: false,
    doubled: false,
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

/** 读桌面存档;损坏或不存在时返回 null,由调用方决定开新桌。 */
export function loadTable(dataDir: string): TableState | null {
  const file = join(dataDir, 'casino-table.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as TableState;
    if (typeof parsed?.version !== 'number' || !parsed.ai || !parsed.player) return null;
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
