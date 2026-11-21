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
 * 牌靴可预测:♠2 ♠3 ♠4 ♠5 ♠6 ♠7 ♠8 ♠9 ♠10 ♠J ♠Q ♠K ♥2 ♥3 …(♠A 转到最后)。
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
    insurance: 0,
    insuranceOutcome: 'none',
    hands: [],
    activeHand: 0,
    dealerCards: [],
    holeRevealed: false,
    history: [],
    shoe: patch.shoe ?? [],
    drawn: 0,
  };
  writeFileSync(join(dir, 'casino-table.json'), JSON.stringify(table), 'utf8');
}

function worldWith(rng?: () => number, cfgPatch: Partial<typeof CASINO_DEFAULTS> = {}): CasinoWorld {
  const ctx = fakeWorldContext(CASINO, { scratchDir });
  // 测试不要发牌停顿;单独测节奏时在 cfgPatch 里覆盖。
  Object.assign(ctx.cfg, { dealDelayMs: 0, ...cfgPatch });
  return new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, rng });
}

async function tool(world: CasinoWorld, name: string, args: Record<string, unknown>): Promise<string> {
  const def = world.tools().find((t) => t.name === name)!;
  return String(await def.handler(args, CALL));
}

interface HandSnap {
  cards: string[];
  total: number | null;
  bet: number;
  outcome: string | null;
  active: boolean;
}

type Snap = Record<string, unknown> & {
  phase: string;
  round: number;
  aiRole: string | null;
  bet: number;
  insurance: number;
  ai: { chips: number };
  player: { chips: number };
  holeCount: number;
  holeRevealed: boolean;
  hands: HandSnap[];
};

async function act(world: CasinoWorld, action: string, extra: Record<string, unknown> = {}): Promise<Snap> {
  return (await world.webUi().invoke!('table', 'action', [{ action, ...extra }])) as Snap;
}

function card(rank: number, suit: number): { rank: number; suit: number } {
  return { rank, suit };
}

