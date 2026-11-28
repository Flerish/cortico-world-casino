/** 联机花札引擎测试:注入固定牌序(原序 48 张),覆盖发牌/轮流/配对/pick/决策/结算/流局。 */
import { describe, it, expect } from 'vitest';
import { freshHanafudaDeck } from '../src/hanafuda.ts';
import { RemoteHanafuda } from '../src/remote-hanafuda.ts';
import { parseOnlineMessage } from '../src/online-protocol.ts';

/** 原序 48 张(1月[光,短,粕,粕]、2月[种,短,粕,粕]…8月[光,种,粕,粕]、12月[光,粕,粕,粕]):注入后不洗牌。 */
const fixedDeck = () => freshHanafudaDeck();

function newEngine(sevenDouble = true): RemoteHanafuda {
  return new RemoteHanafuda({ bankChips: 1000, playerChips: 1000, sevenDouble, deck: fixedDeck() });
}

describe('联机花札:发牌与轮换', () => {
  it('startHand:庄 8 / 客 8 / 场 8 / 山 24,客座先手(首局)', () => {
    const e = newEngine();
    e.startHand();
    const st = e.state!;
    expect(st.bankHand.length).toBe(8);
    expect(st.playerHand.length).toBe(8);
    expect(st.field.length).toBe(8);
    expect(st.deck.length).toBe(24);
    expect(st.turn).toBe('player');
    expect(st.phase).toBe('play');
    expect(st.done).toBe(false);
    expect(e.phase).toBe('player');
  });

  it('打无配对的牌留场、翻山札留场、换庄家;庄家自动回合推进到客座', () => {
    const e = newEngine();
    e.startHand();
    // 客座打 3♠(index 0):场无 3 月 → 留场;翻山札末张 Q♣ 留场 → 换庄
    e.playerPlay(0);
    expect(e.state!.turn).toBe('bank');
    expect(e.state!.field.filter((f) => f.rank === 3).length).toBe(1);
    expect(e.state!.field.some((f) => f.rank === 12)).toBe(true);
    // 庄家自动回合:打一张 + 翻一张 → 轮回客座
    e.bankRunTurn();
    expect(e.state!.turn).toBe('player');
    expect(e.state!.done).toBe(false);
  });

  it('打出配场牌即收走(进收集区)', () => {
    const e = newEngine();
    e.startHand();
    e.playerPlay(0); // 3♠ 留场,Q♣ 留场,换庄
    e.bankRunTurn();
    // 手牌现在 [3♦,3♣,3♣,4♥,4♦,4♣,4♣]:打 index 0(3♦)配场上的 3♠ → 收走(光 + 短册各 1)
    e.playerPlay(0);
    expect(e.state!.playerCollect.light.length).toBe(1);
    expect(e.state!.playerCollect.tan.length).toBe(1);
    expect(e.state!.playerHand.length).toBe(6);
    e.bankRunTurn();
    expect(e.state!.turn).toBe('player');
  });
});

describe('联机花札:决策与结算', () => {
  /** 摆"差一张 3♦ 即赤短"的残局:客座收集 [1♦,2♦]、手牌 [3♦]、场牌 [3♣](打出即配对凑齐)。 */
  function akatanPending(sevenDouble = true): RemoteHanafuda {
    const e = newEngine(sevenDouble);
    e.startHand();
    const st = e.state!;
    st.playerCollect.tan = [{ rank: 1, suit: 3, id: 0 }, { rank: 2, suit: 3, id: 0 }];
    st.playerHand = [{ rank: 3, suit: 3, id: 0 }];
    st.field = [{ rank: 3, suit: 2, id: 0 }];
    st.deck = [{ rank: 4, suit: 2, id: 0 }];
    st.bankHand = [{ rank: 5, suit: 2, id: 0 }];
    return e;
  }

  it('打出促成赤短 → decide;客座 yame → 划筹码 5 文', () => {
    const e = akatanPending();
    e.playerPlay(0);
    expect(e.state!.phase).toBe('decide');
    expect(e.state!.turn).toBe('player');
    e.playerYame();
    expect(e.state!.done).toBe(true);
    expect(e.state!.winner).toBe('player');
    expect(e.chips.player).toBe(1005);
    expect(e.chips.bank).toBe(995);
    const settle = e.settleParts()!;
    expect(settle.some((p) => p.startsWith('result=player'))).toBe(true);
    expect(settle.some((p) => p.startsWith('score=5'))).toBe(true);
  });

  it('koikoi 继续:标记后换庄;庄家再收手时客座分翻倍划转', () => {
    const e = akatanPending();
    e.playerPlay(0);
    e.playerKoikoi();
    expect(e.state!.playerKoikoi).toBe(true);
    expect(e.state!.turn).toBe('bank');
    // 庄家自动回合 + 摆三光残局让庄家成役收手:役分 6 文,客座喊过 koikoi → ×2 = 12
    const st = e.state!;
    st.bankCollect.light = [{ rank: 1, suit: 0, id: 0 }, { rank: 3, suit: 0, id: 0 }];
    st.bankHand = [{ rank: 8, suit: 0, id: 0 }];
    st.field = [{ rank: 8, suit: 2, id: 0 }];
    e.bankRunTurn();
    expect(e.state!.phase).toBe('decide');
    expect(e.state!.turn).toBe('bank');
    e.bankDecide(false); // 收手
    expect(e.state!.done).toBe(true);
    expect(e.state!.winner).toBe('bank');
    expect(e.chips.bank).toBe(1012);
    expect(e.chips.player).toBe(988);
  });

  it('七文翻倍:四光 8 分收手 → 16 文(按役分判定)', () => {
    const e = newEngine(true);
    e.startHand();
    const st = e.state!;
    st.playerCollect.light = [{ rank: 1, suit: 0, id: 0 }, { rank: 3, suit: 0, id: 0 }, { rank: 8, suit: 0, id: 0 }];
    st.playerHand = [{ rank: 12, suit: 0, id: 0 }];
    st.field = [{ rank: 12, suit: 2, id: 0 }];
    st.deck = [{ rank: 4, suit: 2, id: 0 }];
    st.bankHand = [{ rank: 5, suit: 2, id: 0 }];
    e.playerPlay(0);
    expect(e.state!.phase).toBe('decide');
    e.playerYame();
    expect(e.chips.player).toBe(1016); // 四光 8 ≥7 → ×2
  });

  it('流局:双方手牌与山札打空 → done/winner=draw,筹码不动', () => {
    const e = newEngine();
    e.startHand();
    const st = e.state!;
    st.playerHand = [{ rank: 1, suit: 2, id: 9 }];
    st.bankHand = [{ rank: 2, suit: 2, id: 9 }];
    st.field = [];
    st.deck = [];
    e.playerPlay(0);
    e.bankRunTurn();
    expect(e.state!.done).toBe(true);
    expect(e.state!.winner).toBe('draw');
    expect(e.chips.player).toBe(1000);
    expect(e.chips.bank).toBe(1000);
    const settle = e.settleParts()!;
    expect(settle.some((p) => p.startsWith('result=push'))).toBe(true);
  });
});

