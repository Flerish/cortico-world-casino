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
  game: 'blackjack' | 'oldmaid' | 'holdem' | null;
  /** 有未完对局的游戏(打开时面板弹「继续/重新开始」)。 */
  pausedGames?: Array<'blackjack' | 'oldmaid' | 'holdem'>;
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

function statsLine(T: PanelText, seat: SeatView): string {
  return T.stats(seat.wins, seat.losses, seat.pushes, seat.net);
}

function outcomePill(T: PanelText, outcome: string): HTMLElement {
  return el('span', `outcome-pill ${outcome}`, T.outcome[outcome] ?? outcome);
}

function showError(ctx: WebUiPanelContext, message: string): void {
  const box = ctx.root.querySelector('[data-error]');
  if (box) box.textContent = message;
}

async function send(ctx: WebUiPanelContext, T: PanelText, action: string, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    const state = await ctx.invoke<Snapshot>('action', [{ action, ...extra }]);
    render(ctx, state);
  } catch (err) {
    showError(ctx, err instanceof Error ? err.message : String(err));
  }
}

/** 界面本地状态:下注输入、折叠区、规则浮层与大厅搜索词;换手时下注清零。 */
const ui = { bet: 0, historyOpen: false, rulesOpen: false, matchOpen: false, lobbyQuery: '' };
/** 最近一次渲染的快照,规则浮层开合时用它重渲染。 */
let current: Snapshot | null = null;

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
  if (state.game !== 'blackjack' && state.game !== 'holdem') ui.bet = 0;
  const T = panelText(ctx.language);
  const root = ctx.root;
  root.replaceChildren();

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
      padding: 14px 18px 12px; font-size: 13px; line-height: 1.55; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
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
    .chip.chip-green { background: #2c7a4b; } .chip.chip-black { background: #2a2822; }
    .history { margin-top: 12px; }
    .history-toggle { background: none; border: none; cursor: pointer; font-size: 13px; opacity: .75; padding: 2px 0; }
    .history-line { display: flex; gap: 8px; font-size: 12px; padding: 3px 0; flex-wrap: wrap; align-items: center; }
    .history-cards { letter-spacing: 1px; opacity: .85; }
    .hidden { display: none; }
    .casino-error { color: #c0506a; font-size: 12px; min-height: 15px; margin-top: 6px; }
    .casino-idle { opacity: .5; font-size: 12px; padding: 2px 0; }
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

  // ── 空桌:游戏大厅(可滚动列表 + 搜索;以后新玩法往列表里加卡即可) ──
  if (state.game === null) {
    const felt = el('div', 'felt lobby');
    wrap.append(felt);

    const head = el('div', 'lobby-head');
    const suits = el('div', 'lobby-suits');
    for (const [i, s] of (['♠', '♥', '♦', '♣'] as const).entries()) {
      suits.append(el('span', i % 2 === 0 ? 'ls-black' : 'ls-red', s));
    }
    head.append(suits, el('div', 'lobby-title', T.title), el('div', 'lobby-sub', T.gamePicker.title));
    felt.append(head);

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

    const dealerSeat = el('div', 'seat');
    const dealerHead = el('div', 'seat-head');
    dealerHead.append(el('span', undefined, dealerIsAi ? T.ai : T.me));
    dealerHead.append(el('span', 'seat-role', T.roleDealer));
    dealerSeat.append(dealerHead);
    const dealerCards = el('div', 'cards');
    if (bj.phase !== 'betting' || bj.dealerCards.length === 0) {
      if (bj.dealerCards.length === 0) dealerCards.append(cardEl('', true));
    }
    for (const text of bj.dealerCards) dealerCards.append(cardEl(text));
    for (let i = 0; i < bj.holeCount; i++) dealerCards.append(cardEl('', true));
    dealerSeat.append(dealerCards);
    if (bj.holeRevealed && bj.dealerTotal !== null) {
      dealerSeat.append(el('div', 'total-pill', `${T.roleDealer} ${bj.dealerTotal}`));
    } else if (bj.dealerVisibleTotal !== null) {
      dealerSeat.append(el('div', 'total-pill', `${T.dealerUpTotal(bj.dealerVisibleTotal)}${bj.holeCount > 0 ? T.withHole : ''}`));
    }
    const dealerFoot = el('div', 'seat-head');
    dealerFoot.append(chipsEl(T.bank, dealerSeatView.chips, dealerIsAi ? 'blue' : 'gold'));
    dealerFoot.append(el('span', 'seatstats', statsLine(T, dealerSeatView)));
    dealerSeat.append(dealerFoot);
    felt.append(dealerSeat);

    const pot = el('div', 'pot');
    const potInner = el('div', 'pot-inner');
    potInner.append(el('div', undefined, T.potBet + (bj.insurance > 0 ? T.potWithInsurance(bj.insurance) : '')));
    potInner.append(el('div', 'pot-num', String(bj.bet)));
    pot.append(potInner);
    felt.append(pot);

    const playerSeat = el('div', 'seat');
    const playerHead = el('div', 'seat-head');
    playerHead.append(el('span', undefined, dealerIsAi ? T.me : T.ai));
    playerHead.append(el('span', 'seat-role', T.rolePlayer));
    playerSeat.append(playerHead);
    const playerCards = el('div', 'cards');
    if (bj.hands.length === 0) playerCards.append(cardEl('', true));
    for (const hand of bj.hands) {
      for (const text of hand.cards) playerCards.append(cardEl(text));
    }
    playerSeat.append(playerCards);
    const totals = bj.hands.map((hand) => hand.total).filter((n) => n !== null);
    if (totals.length) {
      playerSeat.append(el('div', 'total-pill', `${T.rolePlayer} ${totals.join(' / ')} 点`));
    }
    const playerFoot = el('div', 'seat-head');
    playerFoot.append(chipsEl(T.chips, playerSeatView.chips, dealerIsAi ? 'gold' : 'blue'));
    playerFoot.append(el('span', 'seatstats', statsLine(T, playerSeatView)));
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
      const view = el('span', 'betview', T.betView(ui.bet));
      const clear = el('button', undefined, T.clear);
      clear.type = 'button';
      const go = el('button', 'primary', T.goBet(cap));
      go.type = 'button';
      const sync = (): void => {
        view.textContent = T.betView(ui.bet);
        clear.disabled = ui.bet === 0;
        go.disabled = ui.bet < bj.minBet;
      };
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
      build.append(allin, view);
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
      for (const text of he.aiCards) aiCardsRow.append(cardEl(text));
    } else {
      const n = Math.max(he.aiHoleCount, he.round > 0 ? 2 : 0);
      for (let i = 0; i < n; i++) aiCardsRow.append(cardEl('', true));
    }
    aiSeat.append(aiCardsRow);
    aiSeat.append(el('div', 'total-pill', he.revealHole && he.aiCards?.length ? T.holdem.aiHoleShown(he.aiCards.join(' ')) : T.holdem.aiHoleHidden(Math.max(he.aiHoleCount, he.round > 0 ? 2 : 0))));
    const aiFoot = el('div', 'seat-head');
    aiFoot.append(chipsEl(T.chips, state.ai.chips, 'blue'));
    aiFoot.append(el('span', 'seatstats', statsLine(T, state.ai)));
    aiSeat.append(aiFoot);
    felt.append(aiSeat);

    // 中间:公共牌 + 底池
    const pot = el('div', 'pot');
    const potInner = el('div', 'pot-inner');
    potInner.append(el('div', undefined, `${T.holdem.potLabel} · ${T.holdem.blindsLabel(he.blinds.sb, he.blinds.bb)} · ${T.holdem.capIs(he.streetCap)}`));
    potInner.append(el('div', 'pot-num', String(he.pot)));
    if (he.round > 0) potInner.append(el('div', undefined, T.holdem.roundLabel(he.round, phaseName)));
    const communityRow = el('div', 'cards');
    if (he.community.length) {
      for (const text of he.community) communityRow.append(cardEl(text));
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
      for (const text of he.playerCards) playerCardsRow.append(cardEl(text));
    } else {
      playerCardsRow.append(cardEl('', true));
    }
    playerSeat.append(playerCardsRow);
    playerSeat.append(el('div', 'total-pill', `本手投入 ${he.playerCommitted} / 底池 ${he.pot}`));
    const playerFoot = el('div', 'seat-head');
    playerFoot.append(chipsEl(T.chips, state.player.chips, 'gold'));
    playerFoot.append(el('span', 'seatstats', statsLine(T, state.player)));
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
      // 下注/加注构建器:筹码累加,目标额 = 本街投入到的总额;allinOnly 时锁定为全押额。
      if (canFullRaise || allinOnly) {
        ui.bet = canFullRaise ? Math.min(Math.max(ui.bet, minTo), maxTo) : maxTo;
        const build = el('div', 'betbuild');
        const view = el('span', 'betview', isBet ? T.holdem.betView(ui.bet) : T.holdem.raiseView(ui.bet));
        const clear = el('button', undefined, T.clear);
        clear.type = 'button';
        const go = el('button', 'primary', isBet ? T.holdem.bet : T.holdem.raiseTo(ui.bet));
        go.type = 'button';
        const sync = (): void => {
          view.textContent = isBet ? T.holdem.betView(ui.bet) : T.holdem.raiseView(ui.bet);
          clear.disabled = canFullRaise ? ui.bet <= minTo : true;
          go.disabled = canFullRaise ? (ui.bet < minTo || ui.bet > maxTo) : ui.bet !== maxTo;
        };
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
        build.append(allin, view, el('span', 'casino-idle', canFullRaise ? T.holdem.minRaiseIs(minTo) : T.holdem.allinOnlyHint(maxTo)));
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
  if (state.game === 'oldmaid' || (state.game === null && state.winner !== undefined && state.playerCards)) {
    const omEnded = state.game === null;
    const omTurnOwner = state.turnOwner ?? 'player';
    const omWinner = state.winner;
    const omPlayerCards = state.playerCards ?? [];
    const omPlayerHandCount = state.playerHandCount ?? 0;
    const omAiHandCount = state.aiHandCount ?? 0;
    const omDiscardPairs = state.discardPairs ?? 0;
    const omLastDiscards = state.lastDiscards ?? [];
    const omScore = state.score ?? { ai: 0, player: 0 };
    const omOldmaidHistory = state.oldmaidHistory ?? [];
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
      const back = cardEl('', true);
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
    for (const text of omPlayerCards) playerCards.append(cardEl(text));
    playerSeat.append(playerCards);
    playerSeat.append(el('div', 'total-pill', `${T.oldmaid.ownerHand(omPlayerHandCount)} · ${T.oldmaid.score(omScore.ai, omScore.player)}`));
    felt.append(playerSeat);

    // ── 抽鬼牌结束横幅 ──
    const bannerBox = el('div');
    wrap.append(bannerBox);
    if (omEnded && winner) {
      const playerWon = winner === 'player';
      const banner = el('div', `banner ${playerWon ? 'win' : 'lose'}`);
      banner.append(el('span', 'banner-text', playerWon ? T.oldmaid.winBanner : T.oldmaid.loseBanner));
      bannerBox.append(banner);
      if (state.hiddenCard) bannerBox.append(el('div', 'hidden-reveal', T.oldmaid.hiddenReveal(state.hiddenCard)));
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

  // ── 规则浮层(仅对局中;回大厅即收起) ──
  if (state.game === null) ui.rulesOpen = false;
  if (ui.rulesOpen) wrap.append(buildRules(ctx, T, state.game));

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
