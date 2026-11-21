/**
 * 月下牌桌的面板:棋牌游戏布局。绿呢桌面 + CSS 扑克牌面(手绘素材)+ 筹码 + 按阶段启用的按钮。
 * 对 cortico/* 只允许 import type;运行时值由包自带(装载器规范)。
 */
import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import cardFaceUrl from './assets/card-face.jpg';
import cardBackUrl from './assets/card-back.jpg';

interface SeatView {
  chips: number;
  wins: number;
  losses: number;
  pushes: number;
  net: number;
  bankruptcies: number;
  role: 'dealer' | 'player' | null;
}

interface HandView {
  cards: string[];
  total: number | null;
  bet: number;
  doubled: boolean;
  outcome: string | null;
  active: boolean;
  fromSplit: boolean;
}

interface HandRecordView {
  dealer: 'ai' | 'player';
  round: number;
  bet: number;
  hands: Array<{ cards: string[]; bet: number; outcome: string }>;
  dealerCards: string[];
  insurance: number;
  insuranceWon: boolean;
  delta: number;
  surrendered: boolean;
  at: string;
}

interface Snapshot {
  version: number;
  phase: 'idle' | 'betting' | 'insurance' | 'playerActing';
  round: number;
  aiRole: 'dealer' | 'player' | null;
  bet: number;
  insurance: number;
  holeRevealed: boolean;
  hands: HandView[];
  activeHand: number;
  dealerCards: string[];
  dealerVisibleTotal: number | null;
  dealerTotal: number | null;
  holeCount: number;
  ai: SeatView;
  player: SeatView;
  minBet: number;
  maxBet: number;
  startChips: number;
  dealerHitsSoft17: boolean;
  lastResult: HandRecordView | null;
  history: HandRecordView[];
}

const OUTCOME_ZH: Record<string, string> = {
  win: '赢',
  lose: '输',
  push: '平',
  blackjack: '黑杰克',
  bust: '爆牌',
  surrender: '投降',
};

const ROLE_ZH: Record<string, string> = { dealer: '庄家', player: '闲家' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 一张扑克牌:text 形如 ♠K;hidden 时画手绘牌背。亮牌 = 模板图 + 角标与中央花色叠加。 */
function imgEl(url: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = url;
  img.className = 'cardimg';
  img.draggable = false;
  return img;
}

const SUIT_TONE: Record<string, string> = { '♠': 'idx-black', '♣': 'idx-black', '♥': 'idx-red', '♦': 'idx-red' };

function cardEl(text: string, hidden = false): HTMLElement {
  const card = el('div', 'pcard');
  if (hidden) {
    card.append(imgEl(cardBackUrl));
    return card;
  }
  card.append(imgEl(cardFaceUrl));
  const suit = text.slice(0, 1);
  const rank = text.slice(1);
  const tone = SUIT_TONE[suit] ?? 'idx-black';
  const corner = el('div', `idx ${tone}`);
  corner.append(el('div', 'idx-rank', rank), el('div', 'idx-suit', suit));
  const cornerFlip = el('div', `idx idx-flip ${tone}`);
  cornerFlip.append(el('div', 'idx-rank', rank), el('div', 'idx-suit', suit));
  card.append(corner, cornerFlip, el('div', `pip ${tone}`, suit));
  return card;
}

function chipsEl(label: string, amount: number, tone: string): HTMLElement {
  const box = el('div', 'chipbox');
  if (label) box.append(el('span', 'chipbox-label', label));
  box.append(el('div', `chip chip-${tone}`, String(amount)));
  return box;
}

function statLine(seat: SeatView): string {
  return `${seat.wins}胜 ${seat.losses}负 ${seat.pushes}平 · 净${seat.net >= 0 ? '+' : ''}${seat.net}`;
}

function outcomePill(outcome: string): HTMLElement {
  return el('span', `outcome-pill ${outcome}`, OUTCOME_ZH[outcome] ?? outcome);
}

function showError(ctx: WebUiPanelContext, message: string): void {
  const box = ctx.root.querySelector('[data-error]');
  if (box) box.textContent = message;
}

async function send(ctx: WebUiPanelContext, action: string, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    const state = await ctx.invoke<Snapshot>('action', [{ action, ...extra }]);
    render(ctx, state);
  } catch (err) {
    showError(ctx, err instanceof Error ? err.message : String(err));
  }
}

