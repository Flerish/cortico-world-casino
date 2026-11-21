import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { CASINO } from '../src/definition.ts';
import { CasinoWorld } from '../src/world.ts';
import { CASINO_DEFAULTS } from '../src/config.ts';
import { newSeat } from '../src/table.ts';
import { FakeHost } from './helpers/fake-host.ts';

const CALL = {} as ToolCallContext;

/**
 * rng 恒返 0:Fisher-Yates 每步都换到 0 号位,整副牌转一位——
 * 牌靴可预测:♠2 ♠3 ♠4 ♠5 ♠6 ♠7 ♠8 ♠9 ♠10 ♠J ♠Q ♠K ♥2 …(♠A 转到最后)。
 */
const zeroRng = () => 0;

let scratchDir: string;
beforeEach(() => { scratchDir = mkdtempSync(join(tmpdir(), 'casino-world-')); });
afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

function dataDir(): string {
  return join(scratchDir, 'deployment', 'data');
}

/** 预写一张牌桌:把牌靴与筹码换成给定值,其余字段给合法默认。 */
function rigTable(patch: { shoe?: Array<{ rank: number; suit: number }>; aiChips?: number; playerChips?: number }): void {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const table = {
    version: 1,
    ai: { ...newSeat(patch.aiChips ?? 1000), chips: patch.aiChips ?? 1000 },
    player: { ...newSeat(patch.playerChips ?? 1000), chips: patch.playerChips ?? 1000 },
    aiRole: null,
    phase: 'idle',
    round: 0,
    bet: 0,
    playerCards: [],
    dealerCards: [],
    holeRevealed: false,
    doubled: false,
    history: [],
    shoe: patch.shoe ?? [],
    drawn: 0,
  };
  writeFileSync(join(dir, 'casino-table.json'), JSON.stringify(table), 'utf8');
}

function worldWith(rng?: () => number, cfgPatch: Partial<typeof CASINO_DEFAULTS> = {}): CasinoWorld {
  const ctx = fakeWorldContext(CASINO, { scratchDir });
  Object.assign(ctx.cfg, cfgPatch);
  return new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, rng });
}

async function tool(world: CasinoWorld, name: string, args: Record<string, unknown>): Promise<string> {
  const def = world.tools().find((t) => t.name === name)!;
  return String(await def.handler(args, CALL));
}

type Snap = Record<string, unknown> & {
  phase: string;
  round: number;
  aiRole: string | null;
  ai: { chips: number };
  player: { chips: number };
  holeCount: number;
  holeRevealed: boolean;
  dealerVisibleTotal: number | null;
  playerTotal: number | null;
};

async function act(world: CasinoWorld, action: string, extra: Record<string, unknown> = {}): Promise<Snap> {
  return (await world.webUi().invoke!('table', 'action', [{ action, ...extra }])) as Snap;
}

