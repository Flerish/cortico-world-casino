/** @casino 联机协议:文本格式简单稳定,便于提示注入防护(只有整行精确匹配才算协议)。 */
export type OnlineGame = 'blackjack' | 'oldmaid' | 'holdem';
export const ONLINE_GAMES: readonly OnlineGame[] = ['blackjack', 'oldmaid', 'holdem'];
export const ONLINE_PREFIX = '@casino';

export type OnlineAction = 'invite' | 'accept' | 'decline';
export interface OnlineMessage {
  action: OnlineAction;
  /** invite/accept/decline 携带的游戏名;decline 可省略。 */
  game: OnlineGame | null;
}

/** 解析 @casino 协议消息;非协议消息或格式不合法返回 null(调用方按普通聊天处理)。 */
export function parseOnlineMessage(text: string): OnlineMessage | null {
  const line = String(text ?? '').trim();
  if (!line.startsWith(ONLINE_PREFIX)) return null;
  const tokens = line.slice(ONLINE_PREFIX.length).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const action = tokens[0]!.toLowerCase() as OnlineAction;
  if (action !== 'invite' && action !== 'accept' && action !== 'decline') return null;
  let game: OnlineGame | null = null;
  if (tokens[1]) {
    const candidate = tokens[1]!.toLowerCase() as OnlineGame;
    if (!ONLINE_GAMES.includes(candidate)) return null;
    game = candidate;
  }
  return { action, game };
}

/** 组装协议消息。 */
export function composeOnlineMessage(action: OnlineAction, game?: OnlineGame | null): string {
  return game ? `${ONLINE_PREFIX} ${action} ${game}` : `${ONLINE_PREFIX} ${action}`;
}

/** 邀约记录(内存态,重启即失效——联机会话本就不该跨重启保留)。 */
export interface OnlineInvite {
  direction: 'in' | 'out';
  peer: string;
  game: OnlineGame;
  at: string;
  status: 'pending' | 'accepted' | 'declined';
}
