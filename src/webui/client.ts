/**
 * 月下牌桌的面板:主人从这里开手、要牌、停牌、加倍。
 * 对 cortico/* 只允许 import type;运行时值由包自带(装载器规范)。
 */
import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

interface SeatView {
  who: 'ai' | 'owner';
  chips: number;
  wins: number;
  losses: number;
  pushes: number;
  net: number;
  hand: {
    cards: string[];
    total: number;
    bet: number;
    phase: 'acting' | 'done';
    doubled: boolean;
    dealerUpcard: string;
  } | null;
}

interface Snapshot {
  version: number;
  minBet: number;
  maxBet: number;
  startChips: number;
  ai: SeatView;
  owner: SeatView;
  bankruptcies: number;
  history: Array<{ who: 'ai' | 'owner'; bet: number; playerCards: string[]; dealerCards: string[]; outcome: string; delta: number; at: string }>;
}

const OUTCOME_ZH: Record<string, string> = {
  win: '赢',
  lose: '输',
  push: '平',
  blackjack: '黑杰克',
  bust: '爆牌',
};

const WHO_ZH: Record<string, string> = { ai: 'AI', owner: '主人' };

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function post(ctx: WebUiPanelContext, action: string, bet?: number): Promise<void> {
  try {
    const state = await ctx.invoke<Snapshot>('action', [{ action, bet }]);
    render(ctx, state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const box = ctx.root.querySelector('[data-error]');
    if (box) box.textContent = message;
  }
}

function seatCard(seat: SeatView): HTMLElement {
  const card = el('div', 'casino-seat');
  const title = el('div', 'casino-seat-title');
  title.append(
    el('strong', undefined, WHO_ZH[seat.who] ?? seat.who),
    el('span', 'casino-chips', `筹码 ${seat.chips}`),
    el('span', 'casino-record', `${seat.wins}胜 ${seat.losses}负 ${seat.pushes}平 · 净${seat.net >= 0 ? '+' : ''}${seat.net}`),
  );
  card.append(title);
  if (seat.hand) {
    const hand = seat.hand;
    card.append(el('div', 'casino-hand', `${hand.cards.join(' ')} — ${hand.total} 点${hand.doubled ? '(已加倍)' : ''}`));
    card.append(el('div', 'casino-bet', `押注 ${hand.bet} · 庄家明牌 ${hand.dealerUpcard}`));
  } else {
    card.append(el('div', 'casino-hand casino-idle', '没有进行中的手'));
  }
  return card;
}

function render(ctx: WebUiPanelContext, state: Snapshot): void {
  const root = ctx.root;
  root.replaceChildren();

  const header = el('div', 'casino-header');
  header.append(el('strong', undefined, '月下牌桌'));
  header.append(el('span', 'casino-limits', `最小注 ${state.minBet} · 单手上限 ${state.maxBet} · 起始 ${state.startChips} · AI 破产 ${state.bankruptcies} 次`));
  root.append(header);

  root.append(seatCard(state.ai), seatCard(state.owner));

  const error = el('div', 'casino-error');
  error.setAttribute('data-error', '');
  root.append(error);

  const betRow = el('div', 'casino-actions');
  const betInput = document.createElement('input');
  betInput.type = 'number';
  betInput.min = String(state.minBet);
  betInput.max = String(state.maxBet);
  betInput.step = '10';
  betInput.value = String(state.minBet);
  betInput.className = 'casino-bet-input';
  const readBet = (): number => Math.floor(Number(betInput.value) || 0);
  const acting = state.owner.hand?.phase === 'acting';

  const makeButton = (label: string, action: string, needsBet: boolean, enabled: boolean): HTMLButtonElement => {
    const button = document.createElement('button');
    button.textContent = label;
    button.disabled = !enabled;
    button.addEventListener('click', () => {
      void post(ctx, action, needsBet ? readBet() : undefined);
    }, { signal: ctx.signal });
    return button;
  };

  betRow.append(betInput);
  betRow.append(makeButton('发牌', 'deal', true, !state.owner.hand));
  betRow.append(makeButton('要牌', 'hit', false, acting));
  betRow.append(makeButton('停牌', 'stand', false, acting));
  betRow.append(makeButton('加倍', 'double', false, acting && (state.owner.hand?.cards.length ?? 0) === 2));
  root.append(betRow);

  const history = el('div', 'casino-history');
  history.append(el('div', 'casino-history-title', '最近的手'));
  if (!state.history.length) {
    history.append(el('div', 'casino-idle', '还没有记录'));
  }
  for (const record of state.history) {
    const line = el('div', 'casino-history-line');
    line.append(el('span', undefined, `${WHO_ZH[record.who] ?? record.who} 押 ${record.bet}`));
    line.append(el('span', 'casino-cards', `${record.playerCards.join(' ')} 对 ${record.dealerCards.join(' ')}`));
    line.append(el('span', record.delta >= 0 ? 'casino-delta up' : 'casino-delta down', `${OUTCOME_ZH[record.outcome] ?? record.outcome} ${record.delta >= 0 ? '+' : ''}${record.delta}`));
    history.append(line);
  }
  root.append(history);
}

export default {
  panels: {
    table: {
      async mount(ctx: WebUiPanelContext): Promise<void> {
        const style = el('style');
        style.textContent = `
          .casino-header { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; margin-bottom: 8px; }
          .casino-limits { opacity: 0.7; font-size: 12px; }
          .casino-seat { border: 1px solid var(--cortico-border, #d8d4c8); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
          .casino-seat-title { display: flex; gap: 10px; align-items: baseline; }
          .casino-chips { font-weight: 600; }
          .casino-record { opacity: 0.7; font-size: 12px; }
          .casino-hand { margin-top: 6px; font-size: 15px; letter-spacing: 1px; }
          .casino-hand.casino-idle { opacity: 0.5; letter-spacing: normal; }
          .casino-bet { margin-top: 4px; font-size: 12px; opacity: 0.75; }
          .casino-actions { display: flex; gap: 8px; margin: 10px 0; align-items: center; }
          .casino-bet-input { width: 80px; }
          .casino-error { color: #b3405b; font-size: 12px; min-height: 16px; margin-bottom: 4px; }
          .casino-history-title { font-weight: 600; margin: 6px 0; }
          .casino-history-line { display: flex; gap: 10px; font-size: 13px; padding: 2px 0; flex-wrap: wrap; }
          .casino-cards { letter-spacing: 1px; }
          .casino-delta.up { color: #2c7a4b; }
          .casino-delta.down { color: #b3405b; }
          .casino-idle { opacity: 0.5; }
        `;
        ctx.root.append(style);

        ctx.stream({
          message: (text) => {
            try {
              render(ctx, JSON.parse(text) as Snapshot);
            } catch {
              // 坏帧忽略;面板以下一次推送为准。
            }
          },
        });

        try {
          render(ctx, await ctx.invoke<Snapshot>('state'));
        } catch (err) {
          ctx.root.append(el('div', 'casino-error', err instanceof Error ? err.message : String(err)));
        }
      },
    },
  },
};
