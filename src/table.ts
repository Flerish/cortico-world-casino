/**
 * 牌桌状态与持久化。文件固定名以 World id 开头(casino-table.json),存 ctx.dataDir。
 * 每手结算后原子写(tmp+rename);读不到或读坏了当作新桌,不抛错。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Card } from './cards.ts';
import { formatCard } from './cards.ts';

export type Seat = 'ai' | 'owner';
export type Outcome = 'win' | 'lose' | 'push' | 'blackjack' | 'bust';

/** 一手进行中或已结算的牌;庄家手随手下发并保存,亮过明牌就不再变。 */
export interface HandState {
  cards: Card[];
  /** 这手对桌的庄家手;首张是明牌,其余暗牌。 */
  dealer: Card[];
  bet: number;
  /** acting:可要牌;done:已结算。 */
  phase: 'acting' | 'done';
  doubled: boolean;
}

/** 一名玩家的口袋:筹码、当前手、累计战绩。 */
export interface SeatState {
  chips: number;
  hand: HandState | null;
  wins: number;
  losses: number;
  pushes: number;
  /** 累计盈亏。 */
  net: number;
}

export interface HandRecord {
  who: Seat;
  bet: number;
  playerCards: string[];
  dealerCards: string[];
  outcome: Outcome;
  /** 本手净变动(赢为正)。 */
  delta: number;
  at: string;
}

export interface TableState {
  /** 每次写盘 +1;面板据此丢弃旧帧。 */
  version: number;
  ai: SeatState;
  owner: SeatState;
  history: HandRecord[];
  bankruptcies: number;
  /** 牌靴(未抽完的牌),耗尽时重洗。 */
  shoe: Card[];
  drawn: number;
}

export function newSeat(startChips: number): SeatState {
  return { chips: startChips, hand: null, wins: 0, losses: 0, pushes: 0, net: 0 };
}

export function newTable(startChips: number): TableState {
  return {
    version: 0,
    ai: newSeat(startChips),
    owner: newSeat(startChips),
    history: [],
    bankruptcies: 0,
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
    if (typeof parsed?.version !== 'number' || !parsed.ai || !parsed.owner) return null;
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
