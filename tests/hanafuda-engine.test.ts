/** 花札单机引擎测试:开局发牌、回合流转、场牌选择、こいこい/收手、流局、整场与挂起续局。
 *  直接操纵 world.state 摆已知残局(参照 552 行 dealerActing 测试的注入先例)。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { CASINO } from '../src/definition.ts';
import { CasinoWorld } from '../src/world.ts';
import { CASINO_DEFAULTS } from '../src/config.ts';
import { newSeat, type HanafudaState, type TableState } from '../src/table.ts';
import { HANAFUDA_LIGHT, HANAFUDA_TANE, HANAFUDA_KASU, HANAFUDA_TAN, hanafudaAiPlay, hanafudaAiPick, hanafudaAiKoikoi, type HanaCard } from '../src/hanafuda.ts';
import { FakeHost } from './helpers/fake-host.ts';

const CALL = {} as ToolCallContext;
const zeroRng = () => 0;

let scratchDir: string;
beforeEach(() => { scratchDir = mkdtempSync(join(tmpdir(), 'hanafuda-engine-')); });
afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

function worldWith(rng?: () => number, cfgPatch: Partial<typeof CASINO_DEFAULTS> = {}): CasinoWorld {
  const ctx = fakeWorldContext(CASINO, { scratchDir });
  Object.assign(ctx.cfg, { dealDelayMs: 0, ...cfgPatch });
  return new CasinoWorld({ cfg: ctx.cfg, timezone: 'Asia/Shanghai', dataDir: ctx.dataDir, botDir: ctx.botDir, rng });
}

/** c(1,'L') = 1♠ 光牌;kind: L 光 / T 种 / N 短册 / K 粕;id 自动按同类同月递增。 */
function c(rank: number, kind: 'L' | 'T' | 'N' | 'K', id = 0): HanaCard {
  const suit = kind === 'L' ? HANAFUDA_LIGHT : kind === 'T' ? HANAFUDA_TANE : kind === 'N' ? HANAFUDA_TAN : HANAFUDA_KASU;
  return { rank, suit, id };
}

function hanafudaOf(world: CasinoWorld): HanafudaState {
  return (world as unknown as { state: TableState }).state.hanafuda!;
}

async function setupWorld(rng?: () => number, cfgPatch: Partial<typeof CASINO_DEFAULTS> = {}): Promise<{ world: CasinoWorld; host: FakeHost }> {
  const world = worldWith(rng, cfgPatch);
  const host = new FakeHost();
  await world.start(host);
  await world.webUi().invoke!('table', 'action', [{ action: 'newgame', game: 'hanafuda' }]);
  return { world, host };
}

/** AI 工具动作(hanafuda_act):AI 回合必须走工具,与面板玩家动作分开。 */
async function aiAct(world: CasinoWorld, args: Record<string, unknown>): Promise<string> {
  const def = world.tools().find((t) => t.name === 'hanafuda_act')!;
  return String(await def.handler(args, CALL));
}

async function snapOf(world: CasinoWorld): Promise<Record<string, unknown>> {
  return (await world.webUi().invoke!('table', 'state', [])) as Record<string, unknown>;
}

describe('花札:开局发牌', () => {
  it('newgame 后 8 手 / 8 场 / 24 山,首局玩家先手', async () => {
    const { world } = await setupWorld(zeroRng);
    const snap = await snapOf(world);
    expect(snap.game).toBe('hanafuda');
    expect((snap.handCards as unknown[]).length).toBe(8);
    expect(snap.aiHandCount).toBe(8);
    expect((snap.fieldCards as unknown[]).length).toBe(8);
    expect(snap.deckCount).toBe(24);
    expect(snap.turnOwner).toBe('player');
    expect(snap.phase).toBe('playHand');
    await world.stop();
  });

  it('第 2 局 AI 先手(每局轮换)', async () => {
    const { world } = await setupWorld(zeroRng);
    const h = hanafudaOf(world);
    // 双方各 1 张、无山札无场:玩家打完换手,AI 经工具打完 → 双方空 → 流局 → 第 2 局发牌
    h.playerHand = [c(1, 'K')];
    h.aiHand = [c(2, 'K')];
    h.field = [];
    h.deck = [];
    await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }]);
    await aiAct(world, { action: 'play', index: 0 });
    const snap = await snapOf(world);
    expect(h.round).toBe(2);
    expect(snap.turnOwner).toBe('ai'); // 第 2 局 AI 先手
    await world.stop();
  });
});

