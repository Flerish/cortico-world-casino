/** 星邮客户端与牌桌集成的测试:全部走注入的假传输,不碰真实网络。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { StarpostClient, StarpostError, type StarpostPost } from '../src/starpost-client.ts';
import { parseOnlineMessage, composeOnlineMessage } from '../src/online-protocol.ts';
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
    expect(parseOnlineMessage('@casino invite blackjack')).toEqual({ action: 'invite', game: 'blackjack' });
    expect(parseOnlineMessage('@casino accept')).toEqual({ action: 'accept', game: null });
    expect(parseOnlineMessage('@casino decline holdem')).toEqual({ action: 'decline', game: 'holdem' });
    expect(parseOnlineMessage('@casino')).toBeNull();
    expect(parseOnlineMessage('@casino invite poker')).toBeNull();
    expect(parseOnlineMessage('@casino hack')).toBeNull();
    expect(parseOnlineMessage('来一局 @casino invite')).toBeNull();
    expect(parseOnlineMessage('')).toBeNull();
    expect(composeOnlineMessage('invite', 'holdem')).toBe('@casino invite holdem');
  });

  it('联机邀约全流程:我方邀约→对方接受→事件;对方反邀→事件→婉拒→回发协议', async () => {
    const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
    // 收件箱按轮次变化:第一轮对方接受我们的邀约,第二轮对方反邀 oldmaid。
    let pollTurn = 0;
    const transport: StarpostPost = async (url, body, headers) => {
      const action = (body as any)?.action ?? '';
      calls.push({ url, body, headers: headers ?? {} });
      if (action === 'snapshot') return { status: 200, body: { ok: true, result: { botId: '12345', friends: ['67890'] } } };
      if (action === 'inbox.peek') {
        pollTurn++;
        // 第 1 轮是 start() 的自动轮询(返回空);第 2 轮对方接受,第 3 轮对方反邀。
        const conversations = pollTurn === 2
          ? [{ kind: 'private', target: '67890', unread: 1, latestCursor: 5 }]
          : pollTurn === 3
            ? [{ kind: 'private', target: '67890', unread: 1, latestCursor: 9 }]
            : [];
        return { status: 200, body: { ok: true, result: { conversations } } };
      }
      if (action === 'chat.history') {
        const after = (body as any)?.args?.after ?? 0;
        return { status: 200, body: { ok: true, result: after === 0
          ? { messages: [{ id: 'm1', sender: '67890', text: '@casino accept blackjack', cursor: 5 }], nextBefore: null, nextAfter: null }
          : { messages: [{ id: 'm2', sender: '67890', text: '@casino invite oldmaid', cursor: 9 }], nextBefore: null, nextAfter: null } } };
      }
      if (action === 'message.send') return { status: 200, body: { ok: true, result: { delivered: true } } };
      return { status: 200, body: { ok: true, result: {} } };
    };
    const world = starpostWorld(transport);
    const host = new FakeHost();
    await world.start(host);
    await new Promise((r) => setTimeout(r, 5));
    // 我方发出邀约(协议消息 + 记录 pending)。
    const inv = await tool(world, 'casino_online', { action: 'invite', target: '67890', game: 'blackjack' });
    expect(inv.sent).toBe(true);
    const inviteCall = calls.filter((c) => c.body.action === 'message.send').at(-1)!;
    expect(inviteCall.body.args.text).toBe('@casino invite blackjack');
    // 第一轮轮询:对方接受 → casino.online_accepted 事件(无 @casino 聊天事件泄漏)。
    await (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
    await new Promise((r) => setTimeout(r, 5));
    expect(host.events.some((e) => e.type === 'casino.online_accepted' && e.text.includes('67890'))).toBe(true);
    expect(host.events.some((e) => e.type === 'casino.starpost_message' && e.text.includes('@casino'))).toBe(false);
    // 第二轮轮询:对方反邀 oldmaid → casino.online_invite 事件。
    await (world as unknown as { starpostPoll: () => Promise<void> }).starpostPoll();
    await new Promise((r) => setTimeout(r, 5));
    expect(host.events.some((e) => e.type === 'casino.online_invite' && e.text.includes('oldmaid'))).toBe(true);
    // 婉拒:回发 @casino decline oldmaid。
    const ack = await tool(world, 'casino_online', { action: 'decline', target: '67890' });
    expect(ack.declined).toBe(true);
    expect(ack.game).toBe('oldmaid');
    const declineCall = calls.filter((c) => c.body.action === 'message.send').at(-1)!;
    expect(declineCall.body.args.text).toBe('@casino decline oldmaid');
    // 邀约记录可查。
    const list = await tool(world, 'casino_online', { action: 'list' });
    expect(list.invites.length).toBeGreaterThanOrEqual(2);
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
});
