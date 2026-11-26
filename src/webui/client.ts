/**
 * 月下牌桌的面板:棋牌游戏布局。绿呢桌面 + CSS 扑克牌面(手绘素材)+ 筹码 + 按阶段启用的按钮。
 * 文字按浏览器语言(ctx.language)出中英两份,见 webui/strings.ts。
 * 对 cortico/* 只允许 import type;运行时值由包自带(装载器规范)。
 */
import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import cardFaceUrl from './assets/card-face.jpg';
import cardBackUrl from './assets/card-back.jpg';
import { panelText, type PanelText } from './strings.ts';

interface SeatView {
  chips: number;
  wins: number;
  losses: number;
  pushes: number;
  net: number;
  bankruptcies: number;
}

interface HandView {
  cards: string[];
  total: number | null;
  bet: number;
  doubled: boolean;
  outcome: string | null;
  active: boolean;
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

interface MatchView {
  at: string;
  rounds: number;
  aiChips: number;
  playerChips: number;
  aiNet: number;
  playerNet: number;
  winner: 'ai' | 'player' | 'tie';
}

interface Snapshot {
  version: number;
  spectate?: boolean;
  game: 'blackjack' | 'oldmaid' | 'holdem' | null;
  /** 有未完对局的游戏(打开时面板弹「继续/重新开始」)。 */
  pausedGames?: Array<'blackjack' | 'oldmaid' | 'holdem'>;
  /** 各游戏自己的筹码(筹码按游戏分开计)。 */
  gameChips?: Partial<Record<'blackjack' | 'holdem', { ai: number; player: number }>>;
  ai: SeatView;
  player: SeatView;
  minBet: number;
  maxBet: number;
  startChips: number;
  dealerHitsSoft17: boolean;
  matches: MatchView[];
  // ── 21 点(game==='blackjack') ──
  phase?: 'betting' | 'insurance' | 'playerActing';
  round?: number;
  aiRole?: 'dealer' | 'player';
  bet?: number;
  insurance?: number;
  holeRevealed?: boolean;
  dealerActing?: boolean;
  hands?: HandView[];
  activeHand?: number;
  dealerCards?: string[];
  dealerVisibleTotal?: number | null;
  dealerTotal?: number | null;
  holeCount?: number;
  lastResult?: HandRecordView | null;
  history?: HandRecordView[];
  // ── 抽鬼牌(game==='oldmaid' 或刚结束) ──
  turnOwner?: 'ai' | 'player';
  winner?: 'ai' | 'player' | null;
  playerCards?: string[];
  playerHandCount?: number;
  aiHandCount?: number;
  discardPairs?: number;
  lastDiscards?: string[][];
  score?: { ai: number; player: number };
  /** 「再来一局」计数(牌动画 key 用)。 */
  oldmaidPlays?: number;
  /** 终局才亮:开局藏起来的那张牌(进行中不下发)。 */
  hiddenCard?: string | null;
  oldmaidHistory?: Array<{ at: string; draws: number; discardPairs: number; hidden?: string; winner: string }>;
  // ── 德州扑克(game==='holdem') ──
  button?: 'ai' | 'player';
  toAct?: 'ai' | 'player' | null;
  revealHole?: boolean;
  byFold?: boolean;
  blinds?: { sb: number; bb: number };
  streetCap?: number;
  currentBet?: number;
  minRaise?: number;
  pot?: number;
  community?: string[];
  aiCards?: string[] | null;
  aiHoleCount?: number;
  aiCommitted?: number;
  playerCommitted?: number;
  aiFolded?: boolean;
  playerFolded?: boolean;
  aiAllIn?: boolean;
  playerAllIn?: boolean;
  lastHoldem?: HoldemRecordView | null;
  holdemHistory?: HoldemRecordView[];
}

interface HoldemRecordView {
  at: string;
  round: number;
  winner: 'ai' | 'player' | 'split';
  by: 'fold' | 'showdown';
  pot: number;
  delta: number;
  board: string[];
  playerHole: string[];
  aiHole: string[];
  aiMade?: string;
  playerMade?: string;
}

const SUIT_TONE: Record<string, string> = { '♠': 'idx-black', '♣': 'idx-black', '♥': 'idx-red', '♦': 'idx-red' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function imgEl(url: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = url;
  img.className = 'cardimg';
  img.draggable = false;
  return img;
}

function cardEl(text: string, hidden = false, anim?: { key: string; kind: 'deal' | 'flip' }): HTMLElement {
  const card = el('div', 'pcard');
  if (hidden) {
    if (anim && !seenCards.has(anim.key)) { card.classList.add(anim.kind === 'flip' ? 'flip-in' : 'deal-in'); seenCards.add(anim.key); }
    card.append(imgEl(cardBackUrl));
    return card;
  }
  if (anim && !seenCards.has(anim.key)) { card.classList.add(anim.kind === 'flip' ? 'flip-in' : 'deal-in'); seenCards.add(anim.key); }
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

/** 把金额拆成最少枚的筹码面额组合(100/50/10;不足 10 的零头收进一枚散筹)。 */
function chipBreakdown(amount: number): Array<{ v: number; tone: string }> {
  const out: Array<{ v: number; tone: string }> = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const [v, tone] of [[100, 'black'], [50, 'green'], [10, 'red']] as const) {
    while (rest >= v) { out.push({ v, tone }); rest -= v; }
  }
  if (rest > 0) out.push({ v: rest, tone: 'dark' });
  return out;
}

/** 场中的筹码堆:按面额叠成柱(一柱最多 8 枚,多了并排),牌桌视觉的核心。 */
function chipStackEl(amount: number): HTMLElement {
  const wrap = el('div', 'chipstack');
  const chips = chipBreakdown(amount);
  for (let col = 0; col < chips.length; col += 8) {
    const column = el('div', 'chipcol');
    for (const c of chips.slice(col, col + 8)) {
      const chip = el('div', `chip chip-${c.tone}`, String(c.v));
      chip.title = String(c.v);
      column.append(chip);
    }
    wrap.append(column);
  }
  return wrap;
}

/** 净盈亏的彩色小徽章(盈绿/亏红/平灰)。 */
function netBadge(net: number): HTMLElement {
  return el('span', `net-badge ${net > 0 ? 'up' : net < 0 ? 'down' : 'flat'}`, `${net >= 0 ? '+' : ''}${net}`);
}

/** 座位统计:胜/负/平 + 彩色净盈亏徽章(替代纯文本 statsLine)。 */
function statsEl(T: PanelText, seat: SeatView): HTMLElement {
  const span = el('span', 'seatstats');
  span.append(
    el('span', undefined, T.statsWLP(seat.wins, seat.losses, seat.pushes)),
    el('span', 'netwrap', `${T.netLabel} `),
    netBadge(seat.net),
  );
  return span;
}

/** 浮层的 Esc 关闭:每次渲染重建绑定,避免监听器堆积。 */
let escCleanup: (() => void) | null = null;
function bindEsc(close: () => void): void {
  escCleanup?.();
  const handler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', handler);
  escCleanup = (): void => document.removeEventListener('keydown', handler);
}

/** 已播过进场动画的牌(跨快照记忆,保证动画只播一次,不随重渲染重播)。 */
const seenCards = new Set<string>();
/** 21 点庄家暗牌上一帧是否已亮(检测"翻开"的那一帧,好播翻牌动效)。 */
let prevHoleRevealedBJ = false;

function outcomePill(T: PanelText, outcome: string): HTMLElement {
  return el('span', `outcome-pill ${outcome}`, T.outcome[outcome] ?? outcome);
}

function showError(ctx: WebUiPanelContext, message: string): void {
  const box = ctx.root.querySelector('[data-error]');
  if (box) box.textContent = message;
}

/** 观战视图:两位 AI 的 21 点牌局实况(庄家端权威明细 / 客座端状态缓存)。 */
function renderSpectate(card: HTMLElement, spec: Record<string, any>, T: PanelText): void {
  card.replaceChildren();
  const head = el('div', 'online-friends-title', T.online.spectateTitle);
  card.append(head);
  if (spec.state === 'idle') { card.append(el('div', 'lobby-empty', T.online.spectateIdle)); return; }
  const gameName = spec.game === 'blackjack' ? T.online.gameBlackjack : spec.game === 'oldmaid' ? T.online.gameOldmaid : T.online.gameHoldem;
  card.append(el('div', 'spec-sub', `${gameName} · ${T.online.handsLabel} ${spec.hands ?? 0} · ${T.online.chipsMe} ${spec.chipsMe ?? '?'} / ${T.online.chipsPeer} ${spec.chipsPeer ?? '?'}`));
  if (spec.resting) card.append(el('div', 'spec-rest', T.online.restHint));

  /** 牌面:♠♥♦♣ 着色。 */
  const cardEl = (c: string): HTMLElement => {
    const red = c.includes('♥') || c.includes('♦');
    return el('span', red ? 'spec-card spec-red' : 'spec-card', c);
  };
  const bankLabel = spec.iAmBank ? T.online.selfSide : spec.peer;
  card.append(el('div', 'spec-section', `${T.online.bankLabel}(${bankLabel})`));
  const dealerRow = el('div', 'spec-cards');
  const dealerCards: string[] = Array.isArray(spec.dealerCards) && spec.dealerCards.length ? spec.dealerCards : (spec.dealerUpCard ? [spec.dealerUpCard] : []);
  if (dealerCards.length) for (const c of dealerCards) dealerRow.append(cardEl(c));
  else dealerRow.append(el('span', 'spec-total', `${T.online.dealerUpLabel} ${spec.dealerUpTotal ?? '?'}`));
  card.append(dealerRow);

  const playerLabel = spec.iAmBank ? spec.peer : T.online.selfSide;
  card.append(el('div', 'spec-section', `${T.online.playerLabel}(${playerLabel})`));
  const playerRow = el('div', 'spec-cards');
  for (const c of (spec.playerCards ?? [])) playerRow.append(cardEl(c));
  if (!(spec.playerCards ?? []).length) playerRow.append(el('span', 'spec-total', `${T.online.totalLabel} ${spec.playerTotal ?? '?'}`));
  card.append(playerRow);
  card.append(el('div', 'spec-sub', `${T.online.betLabel} ${spec.bet ?? '—'}`));

  if (Array.isArray(spec.rows)) {
    for (const [label, value] of spec.rows as Array<[string, unknown]>) {
      card.append(el('div', 'spec-sub', `${label}: ${value}`));
    }
  }
  if (Array.isArray(spec.cardGroups)) {
    for (const g of spec.cardGroups as Array<{ label: string; cards: string[] }>) {
      card.append(el('div', 'spec-section', g.label));
      const row = el('div', 'spec-cards');
      for (const c of g.cards) row.append(cardEl(c));
      if (!g.cards.length) row.append(el('span', 'spec-total', T.online.spectateEmpty));
      card.append(row);
    }
  }
  const settle = spec.lastSettle;
  if (settle) {
    const reason = (() => { try { return decodeURIComponent(settle.reason ?? ''); } catch { return settle.reason ?? ''; } })();
    const win = settle.result === 'push' ? T.online.resultPush : settle.result === 'player' ? T.online.resultPlayer : T.online.resultBank;
    card.append(el('div', 'spec-result', `${T.online.lastResult} ${win} · ${reason}`));
  } else if (spec.phase === 'awaitBet') {
    card.append(el('div', 'spec-sub', T.online.phaseAwaitBet));
  }
}

async function send(ctx: WebUiPanelContext, T: PanelText, action: string, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    const state = await ctx.invoke<Snapshot>('action', [{ action, ...extra }]);
    render(ctx, state);
  } catch (err) {
    showError(ctx, err instanceof Error ? err.message : String(err));
  }
}

/** 界面本地状态:下注输入、折叠区、规则浮层、大厅搜索词与主菜单模式;换手时下注清零。 */
const ui = {
  bet: 0,
  historyOpen: false,
  rulesOpen: false,
  matchOpen: false,
  lobbyQuery: '',
  /** 空桌时主菜单停留在哪个视图;一进对局就重置回菜单(返回大厅先见模式选择)。 */
  lobbyMode: 'menu' as 'menu' | 'local' | 'online',
  /** 联机页 1s 状态轮询句柄;离开联机页即清除,避免后台消耗。 */
  onlineTimer: null as number | null,
  /** 观战模式:点左侧 AI 名字进入,看两位 AI 的牌局实况;再点返回好友列表。 */
  spectate: false,
};
/** 最近一次渲染的快照,规则浮层开合时用它重渲染。 */
let current: Snapshot | null = null;
/** 最近一次非观战的真实快照(观战退出时回到联机页用它重渲染)。 */
let lastRealSnapshot: Snapshot | null = null;
/** 观战横幅持久元素(1s 重渲染后重新贴回,退出按钮常驻可点)。 */
let spectateBarEl: HTMLElement | null = null;
/** 上一次观战快照的 JSON(无变化时跳过整页重渲染,防闪烁/防按钮被频繁重建)。 */
let lastSpectateJson = '';

function bjResultBanner(T: PanelText, state: Snapshot): HTMLElement | null {
  const last = state.lastResult;
  if (!last || state.phase !== 'betting') return null;
  const playerDelta = last.dealer === 'ai' ? last.delta : -last.delta;
  const banner = el('div', `banner ${last.surrendered ? 'lose' : playerDelta > 0 ? 'win' : playerDelta === 0 ? 'push' : 'lose'}`);
  const mainOutcome = last.hands.length > 1
    ? (playerDelta > 0 ? 'win' : playerDelta < 0 ? 'lose' : 'push')
    : last.hands[0]?.outcome ?? 'push';
  const pill = outcomePill(T, mainOutcome);
  const handsText = last.hands
    .map((h) => `${h.cards.join(' ')}(${T.outcome[h.outcome] ?? h.outcome})`)
    .join(' / ');
  const insText = last.insurance > 0 ? ` · ${T.chips} ${last.insurance}${last.insuranceWon ? ' ✓' : ' ✗'}` : '';
  const text = el('span', 'banner-text', `${T.roundLabel(last.round, '', '')} ${T.chips} ${last.bet}${insText} · ${handsText} vs ${last.dealerCards.join(' ')}`);
  const delta = el('span', `delta ${playerDelta >= 0 ? 'up' : 'down'}`, `${playerDelta >= 0 ? '+' : ''}${playerDelta}`);
  banner.append(pill, text, delta);
  return banner;
}

function render(ctx: WebUiPanelContext, state: Snapshot): void {
  current = state;
  if (!state.spectate) lastRealSnapshot = state;
  if (state.game !== 'blackjack' && state.game !== 'holdem') ui.bet = 0;
  const T = panelText(ctx.language);
  const root = ctx.root;
  root.replaceChildren();
  escCleanup?.();
  escCleanup = null;

  const style = el('style');
  style.textContent = `
    .casino-wrap { max-width: 560px; margin: 0 auto; position: relative; }
    .casino-topbar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; }
    .topbar-left { display: flex; align-items: center; gap: 8px; }
    .casino-title { font-weight: 700; font-size: 15px; }
    .casino-round { opacity: .7; font-size: 12px; }
    .rules-btn { border: 1px solid rgba(0,0,0,.25); background: #efe9d8; border-radius: 999px;
      padding: 3px 12px; font-size: 12px; cursor: pointer; font-weight: 600; flex: none;
      color: #26200e; }
    .rules-overlay { position: absolute; inset: 0; background: rgba(8,12,9,.74); z-index: 6;
      display: flex; align-items: flex-start; justify-content: center; padding: 16px; overflow: auto;
      border-radius: 12px; }
    .rules-card { background: #f7f3e6; color: #2c2820; border-radius: 12px; max-width: 470px; width: 100%;
      padding: 14px 18px 12px; font-size: 13px; line-height: 1.55; box-shadow: 0 6px 24px rgba(0,0,0,.5);
      max-height: calc(100% - 4px); overflow-y: auto; }
    .rules-card h4 { margin: 10px 0 4px; font-size: 13px; color: #8a3030; }
    .rules-card h4:first-child { margin-top: 2px; }
    .rules-card ul { margin: 2px 0 2px 18px; padding: 0; }
    .rules-card li { margin: 2px 0; }
    .rules-card p { margin: 4px 0; }
    .rules-close { margin-top: 10px; width: 100%; padding: 8px; border-radius: 8px;
      border: 1px solid rgba(0,0,0,.25); background: #c8a44a; font-weight: 700; cursor: pointer; }
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
    .cards { display: flex; gap: 7px; min-height: 76px; align-items: center; flex-wrap: wrap; justify-content: center; }
    .pcard { width: 52px; height: 73px; border-radius: 6px; position: relative; flex: none; overflow: hidden;
      background: #14120d; box-shadow: 0 2px 5px rgba(0,0,0,.45); }
    .pcard.pickable { cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
    .pcard.pickable:hover { transform: translateY(-6px); box-shadow: 0 6px 12px rgba(0,0,0,.55);
      outline: 2px solid rgba(244,239,226,.75); }
    .cardimg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; display: block; }
    .idx { position: absolute; top: 3px; left: 5px; line-height: 1; text-align: center;
      text-shadow: 0 1px 0 rgba(255,255,255,.45); }
    .idx-flip { top: auto; left: auto; bottom: 3px; right: 5px; transform: rotate(180deg); }
    .idx-rank { font-size: 13px; font-weight: 800; font-family: Georgia, 'Times New Roman', serif; }
    .idx-suit { font-size: 10px; }
    .idx-black { color: #1d2f55; } .idx-red { color: #a52a35; }
    .pip { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 28px; text-shadow: 0 1px 0 rgba(255,255,255,.45); }
    .pcard.joker { }
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
    .hidden-reveal { margin: 6px 0 10px; font-size: 12px; opacity: .85; text-align: center;
      background: rgba(0,0,0,.30); border-radius: 999px; padding: 4px 14px; display: inline-block; width: 100%;
      box-sizing: border-box; }
    .outcome-pill { border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 700; flex: none; }
    .outcome-pill.win, .outcome-pill.blackjack { background: #2c7a4b; color: #fff; }
    .outcome-pill.lose, .outcome-pill.bust { background: #a33848; color: #fff; }
    .outcome-pill.push { background: #77735f; color: #fff; }
    .outcome-pill.surrender { background: #4a4438; color: #fff; }
    .delta { font-weight: 700; flex: none; }
    .delta.up { color: #9fe6bd; } .delta.down { color: #f0b9c4; }
    .btnrow { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .btnrow button { flex: 1 1 100px; padding: 10px 6px; font-size: 14px; border-radius: 9px;
      border: 1px solid rgba(0,0,0,.25); background: #efe9d8; cursor: pointer; font-weight: 600;
      color: #26200e; }
    .btnrow button:disabled { opacity: .45; cursor: default; }
    .btnrow button.primary { background: #c8a44a; color: #26200e; }
    .btnrow button.danger { background: #b34355; color: #fff; }
    .lobby { padding: 18px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
    .lobby-head { text-align: center; margin-bottom: 2px; flex: none; }
    .lobby-search { flex: none; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,.30);
      border: 1px solid rgba(244,239,226,.20); border-radius: 999px; padding: 7px 14px; }
    .lobby-search:focus-within { border-color: rgba(244,239,226,.55); }
    .lobby-search .search-icon { font-size: 13px; opacity: .6; flex: none; }
    .lobby-search input { flex: 1 1 auto; min-width: 0; background: none; border: none; outline: none;
      color: #f4efe2; font-size: 13px; font-family: inherit; }
    .lobby-search input::placeholder { color: rgba(244,239,226,.45); }
    .lobby-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column;
      gap: 10px; padding-right: 2px; max-height: 52vh; }
    .lobby-empty { text-align: center; font-size: 12px; opacity: .6; padding: 14px 0; }
    .mode-grid { display: flex; flex-direction: column; gap: 10px; }
    .mode-icon { font-size: 34px; width: 64px; text-align: center; flex: none; }
    .lobby-backrow { flex: none; display: flex; }
    .wip { text-align: center; padding: 34px 16px; }
    .wip-icon { font-size: 40px; }
    .wip-title { font-size: 17px; font-weight: 800; margin: 10px 0 6px; letter-spacing: 2px; }
    .wip-desc { font-size: 13px; opacity: .8; line-height: 1.6; max-width: 380px; margin: 0 auto 14px; }
    .online-grid { display: flex; gap: 10px; align-items: stretch; }
    .online-status { flex: none; width: 42%; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .online-friends { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .online-status-title, .online-friends-title { font-size: 12px; font-weight: 700; opacity: .75; letter-spacing: 1px; }
    .online-badge { font-size: 15px; font-weight: 800; padding: 2px 10px; border-radius: 10px; }
    .online-badge-idle { background: rgba(127,127,127,.18); }
    .online-badge-play { background: rgba(212,175,55,.25); color: #b8860b; }
    .online-badge-rest { background: rgba(70,130,180,.22); color: #4682b4; }
    .online-status-line { font-size: 12px; opacity: .85; line-height: 1.5; word-break: break-all; }
    .online-stop { margin-top: 4px; padding: 4px 12px; font-size: 12px; background: rgba(178,34,34,.14); border: 1px solid rgba(178,34,34,.4); border-radius: 8px; cursor: pointer; }
    .friend-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,.5); }
    .friend-offline { opacity: .45; }
    .friend-ingame { background: rgba(212,175,55,.16); }
    .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; }
    .dot-online { background: #2e8b57; box-shadow: 0 0 0 2px rgba(46,139,87,.18); }
    .dot-offline { background: #9a9a9a; }
    .dot-ingame { background: #e6b422; box-shadow: 0 0 0 2px rgba(230,180,34,.25); }
    .friend-name { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .friend-id { font-size: 11px; opacity: .6; flex: 1; text-align: right; }
    .friend-invite { flex: none; width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(0,0,0,.25); background: rgba(255,255,255,.6); font-size: 15px; line-height: 1; cursor: pointer; font-weight: 700; }
    .friend-invite:hover { background: rgba(212,175,55,.3); }
    .online-game-row { flex-wrap: wrap; }
    .online-status-clickable { cursor: pointer; }
    .online-status-clickable:hover { opacity: .75; text-decoration: underline; }
    .spec-section { font-size: 12px; font-weight: 700; opacity: .8; margin-top: 6px; }
    .spec-cards { display: flex; gap: 6px; flex-wrap: wrap; min-height: 30px; align-items: center; }
    .spec-card { display: inline-flex; padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,.75); border: 1px solid rgba(0,0,0,.2); font-size: 14px; font-weight: 700; }
    .spec-red { color: #c0392b; }
    .spec-total { font-size: 13px; opacity: .8; }
    .spec-sub { font-size: 12px; opacity: .8; margin-top: 4px; }
    .spec-rest { font-size: 12px; color: #4682b4; margin-top: 4px; }
    .spec-result { font-size: 12px; font-weight: 700; color: #b8860b; margin-top: 6px; }
    .lobby-suits { font-size: 15px; letter-spacing: 10px; text-indent: 10px; }
    .lobby-suits .ls-black { color: #eae4d2; }
    .lobby-suits .ls-red { color: #f0a3a3; }
    .lobby-title { font-size: 20px; font-weight: 800; letter-spacing: 3px; margin-top: 3px; }
    .lobby-sub { font-size: 12px; opacity: .7; margin-top: 2px; }
    .game-card { display: flex; gap: 12px; align-items: center; background: rgba(0,0,0,.30);
      border: 1px solid rgba(244,239,226,.20); border-radius: 12px; padding: 10px 12px;
      transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease; }
    .game-card:hover { border-color: rgba(244,239,226,.55); transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,.4); }
    .lobby-cards { min-height: 0; gap: 5px; flex: none; width: 109px; justify-content: center; }
    .game-card .pcard { width: 33px; height: 46px; border-radius: 4px; }
    .game-card .idx { top: 2px; left: 3px; }
    .game-card .idx-rank { font-size: 9px; }
    .game-card .idx-suit { font-size: 7px; }
    .game-card .pip { font-size: 15px; }
    .lobby-cards .pcard.tilt { transform: rotate(7deg) translateY(-2px); }
    .game-info { flex: 1 1 auto; min-width: 0; }
    .game-name { font-size: 15px; font-weight: 800; letter-spacing: 1px; display: flex;
      align-items: baseline; gap: 7px; }
    .game-tag { font-size: 10px; font-weight: 700; letter-spacing: 2px; opacity: .55; }
    .game-tag.paused { color: #e8c96a; opacity: 1; }
    .game-desc { font-size: 12px; opacity: .8; line-height: 1.55; margin: 4px 0 8px; }
    .game-chips { font-size: 11px; font-weight: 600; color: #e8c96a; opacity: .95; margin: -4px 0 8px; }
    .game-card .btnrow { margin-top: 0; gap: 6px; }
    .game-card .btnrow button { padding: 5px 14px; font-size: 12px; flex: none; }
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
    .chip.chip-green { background: #2c7a4b; } .chip.chip-black { background: #2a2822; } .chip.chip-dark { background: #4c4636; }
    /* 场中的筹码堆:按面额叠柱,上下重叠只露边,顶枚全显。 */
    .chipstack { display: flex; gap: 7px; align-items: flex-end; }
    .chipcol { display: flex; flex-direction: column-reverse; align-items: center; }
    .chipcol .chip { width: 34px; height: 34px; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.5), inset 0 0 0 2px rgba(255,255,255,.3); }
    .chipcol .chip + .chip { margin-bottom: -26px; }
    .net-badge { display: inline-block; padding: 0 7px; border-radius: 999px; font-weight: 700; }
    .net-badge.up { color: #9fe6bd; background: rgba(60,140,90,.28); }
    .net-badge.down { color: #f0b9c4; background: rgba(160,60,80,.28); }
    .net-badge.flat { opacity: .6; }
    .netwrap { opacity: .7; }
    .info-pill { display: inline-block; background: rgba(0,0,0,.32); border: 1px solid rgba(244,239,226,.25);
      border-radius: 999px; padding: 1px 10px; font-size: 11px; margin: 0 3px 2px; }
    /* 牌的进场动画:发牌滑入,翻牌绕 Y 轴亮面;系统开了"减少动态效果"则不播。 */
    @keyframes dealIn { from { opacity: 0; transform: translateY(-16px) scale(.92); } to { opacity: 1; transform: none; } }
    .pcard.deal-in { animation: dealIn .3s ease-out both; }
    @keyframes flipIn { from { opacity: 0; transform: perspective(420px) rotateY(95deg); } to { opacity: 1; transform: perspective(420px) rotateY(0); } }
    .pcard.flip-in { animation: flipIn .38s ease-out both; }
    @media (prefers-reduced-motion: reduce) { .pcard.deal-in, .pcard.flip-in { animation: none; } }
    .history { margin-top: 12px; }
    .history-toggle { background: none; border: none; cursor: pointer; font-size: 13px; opacity: .75; padding: 2px 0; }
    .history-line { display: flex; gap: 8px; font-size: 12px; padding: 3px 0; flex-wrap: wrap; align-items: center; }
    .history-cards { letter-spacing: 1px; opacity: .85; }
    .hidden { display: none; }
    .casino-error { color: #c0506a; font-size: 12px; min-height: 15px; margin-top: 6px; }
    .casino-idle { opacity: .5; font-size: 12px; padding: 2px 0; }
    .betinput { width: 76px; text-align: center; background: rgba(0,0,0,.3); border: 1px solid rgba(244,239,226,.3);
      border-radius: 999px; color: #f4efe2; font-size: 14px; font-weight: 700; padding: 6px 4px; font-family: inherit; }
    .betinput:focus { outline: none; border-color: rgba(244,239,226,.65); }
    /* 窄面板(<430px):牌面收小、游戏卡改纵排、留白收紧。 */
    @media (max-width: 430px) {
      .casino-wrap { max-width: 100%; }
      .felt { padding: 10px 8px; border-width: 5px; }
      .lobby { padding: 12px 10px; }
      .game-card { flex-wrap: wrap; }
      .lobby-cards { width: auto; }
      .pcard { width: 44px; height: 62px; }
      .game-card .pcard { width: 26px; height: 37px; }
      .cards { min-height: 62px; }
      .pot-inner { padding: 8px 10px; }
      .btnrow button { padding: 9px 4px; }
      .betinput { width: 64px; }
    }
  `;
  root.append(style);

  const wrap = el('div', 'casino-wrap');
  root.append(wrap);

  // ── 顶栏 ──
  const topbar = el('div', 'casino-topbar');
  const topbarLeft = el('div', 'topbar-left');
  // 对局进行中:左上角放返回键,弃掉当前局回大厅(未结算的手不涉及筹码变动)。
  if (state.game !== null) {
    const backBtn = el('button', 'rules-btn', T.backBtn);
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => void send(ctx, T, 'leave'), { signal: ctx.signal });
    topbarLeft.append(backBtn);
  }
  topbarLeft.append(el('span', 'casino-title', T.title));
  topbar.append(topbarLeft);
  const softLabel = state.dealerHitsSoft17 ? T.soft17Hit : T.soft17Stand;
  const gameLabel = state.game === 'blackjack' ? (state.aiRole === 'dealer' ? T.roleText.aiDealer : T.roleText.meDealer)
    : state.game === 'oldmaid' ? T.gamePicker.oldmaidTitle
      : state.game === 'holdem' ? `${T.gamePicker.holdemTitle} · ${T.holdem.blindsLabel(state.blinds?.sb ?? 0, state.blinds?.bb ?? 0)}`
        : T.roleText.noGame;
  topbar.append(el('span', 'casino-round', `${gameLabel}${state.game === 'holdem' ? '' : ` · ${softLabel}`}`));
  // 「规则说明」只在对局中提供——大厅还没有游戏,规则无从谈起,不占右上角。
  if (state.game !== null) {
    const rulesBtn = el('button', 'rules-btn', ui.rulesOpen ? T.rulesClose : T.rulesBtn);
    rulesBtn.type = 'button';
    rulesBtn.addEventListener('click', () => {
      ui.rulesOpen = !ui.rulesOpen;
      if (current) render(ctx, current);
    }, { signal: ctx.signal });
    topbar.append(rulesBtn);
  }
  wrap.append(topbar);

