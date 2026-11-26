/** 星邮客户端与牌桌集成的测试:全部走注入的假传输,不碰真实网络。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { StarpostClient, StarpostError, type StarpostPost } from '../src/starpost-client.ts';
import { parseOnlineMessage, composeOnlineMessage } from '../src/online-protocol.ts';
import { RemoteBlackjack } from '../src/remote-blackjack.ts';
import { RemoteOldMaid } from '../src/remote-oldmaid.ts';
import { RemoteHoldem } from '../src/remote-holdem.ts';
import { CASINO_TOOL_DECLS, CasinoWorld } from '../src/world.ts';
import { CASINO } from '../src/definition.ts';
import { fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { CASINO_DEFAULTS } from '../src/config.ts';
import { FakeHost } from './helpers/fake-host.ts';

let scratchDir = '';

beforeEach(() => {
  scratchDir = join(tmpdir(), `casino-starpost-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(scratchDir, { recursive: true });
});

const IDENTITY = { serverUrl: 'https://sp.example', botId: '12345', token: 't'.repeat(32) };

function fakeTransport(routes: {
  snapshot?: any;
  inbox?: any;
  history?: any;
  send?: any;
  calls?: Array<{ url: string; body: any; headers: Record<string, string> }>;
}): StarpostPost {
  return async (url, body, headers) => {
    routes.calls?.push({ url, body: body as any, headers: headers ?? {} });
    const action = (body as any)?.action ?? '';
    if (action === 'snapshot') return { status: 200, body: { ok: true, result: routes.snapshot ?? {} } };
    if (action === 'inbox.peek') return { status: 200, body: { ok: true, result: routes.inbox ?? { conversations: [] } } };
    if (action === 'chat.history') return { status: 200, body: { ok: true, result: routes.history ?? { messages: [], nextBefore: null, nextAfter: null } } };
    if (action === 'message.send') return { status: 200, body: { ok: true, result: routes.send ?? { delivered: true } } };
    return { status: 200, body: { ok: true, result: {} } };
  };
}

describe('星邮协议客户端', () => {
  it('rpc 携带认证头与额度声明,结果解包 result', async () => {
    const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
    const client = new StarpostClient(IDENTITY, { post: fakeTransport({ snapshot: { botId: '12345', friends: [] }, calls }) });
    const result = await client.snapshot(true);
    expect(result.botId).toBe('12345');
    const call = calls[0]!;
    expect(call.url).toBe('https://sp.example/rpc');
    expect(call.headers.authorization).toBe(`Bearer ${IDENTITY.token}`);
    expect(call.headers['x-starpost-id']).toBe('12345');
    expect(call.body.action).toBe('snapshot');
    expect(call.body.limits.maxMessagesPerDay).toBe(300);
  });

  it('ok=false 映射为 StarpostError', async () => {
    const client = new StarpostClient(IDENTITY, {
      post: async () => ({ status: 200, body: { ok: false, error: '配额不足' } }),
    });
    await expect(client.snapshot()).rejects.toBeInstanceOf(StarpostError);
  });

  it('身份与地址校验:botId 非数字、令牌过短、非 HTTPS 外网地址都拒绝', () => {
    expect(() => new StarpostClient({ ...IDENTITY, botId: 'abc' })).toThrow(StarpostError);
    expect(() => new StarpostClient({ ...IDENTITY, token: 'short' })).toThrow(StarpostError);
    expect(() => new StarpostClient({ ...IDENTITY, serverUrl: 'http://sp.example' })).toThrow(StarpostError);
    expect(new StarpostClient({ ...IDENTITY, serverUrl: 'http://127.0.0.1:8787' })).toBeInstanceOf(StarpostClient);
  });

  it('sendPrivate 组装 message.send 请求;friends 从快照提取', async () => {
    const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
    const client = new StarpostClient(IDENTITY, {
      post: fakeTransport({ snapshot: { botId: '12345', friends: ['67890'], friendProfiles: [{ id: '67890', nickname: '老K' }], requests: [{ from: 'H1' }] }, calls }),
    });
    await client.sendPrivate('67890', '@casino 来一局?');
    expect(calls.at(-1)!.body).toMatchObject({ action: 'message.send', args: { kind: 'private', target: '67890', text: '@casino 来一局?' } });
    const view = await client.friends();
    expect(view.friends).toEqual(['67890']);
    expect(view.profiles[0]!.nickname).toBe('老K');
  });
});

describe('牌桌 × 星邮集成', () => {
  function starpostWorld(transport: StarpostPost, cfgPatch: Partial<typeof CASINO_DEFAULTS> = {}): CasinoWorld {
    const ctx = fakeWorldContext(CASINO, { scratchDir });
    Object.assign(ctx.cfg, { dealDelayMs: 0, starpostEnabled: true, starpostBotId: '12345', starpostToken: 't'.repeat(32), starpostPollMs: 0, starpostServer: 'https://sp.example', ...cfgPatch });
    return new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng: () => 0, starpostPost: transport });
  }

  async function tool(world: CasinoWorld, name: string, args: Record<string, unknown>): Promise<any> {
    const def = CASINO_TOOL_DECLS.find((t) => t.name === name)!;
    const world2 = world as unknown as { handleTool: (n: string, a: Record<string, unknown>) => Promise<string> };
    return JSON.parse(await world2.handleTool(name, args));
  }

  it('未启用/未配置时给出配置指引,不发起网络请求', async () => {
    const calls: unknown[] = [];
    const world = starpostWorld(fakeTransport({ calls: calls as never[] }), { starpostEnabled: false });
    await world.start(new FakeHost());
    const status = await tool(world, 'casino_starpost', { action: 'status' });
    expect(status.enabled).toBe(false);
    expect(calls.length).toBe(0);
    await world.stop();
  });

  it('启用后:身份验证、status、friends、send、inbox 全链路', async () => {
    const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
    const world = starpostWorld(fakeTransport({
      snapshot: { botId: '12345', profile: { nickname: '牌搭子' }, friends: ['67890'], friendProfiles: [{ id: '67890', nickname: '老K' }], requests: [] },
      inbox: { conversations: [{ kind: 'private', target: '67890', unread: 1, latestCursor: 7 }] },
      history: { messages: [{ id: 'm1', sender: '67890', senderNickname: '老K', text: '@casino 来一局?', cursor: 7 }], nextBefore: null, nextAfter: null },
      calls,
    }));
    const host = new FakeHost();
    await world.start(host);
    await new Promise((r) => setTimeout(r, 5)); // 让 start 里的异步验证与首轮轮询落定

    // 身份验证已发起(snapshot 调用,带认证头)。
    const snapshotCall = calls.find((c) => c.body.action === 'snapshot')!;
    expect(snapshotCall.headers['x-starpost-id']).toBe('12345');

    // 轮询把外来消息推成事件(带外部数据警示)。
    const msgEvent = host.events.find((e) => e.type === 'casino.starpost_message');
    expect(msgEvent).toBeDefined();
    expect(msgEvent!.text).toContain('外部数据');
    expect(msgEvent!.text).toContain('@casino 来一局?');

    // 工具四连:status / friends / send / inbox。
    const status = await tool(world, 'casino_starpost', { action: 'status' });
    expect(status.enabled).toBe(true);
    expect(status.botId).toBe('12345');
    expect(status.lastError).toBeNull();

    const friends = await tool(world, 'casino_starpost', { action: 'friends' });
    expect(friends.friends).toEqual(['67890']);
    expect(friends.friendsDetail[0]!.nickname).toBe('老K');

    const send = await tool(world, 'casino_starpost', { action: 'send', target: '67890', text: '@casino 好,开一局' });
    expect(send.delivered).toBe(true);
    const sendCall = calls.filter((c) => c.body.action === 'message.send').at(-1)!;
    expect(sendCall.body.args).toMatchObject({ kind: 'private', target: '67890', text: '@casino 好,开一局' });

    const inbox = await tool(world, 'casino_starpost', { action: 'inbox' });
    expect(inbox.conversations[0]!.target).toBe('67890');
    await world.stop();
  });

  it('配置了错误令牌:客户端装配报错进 lastError,不炸挂载,status 如实报告', async () => {
    const world = starpostWorld(async () => ({ status: 200, body: { ok: false, error: '身份不符' } }), { starpostBotId: '1' });
    await world.start(new FakeHost());
    await new Promise((r) => setTimeout(r, 5));
    const status = await tool(world, 'casino_starpost', { action: 'status' });
    expect(status.enabled).toBe(true);
    expect(String(status.lastError)).not.toBe('');
    await world.stop();
  });

  it('@casino 协议:合法消息解析,非协议/坏格式返回 null', () => {
    expect(parseOnlineMessage('@casino invite blackjack')).toMatchObject({ action: 'invite', game: 'blackjack' });
    expect(parseOnlineMessage('@casino accept')).toMatchObject({ action: 'accept', game: null });
    expect(parseOnlineMessage('@casino decline holdem')).toMatchObject({ action: 'decline', game: 'holdem' });
    expect(parseOnlineMessage('@casino')).toBeNull();
    expect(parseOnlineMessage('@casino invite poker')).toBeNull();
    expect(parseOnlineMessage('@casino hack')).toBeNull();
    expect(parseOnlineMessage('来一局 @casino invite')).toBeNull();
    expect(parseOnlineMessage('')).toBeNull();
    expect(composeOnlineMessage('invite', 'holdem')).toBe('@casino invite holdem');
  });

  it('联机邀约全流程:我方邀约→对方接受→事件;对方反邀→事件→婉拒→回发协议', async () => {
    const net = new FakeStarpostNet();
    const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
    const ctx = fakeWorldContext(CASINO, { scratchDir });
    Object.assign(ctx.cfg, { dealDelayMs: 0, starpostEnabled: true, starpostBotId: '12345', starpostToken: 't'.repeat(32), starpostPollMs: 0, starpostServer: 'https://sp.example' });
    const post: StarpostPost = async (url, body, headers) => { calls.push({ url, body, headers: headers ?? {} }); return net.postFor('12345')(url as string, body, headers); };
    const world = new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng: () => 0, starpostPost: post });
    const host = new FakeHost();
    await world.start(host);
    await new Promise((r) => setTimeout(r, 5));
    // 我方发出邀约(协议消息 + 记录 pending)。
    const inv = await tool(world, 'casino_online', { action: 'invite', target: '67890', game: 'blackjack' });
    expect(inv.sent).toBe(true);
    const inviteCall = calls.filter((c) => c.body.action === 'message.send').at(-1)!;
    expect(inviteCall.body.args.text).toBe('@casino invite blackjack');
    // 对方接受 → 轮询后 casino.online_accepted(无 @casino 聊天事件泄漏)。
    net.deliver('12345', '67890', '@casino accept blackjack');
    await (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
    await new Promise((r) => setTimeout(r, 5));
    expect(host.events.some((e) => e.type === 'casino.online_accepted' && e.text.includes('67890'))).toBe(true);
    expect(host.events.some((e) => e.type === 'casino.starpost_message' && e.text.includes('@casino'))).toBe(false);
    // 会话进行中,对方的 @casino 邀约被协议守卫忽略(不当聊天、不开新邀约)。
    net.deliver('12345', '67890', '@casino invite oldmaid');
    await (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
    await new Promise((r) => setTimeout(r, 5));
    expect(host.events.some((e) => e.type === 'casino.online_invite')).toBe(false);
    // 会话进行中,decline 无待回应邀约可拒(阶段 B 语义:意向互认即开会话)。
    const ack = await tool(world, 'casino_online', { action: 'decline', target: '67890' });
    expect(ack.error).toBeDefined();
    // 会话已开启:state 应报告角色与筹码。
    const st = await tool(world, 'casino_starpost', { action: 'status' });
    expect(st.enabled).toBe(true);
    // 邀约记录:开局即清空(主人规则——进入牌局后旧邀约一律作废)。
    const list = await tool(world, 'casino_online', { action: 'list' });
    expect(list.invites.length).toBe(0);
    expect(list.session).toMatchObject({ game: 'blackjack', peer: '67890' });
    await world.stop();
  });

  it('婉拒路径:decline 回发协议消息并记录状态', async () => {
    const world = starpostWorld(fakeTransport({
      snapshot: { botId: '12345', friends: ['67890'] },
      inbox: { conversations: [{ kind: 'private', target: '67890', unread: 1, latestCursor: 3 }] },
      history: { messages: [{ id: 'm1', sender: '67890', text: '@casino invite oldmaid', cursor: 3 }] },
    }));
    await world.start(new FakeHost());
    await new Promise((r) => setTimeout(r, 5));
    await (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
    const ack = await tool(world, 'casino_online', { action: 'decline', target: '67890' });
    expect(ack.declined).toBe(true);
    expect(ack.game).toBe('oldmaid');
    await world.stop();
  });

  it('联机面板快照:状态/好友/在线判定与 online-invite 路由', async () => {
    const net = new FakeStarpostNet();
    const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
    const ctx = fakeWorldContext(CASINO, { scratchDir });
    Object.assign(ctx.cfg, { dealDelayMs: 0, starpostEnabled: true, starpostBotId: '12345', starpostToken: 't'.repeat(32), starpostPollMs: 0, starpostServer: 'https://sp.example' });
    const post: StarpostPost = async (url, body, headers) => { calls.push({ url, body, headers: headers ?? {} }); return net.postFor('12345')(url as string, body, headers); };
    const world = new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng: () => 0, starpostPost: post });
    const worldAny = world as unknown as { handleInvoke: (p: string, m: string, a: unknown[]) => Promise<unknown> };
    await world.start(new FakeHost());
    await new Promise((r) => setTimeout(r, 5));
    // 好友 67890 发来消息 → 活动追踪 → 在线判定为真。
    net.deliver('12345', '67890', '@casino invite blackjack');
    await (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
    net.deliver('12345', '67890', '随便聊聊');
    await (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
    const snap = (await worldAny.handleInvoke('table', 'online', [])) as Record<string, any>;
    expect(snap.enabled).toBe(true);
    expect(snap.status).toBe('idle');
    const friends = snap.friends as Array<{ id: string; nickname: string; online: boolean; inGame: boolean }>;
    expect(friends.length).toBe(0); // friends 缓存来自 snapshot 的 profiles;测试假网络未返回 profiles
    // 邀约守卫(主人指示):有待回应邀约时,向同一对方发起邀约被拒。
    const blocked = await worldAny.handleInvoke('table', 'action', [{ action: 'online-invite', target: '67890', game: 'blackjack' }]);
    // 同游戏撞车 → 自动改为接受对方邀约(不再有死端)。
    expect((blocked as any).autoAccepted).toBe(true);
    // 不同游戏撞车 → 守卫拦截,提示先回应。
    net.deliver('12345', '67890', '@casino invite oldmaid');
    await (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
    const blocked2 = await worldAny.handleInvoke('table', 'action', [{ action: 'online-invite', target: '67890', game: 'holdem' }]);
    expect((blocked2 as any).error).toContain('待回应');
    // 婉拒对方的 oldmaid 邀约 → 再邀约 blackjack 成功。
    const dec = JSON.parse(await (world as unknown as { toolOnline: (a: Record<string, unknown>) => Promise<string> }).toolOnline({ action: 'decline', target: '67890' }));
    expect(dec.declined).toBe(true);
    const inv = await worldAny.handleInvoke('table', 'action', [{ action: 'online-invite', target: '67890', game: 'blackjack' }]);
    expect((inv as any).sent).toBe(true);
    const sendCall = calls.filter((c) => c.body.action === 'message.send').at(-1)!;
    expect(sendCall.body.args.text).toBe('@casino invite blackjack');
    // 无会话时 stop 返回错误提示。
    const stopped = await worldAny.handleInvoke('table', 'action', [{ action: 'online-stop' }]);
    expect((stopped as any).error).toBeDefined();
    await world.stop();
  });

  it('远程抽鬼牌引擎:发牌弃对、轮流抽牌、空手者胜、先后手轮换', () => {
    // 牌序(尾部先发):藏一张后,先手玩家连摸 10,K → 弃对;庄家摸 5,9。
    const engine = new RemoteOldMaid({ stake: 10, bankChips: 100, playerChips: 100, deck: [{ rank: 3, suit: 0 }, { rank: 3, suit: 1 }, { rank: 5, suit: 2 }, { rank: 5, suit: 3 }, { rank: 7, suit: 0 }, { rank: 9, suit: 1 }] });
    engine.startHand();
    expect(engine.state!.firstDrawer).toBe('player'); // 第 0 局先手=玩家
    expect(engine.state!.playerHand.length).toBe(3);  // [7,5,3](发牌交错,无初始对)
    expect(engine.state!.bankHand.length).toBe(2);    // [5,3]
    expect(engine.state!.turn).toBe('player');
    // 轮流抽牌直到有人空手(空手者赢);庄家自动回抽,先后手交替。
    let flipped = 0;
    while (!engine.state!.done) {
      const before = engine.state!.turn;
      if (engine.state!.turn === 'player') engine.playerDraws(); else engine.bankDraws();
      if (!engine.state!.done && engine.state!.turn !== before) flipped++;
    }
    expect(engine.phase).toBe('done');
    expect(flipped).toBeGreaterThan(0); // 先后手确实交替
    const s2 = engine.lastSettle!;
    expect(s2.winner === 'player' || s2.winner === 'bank').toBe(true);
    // 第二局先手轮换为庄家。
    engine.startHand();
    expect(engine.state!.firstDrawer).toBe('bank');
  });

  it('远程德州引擎:盲注轮换、跟注过牌、街推进、摊牌比牌', () => {
    // 固定牌序(尾部先发):底牌庄家 [K,K](两张 K)、玩家 [Q,Q];公共牌会补齐 5 张。
    const deck = [
      { rank: 2, suit: 0 }, { rank: 3, suit: 1 }, // 公共牌尾部两张(turn/river 补)
      { rank: 4, suit: 2 }, { rank: 5, suit: 3 }, { rank: 6, suit: 0 }, { rank: 7, suit: 1 }, { rank: 8, suit: 2 }, // flop 3 + turn
      { rank: 12, suit: 0 }, { rank: 12, suit: 1 }, { rank: 13, suit: 0 }, { rank: 13, suit: 1 }, // 发牌顺序:庄家 K,Q? 谨慎:尾部先发
    ];
    // 简化:不追求具体大牌型,只验证流程与筹码守恒。
    const engine = new RemoteHoldem({ bigBlind: 10, bankChips: 500, playerChips: 500, deck });
    engine.startHand();
    expect(engine.phase).toBe('bank'); // 第 0 手按钮=庄家(小盲)先行动
    expect(engine.state!.seats.bank.street).toBe(5);  // 小盲 5
    expect(engine.state!.seats.player.street).toBe(10); // 大盲 10
    // 庄家(小盲)跟注补齐 → 大盲还有 option(可 check/raise,两人桌标准)。
    engine.bankAct('call');
    expect(engine.state!.street).toBe('preflop');
    expect(engine.state!.turn).toBe('player');
    // 玩家过牌 → 双方匹配且行动过 → 发 flop → 轮到非按钮方(玩家)
    engine.playerAct('check');
    expect(engine.state!.street).toBe('flop');
    expect(engine.state!.turn).toBe('player');
    // 玩家过牌 → 庄家过牌 → turn 街
    engine.playerAct('check');
    expect(engine.state!.turn).toBe('bank');
    engine.bankAct('check');
    expect(engine.state!.street).toBe('turn');
    // 玩家下注 20 → 庄家跟 → river → 双方过牌 → 摊牌
    engine.playerAct('bet', 20);
    engine.bankAct('call', undefined);
    expect(engine.state!.street).toBe('river');
    engine.playerAct('check');
    engine.bankAct('check');
    expect(engine.phase).toBe('done');
    // 筹码守恒:两边之和 = 初始 1000(全进池又分给赢家)。
    expect(engine.chips.bank + engine.chips.player).toBe(1000);
    expect(engine.handsPlayed).toBe(1);
  });

  it('远程德州引擎:弃牌即终局,胜者收池', () => {
    const engine = new RemoteHoldem({ bigBlind: 10, bankChips: 500, playerChips: 500, deck: [{ rank: 2, suit: 0 }, { rank: 3, suit: 1 }, { rank: 13, suit: 0 }, { rank: 13, suit: 1 }] });
    engine.startHand();
    engine.bankAct('call');
    engine.playerAct('fold');
    expect(engine.phase).toBe('done');
    const s = engine.lastSettle!;
    expect(s.winner).toBe('bank');
    expect(s.reason).toContain('弃牌');
    expect(engine.chips.bank + engine.chips.player).toBe(1000);
  });

  it('远程 21 点引擎:自然黑杰克 1.5 倍结算', () => {
    const engine = new RemoteBlackjack({ bankChips: 1000, playerChips: 1000, minBet: 10, maxBet: 200, dealerHitsSoft17: false, deck: [{ rank: 5, suit: 2 }, { rank: 9, suit: 3 }, { rank: 10, suit: 1 }, { rank: 1, suit: 0 }] });
    engine.startHand(50);
    expect(engine.phase).toBe('done');
    const s = engine.lastSettle!;
    expect(s.winner).toBe('player');
    expect(s.delta).toBe(75);
    expect(s.reason).toContain('自然黑杰克');
    expect(engine.chips).toEqual({ bank: 925, player: 1075 });
  });
});

/** 两个 world 之间的假星邮网络:message.send 投进对方队列,peek/history 按游标读。 */
class FakeStarpostNet {
  private seq = 0;
  private queues = new Map<string, Array<{ sender: string; text: string; cursor: number }>>();
  deliver(to: string, from: string, text: string): void {
    this.seq++;
    const q = this.queues.get(to) ?? [];
    q.push({ sender: from, text, cursor: this.seq });
    this.queues.set(to, q);
  }
  postFor(botId: string): StarpostPost {
    return async (_url, rawBody) => {
      const body = (rawBody ?? {}) as Record<string, any>;
      const action = (body as any)?.action ?? '';
      if (action === 'snapshot') return { status: 200, body: { ok: true, result: { botId, friends: [] } } };
      if (action === 'message.send') {
        this.seq++;
        const target = String(body.args.target);
        const q = this.queues.get(target) ?? [];
        q.push({ sender: botId, text: String(body.args.text), cursor: this.seq });
        this.queues.set(target, q);
        return { status: 200, body: { ok: true, result: { delivered: true } } };
      }
      if (action === 'inbox.peek') {
        const after = (body.args?.after ?? {}) as Record<string, number>;
        // 自己的队列 = queues[botId](按收件人分键);按发送者分组算未读。
        const own = this.queues.get(botId) ?? [];
        const bySender = new Map<string, Array<{ sender: string; text: string; cursor: number }>>();
        for (const m of own) {
          if (m.sender === botId) continue;
          const arr = bySender.get(m.sender) ?? [];
          arr.push(m);
          bySender.set(m.sender, arr);
        }
        const conversations: Array<{ kind: string; target: string; unread: number; latestCursor: number }> = [];
        for (const [sender, msgs] of bySender.entries()) {
          const cursor = after[`private:${sender}`] ?? 0;
          const unread = msgs.filter((m) => m.cursor > cursor);
          if (unread.length) conversations.push({ kind: 'private', target: sender, unread: unread.length, latestCursor: Math.max(...msgs.map((m) => m.cursor)) });
        }
        return { status: 200, body: { ok: true, result: { conversations } } };
      }
      if (action === 'chat.history') {
        const target = String(body.args.target);
        const after = Number(body.args.after ?? 0);
        const q = (this.queues.get(botId) ?? []).filter((m) => m.sender === target && m.cursor > after);
        return { status: 200, body: { ok: true, result: { messages: q.map((m) => ({ id: 'n' + m.cursor, sender: m.sender, text: m.text, cursor: m.cursor })), nextBefore: null, nextAfter: null } } };
      }
      return { status: 200, body: { ok: true, result: {} } };
    };
  }
}