describe('花札:回合与配对', () => {
  it('打出配场牌即收走;翻山札无配对留场;回合换对方', async () => {
    const { world } = await setupWorld(zeroRng);
    const h = hanafudaOf(world);
    h.playerHand = [c(1, 'N'), c(2, 'K')];
    h.field = [c(1, 'K')];
    h.deck = [c(3, 'K')];
    h.aiHand = [c(2, 'K', 1)];
    const snap = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }])) as Record<string, unknown>;
    // 打 1♦(松短册)收场 1♣;翻 3♣ 留场 → 换 AI
    expect(snap.turnOwner).toBe('ai');
    expect((snap.playerCollect as { tan: unknown[] }).tan.length).toBe(1);
    expect((snap.playerCollect as { kasu: unknown[] }).kasu.length).toBe(1);
    expect((snap.fieldCards as Array<{ r: number }>).map((x) => x.r)).toEqual([3]);
    await world.stop();
  });

  it('场同月 2 张触发 pick:选收哪张,另一张留场,选完继续翻山札', async () => {
    const { world } = await setupWorld(zeroRng);
    const h = hanafudaOf(world);
    h.playerHand = [c(1, 'L')];
    h.field = [c(1, 'K', 0), c(1, 'K', 1)];
    h.deck = [c(5, 'K')];
    h.aiHand = [c(2, 'K')];
    let snap = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }])) as Record<string, unknown>;
    expect(snap.pickOwner).toBe('player');
    expect(h.pendingCard).toEqual(c(1, 'L'));
    // pick 前打牌会被拒
    await expect(world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }])).rejects.toThrow();
    snap = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPick', index: 0 }])) as Record<string, unknown>;
    // 收 A♣#0 + A♠;留 A♣#1;翻 5♣ 留场 → 换 AI
    expect(snap.pickOwner).toBeNull();
    expect((snap.playerCollect as { light: unknown[] }).light.length).toBe(1);
    expect((snap.fieldCards as Array<{ r: number; s: number }>).map((x) => `${x.r}/${x.s}`)).toEqual(['1/2', '5/2']);
    expect(snap.turnOwner).toBe('ai');
    await world.stop();
  });

  it('index 越界被拒绝', async () => {
    const { world } = await setupWorld(zeroRng);
    await expect(world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 99 }])).rejects.toThrow();
    await expect(world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: -1 }])).rejects.toThrow();
    await world.stop();
  });
});

describe('花札:役决策与结算', () => {
  /** 把玩家收集区摆成"差一张 3♦ 即赤短"的残局,手牌 3♦、场牌 3♣(打出即配对收走凑齐)。 */
  async function setupAkatanPending(): Promise<{ world: CasinoWorld; host: FakeHost }> {
    const { world, host } = await setupWorld(zeroRng);
    const h = hanafudaOf(world);
    h.playerCollect.tan = [c(1, 'N'), c(2, 'N')];
    h.playerHand = [c(3, 'N')];
    h.field = [c(3, 'K')];
    h.deck = [c(4, 'K')];
    h.aiHand = [c(5, 'K')];
    return { world, host };
  }

  it('打出促成赤短 → decide;stop 划筹码 + 记累计文 + 进第 2 局', async () => {
    const { world } = await setupAkatanPending();
    let snap = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }])) as Record<string, unknown>;
    expect(snap.phase).toBe('decide');
    expect(snap.newYaku).toEqual(['赤短 5文']);
    snap = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaStop' }])) as Record<string, unknown>;
    // 赤短 5 分(短册 3 张,无加笔);对方没喊 koikoi,不满 7 文 → 5 文划转
    expect((snap.player as { chips: number }).chips).toBe(1005);
    expect((snap.ai as { chips: number }).chips).toBe(995);
    expect((snap.matchScores as { player: number }).player).toBe(5);
    expect(snap.round).toBe(2);
    expect(snap.matchOver).toBe(false);
    await world.stop();
  });

  it('koikoi 继续:记标记换手;对方收手时分数翻倍', async () => {
    const { world } = await setupAkatanPending();
    await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }]);
    let snap = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaKoikoi' }])) as Record<string, unknown>;
    expect((snap.playerKoikoi as boolean)).toBe(true);
    expect(snap.turnOwner).toBe('ai');
    // AI 收集区摆成差一张 8♠ 即三光的残局,场牌 8♣ 让打出配对收走;AI stop → 6 分,玩家喊过 koikoi → ×2
    const h = hanafudaOf(world);
    h.aiCollect.light = [c(1, 'L'), c(3, 'L')];
    h.aiHand = [c(8, 'L')];
    h.field = [c(8, 'K')];
    snap = (await aiAct(world, { action: 'play', index: 0 }).then(() => snapOf(world))) as Record<string, unknown>;
    expect(snap.phase).toBe('decide');
    snap = (await aiAct(world, { action: 'stop' }).then(() => snapOf(world))) as Record<string, unknown>;
    expect((snap.ai as { chips: number }).chips).toBe(1000 + 12);
    expect((snap.player as { chips: number }).chips).toBe(1000 - 12);
    await world.stop();
  });

  it('七文翻倍:四光 8 分收手 → ≥7 ×2 = 16 划转', async () => {
    const { world } = await setupWorld(zeroRng, { hanafudaSevenDouble: true });
    const h = hanafudaOf(world);
    // 摆三光残局,场牌 Q♣ 让玩家打出 Q♠(桐凰)配对收走 → 四光 8 分 ≥7 → ×2 = 16
    h.playerCollect.light = [c(1, 'L'), c(3, 'L'), c(8, 'L')];
    h.playerHand = [c(12, 'L')];
    h.field = [c(12, 'K')];
    h.deck = [c(4, 'K')];
    h.aiHand = [c(5, 'K')];
    const snap = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }])) as Record<string, unknown>;
    expect(snap.phase).toBe('decide');
    const stopped = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaStop' }])) as Record<string, unknown>;
    expect((stopped.player as { chips: number }).chips).toBe(1016);
    await world.stop();
  });

  it('流局:双方手牌与山札打空无人成役 → 0 文进下一局', async () => {
    const { world } = await setupWorld(zeroRng);
    const h = hanafudaOf(world);
    h.playerHand = [c(1, 'K')];
    h.aiHand = [c(2, 'K')];
    h.field = [];
    h.deck = [];
    await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }]);
    await aiAct(world, { action: 'play', index: 0 });
    // 玩家打完(山札空)→ 换手 AI → AI 打完 → 双方空 → 流局 → 第 2 局
    expect(h.round).toBe(2);
    expect(h.matchScores.ai).toBe(0);
    expect(h.matchScores.player).toBe(0);
    expect(h.winner).toBeNull(); // 新一局已发牌,无胜者
    await world.stop();
  });
});