  if (state.spectate && state.game) {
    // 观战横幅是持久元素:每次 1s 重渲染后重新贴回同一节点(退出按钮常驻可点,不随牌桌重建)。
    if (!spectateBarEl) {
      const bar = el('div', 'spectate-bar');
      bar.append(el('span', 'spectate-title', T.online.spectateTitle + ' · ' + (state.game === 'blackjack' ? T.online.gameBlackjack : state.game === 'oldmaid' ? T.online.gameOldmaid : T.online.gameHoldem)));
      const exit = el('button', 'online-stop', T.online.spectateExit);
      exit.type = 'button';
      exit.addEventListener('click', () => {
        ui.spectate = false;
        lastSpectateJson = '';
        spectateBarEl?.remove();
        spectateBarEl = null;
        render(ctx, lastRealSnapshot ?? (current as Snapshot));
      });
      bar.append(exit);
      spectateBarEl = bar;
    }
    wrap.prepend(spectateBarEl);
  }
  // ── 空桌:主菜单(本地模式 / 联机模式) → 本地模式里是游戏大厅 ──
  if (state.game !== null && !state.spectate) ui.lobbyMode = 'menu';
  if (ui.lobbyMode !== 'online' && ui.onlineTimer !== null) { clearInterval(ui.onlineTimer); ui.onlineTimer = null; }
  if (state.game === null) {
    const felt = el('div', 'felt lobby');
    wrap.append(felt);

    if (ui.lobbyMode === 'menu') {
      // 主菜单:两张模式卡。
      const head = el('div', 'lobby-head');
      const suits = el('div', 'lobby-suits');
      for (const [i, suit] of (['♠', '♥', '♦', '♣'] as const).entries()) {
        suits.append(el('span', i % 2 === 0 ? 'ls-black' : 'ls-red', suit));
      }
      head.append(suits, el('div', 'lobby-title', T.title), el('div', 'lobby-sub', T.modeMenu.subtitle));
      felt.append(head);
      const grid = el('div', 'mode-grid');
      const modes: Array<{ icon: string; title: string; tag: string; desc: string; btn: string; primary: boolean; go: 'local' | 'online' }> = [
        { icon: '🎴', title: T.modeMenu.localTitle, tag: T.modeMenu.localTag, desc: T.modeMenu.localDesc, btn: T.modeMenu.localBtn, primary: true, go: 'local' },
        { icon: '🌐', title: T.modeMenu.onlineTitle, tag: T.modeMenu.onlineTag, desc: T.modeMenu.onlineDesc, btn: T.modeMenu.onlineBtn, primary: false, go: 'online' },
      ];
      for (const m of modes) {
        const card = el('div', 'game-card');
        card.append(el('div', 'mode-icon', m.icon));
        const info = el('div', 'game-info');
        info.append(el('div', 'game-name', `${m.title} `), el('span', 'game-tag', m.tag));
        info.append(el('div', 'game-desc', m.desc));
        const row = el('div', 'btnrow');
        const btn = el('button', m.primary ? 'primary' : undefined, m.btn);
        btn.type = 'button';
        btn.addEventListener('click', () => {
          ui.lobbyMode = m.go;
          if (current) render(ctx, current);
        }, { signal: ctx.signal });
        row.append(btn);
        info.append(row);
        card.append(info);
        grid.append(card);
      }
      felt.append(grid);
    } else if (ui.lobbyMode === 'online') {
      // 联机模式:左侧本地 AI 状态,右侧好友列表(在线亮/离线暗/对局黄点),+号邀约,1s 轮询。
      const head = el('div', 'lobby-head');
      head.append(el('div', 'lobby-title', T.modeMenu.onlineTitle), el('div', 'lobby-sub', T.modeMenu.onlineTag));
      felt.append(head);

      // 返回主菜单(模式选择)。
      const backRow = el('div', 'lobby-backrow');
      const back = el('button', 'rules-btn', T.modeMenu.backToMenu);
      back.type = 'button';
      back.addEventListener('click', () => {
        ui.lobbyMode = 'menu';
        if (current) render(ctx, current);
      }, { signal: ctx.signal });
      backRow.append(back);
      felt.append(backRow);

      // 两栏:左 = 本地 AI 状态;右 = 好友列表。
      const grid = el('div', 'online-grid');
      const statusCard = el('div', 'online-status');
      const friendsCard = el('div', 'online-friends');
      friendsCard.append(el('div', 'online-friends-title', T.online.friendsTitle));
      grid.append(statusCard, friendsCard);
      felt.append(grid);
      const onlineError = el('div', 'casino-error');
      onlineError.style.display = 'none';
      felt.append(onlineError);

      /** 拉取联机快照并就地更新两栏(不整页重渲染,避免打断弹窗)。 */
      const refresh = async (): Promise<void> => {
        let data: Record<string, any>;
        try {
          data = await ctx.invoke<Record<string, any>>('online', []);
        } catch (err) {
          onlineError.textContent = err instanceof Error ? err.message : String(err);
          onlineError.style.display = 'block';
          return;
        }
        onlineError.style.display = 'none';
        // 左:本地 AI 状态。
        statusCard.replaceChildren();
        const statusLabel = data.status === 'resting' ? T.online.statusResting
          : data.status === 'playing' ? T.online.statusPlaying : T.online.statusIdle;
        const statusCls = data.status === 'resting' ? 'online-badge-rest' : data.status === 'playing' ? 'online-badge-play' : 'online-badge-idle';
        const statusTitle = el('div', 'online-status-title' + (data.status !== 'idle' ? ' online-status-clickable' : ''), T.online.statusTitle);
        if (data.status !== 'idle') {
          statusTitle.addEventListener('click', () => { ui.spectate = !ui.spectate; void refresh(); }, { signal: ctx.signal });
        }
        statusCard.append(statusTitle);
        statusCard.append(el('span', `online-badge ${statusCls}`, statusLabel));
        statusCard.append(el('div', 'online-status-line', `${T.online.selfId} ${data.myBotId ?? data.botId ?? T.online.unknown}`));
        if (data.status !== 'idle' && data.session) {
          const sess = data.session;
          const gameName = sess.game === 'blackjack' ? T.online.gameBlackjack : sess.game === 'oldmaid' ? T.online.gameOldmaid : T.online.gameHoldem;
          statusCard.append(el('div', 'online-status-line', `${T.online.vsLabel} ${sess.peer} · ${gameName}`));
          statusCard.append(el('div', 'online-status-line', `${T.online.handsLabel} ${sess.hands} · ${T.online.chipsMe} ${sess.chipsMe ?? '?'} · ${T.online.chipsPeer} ${sess.chipsPeer ?? '?'}`));
          statusCard.append(el('div', 'online-status-line', sess.iAmBank ? T.online.youAreBank : T.online.peerIsBank));
          if (data.status === 'resting') statusCard.append(el('div', 'online-status-line', T.online.restHint));
          const stop = el('button', 'online-stop', T.online.stopBtn);
          stop.type = 'button';
          stop.addEventListener('click', async () => {
            try { await ctx.invoke('action', [{ action: 'online-stop' }]); } catch (err) { showError(ctx, err instanceof Error ? err.message : String(err)); }
            void refresh();
          }, { signal: ctx.signal });
          statusCard.append(stop);
        } else if (data.enabled === false) {
          statusCard.append(el('div', 'online-status-line', T.online.notEnabled));
        } else if (data.configured === false) {
          statusCard.append(el('div', 'online-status-line', T.online.notConfigured));
        } else if (data.clientReady === false) {
          statusCard.append(el('div', 'online-status-line', `${T.online.clientNotReady} ${data.lastError ?? ''}`));
        } else if (data.lastError) {
          statusCard.append(el('div', 'online-status-line', `${T.online.lastErr} ${data.lastError}`));
        } else {
          statusCard.append(el('div', 'online-status-line', T.online.idleHint));
        }
        // 右栏:观战模式显示牌局实况;否则好友列表(黄/绿/灰点,在线优先)。
        if (ui.spectate) {
          if (data.status === 'idle') {
            // AI 退出对局/会话结束:自动离开观战,回到联机大厅(主人要求)。
            ui.spectate = false;
            lastSpectateJson = '';
            spectateBarEl?.remove();
            spectateBarEl = null;
            render(ctx, lastRealSnapshot ?? (current as Snapshot));
            return;
          }
          let spec: Record<string, any>;
          try { spec = await ctx.invoke<Record<string, any>>('spectate', []); } catch { spec = null; }
          if (!spec?.snapshot) return; // 拉取失败:保持当前牌桌,下一秒重试(避免与大厅渲染交替闪烁)
          const snapJson = JSON.stringify(spec.snapshot);
          if (snapJson === lastSpectateJson) return; // 快照无变化:不重渲染(退出按钮稳定可点)
          lastSpectateJson = snapJson;
          // 导入单机牌桌渲染器:远程同构快照整页渲染,1s 轮询持续刷新牌面。
          render(ctx, spec.snapshot as Snapshot);
          if (spectateBarEl) ctx.root.prepend(spectateBarEl); // 稳定横幅重新贴回
          return;
        }
        friendsCard.querySelectorAll('.friend-row').forEach((n) => n.remove());
        const friends = (data.friends ?? []) as Array<{ id: string; nickname: string; online: boolean; inGame: boolean }>;
        if (!friends.length) {
          friendsCard.append(el('div', 'lobby-empty', T.online.noFriends));
        }
        for (const f of friends) {
          const row = el('div', `friend-row ${f.inGame ? 'friend-ingame' : f.online ? 'friend-online' : 'friend-offline'}`);
          const dot = el('span', `dot ${f.inGame ? 'dot-ingame' : f.online ? 'dot-online' : 'dot-offline'}`);
          row.append(dot);
          row.append(el('span', 'friend-name', f.nickname));
          row.append(el('span', 'friend-id', f.id));
          const plus = el('button', 'friend-invite', '+');
          plus.type = 'button';
          plus.title = f.online ? T.online.inviteBtnTitle : T.online.inviteOfflineTitle;
          if (!f.online) plus.disabled = true; // 只有在线好友可邀约(离线置灰)
          plus.addEventListener('click', () => {
            // 弹窗:选择邀请游玩的种类。
            const overlay = el('div', 'rules-overlay');
            const card = el('div', 'rules-card');
            card.append(el('h4', undefined, `${T.online.inviteTitle} · ${f.nickname}`));
            const gRow = el('div', 'btnrow online-game-row');
            for (const [g, label] of [['blackjack', T.online.gameBlackjack], ['oldmaid', T.online.gameOldmaid], ['holdem', T.online.gameHoldem]] as const) {
              const gb = el('button', 'primary', label);
              gb.type = 'button';
              gb.addEventListener('click', async () => {
                overlay.remove();
                try { await ctx.invoke('action', [{ action: 'online-invite', target: f.id, game: g }]); } catch (err) { showError(ctx, err instanceof Error ? err.message : String(err)); }
                void refresh();
              }, { signal: ctx.signal });
              gRow.append(gb);
            }
            const cRow = el('div', 'btnrow');
            const cancel = el('button', undefined, T.gamePicker.resumeCancel);
            cancel.type = 'button';
            cancel.addEventListener('click', () => overlay.remove(), { signal: ctx.signal });
            cRow.append(cancel);
            card.append(gRow, cRow);
            overlay.append(card);
            wrap.append(overlay);
            bindEsc(() => overlay.remove());
          }, { signal: ctx.signal });
          row.append(plus);
          friendsCard.append(row);
        }
      };
      void refresh();
      // 每秒刷新一次状态(轻拉缓存快照,减少后台消耗);离开联机页时清除。
      if (ui.onlineTimer !== null) clearInterval(ui.onlineTimer);
      ui.onlineTimer = window.setInterval(() => void refresh(), 1000);
    } else {
      // ── 本地模式:游戏大厅(可滚动列表 + 搜索;以后新玩法往列表里加卡即可) ──
      const head = el('div', 'lobby-head');
    const suits = el('div', 'lobby-suits');
    for (const [i, s] of (['♠', '♥', '♦', '♣'] as const).entries()) {
      suits.append(el('span', i % 2 === 0 ? 'ls-black' : 'ls-red', s));
    }
    head.append(suits, el('div', 'lobby-title', T.title), el('div', 'lobby-sub', T.gamePicker.title));
    felt.append(head);

    // 返回主菜单(模式选择)。
    const backRow = el('div', 'lobby-backrow');
    const backToMenu = el('button', 'rules-btn', T.modeMenu.backToMenu);
    backToMenu.type = 'button';
    backToMenu.addEventListener('click', () => {
      ui.lobbyMode = 'menu';
      if (current) render(ctx, current);
    }, { signal: ctx.signal });
    backRow.append(backToMenu);
    felt.append(backRow);

    // 搜索框:按游戏名/别名/描述过滤;输入时直接显隐卡片,不整体重渲染(避免丢焦点)。
    const search = el('div', 'lobby-search');
    search.append(el('span', 'search-icon', '🔍'));
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = T.gamePicker.searchPlaceholder;
    searchInput.value = ui.lobbyQuery;
    searchInput.addEventListener('input', () => {
      ui.lobbyQuery = searchInput.value;
      applyLobbyFilter();
    }, { signal: ctx.signal });
    search.append(searchInput);
    felt.append(search);

    const list = el('div', 'lobby-list');
    felt.append(list);
    const emptyHint = el('div', 'lobby-empty', T.gamePicker.noMatch);
    emptyHint.style.display = 'none';
    felt.append(emptyHint);

    /** 大厅卡登记表:el 卡片元素,kw 过滤关键词(小写)。 */
    const lobbyEntries: Array<{ el: HTMLElement; kw: string[] }> = [];
    const paused = state.pausedGames ?? [];

    /** 打开某游戏:有挂起的未完对局时先弹「继续/重新开始」确认框,否则直接开局。 */
    function openGame(game: 'blackjack' | 'oldmaid' | 'holdem', dealer?: 'ai' | 'player'): void {
      if (!paused.includes(game)) {
        void send(ctx, T, 'newgame', dealer ? { game, dealer } : { game });
        return;
      }
      const title = game === 'blackjack' ? T.gamePicker.blackjackTitle
        : game === 'oldmaid' ? T.gamePicker.oldmaidTitle : T.gamePicker.holdemTitle;
      const overlay = el('div', 'rules-overlay');
      const card = el('div', 'rules-card');
      card.append(el('h4', undefined, `${title} · ${T.gamePicker.resumeTitle}`));
      card.append(el('p', undefined, T.gamePicker.resumeText));
      const row = el('div', 'btnrow');
      const cont = el('button', 'primary', T.gamePicker.resumeContinue);
      cont.type = 'button';
      cont.addEventListener('click', () => void send(ctx, T, 'resume', { game }), { signal: ctx.signal });
      const restart = el('button', undefined, T.gamePicker.resumeRestart);
      restart.type = 'button';
      restart.addEventListener('click', () => void send(ctx, T, 'newgame', dealer ? { game, dealer } : { game }), { signal: ctx.signal });
      const cancel = el('button', undefined, T.gamePicker.resumeCancel);
      cancel.type = 'button';
      cancel.addEventListener('click', () => { if (current) render(ctx, current); }, { signal: ctx.signal });
      row.append(cont, restart, cancel);
      card.append(row);
      overlay.append(card);
      wrap.append(overlay);
      bindEsc(() => { if (current) render(ctx, current); });
    }

    // 21 点卡:♠A + ♥K 明牌装饰(blackjack 本义就是黑桃 A + J)
    const bjCard = el('div', 'game-card');
    const bjRow = el('div', 'cards lobby-cards');
    bjRow.append(cardEl('♠A'), cardEl('♥K'));
    bjCard.append(bjRow);
    const bjInfo = el('div', 'game-info');
    const bjName = el('div', 'game-name');
    bjName.append(el('span', undefined, T.gamePicker.blackjackTitle), el('span', 'game-tag', T.gamePicker.blackjackTag));
    if (paused.includes('blackjack')) bjName.append(el('span', 'game-tag paused', T.gamePicker.pausedTag));
    bjInfo.append(bjName, el('div', 'game-desc', T.gamePicker.blackjackDesc));
    const bjChips = state.gameChips?.blackjack;
    if (bjChips) bjInfo.append(el('div', 'game-chips', T.gamePicker.chipsLine(bjChips.ai, bjChips.player)));
    const bjBtns = el('div', 'btnrow');
    const bjAI = el('button', 'primary', T.gamePicker.blackjackAI);
    bjAI.type = 'button';
    bjAI.addEventListener('click', () => openGame('blackjack', 'ai'), { signal: ctx.signal });
    const bjMe = el('button', undefined, T.gamePicker.blackjackMe);
    bjMe.type = 'button';
    bjMe.addEventListener('click', () => openGame('blackjack', 'player'), { signal: ctx.signal });
    bjBtns.append(bjAI, bjMe);
    bjInfo.append(bjBtns);
    bjCard.append(bjInfo);
    list.append(bjCard);
    lobbyEntries.push({ el: bjCard, kw: T.gamePicker.blackjackKw });

    // 抽鬼牌卡:三张背面牌,最后一张微斜——藏着鬼牌的悬念
    const omCard = el('div', 'game-card');
    const omRow = el('div', 'cards lobby-cards');
    const omBack1 = cardEl('', true);
    const omBack2 = cardEl('', true);
    const omBack3 = cardEl('', true);
    omBack3.classList.add('tilt');
    omRow.append(omBack1, omBack2, omBack3);
    omCard.append(omRow);
    const omInfo = el('div', 'game-info');
    const omName = el('div', 'game-name');
    omName.append(el('span', undefined, T.gamePicker.oldmaidTitle), el('span', 'game-tag', T.gamePicker.oldmaidTag));
    if (paused.includes('oldmaid')) omName.append(el('span', 'game-tag paused', T.gamePicker.pausedTag));
    omInfo.append(omName, el('div', 'game-desc', T.gamePicker.oldmaidDesc));
    const omBtns = el('div', 'btnrow');
    const omBtn = el('button', 'primary', T.gamePicker.oldmaidStart);
    omBtn.type = 'button';
    omBtn.addEventListener('click', () => openGame('oldmaid'), { signal: ctx.signal });
    omBtns.append(omBtn);
    omInfo.append(omBtns);
    omCard.append(omInfo);
    list.append(omCard);
    lobbyEntries.push({ el: omCard, kw: T.gamePicker.oldmaidKw });

    // 德州卡:两张背面底牌 + 三张公共牌的悬念
    const heCard = el('div', 'game-card');
    const heRow = el('div', 'cards lobby-cards');
    const heBack1 = cardEl('', true);
    const heBack2 = cardEl('', true);
    const heFlop = cardEl('♠K');
    heFlop.classList.add('tilt');
    heRow.append(heBack1, heBack2, heFlop);
    heCard.append(heRow);
    const heInfo = el('div', 'game-info');
    const heName = el('div', 'game-name');
    heName.append(el('span', undefined, T.gamePicker.holdemTitle), el('span', 'game-tag', T.gamePicker.holdemTag));
    if (paused.includes('holdem')) heName.append(el('span', 'game-tag paused', T.gamePicker.pausedTag));
    heInfo.append(heName, el('div', 'game-desc', T.gamePicker.holdemDesc));
    const heChips = state.gameChips?.holdem;
    if (heChips) heInfo.append(el('div', 'game-chips', T.gamePicker.chipsLine(heChips.ai, heChips.player)));
    const heBtns = el('div', 'btnrow');
    const heBtn = el('button', 'primary', T.gamePicker.holdemStart);
    heBtn.type = 'button';
    heBtn.addEventListener('click', () => openGame('holdem'), { signal: ctx.signal });
    heBtns.append(heBtn);
    heInfo.append(heBtns);
    heCard.append(heInfo);
    list.append(heCard);
    lobbyEntries.push({ el: heCard, kw: T.gamePicker.holdemKw });

    /** 按当前搜索词显隐卡片;全部被滤掉时给一条空提示。 */
    function applyLobbyFilter(): void {
      const q = ui.lobbyQuery.trim().toLowerCase();
      let visible = 0;
      for (const entry of lobbyEntries) {
        const hit = q === '' || entry.kw.some((k) => k.includes(q));
        entry.el.style.display = hit ? '' : 'none';
        if (hit) visible++;
      }
      emptyHint.style.display = visible === 0 ? '' : 'none';
    }
    applyLobbyFilter();
    } // else:本地模式大厅结束
  }