/** 界面本地状态:下注输入与历史折叠;换手时下注清零。 */
const ui = { bet: 0, historyOpen: false };

function resultBanner(state: Snapshot): HTMLElement | null {
  const last = state.lastResult;
  if (!last || state.phase !== 'idle') return null;
  const playerDelta = last.dealer === 'ai' ? last.delta : -last.delta;
  const banner = el('div', `banner ${last.surrendered ? 'lose' : playerDelta > 0 ? 'win' : playerDelta === 0 ? 'push' : 'lose'}`);
  const mainOutcome = last.hands.length > 1
    ? (playerDelta > 0 ? 'win' : playerDelta < 0 ? 'lose' : 'push')
    : last.hands[0]?.outcome ?? 'push';
  const pill = outcomePill(mainOutcome);
  const handsText = last.hands
    .map((h) => `${h.cards.join(' ')}(${OUTCOME_ZH[h.outcome] ?? h.outcome})`)
    .join(' / ');
  const insText = last.insurance > 0 ? ` · 保险 ${last.insurance}${last.insuranceWon ? '赢' : '输'}` : '';
  const text = el('span', 'banner-text', `第 ${last.round} 手 · 押 ${last.bet}${insText} · 闲 ${handsText} 对 庄 ${last.dealerCards.join(' ')}`);
  const delta = el('span', `delta ${playerDelta >= 0 ? 'up' : 'down'}`, `${playerDelta >= 0 ? '+' : ''}${playerDelta}`);
  banner.append(pill, text, delta);
  return banner;
}

