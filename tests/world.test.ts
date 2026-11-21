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
 * 牌靴可预测:♠2 ♠3 ♠4 ♠5 ♠6 ♠7 ♠8 …(♠A 转到最后)。
 */
const zeroRng = () => 0;

let scratchDir: string;
beforeEach(() => { scratchDir = mkdtempSync(join(tmpdir(), 'casino-world-')); });
afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

function dataDir(): string {
  return join(scratchDir, 'deployment', 'data');
}

/** 预写一张牌桌:把牌靴换成给定序列,其余字段给合法默认。 */
function rigTable(patch: { shoe?: Array<{ rank: number; suit: number }>; aiChips?: number; ownerChips?: number }): void {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const table = {
    version: 1,
    ai: { ...newSeat(patch.aiChips ?? 1000), chips: patch.aiChips ?? 1000 },
    owner: { ...newSeat(patch.ownerChips ?? 1000), chips: patch.ownerChips ?? 1000 },
    history: [],
    bankruptcies: 0,
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

describe('Casino World', () => {
  it('干装载不报失败:装载器会接受它', async () => {
    const report = await dryMountWorld(CASINO, { scratchDir });
    expect(report.failures).toEqual([]);
  });

  it('首次挂载开出新桌,筹码取配置默认', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    const status = await tool(world, 'casino_bank', { action: 'status' });
    expect(status).toContain('余额:1000');
    expect(status).toContain('最小注 10');
    await world.stop();
  });

  it('rng 恒 0 时出牌可预测:deal 拿到 ♠2♠3(5),庄家亮 ♠4;stand 后庄家连抽爆掉,5 也算赢', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    const dealt = await tool(world, 'casino_play', { action: 'deal', bet: 50 });
    expect(dealt).toContain('♠2 ♠3(5)');
    expect(dealt).toContain('庄家明牌:♠4');
    expect(dealt).toContain('余额 950');
    const stood = await tool(world, 'casino_play', { action: 'stand' });
    expect(stood).toContain('对庄家 ♠4 ♠5 ♠6 ♠7(22,爆)');
    expect(stood).toContain('结果:赢,+50');
    expect(stood).toContain('余额 1050');
    await world.stop();
  });

  it('要牌爆牌立即结算:5 连抽三张到 26,输,押注不回', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await tool(world, 'casino_play', { action: 'deal', bet: 50 });
    await tool(world, 'casino_play', { action: 'hit' });
    await tool(world, 'casino_play', { action: 'hit' });
    const hit = await tool(world, 'casino_play', { action: 'hit' });
    expect(hit).toContain('爆牌');
    expect(hit).toContain('-50');
    expect(hit).toContain('余额 950');
    await world.stop();
  });

  it('天然黑杰克按 3:2 赔:押 50 净得 +75', async () => {
    rigTable({ shoe: [{ rank: 1, suit: 0 }, { rank: 13, suit: 1 }, { rank: 5, suit: 2 }, { rank: 9, suit: 3 }] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    const dealt = await tool(world, 'casino_play', { action: 'deal', bet: 50 });
    expect(dealt).toContain('黑杰克');
    expect(dealt).toContain('+75');
    expect(dealt).toContain('余额 1075');
    await world.stop();
  });

  it('下注校验:低于最小注、超单手上限、超余额都拒绝', async () => {
    rigTable({ aiChips: 15 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    expect(await tool(world, 'casino_play', { action: 'deal', bet: 5 })).toContain('最小下注 10');
    expect(await tool(world, 'casino_play', { action: 'deal', bet: 500 })).toContain('单手上限 200');
    expect(await tool(world, 'casino_play', { action: 'deal', bet: 20 })).toContain('余额 15,押不起 20');
    await world.stop();
  });

  it('救济:有筹码时拒绝;破产时发放并记破产次数', async () => {
    rigTable({ aiChips: 5 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    expect(await tool(world, 'casino_bank', { action: 'relief' })).toContain('救济金 1000 已到账');
    expect(await tool(world, 'casino_bank', { action: 'status' })).toContain('破产 1 次');
    expect(await tool(world, 'casino_bank', { action: 'relief' })).toContain('救济只给破产的人');
    await world.stop();
  });

  it('主人经面板开手结算后,推 casino.result 事件(origin internal)', async () => {
    rigTable({ shoe: [{ rank: 1, suit: 0 }, { rank: 13, suit: 1 }, { rank: 5, suit: 2 }, { rank: 9, suit: 3 }] });
    const world = worldWith(zeroRng);
    const host = new FakeHost();
    await world.start(host);
    const snapshot = (await world.webUi().invoke!('table', 'action', [{ action: 'deal', bet: 20 }])) as { owner: { chips: number } };
    expect(snapshot.owner.chips).toBe(1030);
    expect(host.events.map((e) => e.type)).toEqual(['casino.result']);
    expect(host.events[0]!.origin).toBe('internal');
    await world.stop();
  });

  it('casino_history 报最近的手与累计', async () => {
    rigTable({ shoe: [{ rank: 1, suit: 0 }, { rank: 13, suit: 1 }, { rank: 5, suit: 2 }, { rank: 9, suit: 3 }] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await tool(world, 'casino_play', { action: 'deal', bet: 50 });
    const history = await tool(world, 'casino_history', { limit: 5 });
    expect(history).toContain('黑杰克');
    expect(history).toContain('你的累计:1 胜');
    await world.stop();
  });

  it('存档跨实例延续:重开后筹码与战绩还在', async () => {
    rigTable({ shoe: [{ rank: 1, suit: 0 }, { rank: 13, suit: 1 }, { rank: 5, suit: 2 }, { rank: 9, suit: 3 }] });
    const first = worldWith(zeroRng);
    await first.start(new FakeHost());
    await tool(first, 'casino_play', { action: 'deal', bet: 50 });
    await first.stop();
    const second = worldWith(zeroRng);
    await second.start(new FakeHost());
    const status = await tool(second, 'casino_bank', { action: 'status' });
    expect(status).toContain('余额:1075');
    expect(status).toContain('1 胜');
    await second.stop();
  });
});