  // ── 21 点桌面 ──
  if (state.game === 'blackjack') {
    const felt = el('div', 'felt');
    wrap.append(felt);
    const bj = {
      phase: state.phase ?? 'betting',
      round: state.round ?? 0,
      aiRole: state.aiRole ?? 'dealer',
      bet: state.bet ?? 0,
      insurance: state.insurance ?? 0,
      holeRevealed: state.holeRevealed ?? false,
      dealerActing: state.dealerActing ?? false,
      hands: state.hands ?? [],
      activeHand: state.activeHand ?? 0,
      dealerCards: state.dealerCards ?? [],
      dealerVisibleTotal: state.dealerVisibleTotal ?? null,
      dealerTotal: state.dealerTotal ?? null,
      holeCount: state.holeCount ?? 0,
      minBet: state.minBet,
      maxBet: state.maxBet,
      playerChips: state.player.chips,
      aiChips: state.ai.chips,
    };
    const dealerIsAi = bj.aiRole !== 'player';
    const dealerSeatView = bj.aiRole === 'player' ? state.player : state.ai;
    const playerSeatView = bj.aiRole === 'player' ? state.ai : state.player;
    // 庄家暗牌翻开的那一帧:新亮的牌用翻牌动效,其余新牌用发牌动效。
    const holeJustRevealed = bj.holeRevealed && !prevHoleRevealedBJ;
    prevHoleRevealedBJ = bj.holeRevealed;

    const dealerSeat = el('div', 'seat');
    const dealerHead = el('div', 'seat-head');
    dealerHead.append(el('span', undefined, dealerIsAi ? T.ai : T.me));
    dealerHead.append(el('span', 'seat-role', T.roleDealer));
    dealerSeat.append(dealerHead);
    const dealerCards = el('div', 'cards');
    if (bj.phase !== 'betting' || bj.dealerCards.length === 0) {
      if (bj.dealerCards.length === 0) dealerCards.append(cardEl('', true));
    }
    for (const [i, text] of bj.dealerCards.entries()) {
      dealerCards.append(cardEl(text, false, { key: `bj-r${bj.round}-d${i}-${text}`, kind: holeJustRevealed ? 'flip' : 'deal' }));
    }
    for (let i = 0; i < bj.holeCount; i++) dealerCards.append(cardEl('', true, { key: `bj-r${bj.round}-dh${i}`, kind: 'deal' }));
    dealerSeat.append(dealerCards);
    if (bj.holeRevealed && bj.dealerTotal !== null) {
      dealerSeat.append(el('div', 'total-pill', `${T.roleDealer} ${bj.dealerTotal}`));
    } else if (bj.dealerVisibleTotal !== null) {
      dealerSeat.append(el('div', 'total-pill', `${T.dealerUpTotal(bj.dealerVisibleTotal)}${bj.holeCount > 0 ? T.withHole : ''}`));
    }
    const dealerFoot = el('div', 'seat-head');
    dealerFoot.append(chipsEl(T.bank, dealerSeatView.chips, dealerIsAi ? 'blue' : 'gold'));
    dealerFoot.append(statsEl(T, dealerSeatView));
    dealerSeat.append(dealerFoot);
    felt.append(dealerSeat);

    const pot = el('div', 'pot');
    const potInner = el('div', 'pot-inner');
    potInner.append(el('div', undefined, T.potBet + (bj.insurance > 0 ? T.potWithInsurance(bj.insurance) : '')));
    const potNumRow = el('span', undefined);
    potNumRow.append(el('span', 'pot-num', String(bj.bet)));
    if (bj.bet > 0) potNumRow.append(chipStackEl(bj.bet));
    potInner.append(potNumRow);
    pot.append(potInner);
    felt.append(pot);

    const playerSeat = el('div', 'seat');
    const playerHead = el('div', 'seat-head');
    playerHead.append(el('span', undefined, dealerIsAi ? T.me : T.ai));
    playerHead.append(el('span', 'seat-role', T.rolePlayer));
    playerSeat.append(playerHead);
    const playerCards = el('div', 'cards');
    if (bj.hands.length === 0) playerCards.append(cardEl('', true));
    for (const [h, hand] of bj.hands.entries()) {
      for (const [i, text] of hand.cards.entries()) {
        playerCards.append(cardEl(text, false, { key: `bj-r${bj.round}-p${h}-${i}-${text}`, kind: 'deal' }));
      }
    }
    playerSeat.append(playerCards);
    const totals = bj.hands.map((hand) => hand.total).filter((n) => n !== null);
    if (totals.length) {
      playerSeat.append(el('div', 'total-pill', `${T.rolePlayer} ${totals.join(' / ')} 点`));
    }
    const playerFoot = el('div', 'seat-head');
    playerFoot.append(chipsEl(T.chips, playerSeatView.chips, dealerIsAi ? 'gold' : 'blue'));
    playerFoot.append(statsEl(T, playerSeatView));
    playerSeat.append(playerFoot);
    felt.append(playerSeat);

    const bannerBox = el('div');
    wrap.append(bannerBox);
    const banner = bjResultBanner(T, state);
    if (banner) bannerBox.append(banner);

    const waitingAi =
      (bj.phase === 'betting' || bj.phase === 'insurance') && bj.aiRole === 'player';
    if (waitingAi) {
      const wait = el('div', 'banner wait');
      wait.append(el('span', 'banner-text', bj.phase === 'betting' ? T.waitingBet : T.waitingInsurance));
      const nudge = el('button', undefined, T.nudge);
      nudge.type = 'button';
      nudge.addEventListener('click', () => void send(ctx, T, 'nudge'), { signal: ctx.signal });
      wait.append(nudge);
      bannerBox.append(wait);
    }

    const playerIsIdler = bj.aiRole === 'dealer';
    if (bj.phase === 'betting' && playerIsIdler) {
      const cap = Math.min(bj.maxBet, state.player.chips, state.ai.chips);
      ui.bet = Math.min(ui.bet, cap);
      const build = el('div', 'betbuild');
      // 押注额:筹码按钮累加(保留)或数字输入(整数,精度 1);筹码堆按最少枚组合实时摆在旁边。
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.className = 'betinput';
      input.value = String(ui.bet);
      input.placeholder = '0';
      const stackBox = el('div', 'chipstack-slot');
      const clear = el('button', undefined, T.clear);
      clear.type = 'button';
      const go = el('button', 'primary', T.goBet(cap));
      go.type = 'button';
      const sync = (fromTyping = false): void => {
        if (!fromTyping) input.value = String(ui.bet);
        stackBox.replaceChildren(chipStackEl(ui.bet));
        clear.disabled = ui.bet === 0;
        go.disabled = ui.bet < bj.minBet || ui.bet > cap;
      };
      input.addEventListener('input', () => {
        // 只留数字,精度 1 不许小数;上限在失焦/提交时钳,输入中只放宽到 cap。
        const digits = input.value.replace(/\D+/g, '').slice(0, 6);
        if (digits !== input.value) input.value = digits;
        ui.bet = digits === '' ? 0 : Math.min(parseInt(digits, 10) || 0, cap);
        sync(true);
      }, { signal: ctx.signal });
      input.addEventListener('blur', () => {
        ui.bet = Math.min(ui.bet, cap);
        sync();
      }, { signal: ctx.signal });
      const add = (n: number): void => {
        ui.bet = Math.min(cap, ui.bet + n);
        sync();
      };
      for (const [label, n, tone] of [[T.chip10, 10, 'red'], [T.chip50, 50, 'green'], [T.chip100, 100, 'black']] as const) {
        const chip = el('div', `chip chip-${tone}`, label);
        chip.addEventListener('click', () => add(n), { signal: ctx.signal });
        build.append(chip);
      }
      const allin = el('div', 'chip chip-gold', T.allin);
      allin.addEventListener('click', () => {
        ui.bet = cap;
        sync();
      }, { signal: ctx.signal });
      build.append(allin, el('span', 'casino-idle', T.betWord), input, stackBox);
      wrap.append(build);
      const row = el('div', 'btnrow');
      clear.addEventListener('click', () => {
        ui.bet = 0;
        sync();
      }, { signal: ctx.signal });
      go.addEventListener('click', () => void send(ctx, T, 'bet', { amount: ui.bet }), { signal: ctx.signal });
      row.append(clear, go);
      wrap.append(row);
    } else if (bj.phase === 'betting') {
      const banner2 = el('div', 'banner wait');
      banner2.append(el('span', 'banner-text', T.waitingBet));
      wrap.append(banner2);
    } else if (bj.phase === 'insurance' && playerIsIdler) {
      const maxIns = Math.floor(bj.bet / 2);
      const banner2 = el('div', 'banner wait');
      banner2.append(el('span', 'banner-text', T.insuranceAsk(maxIns)));
      wrap.append(banner2);
      const row = el('div', 'btnrow');
      const decline = el('button', undefined, T.insuranceDecline);
      decline.type = 'button';
      decline.addEventListener('click', () => void send(ctx, T, 'insurance', { amount: 0 }), { signal: ctx.signal });
      const buy = el('button', 'primary', T.insuranceBuy(maxIns));
      buy.type = 'button';
      buy.disabled = maxIns <= 0;
      buy.addEventListener('click', () => void send(ctx, T, 'insurance', { amount: maxIns }), { signal: ctx.signal });
      row.append(decline, buy);
      wrap.append(row);
    } else if (bj.phase === 'insurance') {
      const banner2 = el('div', 'banner wait');
      banner2.append(el('span', 'banner-text', T.waitingInsurance));
      wrap.append(banner2);
    } else if (bj.phase === 'playerActing' && playerIsIdler && !bj.dealerActing) {
      const active = bj.hands[bj.activeHand];
      const singleFresh = bj.hands.length === 1 && (active?.cards.length ?? 0) === 2;
      const canSplit = singleFresh
        && active!.cards.length === 2
        && active!.cards[0]!.slice(1) === active!.cards[1]!.slice(1);
      const row = el('div', 'btnrow');
      const hit = el('button', 'primary', T.hit);
      hit.type = 'button';
      const stand = el('button', undefined, T.stand);
      stand.type = 'button';
      const dbl = el('button', undefined, T.double);
      dbl.type = 'button';
      dbl.disabled = (active?.cards.length ?? 0) !== 2;
      const split = el('button', undefined, T.splitBtn);
      split.type = 'button';
      split.disabled = !canSplit;
      const surrender = el('button', 'danger', T.surrenderBtn);
      surrender.type = 'button';
      surrender.disabled = !singleFresh;
      hit.addEventListener('click', () => void send(ctx, T, 'hit'), { signal: ctx.signal });
      stand.addEventListener('click', () => void send(ctx, T, 'stand'), { signal: ctx.signal });
      dbl.addEventListener('click', () => void send(ctx, T, 'double'), { signal: ctx.signal });
      split.addEventListener('click', () => void send(ctx, T, 'split'), { signal: ctx.signal });
      surrender.addEventListener('click', () => void send(ctx, T, 'surrender'), { signal: ctx.signal });
      row.append(hit, stand, dbl, split, surrender);
      wrap.append(row);
    } else if (bj.phase === 'playerActing' && bj.dealerActing) {
      const banner2 = el('div', 'banner wait');
      banner2.append(el('span', 'banner-text', dealerIsAi ? T.dealerPlayingAI : T.dealerPlayingMe));
      wrap.append(banner2);
    } else if (bj.phase === 'playerActing') {
      const banner2 = el('div', 'banner wait');
      banner2.append(el('span', 'banner-text', T.waitingPlay));
      wrap.append(banner2);
    }
  }

