/** @casino 联机协议:文本格式简单稳定,便于提示注入防护(只有整行精确匹配才算协议)。 */
export type OnlineGame = 'blackjack' | 'oldmaid' | 'holdem';
export const ONLINE_GAMES: readonly OnlineGame[] = ['blackjack', 'oldmaid', 'holdem'];
export const ONLINE_PREFIX = '@casino';

/** 协议动作全集;解析时按动作严格校验参数形态。 */
export const ONLINE_ACTIONS = [
  'invite', 'accept', 'decline',
  'start', 'hand', 'state', 'act', 'settle', 'handoff', 'rest', 'stop', 'reject',
] as const;
export type OnlineAction = (typeof ONLINE_ACTIONS)[number];

export interface OnlineMessage {
  action: OnlineAction;
  /** 首个裸词恰为游戏名时填充(invite/start/accept/decline)。 */
  game: OnlineGame | null;
  /** 动作后的全部裸词(act: 动作词+金额;invite/start: 游戏名)。 */
  tokens: string[];
  /** key=value 形式的参数(state/settle/handoff/rest/stop/reject)。 */
  kv: Record<string, string>;
}

/** 解析 @casino 协议消息;非协议消息、未知动作或参数形态不合法返回 null(按普通聊天处理)。 */
export function parseOnlineMessage(text: string): OnlineMessage | null {
  const line = String(text ?? '').trim();
  if (!line.startsWith(ONLINE_PREFIX)) return null;
  const tokens = line.slice(ONLINE_PREFIX.length).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const action = tokens[0]!.toLowerCase() as OnlineAction;
  if (!ONLINE_ACTIONS.includes(action)) return null;
  const rest = tokens.slice(1);
  const kv: Record<string, string> = {};
  const bare: string[] = [];
  for (const t of rest) {
    const eq = t.indexOf('=');
    if (eq > 0) { kv[t.slice(0, eq)] = t.slice(eq + 1); continue; }
    bare.push(t);
  }
  const game = bare[0] && ONLINE_GAMES.includes(bare[0] as OnlineGame) ? (bare[0] as OnlineGame) : null;
  // 按动作严格校验;任何形态不符都视为普通聊天(协议通道不接受含糊输入)。
  if (action === 'invite' || action === 'start') {
    if (!game || bare.length !== 1) return null; // start 允许携带 kv 筹码账本
  } else if (action === 'accept' || action === 'decline') {
    if (bare.length > 1 || Object.keys(kv).length) return null;
    if (bare.length === 1 && !game) return null;
  } else if (action === 'act') {
    if (!bare.length) return null;
    // 三游戏全动作集(21点:bet/hit/stand/double;抽鬼牌:draw;德州:fold/check/call/bet/raise)——
    // 世界层按当前会话游戏校验,解析层只做形态校验。
    if (!['bet', 'hit', 'stand', 'double', 'draw', 'fold', 'check', 'call', 'raise'].includes(bare[0]!)) return null;
    if ((bare[0] === 'bet' || bare[0] === 'raise') && (bare.length !== 2 || !/^\d+$/.test(bare[1] ?? ''))) return null;
    if (bare[0] !== 'bet' && bare[0] !== 'raise' && bare.length !== 1) return null;
  } else if (action === 'hand') {
    if (bare.length) return null; // hand 无裸参数,kv 允许(抽鬼牌开局带闲家手牌)
  } else if (action === 'state') {
    if (bare.length || !Object.keys(kv).length) return null; // state 只收 key=value 参数
  } else {
    // settle / handoff / rest / stop / reject:只收 key=value 参数
    if (bare.length) return null;
    if (action === 'rest' && !/^\d+$/.test(kv.minutes ?? '')) return null;
    if (action === 'settle' && !/^(player|bank|push)$/.test(kv.result ?? '')) return null;
    if (action === 'handoff' && !/^[\d]+:[\d]+,[\d]+:[\d]+$/.test(kv.chips ?? '')) return null;
  }
  return { action, game, tokens: bare.length ? bare : rest, kv };
}

/** 组装协议消息行:onlineLine('state', ['total=14', ...]) → '@casino state total=14 ...'。 */
export function onlineLine(action: OnlineAction, parts: string[] = []): string {
  return [ONLINE_PREFIX, action, ...parts].join(' ');
}

/** 邀约意向消息(invite/accept/decline,游戏名为首个参数)。 */
export function composeOnlineMessage(action: 'invite' | 'accept' | 'decline', game?: OnlineGame | null): string {
  return onlineLine(action, game ? [game] : []);
}

/** 邀约记录(内存态,重启即失效——联机会话本就不该跨重启保留)。 */
export interface OnlineInvite {
  direction: 'in' | 'out';
  peer: string;
  game: OnlineGame;
  at: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}