describe('花札:整场与挂起', () => {
  it('单局制(hanafudaRounds=1)收手后整场结束,againHanafuda 重开重置筹码', async () => {
    const { world } = await setupWorld(zeroRng, { hanafudaRounds: 1 });
    const h = hanafudaOf(world);
    h.playerCollect.tan = [c(1, 'N'), c(2, 'N')];
    h.playerHand = [c(3, 'N')];
    h.field = [c(3, 'K')];
    h.deck = [c(4, 'K')];
    h.aiHand = [c(5, 'K')];
    await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }]);
    const snap = (await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaStop' }])) as Record<string, unknown>;
    expect(snap.matchOver).toBe(true);
    expect(snap.finalWinner).toBe('player');
    // 筹码改变后再来一场:重置回 1000
    const again = (await world.webUi().invoke!('table', 'action', [{ action: 'againHanafuda' }])) as Record<string, unknown>;
    expect(again.matchOver).toBe(false);
    expect((again.player as { chips: number }).chips).toBe(1000);
    expect(again.round).toBe(1);
    await world.stop();
  });

  it('挂起与续局:leave 后进挂起列表,resume 恢复原局面', async () => {
    const { world } = await setupWorld(zeroRng);
    const h = hanafudaOf(world);
    h.playerHand = [c(1, 'L')];
    h.field = [c(1, 'K', 0), c(1, 'K', 1)];
    h.deck = [c(5, 'K')];
    h.aiHand = [c(2, 'K')];
    await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPlay', index: 0 }]);
    await world.webUi().invoke!('table', 'action', [{ action: 'hanafudaPick', index: 0 }]);
    const snapLeave = (await world.webUi().invoke!('table', 'action', [{ action: 'leave' }])) as Record<string, unknown>;
    expect(snapLeave.game).toBeNull();
    // 挂起列表(casino_table 空桌分支)——直接验证状态
    const st = (world as unknown as { state: TableState }).state;
    expect(st.hanafuda).not.toBeNull();
    expect(st.game).toBeNull();
    const snapResume = (await world.webUi().invoke!('table', 'action', [{ action: 'resume', game: 'hanafuda' }])) as Record<string, unknown>;
    expect(snapResume.game).toBe('hanafuda');
    expect(snapResume.turnOwner).toBe('ai'); // 玩家打完并 pick 完,轮到 AI
    await world.stop();
  });
});

describe('花札 AI 决策纯函数', () => {
  it('hanafudaAiPlay:有配对优先选高价值;无配对先丢粕', () => {
    const hand = [c(1, 'K'), c(2, 'T'), c(3, 'L')];
    const field = [c(3, 'K'), c(2, 'K')];
    // 2♥ 配 2♣(种 3 分)vs 3♠ 配 3♣(光 4 分)→ 选 3♠(index 2)
    expect(hanafudaAiPlay(hand, field)).toBe(2);
    const noMatch = hanafudaAiPlay([c(1, 'T'), c(2, 'N'), c(3, 'K')], [c(9, 'K')]);
    expect(noMatch).toBe(2); // 无配对:先丢粕
  });

  it('hanafudaAiPick:两张同月收类别价值高的', () => {
    expect(hanafudaAiPick([c(1, 'K'), c(1, 'L')])).toBe(1);
    expect(hanafudaAiPick([c(1, 'L'), c(1, 'K')])).toBe(0);
  });

  it('hanafudaAiKoikoi:不落后且 ≥4 文继续;落后收手', () => {
    expect(hanafudaAiKoikoi(5, 3)).toBe(true);
    expect(hanafudaAiKoikoi(4, 4)).toBe(true);
    expect(hanafudaAiKoikoi(2, 6)).toBe(false);
    expect(hanafudaAiKoikoi(0, 0)).toBe(false);
  });
});