  // ── 德州扑克桌面 ──
  if (state.game === 'holdem') {
    const he = {
      phase: (state.phase as string) ?? 'idle',
      round: state.round ?? 0,
      button: state.button ?? 'player',
      toAct: state.toAct,
      winner: state.winner,
      revealHole: state.revealHole ?? false,
      byFold: state.byFold ?? false,
      blinds: state.blinds ?? { sb: 5, bb: 10 },
      streetCap: state.streetCap ?? state.maxBet,
      currentBet: state.currentBet ?? 0,
      minRaise: state.minRaise ?? 10,
      pot: state.pot ?? 0,
      community: state.community ?? [],
      playerCards: state.playerCards ?? [],
      aiCards: state.aiCards ?? null,
      aiHoleCount: state.aiHoleCount ?? 0,
      aiCommitted: state.aiCommitted ?? 0,
      playerCommitted: state.playerCommitted ?? 0,
      aiFolded: state.aiFolded ?? false,
      aiAllIn: state.aiAllIn ?? false,
      playerAllIn: state.playerAllIn ?? false,
      lastHoldem: state.lastHoldem ?? null,
      holdemHistory: state.holdemHistory ?? [],
    };
    const phaseName = T.holdem.phaseName[he.phase as keyof typeof T.holdem.phaseName] ?? he.phase;
    const felt = el('div', 'felt');
    wrap.append(felt);

    // 对方席(上):庄位标识;摊牌亮底牌,其余背面
    const aiSeat = el('div', 'seat');
    const aiHead = el('div', 'seat-head');
    aiHead.append(el('span', undefined, T.ai));
    if (he.button === 'ai' && he.round > 0) aiHead.append(el('span', 'seat-role', T.holdem.buttonBadge));
    if (he.aiFolded) aiHead.append(el('span', 'seat-role', T.holdem.aiFolded));
    aiSeat.append(aiHead);
    const aiCardsRow = el('div', 'cards');
    if (he.revealHole && he.aiCards && he.aiCards.length) {
      he.aiCards.forEach((text, i) => aiCardsRow.append(cardEl(text, false, { key: `he-r${he.round}-ai${i}-${text}`, kind: 'flip' })));
    } else {
      const n = Math.max(he.aiHoleCount, he.round > 0 ? 2 : 0);
      for (let i = 0; i < n; i++) aiCardsRow.append(cardEl('', true, { key: `he-r${he.round}-ai-h${i}`, kind: 'deal' }));
    }
    aiSeat.append(aiCardsRow);
    aiSeat.append(el('div', 'total-pill', he.revealHole && he.aiCards?.length ? T.holdem.aiHoleShown(he.aiCards.join(' ')) : T.holdem.aiHoleHidden(Math.max(he.aiHoleCount, he.round > 0 ? 2 : 0))));
    const aiFoot = el('div', 'seat-head');
    aiFoot.append(chipsEl(T.chips, state.ai.chips, 'blue'));
    aiFoot.append(statsEl(T, state.ai));
    aiSeat.append(aiFoot);
    felt.append(aiSeat);

    // 中间:公共牌 + 底池
    const pot = el('div', 'pot');
    const potInner = el('div', 'pot-inner');
    // 常驻参数徽章:盲注/封顶一目了然,不用回忆规则。
    const badgeRow = el('div', undefined);
    badgeRow.append(
      el('span', 'info-pill', T.holdem.blindsLabel(he.blinds.sb, he.blinds.bb)),
      el('span', 'info-pill', T.holdem.capIs(he.streetCap)),
    );
    potInner.append(badgeRow);
    const potNumRow = el('div', undefined, `${T.holdem.potLabel} `);
    potNumRow.append(el('span', 'pot-num', String(he.pot)));
    if (he.pot > 0) potNumRow.append(chipStackEl(he.pot));
    potInner.append(potNumRow);
    if (he.round > 0) potInner.append(el('div', undefined, T.holdem.roundLabel(he.round, phaseName)));
    const communityRow = el('div', 'cards');
    if (he.community.length) {
      he.community.forEach((text, i) => communityRow.append(cardEl(text, false, { key: `he-c${he.round}-${i}-${text}`, kind: 'flip' })));
    } else {
      for (let i = 0; i < 5; i++) communityRow.append(cardEl('', true));
    }
    potInner.append(communityRow);
    pot.append(potInner);
    felt.append(pot);

    // 你的席(下,明牌)
    const playerSeat = el('div', 'seat');
    const playerHead = el('div', 'seat-head');
    playerHead.append(el('span', undefined, T.me));
    if (he.button === 'player' && he.round > 0) playerHead.append(el('span', 'seat-role', T.holdem.buttonBadge));
    playerSeat.append(playerHead);
    const playerCardsRow = el('div', 'cards');
    if (he.playerCards.length) {
      he.playerCards.forEach((text, i) => playerCardsRow.append(cardEl(text, false, { key: `he-r${he.round}-p${i}-${text}`, kind: 'deal' })));
    } else {
      playerCardsRow.append(cardEl('', true));
    }
    playerSeat.append(playerCardsRow);
    playerSeat.append(el('div', 'total-pill', `本手投入 ${he.playerCommitted} / 底池 ${he.pot}`));
    const playerFoot = el('div', 'seat-head');
    playerFoot.append(chipsEl(T.chips, state.player.chips, 'gold'));
    playerFoot.append(statsEl(T, state.player));
    playerSeat.append(playerFoot);
    felt.append(playerSeat);

    // ── 横幅与操作 ──
    const bannerBox = el('div');
    wrap.append(bannerBox);
    const last = he.lastHoldem;
    if (he.winner && last) {
      const playerDelta = -last.delta;
      const banner = el('div', `banner ${playerDelta > 0 ? 'win' : playerDelta < 0 ? 'lose' : 'push'}`);
      const pill = outcomePill(T, playerDelta > 0 ? 'win' : playerDelta < 0 ? 'lose' : 'push');
      const madeText = last.by === 'showdown' ? T.holdem.madeLine(last.aiMade ?? '', last.playerMade ?? '') : T.holdem.foldLine;
      banner.append(pill, el('span', 'banner-text', `${T.holdem.winnerBanner(he.winner, last.pot)} · ${madeText}`),
        el('span', `delta ${playerDelta >= 0 ? 'up' : 'down'}`, `${playerDelta >= 0 ? '+' : ''}${playerDelta}`));
      bannerBox.append(banner);
    }

    const myTurn = he.toAct === 'player' && !he.winner && he.phase !== 'runout' && he.phase !== 'idle';
    if (he.phase === 'idle') {
      if (!he.winner && he.round === 0) {
        const wait = el('div', 'banner wait');
        wait.append(el('span', 'banner-text', T.holdem.dealFirst));
        bannerBox.append(wait);
      }
      const row = el('div', 'btnrow');
      const deal = el('button', 'primary', T.holdem.dealBtn);
      deal.type = 'button';
      deal.addEventListener('click', () => void send(ctx, T, 'deal'), { signal: ctx.signal });
      row.append(deal);
      wrap.append(row);
    } else if (myTurn) {
      const toCall = Math.max(0, he.currentBet - he.playerCommitted);
      const isBet = he.currentBet === 0;
      const myAvail = Math.max(0, state.player.chips - he.playerCommitted);
      const minTo = isBet ? he.blinds.bb : he.currentBet + he.minRaise;
      const allinTarget = he.playerCommitted + myAvail;
      const maxTo = Math.min(he.streetCap, allinTarget);
      const canFullRaise = maxTo >= minTo;
      // 常规最小加注超过单街封顶时,若不足额全押仍高于现注,只剩"全押"这一个合法加注目标;
      // 对方已全押时任何加注都非法,构建器整个隐藏。
      const allinOnly = !canFullRaise && !he.aiAllIn && allinTarget > (isBet ? 0 : he.currentBet);
      const row = el('div', 'btnrow');
      const foldBtn = el('button', 'danger', T.holdem.fold);
      foldBtn.type = 'button';
      foldBtn.addEventListener('click', () => void send(ctx, T, 'fold'), { signal: ctx.signal });
      row.append(foldBtn);
      if (toCall === 0) {
        const check = el('button', 'primary', T.holdem.check);
        check.type = 'button';
        check.addEventListener('click', () => void send(ctx, T, 'check'), { signal: ctx.signal });
        row.append(check);
      } else {
        const call = el('button', 'primary', he.playerAllIn ? `${T.holdem.call(Math.min(toCall, myAvail))} · ${T.holdem.allin}` : T.holdem.call(toCall));
        call.type = 'button';
        call.addEventListener('click', () => void send(ctx, T, 'call'), { signal: ctx.signal });
        row.append(call);
      }
      wrap.append(row);
      // 下注/加注构建器:筹码累加或数字输入,目标额 = 本街投入到的总额;allinOnly 时锁定为全押额。
      if (canFullRaise || allinOnly) {
        ui.bet = canFullRaise ? Math.min(Math.max(ui.bet, minTo), maxTo) : maxTo;
        const build = el('div', 'betbuild');
        const wordLabel = el('span', 'casino-idle', isBet ? T.holdem.betWord : T.holdem.raiseWord);
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.className = 'betinput';
        input.value = String(ui.bet);
        input.placeholder = '0';
        const stackBox = el('div', 'chipstack-slot');
        const clear = el('button', undefined, T.clear);
        clear.type = 'button';
        const go = el('button', 'primary', isBet ? T.holdem.bet : T.holdem.raiseTo(ui.bet));
        go.type = 'button';
        const sync = (fromTyping = false): void => {
          if (!fromTyping) input.value = String(ui.bet);
          stackBox.replaceChildren(chipStackEl(ui.bet));
          clear.disabled = canFullRaise ? ui.bet <= minTo : true;
          go.disabled = canFullRaise ? (ui.bet < minTo || ui.bet > maxTo) : ui.bet !== maxTo;
          go.textContent = isBet ? T.holdem.bet : T.holdem.raiseTo(ui.bet);
        };
        input.addEventListener('input', () => {
          // 只留数字,精度 1 不许小数;失焦时钳回合法区间,输入中只保留上限。
          const digits = input.value.replace(/\D+/g, '').slice(0, 6);
          if (digits !== input.value) input.value = digits;
          ui.bet = digits === '' ? 0 : Math.min(parseInt(digits, 10) || 0, maxTo);
          sync(true);
        }, { signal: ctx.signal });
        input.addEventListener('blur', () => {
          ui.bet = canFullRaise ? Math.min(Math.max(ui.bet, minTo), maxTo) : maxTo;
          sync();
        }, { signal: ctx.signal });
        const add = (n: number): void => {
          ui.bet = Math.min(maxTo, ui.bet + n);
          sync();
        };
        for (const [label, n, tone] of [[T.chip10, 10, 'red'], [T.chip50, 50, 'green'], [T.chip100, 100, 'black']] as const) {
          const chip = el('div', `chip chip-${tone}`, label);
          chip.addEventListener('click', () => add(n), { signal: ctx.signal });
          build.append(chip);
        }
        const allin = el('div', 'chip chip-gold', T.holdem.allin);
        allin.addEventListener('click', () => {
          ui.bet = maxTo;
          sync();
        }, { signal: ctx.signal });
        build.append(allin, wordLabel, input, stackBox, el('span', 'casino-idle', canFullRaise ? T.holdem.minRaiseIs(minTo) : T.holdem.allinOnlyHint(maxTo)));
        wrap.append(build);
        clear.addEventListener('click', () => {
          ui.bet = minTo;
          sync();
        }, { signal: ctx.signal });
        go.addEventListener('click', () => void send(ctx, T, isBet ? 'bet' : 'raise', { amount: ui.bet }), { signal: ctx.signal });
        const row2 = el('div', 'btnrow');
        row2.append(clear, go);
        wrap.append(row2);
      }
    } else if (he.phase === 'runout') {
      const wait = el('div', 'banner wait');
      wait.append(el('span', 'banner-text', T.holdem.dealing));
      bannerBox.append(wait);
    } else if (he.toAct === 'ai' && !he.winner) {
      const toCallAi = Math.max(0, he.currentBet - he.aiCommitted);
      const wait = el('div', 'banner wait');
      wait.append(el('span', 'banner-text', T.holdem.aiThinkingTurn(toCallAi)));
      const nudge = el('button', undefined, T.nudge);
      nudge.type = 'button';
      nudge.addEventListener('click', () => void send(ctx, T, 'nudge'), { signal: ctx.signal });
      wait.append(nudge);
      bannerBox.append(wait);
    }

    // ── 德州手历史 ──
    const heHistory = el('div', 'history');
    const heToggle = el('button', 'history-toggle', T.historyToggle(ui.historyOpen, he.holdemHistory.length));
    heToggle.type = 'button';
    heToggle.addEventListener('click', () => {
      ui.historyOpen = !ui.historyOpen;
      heToggle.textContent = T.historyToggle(ui.historyOpen, he.holdemHistory.length);
      heList.classList.toggle('hidden', !ui.historyOpen);
    }, { signal: ctx.signal });
    heHistory.append(heToggle);
    const heList = el('div');
    heList.classList.toggle('hidden', !ui.historyOpen);
    for (const record of he.holdemHistory) {
      const line = el('div', 'history-line');
      line.append(el('span', undefined, `${T.holdem.roundLabel(record.round, '')} ${record.by === 'fold' ? T.holdem.foldLine : (record.playerMade ?? '')}`));
      line.append(el('span', 'history-cards', `${record.playerHole.join(' ')} vs ${record.aiHole.length ? record.aiHole.join(' ') : '??'} · ${record.board.join(' ')}`));
      const playerDelta = -record.delta;
      line.append(el('span', `delta ${playerDelta >= 0 ? 'up' : 'down'}`, `${playerDelta >= 0 ? '+' : ''}${playerDelta}`));
      heList.append(line);
    }
    heHistory.append(heList);
    wrap.append(heHistory);
  }

