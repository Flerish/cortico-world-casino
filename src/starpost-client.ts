/** 月下牌桌的星邮客户端:轻量协议层,只做联机对局需要的部分(身份、好友、私信)。 */
export interface StarpostIdentity {
  serverUrl: string;
  botId: string;
  token: string;
}

export type StarpostPost = (
  url: string,
  body: unknown,
  headers?: Record<string, string>,
  timeoutMs?: number,
) => Promise<{ status: number; body: any }>;

/** 与星邮扩展一致的默认额度声明(服务器按此校限)。 */
export const STARPOST_LIMITS = {
  private: 10,
  groups: 5,
  // 联机牌局的协议消息(state/act 每手 15-30 条)全部计入配额:
  // 旧值(300/天,时段 60)会让一局德州打到一半就被静默——大幅上调。
  maxMessagesPerDay: 2000,
  maxWerewolfGamesPerDay: 0,
  periods: { morning: 800, afternoon: 800, evening: 800, sleep: 200 },
} as const;

export class StarpostError extends Error {}

/** 默认传输:fetch + 超时;测试可注入 post 替身。 */
export const defaultStarpostPost: StarpostPost = async (url, body, headers, timeoutMs) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs ?? 15000),
  });
  let parsed: any = null;
  try { parsed = await response.json(); } catch { parsed = null; }
  return { status: response.status, body: parsed };
};

export interface StarpostMessage {
  id: string;
  sender: string;
  senderNickname?: string;
  text?: string;
  at?: string;
  cursor?: number;
  [key: string]: unknown;
}

export interface StarpostConversation {
  kind: 'private' | 'group';
  target: string;
  unread: number;
  latestCursor: number;
  name?: string;
}

export interface StarpostFriendView {
  friends: string[];
  profiles: Array<{ id: string; nickname?: string; [key: string]: unknown }>;
  requests: unknown[];
  profile: Record<string, unknown>;
  botId: string;
}

/** 校验服务地址:HTTPS(本机回环可用 HTTP),与星邮扩展同规则。 */
export function starpostBase(serverUrl: string): string {
  let url: URL;
  try { url = new URL(serverUrl); } catch { throw new StarpostError('星邮服务地址不是合法 URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new StarpostError('星邮服务地址须使用 HTTPS(本机回环地址可用 HTTP)');
  }
  if (url.username || url.password || url.search || url.hash) throw new StarpostError('星邮服务地址不应携带用户名/查询串');
  return url.origin;
}

export class StarpostClient {
  readonly botId: string;
  private readonly token: string;
  private readonly server: string;
  private readonly post: StarpostPost;
  private readonly timeoutMs: number;

  constructor(identity: StarpostIdentity, options: { post?: StarpostPost; timeoutMs?: number } = {}) {
    const botId = String(identity.botId ?? '').trim();
    const token = String(identity.token ?? '').trim();
    if (!/^\d{5,12}$/.test(botId)) throw new StarpostError('星邮 botId 须为 5–12 位数字');
    if (token.length < 24 || token.length > 128) throw new StarpostError('星邮令牌长度不合法(24–128 字符)');
    this.botId = botId;
    this.token = token;
    this.server = starpostBase(identity.serverUrl);
    this.post = options.post ?? defaultStarpostPost;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'x-starpost-id': this.botId };
  }

  /** 单次 RPC:POST {server}/rpc。ok=false 抛 StarpostError。 */
  async rpc(action: string, args: Record<string, unknown> = {}): Promise<any> {
    const { status, body } = await this.post(`${this.server}/rpc`, { action, args, limits: STARPOST_LIMITS }, this.headers(), this.timeoutMs);
    if (!body?.ok) throw new StarpostError(body?.error ?? `星邮服务返回 HTTP ${status}`);
    return body.result;
  }

  /** 全量状态(omitMessages=true 时不含消息正文,流量友好)。 */
  async snapshot(omitMessages = false): Promise<any> {
    return this.rpc('snapshot', { omitMessages });
  }

  /** 好友与资料概览。 */
  async friends(): Promise<StarpostFriendView> {
    const snap = await this.snapshot(true);
    return {
      botId: snap.botId,
      profile: snap.profile ?? {},
      friends: Array.isArray(snap.friends) ? snap.friends : [],
      profiles: Array.isArray(snap.friendProfiles) ? snap.friendProfiles.map((p: Record<string, unknown>) => ({ ...p, id: String(p.botId ?? p.id ?? p.humanId ?? '') })) : [],
      requests: Array.isArray(snap.requests) ? snap.requests : [],
    };
  }

  /** 发私聊消息;服务器校验好友关系与配额。 */
  async sendPrivate(target: string, text: string): Promise<any> {
    if (!/^\d{5,12}$|^H\d+$/.test(String(target))) throw new StarpostError('目标 ID 须为 bot 数字 ID 或人类 H 账号');
    return this.rpc('message.send', { kind: 'private', target: String(target), text: String(text) });
  }

  /** 收件箱增量:各会话未读数(带游标,配合 chat.history 做轻量轮询)。 */
  async inboxPeek(after: Record<string, number> = {}): Promise<{ conversations: StarpostConversation[]; gameBusy?: boolean }> {
    return this.rpc('inbox.peek', { after });
  }

  /** 会话历史:after/before 游标分页。 */
  async history(kind: 'private' | 'group', target: string, options: { after?: number | null; before?: number | null; limit?: number } = {}): Promise<{
    messages: StarpostMessage[];
    nextBefore: number | null;
    nextAfter: number | null;
  }> {
    return this.rpc('chat.history', {
      kind,
      target: String(target),
      after: options.after ?? null,
      before: options.before ?? null,
      limit: Math.min(Math.max(options.limit ?? 15, 1), 50),
    });
  }
}