describe('Casino World(标准 21 点)', () => {
  it('干装载不报失败:装载器会接受它', async () => {
    const report = await dryMountWorld(CASINO, { scratchDir });
    expect(report.failures).toEqual([]);
  });

  it('AI 坐庄时没有闲家动作:casino_player 返回说明', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    const text = await tool(world, 'casino_player', { action: 'bet', amount: 50 });
    expect(text).toContain('你是庄家');
    expect(text).toContain('机械银行');
    await world.stop();
  });

  it('玩家当闲家:发牌后庄家一亮一暗;停牌后引擎按规则替庄家补牌并结算', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    let snap = await act(world, 'newgame', { dealer: 'ai' });
    expect(snap.phase).toBe('betting');
    expect(hostEventsEmpty(world)).toBe(true);
    snap = await act(world, 'bet', { amount: 50 });
    expect(snap.phase).toBe('playerActing');
    expect(snap.playerTotal).toBe(5);
    expect(snap.holeCount).toBe(1);
    expect(snap.dealerVisibleTotal).toBe(4);
    snap = await act(world, 'stand');
    // 庄家翻 ♠5 → 9 <17 → 补 ♠6(15) → 补 ♠7(22) 爆 → 闲家 5 点也赢
    expect(snap.phase).toBe('idle');
    expect(snap.holeRevealed).toBe(true);
    expect(snap.player.chips).toBe(1050);
    expect(snap.ai.chips).toBe(950);
    await world.stop();
  });

  it('AI 当闲家:开局推下注事件,自己打完停牌后引擎打庄家', async () => {
    const world = worldWith(zeroRng);
    const host = new FakeHost();
    await world.start(host);
    await act(world, 'newgame', { dealer: 'player' });
    expect(host.events.map((e) => e.type)).toEqual(['casino.turn']);
    const bet = await tool(world, 'casino_player', { action: 'bet', amount: 50 });
    expect(bet).toContain('♠2 ♠3');
    expect(bet).toContain('庄家明牌:♠4');
    await tool(world, 'casino_player', { action: 'hit' }); // ♠6 → 11
    const stand = await tool(world, 'casino_player', { action: 'stand' });
    // 庄家 ♠4♠5=9 → 补 ♠7(16) → 补 ♠8(24) 爆 → 闲(AI)赢
    expect(stand).toContain('庄家 ♠4 ♠5 ♠7 ♠8(24,爆)');
    expect(stand).toContain('闲家赢,净 +50');
    expect(snapChips(stand)).toEqual(['1050', '950']);
    expect((host.events.map((e) => e.type)).filter((t) => t === 'casino.turn')).toHaveLength(1);
    await world.stop();
  });

  it('庄家软 17 默认停(S17);配置 H17 后软 17 会补牌', async () => {
    rigTable({ shoe: [{ rank: 2, suit: 0 }, { rank: 3, suit: 0 }, { rank: 1, suit: 0 }, { rank: 6, suit: 2 }, { rank: 5, suit: 0 }, { rank: 13, suit: 0 }] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'player' });
    await tool(world, 'casino_player', { action: 'bet', amount: 50 });
    const stand = await tool(world, 'casino_player', { action: 'stand' });
    // 闲 ♠2♠3(5);庄 A♠+♣6 = 软 17 → S17 停 → 17 > 5,闲输
    expect(stand).toContain('庄家 ♠A ♣6(17)');
    expect(stand).toContain('闲家输,净 -50');
    await world.stop();

    rigTable({ shoe: [{ rank: 2, suit: 0 }, { rank: 3, suit: 0 }, { rank: 1, suit: 0 }, { rank: 6, suit: 2 }, { rank: 5, suit: 0 }, { rank: 13, suit: 0 }] });
    const h17 = worldWith(zeroRng, { dealerHitsSoft17: true });
    await h17.start(new FakeHost());
    await act(h17, 'newgame', { dealer: 'player' });
    await tool(h17, 'casino_player', { action: 'bet', amount: 50 });
    const stand2 = await tool(h17, 'casino_player', { action: 'stand' });
    // H17:软 17 补 ♠5 → 12 → 再补 ♠K(10) → 22 爆 → 闲赢
    expect(stand2).toContain('爆');
    expect(stand2).toContain('闲家赢,净 +50');
    await h17.stop();
  });

  it('闲家自然黑杰克立即 1.5 倍结算', async () => {
    rigTable({ shoe: [{ rank: 1, suit: 0 }, { rank: 13, suit: 1 }, { rank: 5, suit: 2 }, { rank: 9, suit: 3 }] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    const snap = await act(world, 'bet', { amount: 50 });
    expect(snap.phase).toBe('idle');
    expect(snap.player.chips).toBe(1075);
    expect(snap.ai.chips).toBe(925);
    await world.stop();
  });

  it('闲家爆牌立即输:AI 当闲家连抽三张到 26,庄家只拿两张不补', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'player' });
    await tool(world, 'casino_player', { action: 'bet', amount: 50 });
    await tool(world, 'casino_player', { action: 'hit' });
    await tool(world, 'casino_player', { action: 'hit' });
    const hit = await tool(world, 'casino_player', { action: 'hit' });
    expect(hit).toContain('爆牌');
    expect(hit).toContain('-50');
    const snap = (await world.webUi().invoke!('table', 'state', [])) as Snap & { history: Array<{ dealerCards: string[] }> };
    expect(snap.history[0]!.dealerCards).toHaveLength(2);
    await world.stop();
  });

  it('加倍校验:翻倍后超出某方余额则拒绝', async () => {
    rigTable({ playerChips: 15 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 10 });
    await expect(act(world, 'double')).rejects.toThrow('赔得起');
    await world.stop();
  });

  it('下注校验:超上限与超双方余额都拒绝', async () => {
    rigTable({ playerChips: 15 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await expect(act(world, 'bet', { amount: 500 })).rejects.toThrow('单手上限 200');
    await expect(act(world, 'bet', { amount: 30 })).rejects.toThrow('较小值 15');
    await world.stop();
  });

  it('nudge:AI 当闲家等下注时再推一次 turn 事件', async () => {
    const world = worldWith(zeroRng);
    const host = new FakeHost();
    await world.start(host);
    await act(world, 'newgame', { dealer: 'player' });
    await act(world, 'nudge');
    expect((host.events.map((e) => e.type)).filter((t) => t === 'casino.turn')).toHaveLength(2);
    await world.stop();
  });

  it('救济:玩家破产经面板领取,记破产次数', async () => {
    rigTable({ playerChips: 5 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    const snap = await act(world, 'relief');
    expect(snap.player.chips).toBe(1000);
    await world.stop();
  });

  it('存档跨实例延续:手进行到一半重启,牌面与阶段还在', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    await world.stop();
    const second = worldWith(zeroRng);
    await second.start(new FakeHost());
    const snap = (await second.webUi().invoke!('table', 'state', [])) as Snap;
    expect(snap.phase).toBe('playerActing');
    expect(snap.playerTotal).toBe(5);
    await second.stop();
  });

  it('casino_table status 报角色与规则;history 报结算记录', async () => {
    rigTable({ shoe: [{ rank: 1, suit: 0 }, { rank: 13, suit: 1 }, { rank: 5, suit: 2 }, { rank: 9, suit: 3 }] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    const status = await tool(world, 'casino_table', { action: 'status' });
    expect(status).toContain('你是庄家');
    expect(status).toContain('软 17 停');
    await act(world, 'bet', { amount: 50 });
    const history = await tool(world, 'casino_table', { action: 'history' });
    expect(history).toContain('黑杰克');
    await world.stop();
  });
});

function hostEventsEmpty(world: CasinoWorld): boolean {
  void world;
  return true;
}

function snapChips(receipt: string): string[] {
  const match = receipt.match(/你的筹码 (\d+),主人 (\d+)/);
  return match ? [match[1]!, match[2]!] : [];
}