  // ── 抽鬼牌桌面 ──
  // ── 抽鬼牌桌面(终局态也在此:winner 非 null 即终局,牌面留在桌上) ──
  if (state.game === 'oldmaid') {
    const omEnded = state.winner != null;
    const omTurnOwner = state.turnOwner ?? 'player';
    const omWinner = state.winner;
    const omPlayerCards = state.playerCards ?? [];
    const omPlayerHandCount = state.playerHandCount ?? 0;
    const omAiHandCount = state.aiHandCount ?? 0;
    const omDiscardPairs = state.discardPairs ?? 0;
    const omLastDiscards = state.lastDiscards ?? [];
    const omScore = state.score ?? { ai: 0, player: 0 };
    const omOldmaidHistory = state.oldmaidHistory ?? [];
    const omPlays = state.oldmaidPlays ?? omOldmaidHistory.length;
    const winner = omWinner;
    const playerIsIdler = omTurnOwner !== 'player';

    const felt = el('div', 'felt');
    wrap.append(felt);

    // 对方席(上,背面)
    const aiSeat = el('div', 'seat');
    const aiHead = el('div', 'seat-head');
    aiHead.append(el('span', undefined, T.ai));
    aiHead.append(el('span', 'seat-role', T.rolePlayer));
    aiSeat.append(aiHead);
    const aiCards = el('div', 'cards');
    const canPick = !omEnded && omTurnOwner === 'player';
    for (let i = 0; i < omAiHandCount; i++) {
      const back = cardEl('', true, { key: `om-g${omPlays}-ai${i}`, kind: 'deal' });
      if (canPick) {
        back.classList.add('pickable');
        const idx = i;
        back.addEventListener('click', () => void send(ctx, T, 'draw', { index: idx }), { signal: ctx.signal });
      }
      aiCards.append(back);
    }
    if (!omEnded && omAiHandCount === 0) aiCards.append(cardEl('', true));
    aiSeat.append(aiCards);
    aiSeat.append(el('div', 'total-pill', T.oldmaid.aiHand(omAiHandCount)));
    felt.append(aiSeat);

    // 中间:弃对堆
    const pot = el('div', 'pot');
    const potInner = el('div', 'pot-inner');
    potInner.append(el('div', undefined, T.oldmaid.discards(omDiscardPairs)));
    potInner.append(el('div', 'pot-num', String(omDiscardPairs)));
    const last3 = omLastDiscards ?? [];
    for (const pair of last3) {
      potInner.append(el('div', undefined, pair.join(' ')));
    }
    pot.append(potInner);
    felt.append(pot);

    // 你的席(下,明牌)
    const playerSeat = el('div', 'seat');
    const playerHead = el('div', 'seat-head');
    playerHead.append(el('span', undefined, T.me));
    playerSeat.append(playerHead);
    const playerCards = el('div', 'cards');
    for (const text of omPlayerCards) playerCards.append(cardEl(text, false, { key: `om-g${omPlays}-p${text}`, kind: 'deal' }));
    playerSeat.append(playerCards);
    playerSeat.append(el('div', 'total-pill', `${T.oldmaid.ownerHand(omPlayerHandCount)} · ${T.oldmaid.score(omScore.ai, omScore.player)}`));
    felt.append(playerSeat);

    // ── 抽鬼牌结束横幅 + 场中央的「再来一局 / 返回主菜单」 ──
    const bannerBox = el('div');
    wrap.append(bannerBox);
    if (omEnded && winner) {
      const playerWon = winner === 'player';
      const banner = el('div', `banner ${playerWon ? 'win' : 'lose'}`);
      banner.append(el('span', 'banner-text', playerWon ? T.oldmaid.winBanner : T.oldmaid.loseBanner));
      bannerBox.append(banner);
      if (state.hiddenCard) bannerBox.append(el('div', 'hidden-reveal', T.oldmaid.hiddenReveal(state.hiddenCard)));
      // 不用回大厅重开:当场接着来,胜场与局历史延续。
      const row = el('div', 'btnrow');
      const again = el('button', 'primary', T.oldmaid.againBtn);
      again.type = 'button';
      again.addEventListener('click', () => void send(ctx, T, 'again'), { signal: ctx.signal });
      const back = el('button', undefined, T.oldmaid.backLobbyBtn);
      back.type = 'button';
      back.addEventListener('click', () => void send(ctx, T, 'leave'), { signal: ctx.signal });
      row.append(again, back);
      bannerBox.append(row);
    }

    // ── 回合操作:玩家回合点对方背面牌,无需按钮 ──
    if (!omEnded && omTurnOwner === 'player') {
      const banner2 = el('div', 'banner wait');
      banner2.append(el('span', 'banner-text', T.oldmaid.yourTurn));
      wrap.append(banner2);
    } else if (!omEnded && omTurnOwner === 'ai') {
      const banner2 = el('div', 'banner wait');
      banner2.append(el('span', 'banner-text', T.oldmaid.aiTurn));
      wrap.append(banner2);
    }

    // ── 局历史 ──
    const omHistory = el('div', 'history');
    const omToggle = el('button', 'history-toggle', T.matchToggle(ui.matchOpen, omOldmaidHistory.length));
    omToggle.type = 'button';
    omToggle.addEventListener('click', () => {
      ui.matchOpen = !ui.matchOpen;
      omToggle.textContent = T.matchToggle(ui.matchOpen, omOldmaidHistory.length);
      omList.classList.toggle('hidden', !ui.matchOpen);
    }, { signal: ctx.signal });
    omHistory.append(omToggle);
    const omList = el('div');
    omList.classList.toggle('hidden', !ui.matchOpen);
    omOldmaidHistory.forEach((record, i) => {
      const line = el('div', 'history-line');
      const when = (record.at || '').slice(5, 16).replace('T', ' ');
      line.append(el('span', undefined, T.oldmaid.historyLine(when, record.discardPairs, record.hidden ?? '')));
      const pill = outcomePill(T, record.winner === 'player' ? 'win' : 'lose');
      line.append(pill);
      omList.append(line);
    });
    omHistory.append(omList);
    wrap.append(omHistory);
  }

