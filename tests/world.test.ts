import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { CASINO } from '../src/definition.ts';
import { CasinoWorld } from '../src/world.ts';
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

function worldWith(rng?: () => number): CasinoWorld {
  const ctx = fakeWorldContext(CASINO, { scratchDir });
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
  playerTotal: number | null;
};

async function act(world: CasinoWorld, action: string, extra: Record<string, unknown> = {}): Promise<Snap> {
  return (await world.webUi().invoke!('table', 'action', [{ action, ...extra }])) as Snap;
}

describe('Casino World(对战版)', () => {
  it('干装载不报失败:装载器会接受它', async () => {
    const report = await dryMountWorld(CASINO, { scratchDir });
    expect(report.failures).toEqual([]);
  });

  it('玩家让 AI 坐庄后自己下注开手,停牌后推 casino.turn 给 AI 做庄', async () => {
    const world = worldWith(zeroRng);
    const host = new FakeHost();
    await world.start(host);
    let snap = await act(world, 'newgame', { dealer: 'ai' });
    expect(snap.phase).toBe('betting');
    expect(host.events.map((e) => e.type)).toEqual([]);
    snap = await act(world, 'bet', { amount: 50 });
    expect(snap.phase).toBe('playerActing');
    expect(snap.playerTotal).toBe(5);
    expect(snap.holeCount).toBe(1);
    snap = await act(world, 'stand');
    expect(snap.phase).toBe('dealerActing');
    expect(host.events.map((e) => e.type)).toEqual(['casino.turn']);
    // AI 做庄:庄家 ♠4♠5(9) 自由停牌 → 闲家 5 输,庄家收注
    const receipt = await tool(world, 'casino_dealer', { action: 'stand' });
    expect(receipt).toContain('闲家输,净 -50');
    expect(receipt).toContain('你的筹码 1050');
    await world.stop();
    void snap;
  });

  it('庄家爆牌赔付:AI 做庄连抽到爆,闲家 5 点也赢', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    await act(world, 'stand');
    await tool(world, 'casino_dealer', { action: 'hit' }); // ♠6 → 15
    await tool(world, 'casino_dealer', { action: 'hit' }); // ♠7 → 22 爆
    const snap = (await world.webUi().invoke!('table', 'state', [])) as Snap & { history: Array<{ outcome: string; delta: number }> };
    expect(snap.phase).toBe('idle');
    expect(snap.player.chips).toBe(1050);
    expect(snap.ai.chips).toBe(950);
    expect(snap.history[0]!.outcome).toBe('win');
    await world.stop();
  });

  it('玩家坐庄、AI 当闲家:开局即推下注事件,AI 押注后行动,停牌后轮到玩家做庄', async () => {
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
    expect(stand).toContain('闲家停在 11 点');
    expect((host.events.map((e) => e.type)).filter((t) => t === 'casino.turn')).toHaveLength(1);
    const snap = await act(world, 'dealer_stand');
    expect(snap.phase).toBe('idle');
    // 闲 11 对 庄 ♠4♠5(9) → 闲赢;闲家是 AI:AI +50,玩家 -50
    expect(snap.ai.chips).toBe(1050);
    expect(snap.player.chips).toBe(950);
    await world.stop();
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

  it('闲家爆牌立即输:AI 当闲家连抽三张到 26', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'player' });
    await tool(world, 'casino_player', { action: 'bet', amount: 50 });
    await tool(world, 'casino_player', { action: 'hit' });
    await tool(world, 'casino_player', { action: 'hit' });
    const hit = await tool(world, 'casino_player', { action: 'hit' });
    expect(hit).toContain('爆牌');
    expect(hit).toContain('-50');
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

  it('casino_table status 报角色与阶段;history 报结算记录', async () => {
    rigTable({ shoe: [{ rank: 1, suit: 0 }, { rank: 13, suit: 1 }, { rank: 5, suit: 2 }, { rank: 9, suit: 3 }] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    const status = await tool(world, 'casino_table', { action: 'status' });
    expect(status).toContain('你是庄家');
    await act(world, 'bet', { amount: 50 });
    const history = await tool(world, 'casino_table', { action: 'history' });
    expect(history).toContain('黑杰克');
    await world.stop();
  });
});