function render(ctx: WebUiPanelContext, state: Snapshot): void {
  if (state.phase !== 'betting') ui.bet = 0;
  const root = ctx.root;
  root.replaceChildren();

  const style = el('style');
  style.textContent = `
    .casino-wrap { max-width: 560px; margin: 0 auto; }
    .casino-topbar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; }
    .casino-title { font-weight: 700; font-size: 15px; }
    .casino-round { opacity: .7; font-size: 12px; }
    .felt { border-radius: 16px; border: 7px solid #4a3220; background:
      radial-gradient(ellipse at 50% 38%, #208652 0%, #14603a 55%, #0c4527 100%);
      box-shadow: inset 0 0 46px rgba(0,0,0,.5), 0 3px 10px rgba(0,0,0,.25);
      padding: 14px 14px 12px; color: #f4efe2; }
    .seat { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .seat-head { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .seat-role { background: rgba(0,0,0,.32); padding: 1px 9px; border-radius: 999px; font-size: 11px; }
    .seatstats { font-size: 11px; opacity: .7; }
    .hands { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .hand { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 5px 7px;
      border-radius: 8px; border: 1px solid transparent; }
    .hand.active { border-color: rgba(244,239,226,.65); background: rgba(0,0,0,.18); }
    .cards { display: flex; gap: 7px; min-height: 80px; align-items: center; }
    .pcard { width: 52px; height: 73px; border-radius: 6px; position: relative; flex: none; overflow: hidden;
      background: #14120d; box-shadow: 0 2px 5px rgba(0,0,0,.45); }
    .cardimg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; display: block; }
    .idx { position: absolute; top: 3px; left: 5px; line-height: 1; text-align: center;
      text-shadow: 0 1px 0 rgba(255,255,255,.45); }
    .idx-flip { top: auto; left: auto; bottom: 3px; right: 5px; transform: rotate(180deg); }
    .idx-rank { font-size: 13px; font-weight: 800; font-family: Georgia, 'Times New Roman', serif; }
    .idx-suit { font-size: 10px; }
    .idx-black { color: #1d2f55; } .idx-red { color: #a52a35; }
    .pip { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 28px; text-shadow: 0 1px 0 rgba(255,255,255,.45); }
    .total-pill { background: rgba(0,0,0,.34); border-radius: 999px; padding: 2px 12px; font-size: 12px; }
    .pot { display: flex; justify-content: center; margin: 10px 0; }
    .pot-inner { background: rgba(0,0,0,.30); border: 1px dashed rgba(244,239,226,.45); border-radius: 12px;
      padding: 5px 20px; font-size: 12px; text-align: center; }
    .pot-num { font-size: 17px; font-weight: 700; }
    .banner { border-radius: 10px; padding: 8px 12px; margin: 10px 0; font-size: 13px; display: flex;
      justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .banner.win { background: #16452c; color: #9fe6bd; border: 1px solid #2c7a4b; }
    .banner.lose { background: #4d1f28; color: #f0b9c4; border: 1px solid #a33848; }
    .banner.push { background: #3c3a30; color: #e6dfc8; border: 1px solid #77735f; }
    .banner.wait { background: #27354d; color: #bcd0f0; border: 1px solid #46618f; }
    .banner-text { flex: 1 1 auto; }
    .outcome-pill { border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 700; flex: none; }
    .outcome-pill.win, .outcome-pill.blackjack { background: #2c7a4b; color: #fff; }
    .outcome-pill.lose, .outcome-pill.bust { background: #a33848; color: #fff; }
    .outcome-pill.push { background: #77735f; color: #fff; }
    .outcome-pill.surrender { background: #4a4438; color: #fff; }
    .delta { font-weight: 700; flex: none; }
    .delta.up { color: #9fe6bd; } .delta.down { color: #f0b9c4; }
    .btnrow { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .btnrow button { flex: 1 1 100px; padding: 10px 6px; font-size: 14px; border-radius: 9px;
      border: 1px solid rgba(0,0,0,.25); background: #efe9d8; cursor: pointer; font-weight: 600; }
    .btnrow button:disabled { opacity: .45; cursor: default; }
    .btnrow button.primary { background: #c8a44a; color: #26200e; }
    .btnrow button.danger { background: #b34355; color: #fff; }
    .betbuild { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
    .betview { font-size: 14px; font-weight: 700; padding: 6px 14px; border-radius: 999px;
      background: rgba(0,0,0,.3); color: #f4efe2; }
    .betbuild .chip { cursor: pointer; }
    .chip { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px;
      border-radius: 999px; font-size: 11px; font-weight: 800; color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,.4), inset 0 0 0 3px rgba(255,255,255,.35); }
    .chipbox { text-align: center; font-size: 11px; }
    .chipbox-label { display: block; margin-bottom: 3px; opacity: .85; }
    .chip.chip-red { background: #b34355; } .chip.chip-blue { background: #3565a8; } .chip.chip-gold { background: #c8a44a; }
    .chip.chip-green { background: #2c7a4b; } .chip.chip-black { background: #2a2822; }
    .history { margin-top: 12px; }
    .history-toggle { background: none; border: none; cursor: pointer; font-size: 13px; opacity: .75; padding: 2px 0; }
    .history-line { display: flex; gap: 8px; font-size: 12px; padding: 3px 0; flex-wrap: wrap; align-items: center; }
    .history-cards { letter-spacing: 1px; opacity: .85; }
    .hidden { display: none; }
    .casino-error { color: #c0506a; font-size: 12px; min-height: 15px; margin-top: 6px; }
  `;
  root.append(style);

  const wrap = el('div', 'casino-wrap');
  root.append(wrap);

  // ── 顶栏 ──
  const topbar = el('div', 'casino-topbar');
  topbar.append(el('span', 'casino-title', '月下牌桌'));
  const roleText = state.aiRole === null
    ? '还没开局'
    : state.aiRole === 'dealer' ? 'AI 坐庄 · 你是闲家' : '你坐庄(按规则自动打)· AI 是闲家';
  topbar.append(el('span', 'casino-round', `${state.round > 0 ? `第 ${state.round} 手 · ` : ''}${roleText} · ${state.dealerHitsSoft17 ? 'H17' : 'S17'}`));
  wrap.append(topbar);

  // ── 绿呢桌面 ──
  const felt = el('div', 'felt');
  wrap.append(felt);

  const dealerIsAi = state.aiRole !== 'player';
  const dealerSeatView = state.aiRole === 'player' ? state.player : state.ai;
  const playerSeatView = state.aiRole === 'player' ? state.ai : state.player;
  const dealerRole = state.aiRole === null ? null : 'dealer';
  const playerRole = state.aiRole === null ? null : state.aiRole === 'dealer' ? 'player' : 'dealer';

  // 庄家席(上)
  const dealerSeat = el('div', 'seat');
  const dealerHead = el('div', 'seat-head');
  dealerHead.append(el('span', undefined, dealerIsAi ? 'AI' : '我'));
  if (dealerRole) dealerHead.append(el('span', 'seat-role', ROLE_ZH[dealerRole]!));
  dealerSeat.append(dealerHead);
  const dealerCards = el('div', 'cards');
  if (state.phase !== 'idle' && state.dealerCards.length === 0) dealerCards.append(cardEl('', true));
  for (const text of state.dealerCards) dealerCards.append(cardEl(text));
  for (let i = 0; i < state.holeCount; i++) dealerCards.append(cardEl('', true));
  if (state.phase === 'idle' && state.round === 0) dealerCards.append(el('span', 'seatstats', '庄家按固定规则自动打'));
  dealerSeat.append(dealerCards);
  if (state.holeRevealed && state.dealerTotal !== null) {
    dealerSeat.append(el('div', 'total-pill', `庄家 ${state.dealerTotal} 点`));
  } else if (state.dealerVisibleTotal !== null) {
    dealerSeat.append(el('div', 'total-pill', `庄家明牌 ${state.dealerVisibleTotal} 点${state.holeCount > 0 ? ' +1 暗牌' : ''}`));
  }
  const dealerFoot = el('div', 'seat-head');
  dealerFoot.append(chipsEl('银行', dealerSeatView.chips, dealerIsAi ? 'chip-blue' : 'chip-gold'));
  dealerFoot.append(el('span', 'seatstats', statLine(dealerSeatView)));
  dealerSeat.append(dealerFoot);
  felt.append(dealerSeat);

  // 中间:押注
  const pot = el('div', 'pot');
  const potInner = el('div', 'pot-inner');
  if (state.phase === 'idle') {
    potInner.append(el('div', undefined, state.round > 0 ? '一手已结,选庄再开' : '选庄开局'));
    potInner.append(el('div', 'pot-num', `各 ${state.minBet} 起押`));
  } else {
    potInner.append(el('div', undefined, `本手底注${state.insurance > 0 ? ` · 保险 ${state.insurance}` : ''}`));
    potInner.append(el('div', 'pot-num', String(state.bet)));
  }
  pot.append(potInner);
  felt.append(pot);

  // 闲家席(下):分牌后多手并排
  const playerSeat = el('div', 'seat');
  const playerHead = el('div', 'seat-head');
  playerHead.append(el('span', undefined, dealerIsAi ? '我' : 'AI'));
  if (playerRole) playerHead.append(el('span', 'seat-role', ROLE_ZH[playerRole]!));
  playerSeat.append(playerHead);
  const handsWrap = el('div', 'hands');
  if (state.phase !== 'idle' && state.hands.length === 0) {
    const single = el('div', 'hand');
    const cards = el('div', 'cards');
    cards.append(cardEl('', true));
    single.append(cards);
    handsWrap.append(single);
  }
  if (state.phase === 'idle' && state.round === 0) {
    const single = el('div', 'hand');
    single.append(el('span', 'seatstats', '闲家先行动;坐庄按固定规则自动打'));
    handsWrap.append(single);
  }
  for (const hand of state.hands) {
    const box = el('div', `hand${hand.active ? ' active' : ''}`);
    const cards = el('div', 'cards');
    for (const text of hand.cards) cards.append(cardEl(text));
    box.append(cards);
    box.append(el('div', 'total-pill', `${hand.total ?? ''} 点 · 押 ${hand.bet}${hand.doubled ? '(加倍)' : ''}`));
    if (hand.outcome) box.append(outcomePill(hand.outcome));
    handsWrap.append(box);
  }
  playerSeat.append(handsWrap);
  const playerFoot = el('div', 'seat-head');
  playerFoot.append(chipsEl('筹码', playerSeatView.chips, dealerIsAi ? 'chip-gold' : 'chip-blue'));
  playerFoot.append(el('span', 'seatstats', statLine(playerSeatView)));
  playerSeat.append(playerFoot);
  felt.append(playerSeat);

  // ── 结果横幅(结算后)──
  const bannerBox = el('div');
  wrap.append(bannerBox);
  const banner = resultBanner(state);
  if (banner) bannerBox.append(banner);

  // ── 等待 AI 的横幅 ──
  const waitingAi =
    (state.phase === 'betting' || state.phase === 'insurance') && state.aiRole === 'player';
  if (waitingAi) {
    const wait = el('div', 'banner wait');
    wait.append(el('span', 'banner-text', state.phase === 'betting' ? '等 AI 下注…(它已收到通知)' : '等 AI 决定保险…(它已收到通知)'));
    const nudge = el('button', undefined, '催一下');
    nudge.type = 'button';
    nudge.addEventListener('click', () => void send(ctx, 'nudge'), { signal: ctx.signal });
    wait.append(nudge);
    bannerBox.append(wait);
  }

  const playerIsIdler = state.aiRole === 'dealer';
  const playerBroke = state.player.chips < state.minBet && state.phase === 'idle';

  // ── 按阶段给操作 ──
  if (state.phase === 'idle') {
    const row = el('div', 'btnrow');
    const aiDealer = el('button', 'primary', '让 AI 坐庄');
    aiDealer.type = 'button';
    aiDealer.addEventListener('click', () => void send(ctx, 'newgame', { dealer: 'ai' }), { signal: ctx.signal });
    const meDealer = el('button', undefined, '我坐庄');
    meDealer.type = 'button';
    meDealer.addEventListener('click', () => void send(ctx, 'newgame', { dealer: 'player' }), { signal: ctx.signal });
    row.append(aiDealer, meDealer);
    wrap.append(row);
    if (playerBroke) {
      const relief = el('div', 'broke');
      relief.append(el('span', undefined, `你的筹码只剩 ${state.player.chips},低于最小注 ${state.minBet}。`));
      const btn = el('button', 'danger', `领救济(重置 ${state.startChips})`);
      btn.type = 'button';
      btn.addEventListener('click', () => void send(ctx, 'relief'), { signal: ctx.signal });
      relief.append(btn);
      wrap.append(relief);
    }
  } else if (state.phase === 'betting' && playerIsIdler) {
    const cap = Math.min(state.maxBet, state.player.chips, state.ai.chips);
    ui.bet = Math.min(ui.bet, cap);
    const build = el('div', 'betbuild');
    const view = el('span', 'betview', `押 ${ui.bet}`);
    const clear = el('button', undefined, '清零');
    clear.type = 'button';
    const go = el('button', 'primary', `下注开局(上限 ${cap})`);
    go.type = 'button';
    // 按钮/筹码的可点状态跟着注额走:加注即亮,不依赖下一次重渲染。
    const sync = (): void => {
      view.textContent = `押 ${ui.bet}`;
      clear.disabled = ui.bet === 0;
      go.disabled = ui.bet < state.minBet;
    };
    const add = (n: number): void => {
      ui.bet = Math.min(cap, ui.bet + n);
      sync();
    };
    for (const [label, n, tone] of [['+10', 10, 'red'], ['+50', 50, 'green'], ['+100', 100, 'black']] as const) {
      const chip = el('div', `chip chip-${tone}`, label);
      chip.addEventListener('click', () => add(n), { signal: ctx.signal });
      build.append(chip);
    }
    const allin = el('div', 'chip chip-gold', '全押');
    allin.addEventListener('click', () => {
      ui.bet = cap;
      sync();
    }, { signal: ctx.signal });
    build.append(allin, view);
    wrap.append(build);
    const row = el('div', 'btnrow');
    clear.addEventListener('click', () => {
      ui.bet = 0;
      sync();
    }, { signal: ctx.signal });
    go.addEventListener('click', () => void send(ctx, 'bet', { amount: ui.bet }), { signal: ctx.signal });
    row.append(clear, go);
    wrap.append(row);
  } else if (state.phase === 'betting') {
    const banner2 = el('div', 'banner wait');
    banner2.append(el('span', 'banner-text', '等 AI 下注…'));
    wrap.append(banner2);
  } else if (state.phase === 'insurance' && playerIsIdler) {
    const maxIns = Math.floor(state.bet / 2);
    const banner2 = el('div', 'banner wait');
    banner2.append(el('span', 'banner-text', `庄家亮 A:买保险吗?最多 ${maxIns},庄家黑杰克按 2:1 赔。`));
    wrap.append(banner2);
    const row = el('div', 'btnrow');
    const decline = el('button', undefined, '不买');
    decline.type = 'button';
    decline.addEventListener('click', () => void send(ctx, 'insurance', { amount: 0 }), { signal: ctx.signal });
    const buy = el('button', 'primary', `买保险 ${maxIns}`);
    buy.type = 'button';
    buy.disabled = maxIns <= 0;
    buy.addEventListener('click', () => void send(ctx, 'insurance', { amount: maxIns }), { signal: ctx.signal });
    row.append(decline, buy);
    wrap.append(row);
  } else if (state.phase === 'insurance') {
    const banner2 = el('div', 'banner wait');
    banner2.append(el('span', 'banner-text', '等 AI 决定保险…'));
    wrap.append(banner2);
  } else if (state.phase === 'playerActing' && playerIsIdler) {
    const active = state.hands[state.activeHand];
    const singleFresh = state.hands.length === 1 && (active?.cards.length ?? 0) === 2;
    const canSplit = singleFresh
      && active!.cards.length === 2
      && active!.cards[0]!.slice(1) === active!.cards[1]!.slice(1);
    const row = el('div', 'btnrow');
    const hit = el('button', 'primary', '要牌');
    hit.type = 'button';
    const stand = el('button', undefined, '停牌');
    stand.type = 'button';
    const dbl = el('button', undefined, '加倍');
    dbl.type = 'button';
    dbl.disabled = (active?.cards.length ?? 0) !== 2;
    const split = el('button', undefined, '分牌');
    split.type = 'button';
    split.disabled = !canSplit;
    const surrender = el('button', 'danger', '投降');
    surrender.type = 'button';
    surrender.disabled = !singleFresh;
    hit.addEventListener('click', () => void send(ctx, 'hit'), { signal: ctx.signal });
    stand.addEventListener('click', () => void send(ctx, 'stand'), { signal: ctx.signal });
    dbl.addEventListener('click', () => void send(ctx, 'double'), { signal: ctx.signal });
    split.addEventListener('click', () => void send(ctx, 'split'), { signal: ctx.signal });
    surrender.addEventListener('click', () => void send(ctx, 'surrender'), { signal: ctx.signal });
    row.append(hit, stand, dbl, split, surrender);
    wrap.append(row);
  } else if (state.phase === 'playerActing') {
    const banner2 = el('div', 'banner wait');
    banner2.append(el('span', 'banner-text', 'AI 出牌中…'));
    wrap.append(banner2);
  }

  // ── 历史 ──
  const history = el('div', 'history');
  const toggle = el('button', 'history-toggle', `${ui.historyOpen ? '▾' : '▸'} 历史(${state.history.length})`);
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    ui.historyOpen = !ui.historyOpen;
    toggle.textContent = `${ui.historyOpen ? '▾' : '▸'} 历史(${state.history.length})`;
    list.classList.toggle('hidden', !ui.historyOpen);
  }, { signal: ctx.signal });
  history.append(toggle);
  const list = el('div');
  list.classList.toggle('hidden', !ui.historyOpen);
  for (const record of state.history) {
    const line = el('div', 'history-line');
    line.append(el('span', undefined, `第${record.round}手 庄:${record.dealer === 'ai' ? 'AI' : '我'} 押 ${record.bet}`));
    const handsText = record.hands.map((h) => `${h.cards.join(' ')}(${OUTCOME_ZH[h.outcome] ?? h.outcome})`).join(' / ');
    line.append(el('span', 'history-cards', `闲 ${handsText} 对 庄 ${record.dealerCards.join(' ')}`));
    if (record.insurance > 0) {
      line.append(el('span', undefined, `保险 ${record.insurance}${record.insuranceWon ? '赢' : '输'}`));
    }
    const playerDelta = record.dealer === 'ai' ? record.delta : -record.delta;
    line.append(el('span', `delta ${playerDelta >= 0 ? 'up' : 'down'}`, `${playerDelta >= 0 ? '+' : ''}${playerDelta}`));
    list.append(line);
  }
  history.append(list);
  wrap.append(history);

  // ── 错误条 ──
  wrap.append(el('div', 'casino-error'));
}

export default {
  panels: {
    table: {
      async mount(ctx: WebUiPanelContext): Promise<void> {
        ctx.stream({
          message: (text) => {
            try {
              render(ctx, JSON.parse(text) as Snapshot);
            } catch {
              // 坏帧忽略;以下一次推送为准。
            }
          },
        });
        try {
          render(ctx, await ctx.invoke<Snapshot>('state'));
        } catch (err) {
          const box = el('div', 'casino-error', err instanceof Error ? err.message : String(err));
          ctx.root.append(box);
        }
      },
    },
  },
};