  // ── 21 点手历史 ──
  if (state.game === 'blackjack') {
    const history = el('div', 'history');
    const toggle = el('button', 'history-toggle', T.historyToggle(ui.historyOpen, (state.history ?? []).length));
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      ui.historyOpen = !ui.historyOpen;
      toggle.textContent = T.historyToggle(ui.historyOpen, (state.history ?? []).length);
      list.classList.toggle('hidden', !ui.historyOpen);
    }, { signal: ctx.signal });
    history.append(toggle);
    const list = el('div');
    list.classList.toggle('hidden', !ui.historyOpen);
    for (const record of state.history ?? []) {
      const line = el('div', 'history-line');
      line.append(el('span', undefined, `${T.roundLabel(record.round, record.dealer === 'ai' ? T.historyDealerAI : T.historyDealerMe, '')} ${T.chips} ${record.bet}`));
      const handsText = record.hands.map((h) => `${h.cards.join(' ')}(${T.outcome[h.outcome] ?? h.outcome})`).join(' / ');
      line.append(el('span', 'history-cards', `${handsText} vs ${record.dealerCards.join(' ')}`));
      if (record.insurance > 0) {
        line.append(el('span', undefined, `${T.chips} ${record.insurance}${record.insuranceWon ? ' ✓' : ' ✗'}`));
      }
      const playerDelta = record.dealer === 'ai' ? record.delta : -record.delta;
      line.append(el('span', `delta ${playerDelta >= 0 ? 'up' : 'down'}`, `${playerDelta >= 0 ? '+' : ''}${playerDelta}`));
      list.append(line);
    }
    history.append(list);
    wrap.append(history);
  }

  // ── 场次记录(21 点 / 德州共用) ──
  const matches = state.matches ?? [];
  if (state.game === 'blackjack' || state.game === 'holdem' || matches.length > 0) {
    const matchBox = el('div', 'history');
    const matchToggle = el('button', 'history-toggle', T.matchToggle(ui.matchOpen, matches.length));
    matchToggle.type = 'button';
    matchToggle.addEventListener('click', () => {
      ui.matchOpen = !ui.matchOpen;
      matchToggle.textContent = T.matchToggle(ui.matchOpen, matches.length);
      matchList.classList.toggle('hidden', !ui.matchOpen);
    }, { signal: ctx.signal });
    matchBox.append(matchToggle);
    const matchList = el('div');
    matchList.classList.toggle('hidden', !ui.matchOpen);
    if (!matches.length) matchList.append(el('div', 'casino-idle', T.matchEmpty));
    for (const match of matches) {
      const line = el('div', 'history-line');
      const when = (match.at || '').slice(5, 16).replace('T', ' ');
      line.append(el('span', undefined, T.matchLine(when, match.rounds, match.aiChips, match.playerChips, match.winner, match.playerNet)));
      line.append(el('span', 'history-cards', `AI ${match.aiChips} / ${T.me} ${match.playerChips}`));
      line.append(el('span', `delta ${match.winner === 'player' ? 'up' : match.winner === 'ai' ? 'down' : ''}`, T.matchWinner[match.winner]));
      matchList.append(line);
    }
    matchBox.append(matchList);
    wrap.append(matchBox);
  }

  // ── 规则浮层(仅对局中;回大厅即收起;Esc 可关) ──
  if (state.game === null) ui.rulesOpen = false;
  if (ui.rulesOpen) {
    wrap.append(buildRules(ctx, T, state.game));
    bindEsc(() => {
      ui.rulesOpen = false;
      if (current) render(ctx, current);
    });
  }

  // ── 错误条 ──
  wrap.append(el('div', 'casino-error'));
}