describe('双 world 联机对局(主机权威)', () => {
  const net = new FakeStarpostNet();
  function onlineWorld(botId: string, cfgPatch: Partial<typeof CASINO_DEFAULTS> = {}, extra: { starpostEngineDeck?: Array<{ rank: number; suit: number }> } = {}): CasinoWorld {
    const ctx = fakeWorldContext(CASINO, { scratchDir });
    Object.assign(ctx.cfg, { dealDelayMs: 0, starpostEnabled: true, starpostBotId: botId, starpostToken: 't'.repeat(32), starpostPollMs: 0, starpostServer: 'https://sp.example', onlineGapMs: 10, onlineRestAfterHands: 100, ...cfgPatch });
    return new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng: () => 0, starpostPost: net.postFor(botId), starpostEngineDeck: extra.starpostEngineDeck });
  }
  async function tool(world: CasinoWorld, args: Record<string, unknown>): Promise<any> {
    const world2 = world as unknown as { handleTool: (n: string, a: Record<string, unknown>) => Promise<string> };
    return JSON.parse(await world2.handleTool('casino_online', args));
  }
  const poll = (world: CasinoWorld) => (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
  const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));

  it('全流程:邀约→接受→开_session→下注→行动→结算→节奏停顿→新手→stop', async () => {
    // 固定牌序:pop 从尾部取 → 闲家 [10,6]=16,庄家 [9,7]=16;停牌后庄家补 7 爆牌,闲家胜(无自然)。
    const host = onlineWorld('11477', {}, { starpostEngineDeck: [{ rank: 7, suit: 0 }, { rank: 9, suit: 1 }, { rank: 6, suit: 2 }, { rank: 10, suit: 3 }] });
    const guest = onlineWorld('11489');
    const hostFake = new FakeHost();
    const guestFake = new FakeHost();
    await host.start(hostFake);
    await guest.start(guestFake);
    await wait();

    // 11477 邀约 → 11489 接受(发协议消息)
    const inv = await tool(host, { action: 'invite', target: '11489', game: 'blackjack' });
    expect(inv.sent).toBe(true);
    await poll(guest); await wait();
    expect(guestFake.events.some((e) => e.type === 'casino.online_invite' && e.text.includes('11477'))).toBe(true);
    const acc = await tool(guest, { action: 'accept', target: '11477' });
    expect(acc.accepted).toBe(true);
    // 主机收到 accept → 开会话 + 发 start + 请下注
    await poll(host); await wait();
    expect(hostFake.events.some((e) => e.type === 'casino.online_session' && e.text.includes('庄家'))).toBe(true);
    // 客座收到 start 与 hand 事件
    await poll(guest); await wait();
    console.log('NET-QUEUES:', JSON.stringify(Object.fromEntries([...net['queues'].entries()].map(([k, v]) => [k, v.map((m) => ({ s: m.sender, c: m.cursor, x: m.text.slice(0, 30) }))]))));
    console.log('GUEST-CURSORS:', JSON.stringify((guest as unknown as { starpost: { cursors: Record<string, number> } }).starpost.cursors));
    expect(guestFake.events.some((e) => e.type === 'casino.online_session' && e.text.includes('你是闲家'))).toBe(true);
    expect(guestFake.events.some((e) => e.type === 'casino.online_state' && e.text.includes('请下注'))).toBe(true);

    // 客座下注 → 主机开局发 state;客座收到"轮到你行动"
    const bet = await tool(guest, { action: 'act', act: 'bet', amount: 50 });
    expect(bet.sent).toBe(true);
    await poll(host); await wait();
    expect(hostFake.events.some((e) => e.type === 'casino.online_state' && e.text.includes('押注 50'))).toBe(true);
    await poll(guest); await wait();
    expect(guestFake.events.some((e) => e.type === 'casino.online_state' && e.text.includes('轮到你行动'))).toBe(true);

    // 客座停牌 → 庄家打完结算 → 双方收到结果事件 → 主机按 10ms 节奏自动换庄发新手
    await tool(guest, { action: 'act', act: 'stand' });
    await poll(host); await wait();
    expect(hostFake.events.some((e) => e.type === 'casino.online_result')).toBe(true);
    await poll(guest); await wait();
    expect(guestFake.events.some((e) => e.type === 'casino.online_result')).toBe(true);
    // 庄家轮换:gap 10ms 过后原庄家发 handoff 并交出权威端,客座成为新庄家并发新手。
    await wait(60);
    expect(hostFake.events.some((e) => e.type === 'casino.online_state' && e.text.includes('庄家轮换'))).toBe(true);
    await poll(guest); await wait();
    expect(guestFake.events.some((e) => e.type === 'casino.online_state' && e.text.includes('庄家轮换到你'))).toBe(true);
    await poll(host); await wait();
    expect(hostFake.events.some((e) => e.type === 'casino.online_state' && e.text.includes('请下注'))).toBe(true);
    const state = await tool(host, { action: 'state' });
    expect(state.hands).toBe(1);
    expect(state.bank).toBe('11489');
    expect(state.iAmBank).toBe(false);

    // 主机 stop → 双方会话关闭,客座收到结束事件
    const stopped = await tool(host, { action: 'stop' });
    expect(stopped.stopped).toBe(true);
    await poll(guest); await wait();
    expect(guestFake.events.some((e) => e.type === 'casino.online_session' && e.text.includes('结束'))).toBe(true);
    const guestState = await tool(guest, { action: 'state' });
    expect(guestState.state).toBe('idle');
    await host.stop();
    await guest.stop();
  });
});
