/**
 * 场次记录:主人点「记录并重来」时归档一场(双方筹码与战绩),最多存最近 10 场。
 * 文件名以 World id 开头(casino-matches.json),存 ctx.dataDir,损坏时当空表。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MatchRecord {
  at: string;
  /** 这一场打过的手数。 */
  rounds: number;
  aiChips: number;
  playerChips: number;
  aiNet: number;
  playerNet: number;
  winner: 'ai' | 'player' | 'tie';
}

const MAX_MATCHES = 10;

export function loadMatches(dataDir: string): MatchRecord[] {
  const file = join(dataDir, 'casino-matches.json');
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { matches?: MatchRecord[] };
    if (!Array.isArray(parsed?.matches)) return [];
    return parsed.matches.slice(0, MAX_MATCHES);
  } catch {
    return [];
  }
}

export function saveMatches(dataDir: string, matches: readonly MatchRecord[]): void {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'casino-matches.json');
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ matches: matches.slice(0, MAX_MATCHES) }, null, 2), 'utf8');
  renameSync(tmp, file);
}

export const MATCHES_LIMIT = MAX_MATCHES;