/** 规则说明浮层:右上角按钮展开;内容随桌面当前游戏切换,空桌时所有游戏的规则都给(按浏览器语言)。 */
function buildRules(ctx: WebUiPanelContext, T: PanelText, game: 'blackjack' | 'oldmaid' | 'holdem' | null): HTMLElement {
  const overlay = el('div', 'rules-overlay');
  const card = el('div', 'rules-card');
  const tpl = document.createElement('template');
  tpl.innerHTML = game === 'oldmaid'
    ? T.rulesOldmaidHtml
    : game === 'holdem'
      ? T.rulesHoldemHtml
        : game === 'blackjack'
      ? T.rulesBlackjackHtml
      : `${T.rulesBlackjackHtml}\n${T.rulesOldmaidHtml}\n${T.rulesHoldemHtml}`;
  card.append(tpl.content.cloneNode(true));
  const close = el('button', 'rules-close', T.rulesCloseBtn);
  close.type = 'button';
  close.addEventListener('click', () => {
    ui.rulesOpen = false;
    if (current) render(ctx, current);
  }, { signal: ctx.signal });
  card.append(close);
  overlay.append(card);
  return overlay;
}

export default {
  panels: {
    table: {
      async mount(ctx: WebUiPanelContext): Promise<void> {
        ctx.stream({
          message: (text) => {
            // 联机页有自己的 1s 轮询;本地对局的广播流不在联机页整页重渲染(会打断弹窗与轮询)。
            if (ui.lobbyMode === 'online') return;
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