describe('联机花札:协议视图', () => {
  it('decide 阶段的 stateParts:newYaku 经 URI 编码,协议行不含裸空格(役名带空格曾把整条 state 打成非法=决策卡死)', () => {
    const e = newEngine();
    e.startHand();
    // 直接注入成役态:走公开 API 太依赖牌序,这里用引擎内部状态模拟(仅测试可见)。
    const st = e.state!;
    st.phase = 'decide';
    st.newYaku = ['赤短 5文', '流局牌 1文'];
    const line = '@casino state ' + e.stateParts().join(' ');
    expect(line).not.toContain('赤短 5文'); // 空格必须已被编码
    const msg = parseOnlineMessage(line);
    if (!msg) throw new Error('decide state 消息被解析器丢弃(修复前的回归)');
    expect(decodeURIComponent(msg.kv.newYaku)).toBe('赤短 5文·流局牌 1文');
  });

  it('残局:一方手牌先空而山札有牌 → 换手时自动补一张,不卡死', () => {
    const e = newEngine();
    e.startHand();
    const st = e.state!;
    st.playerHand.length = 0; // 客座手牌打光,山札还有牌
    st.turn = 'bank'; // 先把回合交给庄家(开局默认客座先手)
    e.bankRunTurn(); // 庄家自动打完这一回合 → finishTurn 轮到空手的客座
    if (!st.done && st.phase !== 'decide' && !st.pickOwner) {
      expect(st.playerHand.length).toBeGreaterThanOrEqual(1); // 空手方从山札补了牌(修复前恒为 0=无牌可打死循环)
      expect(st.turn).toBe('player');
    }
  });

  it('stateParts 含 turn/stage/yourHand/field/score;牌名与本地映射一致', () => {
    const e = newEngine();
    e.startHand();
    const parts = e.stateParts();
    const kv = Object.fromEntries(parts.map((p) => { const eq = p.indexOf('='); return [p.slice(0, eq), p.slice(eq + 1)]; }));
    expect(kv.turn).toBe('you');
    expect(kv.stage).toBe('play');
    expect(kv.yourHand.split(',').length).toBe(8);
    expect(kv.field.split(',').length).toBe(8);
    expect(kv.deck).toBe('24');
    expect(kv.myScore).toBe('0');
    expect(kv.myCollect).toBe('none');
    expect(kv.pick).toBeUndefined();
  });

  it('pick 待选时 stateParts 带 pick=2;decide 时带 decide=1', () => {
    const e = newEngine();
    e.startHand();
    const st = e.state!;
    st.playerHand = [{ rank: 1, suit: 0, id: 0 }];
    st.field = [{ rank: 1, suit: 2, id: 0 }, { rank: 1, suit: 2, id: 1 }];
    st.deck = [{ rank: 5, suit: 2, id: 0 }];
    st.bankHand = [{ rank: 2, suit: 2, id: 0 }];
    e.playerPlay(0);
    let kv = Object.fromEntries(e.stateParts().map((p) => { const eq = p.indexOf('='); return [p.slice(0, eq), p.slice(eq + 1)]; }));
    expect(kv.pick).toBe('2');
    e.playerPick(0);
    kv = Object.fromEntries(e.stateParts().map((p) => { const eq = p.indexOf('='); return [p.slice(0, eq), p.slice(eq + 1)]; }));
    expect(kv.pick).toBeUndefined();
    expect(kv.turn).toBe('bank');
  });

  it('handDetail 汇总张数;先后手逐局轮换', () => {
    const e = newEngine();
    e.startHand();
    expect(e.handDetail()).toContain('庄家 8 张');
    // 收手一局后:handsPlayed=1 → 下一局庄家先手
    const st = e.state!;
    st.playerHand = [{ rank: 1, suit: 2, id: 9 }];
    st.bankHand = [{ rank: 2, suit: 2, id: 9 }];
    st.field = [];
    st.deck = [];
    e.playerPlay(0);
    e.bankRunTurn();
    expect(e.state!.done).toBe(true);
    e.startHand();
    expect(e.state!.turn).toBe('bank');
  });
});
