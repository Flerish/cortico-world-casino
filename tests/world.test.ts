import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { bestPokerHand, comparePokerHands } from '../src/cards.ts';
import { CASINO } from '../src/definition.ts';
import { CasinoWorld } from '../src/world.ts';
import { CASINO_DEFAULTS, type CasinoConfigSection } from '../src/config.ts';
import { loadTable, newHoldemState, newSeat, type BlackjackState, type HoldemState, type OldMaidState, type TableState } from '../src/table.ts';
import type { Card } from '../src/cards.ts';
import { FakeHost } from './helpers/fake-host.ts';

const CALL = {} as ToolCallContext;

/** rng 恒返 0:抽牌永远抽对方手里的第一张(结果完全可预测)。 */
const zeroRng = () => 0;

let scratchDir: string;
beforeEach(() => { scratchDir = mkdtempSync(join(tmpdir(), 'casino-world-')); });
afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

function dataDir(): string {
  return join(scratchDir, 'deployment', 'data');
}

function card(rank: number, suit: number): Card {
  return { rank, suit };
}

/** 预写一张牌桌:按补丁拼出三游戏结构,牌靴与筹码可覆盖。 */
function rigTable(patch: {
  game?: 'blackjack' | 'oldmaid' | 'holdem' | null;
  blackjack?: Partial<BlackjackState>;
  oldmaid?: Partial<OldMaidState>;
  holdem?: Partial<HoldemState>;
  shoe?: Card[];
  aiChips?: number;
  playerChips?: number;
}): void {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const state: TableState = {
    version: 1,
    game: patch.game ?? null,
    blackjack: patch.game === 'blackjack'
      ? {
          phase: 'betting',
          aiRole: 'dealer',
          round: 1,
          bet: 0,
          insurance: 0,
          insuranceOutcome: 'none',
          hands: [],
          activeHand: 0,
          dealerCards: [],
          holeRevealed: false,
          dealerActing: false,
          history: [],
          ...(patch.blackjack ?? {}),
        }
      : null,
    oldmaid: patch.game === 'oldmaid'
      ? {
          aiHand: [],
          playerHand: [],
          discards: [],
          hiddenCard: null,
          turnOwner: 'player',
          winner: null,
          score: { ai: 0, player: 0 },
          history: [],
          ...(patch.oldmaid ?? {}),
        }
      : null,
    ai: { ...newSeat(patch.aiChips ?? 1000), chips: patch.aiChips ?? 1000 },
    player: { ...newSeat(patch.playerChips ?? 1000), chips: patch.playerChips ?? 1000 },
    shoe: patch.shoe ?? [],
    holdem: patch.game === 'holdem'
      ? {
          ...newHoldemState('player'),
          ...(patch.holdem ?? {}),
        }
      : null,
    drawn: 0,
  };
  writeFileSync(join(dir, 'casino-table.json'), JSON.stringify(state), 'utf8');
}

function worldWith(rng?: () => number, cfgPatch: Partial<typeof CASINO_DEFAULTS> = {}): CasinoWorld {
  const ctx = fakeWorldContext(CASINO, { scratchDir });
  // 测试不要发牌停顿;单独测节奏时在 cfgPatch 里覆盖。
  Object.assign(ctx.cfg, { dealDelayMs: 0, ...cfgPatch });
  return new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng });
}

async function tool(world: CasinoWorld, name: string, args: Record<string, unknown>): Promise<string> {
  const def = world.tools().find((t) => t.name === name)!;
  return String(await def.handler(args, CALL));
}