describe('Casino World(标准 21 点 + 分牌/保险/投降)', () => {
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
    snap = await act(world, 'bet', { amount: 50 });
    expect(snap.phase).toBe('playerActing');
    expect(snap.hands[0]!.total).toBe(5);
    expect(snap.holeCount).toBe(1);
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
    await tool(world, 'casino_player', { action: 'hit' }); // ♠6 → 11
    const stand = await tool(world, 'casino_player', { action: 'stand' });
    // 庄家 ♠4♠5=9 → 补 ♠7(16) → 补 ♠8(24) 爆 → 闲(AI)赢
    expect(stand).toContain('庄家 ♠4 ♠5 ♠7 ♠8(24,爆)');
    expect(stand).toContain('闲家净 +50');
    const match = stand.match(/你的筹码 (\d+),主人 (\d+)/);
    expect(match?.[1]).toBe('1050');
    expect(match?.[2]).toBe('950');
    // AI 自己打的手,动作不投事件(结果在回执里)
    expect((host.events.map((e) => e.type)).filter((t) => t === 'casino.action')).toHaveLength(0);
    await world.stop();
  });

  it('AI 坐庄:主人的下注/要牌/停牌都即时推 casino.action(flush),结算推 result', async () => {
    const world = worldWith(zeroRng);
    const host = new FakeHost();
    await world.start(host);
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    await act(world, 'hit'); // ♠6 → 11
    await act(world, 'stand');
    const types = host.events.map((e) => e.type);
    expect(types.filter((t) => t === 'casino.action')).toHaveLength(3);
    expect(types[types.length - 1]).toBe('casino.result');
    expect(host.pushOpts.every((o) => o?.trigger === 'flush')).toBe(true);
    expect(host.events[0]!.text).toContain('主人下注 50');
    expect(host.events[1]!.text).toContain('拿到 ♠6');
    expect(host.events[2]!.text).toContain('停在 11 点');
    await world.stop();
  });

  it('庄家软 17 默认停(S17);配置 H17 后软 17 会补牌', async () => {
    rigTable({ shoe: [card(2, 0), card(3, 0), card(1, 0), card(6, 2), card(5, 0), card(13, 0)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'player' });
    await tool(world, 'casino_player', { action: 'bet', amount: 50 });
    await tool(world, 'casino_player', { action: 'insurance', amount: 0 }); // 明牌 A,声明不买
    const stand = await tool(world, 'casino_player', { action: 'stand' });
    // 闲 ♠2♠3(5);庄 A♠+♣6 = 软 17 → S17 停 → 17 > 5,闲输
    expect(stand).toContain('庄家 ♠A ♣6(17)');
    expect(stand).toContain('闲家净 -50');
    await world.stop();

    rigTable({ shoe: [card(2, 0), card(3, 0), card(1, 0), card(6, 2), card(5, 0), card(13, 0)] });
    const h17 = worldWith(zeroRng, { dealerHitsSoft17: true });
    await h17.start(new FakeHost());
    await act(h17, 'newgame', { dealer: 'player' });
    await tool(h17, 'casino_player', { action: 'bet', amount: 50 });
    await tool(h17, 'casino_player', { action: 'insurance', amount: 0 });
    const stand2 = await tool(h17, 'casino_player', { action: 'stand' });
    // H17:软 17 补 ♠5 → 12 → 再补 ♠K(10) → 22 爆 → 闲赢
    expect(stand2).toContain('爆');
    expect(stand2).toContain('闲家净 +50');
    await h17.stop();
  });

  it('分牌:同点两张分两手,各补一张,逐手打完一起结算', async () => {
    rigTable({ shoe: [card(7, 0), card(7, 1), card(4, 0), card(5, 0), card(8, 0), card(9, 0), card(10, 0), card(11, 0), card(12, 0)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    let snap = await act(world, 'split');
    expect(snap.hands).toHaveLength(2);
    expect(snap.hands[0]!.cards).toEqual(['♠7', '♠8']);
    expect(snap.hands[1]!.cards).toEqual(['♥7', '♠9']);
    expect(snap.hands[0]!.active).toBe(true);
    snap = await act(world, 'stand'); // 手一 15 停
    expect(snap.hands[0]!.active).toBe(false);
    expect(snap.hands[1]!.active).toBe(true);
    snap = await act(world, 'hit'); // 手二 ♠10 → 16+10=26 爆
    expect(snap.hands[1]!.total).toBe(26);
    // 全部打完 → 庄家 ♠4♠5=9 → 补 ♠J → 19 停:手一 15 输、手二爆输 → 净 -100
    expect(snap.phase).toBe('idle');
    expect(snap.player.chips).toBe(900);
    expect(snap.ai.chips).toBe(1100);
    const history = await tool(world, 'casino_table', { action: 'history' });
    expect(history).toContain('输');
    await world.stop();
  });

  it('分 A:各拿一张即停,分牌后的 21 不算黑杰克', async () => {
    rigTable({ shoe: [card(1, 0), card(1, 1), card(4, 0), card(5, 0), card(6, 0), card(7, 0), card(8, 0)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    const split = await act(world, 'split');
    // 两手各 A+一张:♠A♠6(软17) / ♥A♠7(软18);庄家 ♠4♠5=9 → 补 ♠8(17)
    expect(split.phase).toBe('idle');
    // 手一 17 对 17 平;手二 18 > 17 赢 → 净 +50
    expect(split.player.chips).toBe(1050);
    expect(split.ai.chips).toBe(950);
    const snap = (await world.webUi().invoke!('table', 'state', [])) as Snap & { history: Array<{ hands: Array<{ outcome: string; cards: string[] }> }> };
    expect(snap.history[0]!.hands[0]!.outcome).toBe('push');
    expect(snap.history[0]!.hands[0]!.cards).toEqual(['♠A', '♠6']);
    expect(snap.history[0]!.hands[1]!.outcome).toBe('win');
    await world.stop();
  });

  it('保险:庄家亮 A 先决定;买后被收走则并入结算', async () => {
    rigTable({ shoe: [card(2, 0), card(3, 0), card(1, 1), card(6, 0), card(13, 0)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    let snap = await act(world, 'bet', { amount: 50 });
    expect(snap.phase).toBe('insurance');
    expect(snap.insurance).toBe(0);
    snap = await act(world, 'insurance', { amount: 25 });
    // 庄家 A♥+♠6 = 软 17 不是黑杰克 → 保险待输,继续打牌
    expect(snap.phase).toBe('playerActing');
    snap = await act(world, 'stand');
    // 庄软 17 停(S17):17 > 闲 5 → 闲输 -50,保险输 -25 → 净 -75
    expect(snap.player.chips).toBe(925);
    expect(snap.ai.chips).toBe(1075);
    const history = await tool(world, 'casino_table', { action: 'history' });
    expect(history).toContain('保险 25');
    await world.stop();
  });

  it('保险赢:庄家明 A 且暗牌 10,保险 2:1 对冲主注', async () => {
    rigTable({ shoe: [card(2, 0), card(3, 0), card(1, 1), card(13, 0)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    const snap = await act(world, 'insurance', { amount: 25 });
    // 庄 A♥+♠K 黑杰克:保险 +50,主注输 -50 → 净 0
    expect(snap.phase).toBe('idle');
    expect(snap.player.chips).toBe(1000);
    expect(snap.ai.chips).toBe(1000);
    const history = await tool(world, 'casino_table', { action: 'history' });
    expect(history).toContain('保险 25(赢)');
    await world.stop();
  });

  it('不买保险:庄家不是黑杰克,直接进入行动', async () => {
    rigTable({ shoe: [card(2, 0), card(3, 0), card(1, 1), card(6, 0), card(13, 0)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    const snap = await act(world, 'insurance', { amount: 0 });
    expect(snap.phase).toBe('playerActing');
    expect(snap.insurance).toBe(0);
    await world.stop();
  });

  it('投降:弃一半注立即结束', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    const snap = await act(world, 'surrender');
    expect(snap.phase).toBe('idle');
    expect(snap.player.chips).toBe(975);
    expect(snap.ai.chips).toBe(1025);
    const history = await tool(world, 'casino_table', { action: 'history' });
    expect(history).toContain('投降');
    await world.stop();
  });

  it('闲家自然黑杰克立即 1.5 倍结算', async () => {
    rigTable({ shoe: [card(1, 0), card(13, 1), card(5, 2), card(9, 3)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'ai' });
    const snap = await act(world, 'bet', { amount: 50 });
    expect(snap.phase).toBe('idle');
    expect(snap.player.chips).toBe(1075);
    expect(snap.ai.chips).toBe(925);
    await world.stop();
  });

  it('闲家爆牌立即输:AI 当闲家连抽三张到 26,庄家不补牌直接收注', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'player' });
    await tool(world, 'casino_player', { action: 'bet', amount: 50 });
    await tool(world, 'casino_player', { action: 'hit' });
    await tool(world, 'casino_player', { action: 'hit' });
    await tool(world, 'casino_player', { action: 'hit' }); // ♠6 ♠7 ♠8 → 26 爆
    const snap = (await world.webUi().invoke!('table', 'state', [])) as Snap & { history: Array<{ dealerCards: string[]; hands: Array<{ outcome: string }>; delta: number }> };
    expect(snap.phase).toBe('idle');
    expect(snap.ai.chips).toBe(950);
    expect(snap.player.chips).toBe(1050);
    expect(snap.history[0]!.hands[0]!.outcome).toBe('bust');
    expect(snap.history[0]!.delta).toBe(-50);
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

  it('加倍校验看的是庄家银行:AI 闲家加倍不能超过玩家(庄)赔得起的数', async () => {
    rigTable({ playerChips: 20 }); // 玩家坐庄,银行只有 20
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { dealer: 'player' });
    await tool(world, 'casino_player', { action: 'bet', amount: 15 });
    const text = await tool(world, 'casino_player', { action: 'double' });
    expect(text).toContain('赔得起');
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

  it('记录并重来:归档场次、筹码清零、等选庄', async () => {
    const world = worldWith(zeroRng);
    const host = new FakeHost();
    await world.start(host);
    await act(world, 'newgame', { dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    await act(world, 'stand'); // 庄爆,玩家 +50 → 1050 / 950
    const snap = await act(world, 'resetmatch') as Snap & { matches: Array<{ rounds: number; aiChips: number; playerChips: number; winner: string }> };
    expect(snap.phase).toBe('idle');
    expect(snap.aiRole).toBe(null);
    expect(snap.ai.chips).toBe(1000);
    expect(snap.player.chips).toBe(1000);
    expect(snap.matches).toHaveLength(1);
    expect(snap.matches[0]!.rounds).toBe(1);
    expect(snap.matches[0]!.aiChips).toBe(950);
    expect(snap.matches[0]!.playerChips).toBe(1050);
    expect(snap.matches[0]!.winner).toBe('player');
    // AI 收到场次重置通知
    const last = host.events[host.events.length - 1]!;
    expect(last.type).toBe('casino.action');
    expect(last.text).toContain('归档');
    await world.stop();
  });

  it('场次记录最多保存 10 条', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    for (let i = 0; i < 11; i++) {
      await act(world, 'resetmatch');
    }
    const snap = (await world.webUi().invoke!('table', 'state', [])) as Snap & { matches: unknown[] };
    expect(snap.matches).toHaveLength(10);
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
    expect(snap.hands[0]!.total).toBe(5);
    await second.stop();
  });
});
