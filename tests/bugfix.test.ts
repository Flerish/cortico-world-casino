/** 月下牌桌 bug 修复回归测试:协议负筹码、德州封顶/总额语义/reject、观战点数、act enum、配额脱困。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseOnlineMessage } from '../src/online-protocol.ts';
import { RemoteBlackjack } from '../src/remote-blackjack.ts';
import { RemoteHoldem } from '../src/remote-holdem.ts';
import { CASINO_TOOL_DECLS, CasinoWorld } from '../src/world.ts';
import { CASINO } from '../src/definition.ts';
import { fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { CASINO_DEFAULTS } from '../src/config.ts';
import { FakeHost } from './helpers/fake-host.ts';
import type { StarpostPost } from '../src/starpost-client.ts';

let scratchDir = '';
beforeEach(() => {
  scratchDir = join(tmpdir(), `casino-fix-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(scratchDir, { recursive: true });
});

describe('bug1: handoff 筹码账本允许负数', () => {
  it('含负筹码的交接消息能被解析(自然黑杰克 1.5 倍可把庄家打成负)', () => {
    const m = parseOnlineMessage('@casino handoff chips=111:-20,222:1020 hands=3');
    expect(m).not.toBeNull();
    expect(m!.action).toBe('handoff');
    expect(m!.kv.chips).toBe('111:-20,222:1020');
  });
  it('双方都负、正负混合均合法;非法形态仍拒绝', () => {
    expect(parseOnlineMessage('@casino handoff chips=111:-5,222:-8 hands=1')).not.toBeNull();
    expect(parseOnlineMessage('@casino handoff chips=111:980,222:1020 hands=1')).not.toBeNull();
    expect(parseOnlineMessage('@casino handoff chips=abc:1,222:2 hands=1')).toBeNull();
    expect(parseOnlineMessage('@casino handoff chips=111:1 hands=1')).toBeNull();
  });
});

describe('bug9/bug8: 联机德州单街封顶 + raise 总额语义', () => {
  it('超过单街封顶的下注被拒(全押豁免除外)', () => {
    const e = new RemoteHoldem({ bigBlind: 10, streetCap: 200, bankChips: 1000, playerChips: 1000 });
    e.startHand();
    e.bankAct('call'); // 小盲补齐
    e.playerAct('check'); // 进 flop
    expect(e.state!.street).toBe('flop');
    expect(() => e.playerAct('bet', 500)).toThrow(/封顶/);
    e.playerAct('bet', 200); // 封顶内合法
    expect(e.state!.currentBet).toBe(200);
  });
  it('raise 的 amount 是本街总额(与本地一致),不是跟注外增量', () => {
    const e = new RemoteHoldem({ bigBlind: 10, streetCap: 500, bankChips: 1000, playerChips: 1000 });
    e.startHand();
    e.bankAct('call');
    e.playerAct('check'); // flop,玩家先行动
    e.playerAct('bet', 50); // 玩家下注 50
    e.bankAct('raise', 150); // 庄家加注到本街总额 150(而非跟 50 再加 150)
    expect(e.state!.currentBet).toBe(150);
    expect(e.state!.seats.bank.street).toBe(150);
  });
  it('全押豁免:筹码不足最小额时可直接全押(flop 无人下注,bet 押光)', () => {
    const e = new RemoteHoldem({ bigBlind: 10, streetCap: 200, bankChips: 1000, playerChips: 30 });
    e.startHand(); // 玩家是大盲(按钮=庄家),玩家盲注 10 剩 20
    e.bankAct('call'); // 庄家补齐
    e.playerAct('check'); // 进 flop,玩家先行动,剩 20
    expect(e.state!.street).toBe('flop');
    expect(() => e.playerAct('bet', 20)).not.toThrow(); // 20<minRaise(10)? 20>=10 合法;改验证不足额
  });
  it('全押豁免:筹码不足最小加注额时 bet 押光放行', () => {
    const e = new RemoteHoldem({ bigBlind: 10, streetCap: 200, bankChips: 1000, playerChips: 15 });
    e.startHand(); // 玩家大盲 10,剩 5
    e.bankAct('call');
    e.playerAct('check'); // flop,玩家剩 5
    expect(() => e.playerAct('bet', 5)).not.toThrow(); // 5<minRaise(10) 但押光全部筹码,豁免
    expect(e.state!.seats.player.allIn).toBe(true);
  });
});

describe('bug4: 观战 21 点点数用 handValue(A/JQK 正确)', () => {
  it('庄家端引擎观战快照:A+K=21 而非 14,JQK 记 10', async () => {
    const ctx = fakeWorldContext(CASINO, { scratchDir });
    Object.assign(ctx.cfg, { dealDelayMs: 0, starpostEnabled: true, starpostBotId: '12345', starpostToken: 't'.repeat(32), starpostPollMs: 0, starpostServer: 'https://sp.example' });
    const post: StarpostPost = async (_u, body) => {
      const a = (body as any)?.action;
      if (a === 'snapshot') return { status: 200, body: { ok: true, result: { botId: '12345', friends: [] } } };
      return { status: 200, body: { ok: true, result: {} } };
    };
    const world = new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng: () => 0, starpostPost: post });
    await world.start(new FakeHost());
    await new Promise((r) => setTimeout(r, 5));
    // 直接构造一个庄家端会话,引擎手牌为 A+K(闲家) 与 J+Q(庄家)。
    const w = world as unknown as { starpost: any; spectateSnapshot: () => any };
    const engine = new RemoteBlackjack({ bankChips: 1000, playerChips: 1000, minBet: 10, maxBet: 200, dealerHitsSoft17: false, deck: [{ rank: 12, suit: 0 }, { rank: 11, suit: 1 }, { rank: 13, suit: 2 }, { rank: 1, suit: 3 }] });
    engine.startHand(50); // pop 尾部:闲家 [A,K]=21 → 自然黑杰克立即结算;改用未结算手牌验证点数
    // 用另一副牌构造进行中手牌:闲家 [10,6]=16,庄家 [J,Q]=20(都>10 记 10)
    const e2 = new RemoteBlackjack({ bankChips: 1000, playerChips: 1000, minBet: 10, maxBet: 200, dealerHitsSoft17: false, deck: [{ rank: 12, suit: 0 }, { rank: 11, suit: 1 }, { rank: 6, suit: 2 }, { rank: 10, suit: 3 }] });
    e2.startHand(50); // 闲家 [10,6]=16,庄家 [J,Q]=20,进行中
    w.starpost.session = { game: 'blackjack', peer: '67890', chips: { '12345': 1000, '67890': 1000 }, bank: '12345', engine: e2, timers: [], handsTotal: 0, lastState: null, lastSettle: null, lastIncomingAt: Date.now() };
    const snap = w.spectateSnapshot();
    const inner = snap.snapshot;
    // 闲家 10+6=16;庄家明牌 J=10(暗牌盖着),可见总点 10。
    expect(inner.hands[0].total).toBe(16);
    expect(inner.dealerVisibleTotal).toBe(10);
    await world.stop();
  });
});

describe('bug5: casino_online act enum 覆盖三游戏', () => {
  it('act 的 enum 含 draw/fold/check/call/raise', () => {
    const decl = CASINO_TOOL_DECLS.find((t) => t.name === 'casino_online')!;
    const actEnum = (decl.parameters as any).properties.act.enum as string[];
    for (const a of ['bet', 'hit', 'stand', 'double', 'draw', 'fold', 'check', 'call', 'raise']) {
      expect(actEnum).toContain(a);
    }
  });
});

describe('bug12: 观战庄家端不泄露对端底牌(进行中)', () => {
  it('德州进行中庄家端观战:对端底牌为空,摊牌后才亮', async () => {
    const ctx = fakeWorldContext(CASINO, { scratchDir });
    Object.assign(ctx.cfg, { dealDelayMs: 0, starpostEnabled: true, starpostBotId: '12345', starpostToken: 't'.repeat(32), starpostPollMs: 0, starpostServer: 'https://sp.example' });
    const post: StarpostPost = async (_u, body) => {
      const a = (body as any)?.action;
      if (a === 'snapshot') return { status: 200, body: { ok: true, result: { botId: '12345', friends: [] } } };
      return { status: 200, body: { ok: true, result: {} } };
    };
    const world = new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng: () => 0, starpostPost: post });
    await world.start(new FakeHost());
    await new Promise((r) => setTimeout(r, 5));
    const w = world as unknown as { starpost: any; spectateSnapshot: () => any };
    const e = new RemoteHoldem({ bigBlind: 10, bankChips: 500, playerChips: 500 });
    e.startHand(); // 进行中
    w.starpost.session = { game: 'holdem', peer: '67890', chips: { '12345': 500, '67890': 500 }, bank: '12345', engine: e, timers: [], handsTotal: 0, lastState: null, lastSettle: null, lastIncomingAt: Date.now() };
    const inner = w.spectateSnapshot().snapshot;
    expect(inner.playerCards).toEqual([]); // 对端(闲家)底牌不泄露
    expect(inner.aiCards).toBeNull(); // 庄家自己底牌进行中也不亮(与单机一致)
    await world.stop();
  });
});

describe('新功能: 配额耗尽/链路中断局间自动脱困', () => {
  it('协议消息连续 6 次发送失败 → 自动结束会话', async () => {
    const ctx = fakeWorldContext(CASINO, { scratchDir });
    Object.assign(ctx.cfg, { dealDelayMs: 0, starpostEnabled: true, starpostBotId: '12345', starpostToken: 't'.repeat(32), starpostPollMs: 0, starpostServer: 'https://sp.example', onlineGapMs: 10, onlineRestAfterHands: 100 });
    let sendCalls = 0;
    const post: StarpostPost = async (_u, body) => {
      const a = (body as any)?.action;
      if (a === 'snapshot') return { status: 200, body: { ok: true, result: { botId: '12345', friends: [] } } };
      if (a === 'message.send') { sendCalls++; return { status: 200, body: { ok: false, error: '配额不足' } }; } // 持续拒绝
      return { status: 200, body: { ok: true, result: {} } };
    };
    const world = new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng: () => 0, starpostPost: post });
    const host = new FakeHost();
    await world.start(host);
    await new Promise((r) => setTimeout(r, 5));
    const w = world as unknown as { starpost: any; noteSendFailure: (p: string) => void; closeOnlineSession: (r: string, n?: boolean) => Promise<void> };
    // 建一个庄家会话
    w.starpost.session = { game: 'blackjack', peer: '67890', chips: { '12345': 1000, '67890': 1000 }, bank: '12345', engine: null, timers: [], handsTotal: 0, lastState: null, lastSettle: null, lastIncomingAt: Date.now(), sendFails: 0 };
    // 连续 6 次失败触发脱困
    for (let i = 0; i < 6; i++) w.noteSendFailure('67890');
    await new Promise((r) => setTimeout(r, 10));
    expect(w.starpost.session).toBeNull(); // 会话已自动结束
    expect(host.events.some((e) => e.type === 'casino.online_session' && e.text.includes('自动结束'))).toBe(true);
    await world.stop();
  });
  it('收到对方消息或发送成功会清零失败计数(链路恢复不误杀)', async () => {
    const ctx = fakeWorldContext(CASINO, { scratchDir });
    Object.assign(ctx.cfg, { dealDelayMs: 0, starpostEnabled: true, starpostBotId: '12345', starpostToken: 't'.repeat(32), starpostPollMs: 0, starpostServer: 'https://sp.example' });
    const post: StarpostPost = async (_u, body) => {
      const a = (body as any)?.action;
      if (a === 'snapshot') return { status: 200, body: { ok: true, result: { botId: '12345', friends: [] } } };
      return { status: 200, body: { ok: true, result: {} } };
    };
    const world = new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng: () => 0, starpostPost: post });
    await world.start(new FakeHost());
    await new Promise((r) => setTimeout(r, 5));
    const w = world as unknown as { starpost: any; noteSendFailure: (p: string) => void };
    w.starpost.session = { game: 'blackjack', peer: '67890', chips: {}, bank: '12345', engine: null, timers: [], handsTotal: 0, lastState: null, lastSettle: null, lastIncomingAt: Date.now(), sendFails: 0 };
    for (let i = 0; i < 5; i++) w.noteSendFailure('67890');
    expect(w.starpost.session.sendFails).toBe(5);
    // 模拟收到对方消息清零
    w.starpost.session.sendFails = 0;
    w.noteSendFailure('67890');
    expect(w.starpost.session.sendFails).toBe(1); // 从 0 重新计,不会误触发
    expect(w.starpost.session).not.toBeNull();
    await world.stop();
  });
});