type Snap = Record<string, unknown> & {
  game: 'blackjack' | 'oldmaid' | 'holdem' | null;
  phase?: string;
  aiRole?: string;
  ai: { chips: number };
  player: { chips: number };
  holeCount?: number;
  holeRevealed?: boolean;
  dealerVisibleTotal?: number | null;
  hands?: Array<{ cards: string[]; total: number | null; outcome: string | null }>;
  turnOwner?: string;
  winner?: string | null;
  playerHandCount?: number;
  aiHandCount?: number;
  discardPairs?: number;
  playerCards?: string[];
  oldmaid?: {
    winner: 'ai' | 'player' | null;
    score: { ai: number; player: number };
    hiddenCard?: string | null;
  };
  // ── 德州 ──
  button?: 'ai' | 'player';
  toAct?: 'ai' | 'player' | null;
  revealHole?: boolean;
  byFold?: boolean;
  pot?: number;
  currentBet?: number;
  community?: string[];
  aiCards?: string[] | null;
  aiHoleCount?: number;
  aiCommitted?: number;
  playerCommitted?: number;
  aiFolded?: boolean;
  lastHoldem?: { winner: string; by: string; pot: number; delta: number; aiMade?: string; playerMade?: string } | null;
};

async function act(world: CasinoWorld, action: string, extra: Record<string, unknown> = {}): Promise<Snap> {
  return (await world.webUi().invoke!('table', 'action', [{ action, ...extra }])) as Snap;
}

async function omState(world: CasinoWorld): Promise<Snap> {
  return (await world.webUi().invoke!('table', 'state', [])) as Snap;
}

describe('Casino World(21 点 + 抽鬼牌)', () => {
  it('干装载不报失败:装载器会接受它', async () => {
    const report = await dryMountWorld(CASINO, { scratchDir });
    expect(report.failures).toEqual([]);
  });

  // ── 21 点 ──

  it('21 点:选庄开手后庄家一亮一暗;停牌后引擎按规则打并结算', async () => {
    rigTable({ shoe: [card(2, 0), card(3, 0), card(4, 0), card(5, 0), card(6, 0), card(7, 0)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    let snap = await act(world, 'newgame', { game: 'blackjack', dealer: 'ai' });
    expect(snap.game).toBe('blackjack');
    expect(snap.phase).toBe('betting');
    snap = await act(world, 'bet', { amount: 50 });
    expect(snap.phase).toBe('playerActing');
    expect(snap.hands![0]!.total).toBe(5);
    expect(snap.holeCount).toBe(1);
    snap = await act(world, 'stand');
    // 庄家翻 ♠5 → 9 <17 → 补 ♠6(15) → 补 ♠7(22) 爆 → 闲家 5 点也赢
    expect(snap.phase).toBe('betting');
    expect(snap.holeRevealed).toBe(true);
    expect(snap.player.chips).toBe(1050);
    expect(snap.ai.chips).toBe(950);
    await world.stop();
  });

  it('21 点:自然黑杰克立即 1.5 倍结算', async () => {
    rigTable({ shoe: [card(1, 0), card(13, 1), card(5, 2), card(9, 3)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'blackjack', dealer: 'ai' });
    const snap = await act(world, 'bet', { amount: 50 });
    expect(snap.phase).toBe('betting');
    expect(snap.player.chips).toBe(1075);
    expect(snap.ai.chips).toBe(925);
    await world.stop();
  });

  it('21 点:下注校验与加倍校验仍然生效', async () => {
    rigTable({ playerChips: 15 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'blackjack', dealer: 'ai' });
    await expect(act(world, 'bet', { amount: 500 })).rejects.toThrow('单手上限 200');
    await expect(act(world, 'bet', { amount: 30 })).rejects.toThrow('余额 15,押不起 30');
    await act(world, 'bet', { amount: 10 });
    await expect(act(world, 'double')).rejects.toThrow('你的余额 15');
    await world.stop();
  });

  it('21 点:救济与破产次数照旧', async () => {
    rigTable({ playerChips: 5 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    const snap = await act(world, 'relief');
    expect(snap.player.chips).toBe(1000);
    await world.stop();
  });

  it('21 点:存档跨实例延续(状态分层在 blackjack 子对象)', async () => {
    rigTable({ shoe: [card(2, 0), card(3, 0), card(4, 0), card(5, 0)] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'blackjack', dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    await world.stop();
    const second = worldWith(zeroRng);
    await second.start(new FakeHost());
    const snap = (await second.webUi().invoke!('table', 'state', [])) as Snap;
    expect(snap.game).toBe('blackjack');
    expect(snap.phase).toBe('playerActing');
    expect(snap.hands![0]!.total).toBe(5);
    await second.stop();
  });

  it('旧版存档迁移:0.5.x 平面结构 → 保留筹码战绩,清桌回空', () => {
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    // 0.5.2 的平面结构:没有 blackjack / oldmaid 子对象键
    const legacy = {
      version: 7,
      game: 'blackjack',
      phase: 'betting',
      aiRole: 'dealer',
      round: 3,
      bet: 0,
      hands: [],
      dealerCards: [],
      holeRevealed: false,
      shoe: [card(5, 0)],
      drawn: 2,
      ai: newSeat(1000),
      player: newSeat(900),
    };
    writeFileSync(join(dir, 'casino-table.json'), JSON.stringify(legacy), 'utf8');
    const loaded = loadTable(dir)!;
    expect(loaded).not.toBeNull();
    expect(loaded.game).toBeNull();
    expect(loaded.blackjack).toBeNull();
    expect(loaded.oldmaid).toBeNull();
    expect(loaded.ai.chips).toBe(1000);
    expect(loaded.player.chips).toBe(900);
    expect(loaded.shoe).toEqual([card(5, 0)]);
  });

  it('新版存档(blackjack/oldmaid 键存在)原样加载,空桌的 null 子对象不触发迁移', () => {
    rigTable({ game: 'blackjack' });
    const loaded = loadTable(dataDir())!;
    expect(loaded.game).toBe('blackjack');
    expect(loaded.blackjack!.phase).toBe('betting');
    expect(loaded.blackjack!.round).toBe(1);
  });

  // ── 抽鬼牌 ──

  /** 52 张已知顺序:♠ 块、♥ 块、♦ 块、♣ 块(♣A 挪到最前)。
   *  rng=0 → 藏 shoe[0]=♣A;剩 51 张轮流发(玩家偶数位、AI 奇数位)。
   *  推导:玩家开局弃 ♠+♦ 的 7 对后剩 12 张(♥2..♥Q、♣3..♣K,无对);
   *        AI 开局弃 ♠+♦ 的 6 对后剩 13 张(♥A..♥K 奇数、♣2..♣Q,无对);
   *        鬼牌 = ♣A 的同伴:♠A/♦A 已在开局弃掉,♥A 落在 AI 手里 = 唯一落单鬼牌。 */
  function oldmaidShoe(): Card[] {
    const shoe: Card[] = [card(1, 3)];
    for (let suit = 0; suit <= 2; suit++) {
      for (let rank = 1; rank <= 13; rank++) shoe.push(card(rank, suit));
    }
    for (let rank = 2; rank <= 13; rank++) shoe.push(card(rank, 3));
    return shoe;
  }

  it('抽鬼牌:开局藏一张、发完 51 张,双方弃初始对,玩家先抽', async () => {
    rigTable({ shoe: oldmaidShoe() });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    const snap = await act(world, 'newgame', { game: 'oldmaid' });
    expect(snap.game).toBe('oldmaid');
    expect(snap.playerHandCount).toBe(12);
    expect(snap.aiHandCount).toBe(13);
    expect(snap.discardPairs).toBe(13);
    expect(snap.turnOwner).toBe('player');
    expect(snap.oldmaid).toBeUndefined(); // 进行中不下发 oldmaid 子对象,更不泄藏牌
    await world.stop();
  });

  it('抽鬼牌:玩家按 index 指定位置抽牌,成对即弃', async () => {
    rigTable({ shoe: oldmaidShoe() });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'oldmaid' });
    // AI 手牌弃对重组后为 [♣2,♣4,♣6,♣8,♣10,♣Q,♥A,♥3,♥5,♥7,♥9,♥J,♥K],index 5 = ♣Q;
    // 玩家手里有 ♥Q,抽到即成对弃掉
    const snap = await act(world, 'draw', { index: 5 });
    expect(snap.playerHandCount).toBe(11); // 12 + 1 - 2
    expect(snap.aiHandCount).toBe(12);
    expect(snap.discardPairs).toBe(14);
    expect(snap.turnOwner).toBe('ai');
    await world.stop();
  });

  it('抽鬼牌:index 越界会被拒绝', async () => {
    rigTable({ shoe: oldmaidShoe() });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'oldmaid' });
    await expect(act(world, 'draw', { index: 99 })).rejects.toThrow('index 要在 0 到 12 之间');
    await expect(act(world, 'draw', { index: -1 })).rejects.toThrow('index 要在 0 到 12 之间');
    await world.stop();
  });

  it('抽鬼牌:AI 抽牌经工具,双方抽到同点即成对弃,轮回玩家', async () => {
    rigTable({ shoe: oldmaidShoe() });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'oldmaid' });
    // 玩家 index 0 抽走 ♣2,与手里 ♥2 成对弃掉
    await act(world, 'draw', { index: 0 });
    const receipt = await tool(world, 'oldmaid_draw', {});
    expect(receipt.length).toBeGreaterThan(0);
    const snap = await omState(world);
    // rng=0:AI 抽玩家手里第一张 ♥4(弃对重组后玩家首张);AI 手里有 ♣4,抽到即成对弃掉
    expect(snap.playerHandCount).toBe(10); // 12 +♣2 -♥2♣2对 -♥4 被抽走
    expect(snap.aiHandCount).toBe(11); // 13 -♣2 +♥4 -♣4♥4对
    expect(snap.discardPairs).toBe(15); // 13 初始 + ♥2/♣2 + ♥4/♣4
    expect(snap.turnOwner).toBe('player');
    await world.stop();
  });

  it('抽鬼牌:终局判定——先空手的赢,藏牌亮出,输家手里剩同点鬼牌', async () => {
    // 手工摆残局:玩家 ♠5+♠K,AI ♥K,藏牌 ♥5;玩家抽走 ♥K 与 ♠K 成对弃,玩家恰剩 ♠5(鬼牌),AI 空手赢。
    rigTable({
      game: 'oldmaid',
      oldmaid: { aiHand: [card(13, 1)], playerHand: [card(5, 0), card(13, 0)], turnOwner: 'player', hiddenCard: card(5, 1) },
    });
    const world = worldWith(zeroRng);
    const host = new FakeHost();
    await world.start(host);
    const snap = await act(world, 'draw');
    expect(snap.oldmaid!.winner).toBe('ai');
    expect(snap.oldmaid!.score).toEqual({ ai: 1, player: 0 });
    expect(snap.oldmaid!.hiddenCard).toBe('♥5');
    const result = host.events.find((e) => e.type === 'oldmaid.result');
    expect(result!.text).toContain('藏起来的牌是 ♥5');
    expect(result!.text).toContain('♠5');
    await world.stop();
  });

  it('抽鬼牌:局结束后自动回空桌,可再开新局', async () => {
    rigTable({
      game: 'oldmaid',
      oldmaid: { aiHand: [card(13, 1)], playerHand: [card(5, 0), card(13, 0)], turnOwner: 'player', hiddenCard: card(5, 1) },
      shoe: oldmaidShoe(), // 新局走 rig 牌靴:zeroRng 的"洗牌"是循环移位,空靴会发出全员成对的退化局面
    });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    let snap = await act(world, 'draw');
    expect(snap.oldmaid!.winner).toBe('ai');
    snap = await act(world, 'newgame', { game: 'oldmaid' });
    expect(snap.game).toBe('oldmaid');
    expect(typeof snap.discardPairs).toBe('number');
    await world.stop();
  });

  // ── 通用 ──

  it('称呼与桌宠配置对齐:desktop-pet.user 设为主人时,事件与回执用主人', async () => {
    const deploymentDir = join(scratchDir, 'deployment');
    mkdirSync(deploymentDir, { recursive: true });
    writeFileSync(join(deploymentDir, 'config.json'), JSON.stringify({ language: 'zh', worlds: { 'desktop-pet': { user: '主人' } } }), 'utf8');
    const world = worldWith(zeroRng);
    const host = new FakeHost();
    await world.start(host);
    await act(world, 'newgame', { game: 'blackjack', dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    const actionText = (host.events.filter((e) => e.type === 'casino.action'))[0]!.text;
    expect(actionText).toContain('主人下注 50');
    await world.stop();
  });

  it('部署语言 en:回执与状态走英文表', async () => {
    const deploymentDir = join(scratchDir, 'deployment');
    mkdirSync(deploymentDir, { recursive: true });
    writeFileSync(join(deploymentDir, 'config.json'), JSON.stringify({ language: 'en' }), 'utf8');
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    const status = await tool(world, 'casino_bank', { action: 'status' });
    expect(status).toContain('Your balance: 1000');
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

  it('返回大厅:21 点进行中退出清桌,筹码无损', async () => {
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'blackjack', dealer: 'ai' });
    await act(world, 'bet', { amount: 50 });
    const snap = await act(world, 'leave');
    expect(snap.game).toBeNull();
    expect(snap.blackjack).toBeNull();
    expect(snap.player.chips).toBe(1000); // 下注不动筹码,弃手即无损
    expect(snap.ai.chips).toBe(1000);
    await world.stop();
  });

  it('返回大厅:抽鬼牌进行中退出,可再开新局', async () => {
    rigTable({ shoe: oldmaidShoe() });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'oldmaid' });
    const snap = await act(world, 'leave');
    expect(snap.game).toBeNull();
    await world.stop();
    // zeroRng 的洗牌是循环移位:重开前重 rig 并用新 world 读盘,才不退化成秒结束。
    rigTable({ shoe: oldmaidShoe() });
    const world2 = worldWith(zeroRng);
    await world2.start(new FakeHost());
    const snap2 = await act(world2, 'newgame', { game: 'oldmaid' });
    expect(snap2.game).toBe('oldmaid');
    await world2.stop();
  });

  it('返回大厅:庄家自动打牌期间拒绝退出,空桌退出幂等', async () => {
    // 不经 start(恢复流程会把 dealerActing 打完):直接注入庄家自动打牌中的状态。
    const world = worldWith(zeroRng);
    (world as unknown as { state: TableState }).state = {
      version: 1,
      game: 'blackjack',
      blackjack: {
        phase: 'playerActing', aiRole: 'player', round: 1, bet: 50, insurance: 0, insuranceOutcome: 'none',
        hands: [{ cards: [card(10, 0), card(9, 0)], bet: 50, doubled: false, stood: false, fromSplit: false, outcome: null }],
        activeHand: 0, dealerCards: [card(6, 1), card(7, 1)], holeRevealed: false, dealerActing: true, history: [],
      },
      oldmaid: null,
      holdem: null,
      ai: newSeat(1000),
      player: newSeat(1000),
      shoe: [],
      drawn: 0,
    };
    await expect(act(world, 'leave')).rejects.toThrow();

    const world2 = worldWith(zeroRng);
    await world2.start(new FakeHost());
    const snap = await act(world2, 'leave');
    expect(snap.game).toBeNull();
    await world2.stop();
  });

  // ── 德州扑克 ──

  it('德州:开新局等发牌;发手后自动下盲注,庄位先行动,快照不下发 AI 底牌', async () => {
    rigTable({});
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    const lobby = await act(world, 'newgame', { game: 'holdem' });
    expect(lobby.game).toBe('holdem');
    expect(lobby.phase).toBe('idle');
    expect(lobby.round).toBe(0);
    const snap = await act(world, 'deal');
    expect(snap.phase).toBe('preflop');
    expect(snap.round).toBe(1);
    // 第一手庄位在玩家:玩家小盲 5,AI 大盲 10;庄位先行动。
    expect(snap.button).toBe('player');
    expect(snap.toAct).toBe('player');
    expect(snap.pot).toBe(15);
    expect(snap.currentBet).toBe(10);
    expect(snap.playerCommitted).toBe(5);
    expect(snap.aiCommitted).toBe(10);
    expect(snap.community).toEqual([]);
    // 不泄底:AI 底牌只有张数,没有牌面。
    expect(snap.aiHoleCount).toBe(2);
    expect(snap.aiCards).toBeNull();
    expect(snap.playerCards!.length).toBe(2);
    await world.stop();
  });

  it('德州:翻牌前弃牌,对手收下底池(settle 一次性划账),庄位轮换', async () => {
    rigTable({});
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'holdem' });
    await act(world, 'deal');
    const snap = await act(world, 'fold');
    expect(snap.winner).toBe('ai');
    expect(snap.byFold).toBe(true);
    expect(snap.revealHole).toBe(false);
    // 玩家弃掉小盲 5:AI 净 +5,玩家净 -5。
    expect(snap.ai.chips).toBe(1005);
    expect(snap.player.chips).toBe(995);
    // 下一手庄位轮到 AI。
    expect(snap.button).toBe('ai');
    expect(snap.phase).toBe('idle');
    await world.stop();
  });

  it('德州:preflop check 非法(有注要跟);加注超过单街封顶被拒', async () => {
    rigTable({});
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'holdem' });
    await act(world, 'deal');
    await expect(act(world, 'check')).rejects.toThrow();
    await expect(act(world, 'raise', { amount: 300 })).rejects.toThrow();
    await expect(act(world, 'bet', { amount: 5 })).rejects.toThrow(); // bet 只在没人下注的街
    const still = await omState(world);
    expect(still.toAct).toBe('player');
    expect(still.pot).toBe(15);
    await world.stop();
  });

  it('德州:限注跟注打满四街,摊牌亮牌比牌,赢家收池', async () => {
    // 牌靴(庄位=玩家,发牌序:玩家/AI/玩家/AI → 翻 3 → 转 → 河):
    // 玩家 ♠A ♠K,AI ♥J ♥Q;公共牌 ♠2 ♠3 ♠4 ♠5 ♥9 → 玩家 A 高同花,玩家赢。
    // 预写路径要求整副 52 张:把用到的 9 张排前面,其余牌补在后面。
    const used: Card[] = [
      card(1, 0), card(11, 1), card(13, 0), card(12, 1),
      card(2, 0), card(3, 0), card(4, 0), card(5, 0), card(9, 1),
    ];
    const rest: Card[] = [];
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 1; rank <= 13; rank++) {
        if (!used.some((c) => c.rank === rank && c.suit === suit)) rest.push(card(rank, suit));
      }
    }
    rigTable({ game: 'holdem', shoe: [...used, ...rest] });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    let snap = await act(world, 'deal');
    expect(snap.toAct).toBe('player');
    // 翻牌前:玩家跟注补齐 10,AI 有选择权过牌。
    snap = await act(world, 'call');
    expect(snap.toAct).toBe('ai');
    expect(snap.community).toEqual([]);
    // AI 过牌 → 翻牌(3 张)→ AI(非庄位)先行动。
    const aiCheck1 = await tool(world, 'holdem_act', { action: 'check' });
    expect(aiCheck1).toBeTruthy();
    snap = await omState(world);
    expect(snap.phase).toBe('flop');
    expect(snap.community!.length).toBe(3);
    expect(snap.toAct).toBe('ai');
    // AI 下注 20,玩家跟注,AI 过牌 → 转牌;双方过牌 → 河牌;双方过牌 → 摊牌。
    await tool(world, 'holdem_act', { action: 'bet', amount: 20 });
    snap = await omState(world);
    expect(snap.toAct).toBe('player');
    expect(snap.currentBet).toBe(20);
    snap = await act(world, 'call');
    expect(snap.toAct).toBe('ai');
    expect(snap.phase).toBe('turn');
    await tool(world, 'holdem_act', { action: 'check' });
    snap = await act(world, 'check');
    expect(snap.phase).toBe('river');
    expect(snap.community!.length).toBe(5);
    await tool(world, 'holdem_act', { action: 'check' });
    snap = await act(world, 'check');
    expect(snap.winner).toBe('player');
    expect(snap.revealHole).toBe(true);
    expect(snap.aiCards!.length).toBe(2);
    // 底池 60(双方各投 30):玩家 +30,AI -30。
    expect(snap.player.chips).toBe(1030);
    expect(snap.ai.chips).toBe(970);
    expect(snap.lastHoldem!.by).toBe('showdown');
    expect(snap.lastHoldem!.pot).toBe(60);
    await world.stop();
  });

  it('德州:AI 回合工具弃牌,玩家收池;回执非空', async () => {
    rigTable({});
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'newgame', { game: 'holdem' });
    await act(world, 'deal');
    await act(world, 'fold'); // 玩家弃 → AI 赢;庄位轮到 AI。
    const snap = await act(world, 'deal');
    expect(snap.button).toBe('ai');
    expect(snap.toAct).toBe('ai');
    // 还没轮到 AI 之外的人:玩家动作被拒。
    await expect(act(world, 'check')).rejects.toThrow();
    const receipt = await tool(world, 'holdem_act', { action: 'fold' });
    expect(receipt.length).toBeGreaterThan(0);
    const done = await omState(world);
    expect(done.winner).toBe('player');
    // AI 是小盲弃 5,玩家净 +5:回到 1000/1000。
    expect(done.ai.chips).toBe(1000);
    expect(done.player.chips).toBe(1000);
    await world.stop();
  });

  it('德州:双方短筹码盲注全押,公共牌最大牌双方同牌,平分底池(未跟注部分留在原主)', async () => {
    // 牌靴:发牌序(庄位=玩家=小盲):玩家 ♦4 ♣5,AI ♥2 ♦3;公共牌 ♠A ♥K ♦Q ♣J ♥10。
    // 双方都只能用公共牌的 A-K-Q-J-10 顺子 → 平分。玩家小盲全押 5,AI 大盲全押 8:
    // AI 多出的 3 无人能跟,留在原主;成交池 = 2×5 = 10,平分双方净 0 → 筹码 8/5 不变。
    const used: Card[] = [
      card(4, 2), card(2, 1), card(5, 3), card(3, 2),
      card(1, 0), card(13, 1), card(12, 2), card(11, 3), card(10, 1),
    ];
    const rest: Card[] = [];
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 1; rank <= 13; rank++) {
        if (!used.some((c) => c.rank === rank && c.suit === suit)) rest.push(card(rank, suit));
      }
    }
    rigTable({ game: 'holdem', shoe: [...used, ...rest], aiChips: 8, playerChips: 5 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'deal'); // 双方盲注阶段即全押,自动发完公共牌摊牌
    const snap = await omState(world);
    expect(snap.winner).toBe('split');
    expect(snap.lastHoldem!.pot).toBe(10);
    expect(snap.ai.chips).toBe(8);
    expect(snap.player.chips).toBe(5);
    await world.stop();
  });

  it('德州:单街封顶后不能常规加注(报错如实说明),底池只显示已成交部分', async () => {
    rigTable({ game: 'holdem' }); // 默认 1000/1000,庄位=玩家
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'deal');
    // 翻牌前:玩家直接加注到封顶 200,AI 跟注 → 翻牌。
    await act(world, 'raise', { amount: 200 });
    await tool(world, 'holdem_act', { action: 'call' });
    let snap = await omState(world);
    expect(snap.phase).toBe('flop');
    expect(snap.pot).toBe(400);
    // 翻牌:AI 过牌(非庄位先手),玩家下注 200(封顶)。
    await tool(world, 'holdem_act', { action: 'check' });
    snap = await omState(world);
    expect(snap.toAct).toBe('player');
    await act(world, 'bet', { amount: 200 });
    snap = await omState(world);
    // 总投入 600,其中 200 未跟注 → 底池显示 400(未跟注部分不进已成交池)。
    expect(snap.pot).toBe(400);
    expect(snap.currentBet).toBe(200);
    // 封顶死局:常规加注非法(最小加注 400 > 封顶 200),面板动作被拒。
    await expect(act(world, 'raise', { amount: 300 })).rejects.toThrow();
    await expect(act(world, 'raise', { amount: 400 })).rejects.toThrow();
    // AI 只能跟注 → 转牌,底池 800(四笔 200 全部成交),现注清零。
    await tool(world, 'holdem_act', { action: 'call' });
    snap = await omState(world);
    expect(snap.phase).toBe('turn');
    expect(snap.currentBet).toBe(0);
    expect(snap.pot).toBe(800);
    await world.stop();
  });

  it('德州:全押跟注不足额时,赢家只净得已成交部分,未跟注超出部分留在下注方', async () => {
    // 玩家(庄位)320 筹码,翻牌前加注到封顶 200;AI 只有 120,全押跟注不足额(成交 120)。
    // 牌:AI ♠A ♠K,玩家 ♥2 ♦3,公共牌 ♠Q ♠J ♠9 ♦5 ♣4 → AI 黑桃同花胜。
    // 成交池 = 2×120 = 240:AI +120(120→240),玩家 -120(320→200);玩家未跟的 80 不动。
    const used: Card[] = [
      card(2, 1), card(1, 0), card(3, 2), card(13, 0),
      card(12, 0), card(11, 0), card(9, 0), card(5, 2), card(4, 3),
    ];
    const rest: Card[] = [];
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 1; rank <= 13; rank++) {
        if (!used.some((c) => c.rank === rank && c.suit === suit)) rest.push(card(rank, suit));
      }
    }
    rigTable({ game: 'holdem', shoe: [...used, ...rest], aiChips: 120, playerChips: 320 });
    const world = worldWith(zeroRng);
    await world.start(new FakeHost());
    await act(world, 'deal');
    await act(world, 'raise', { amount: 200 }); // 玩家加注到封顶
    await tool(world, 'holdem_act', { action: 'call' }); // AI 全押跟注(不足额,110 补到 120)
    const snap = await omState(world);
    expect(snap.winner).toBe('ai');
    expect(snap.lastHoldem!.pot).toBe(240);
    expect(snap.ai.chips).toBe(240);
    expect(snap.player.chips).toBe(200);
    await world.stop();
  });

  it('德州:牌力评估(同花>葫芦、轮子顺子、7 选 5)', () => {
    // A 高同花 vs 葫芦:同花赢。
    const flush = bestPokerHand([card(1, 0), card(13, 0), card(12, 0), card(5, 0), card(3, 0), card(9, 2), card(9, 3)]);
    expect(flush.rank.cat).toBe(5);
    // 轮子:A-2-3-4-5 是顺子(顶张 5)。
    const wheel = bestPokerHand([card(1, 0), card(2, 1), card(3, 2), card(4, 3), card(5, 1), card(13, 2), card(12, 3)]);
    expect(wheel.rank.cat).toBe(4);
    expect(wheel.rank.keys[0]).toBe(5);
    // 两对 + 踢脚:比较取高对在前。
    const twoPair = bestPokerHand([card(13, 0), card(13, 1), card(9, 2), card(9, 3), card(5, 0), card(6, 1), card(7, 2)]);
    expect(twoPair.rank.cat).toBe(2);
    expect(twoPair.rank.keys).toEqual([13, 9, 7]);
    // 四条 vs 葫芦。
    const quads = bestPokerHand([card(9, 0), card(9, 1), card(9, 2), card(9, 3), card(5, 0), card(5, 1), card(6, 2)]);
    const boat = bestPokerHand([card(13, 0), card(13, 1), card(13, 2), card(5, 0), card(5, 1), card(2, 2), card(3, 3)]);
    expect(comparePokerHands(quads.rank, boat.rank)).toBeGreaterThan(0);
  });

  it('主动邀约:开启且空桌挂载时发 casino.invite;进行中对局或默认关闭时不发', async () => {
    // 默认关:不发。
    const off = worldWith(zeroRng);
    const offHost = new FakeHost();
    await off.start(offHost);
    expect(offHost.events.some((e) => e.type === 'casino.invite')).toBe(false);
    await off.stop();

    // 开 + 空桌:发。
    const on = worldWith(zeroRng, { proactiveInvite: true });
    const onHost = new FakeHost();
    await on.start(onHost);
    const invite = onHost.events.find((e) => e.type === 'casino.invite');
    expect(invite).toBeDefined();
    expect(invite!.text).toContain('月下牌桌');
    expect(onHost.pushOpts.at(-1)?.trigger).toBe('flush');
    await on.stop();

    // 开但对局进行中:不发(不催)。
    rigTable({ game: 'blackjack' });
    const busy = worldWith(zeroRng, { proactiveInvite: true });
    const busyHost = new FakeHost();
    await busy.start(busyHost);
    expect(busyHost.events.some((e) => e.type === 'casino.invite')).toBe(false);
    await busy.stop();
  });
});
