/**
 * 面板文字的双语表:浏览器语言(ctx.language)→ zh / en,其余语言按 pick 语义回退
 * (zh-Hant 读中文,其余读英文)。规则浮层的正文也是 HTML,一并入表。
 * 服务端(handleInvoke 的错误)也用这份表,按部署语言取——纯数据,无 DOM 依赖。
 */

const zh = {
  title: '月下牌桌',
  rulesBtn: '规则说明',
  rulesClose: '收起规则',
  resetBtn: '记录并重来',
  roundLabel: (round: number, role: string, soft: string) => `第 ${round} 手 · ${role} · ${soft}`,
  roleText: { noGame: '还没开局', aiDealer: 'AI 坐庄 · 你是闲家', meDealer: '你坐庄(按规则自动打)· AI 是闲家' },
  soft17Stand: 'S17',
  soft17Hit: 'H17',
  me: '我',
  ai: 'AI',
  roleDealer: '庄家',
  rolePlayer: '闲家',
  dealerAutoHint: '庄家按固定规则自动打',
  idleHint: '闲家先行动;坐庄按固定规则自动打',
  dealerTotal: (n: number) => `庄家 ${n} 点`,
  dealerUpTotal: (n: number) => `庄家明牌 ${n} 点`,
  withHole: ' +1 暗牌',
  bank: '银行',
  chips: '筹码',
  stats: (w: number, l: number, p: number, net: number) => `${w}胜 ${l}负 ${p}平 · 净${net >= 0 ? '+' : ''}${net}`,
  potIdle: '一手已结,选庄再开',
  potPickDealer: '选庄开局',
  potMinEach: (n: number) => `各 ${n} 起押`,
  potBet: '本手底注',
  potWithInsurance: (n: number) => ` · 保险 ${n}`,
  outcome: <Record<string, string>>{ win: '赢', lose: '输', push: '平', blackjack: '黑杰克', bust: '爆牌', surrender: '投降' },
  bannerHands: (round: number, bet: number, insurance: number, insuranceWon: boolean, hands: string, dealer: string) =>
    `第 ${round} 手 · 押 ${bet}${insurance > 0 ? ` · 保险 ${insurance}${insuranceWon ? '赢' : '输'}` : ''} · 闲 ${hands} 对 庄 ${dealer}`,
  waitingBet: '等 AI 下注…(它已收到通知)',
  waitingInsurance: '等 AI 决定保险…(它已收到通知)',
  waitingPlay: 'AI 出牌中…',
  dealerPlayingAI: '庄家(AI)按规则打牌中…',
  dealerPlayingMe: '你的庄家手按规则打牌中…',
  nudge: '催一下',
  idleBtnAI: '让 AI 坐庄',
  idleBtnMe: '我坐庄',
  broke: (chips: number, minBet: number) => `你的筹码只剩 ${chips},低于最小注 ${minBet}。`,
  reliefBtn: (n: number) => `领救济(重置 ${n})`,
  betView: (n: number) => `押 ${n}`,
  chip10: '+10', chip50: '+50', chip100: '+100', allin: '全押',
  clear: '清零',
  goBet: (cap: number) => `下注开局(上限 ${cap})`,
  hit: '要牌', stand: '停牌', double: '加倍', splitBtn: '分牌', surrenderBtn: '投降',
  insuranceAsk: (max: number) => `庄家亮 A:买保险吗?最多 ${max},庄家黑杰克按 2:1 赔。`,
  insuranceDecline: '不买',
  insuranceBuy: (n: number) => `买保险 ${n}`,
  historyToggle: (open: boolean, n: number) => `${open ? '▾' : '▸'} 历史(${n})`,
  matchToggle: (open: boolean, n: number) => `${open ? '▾' : '▸'} 场次记录(${n})`,
  matchEmpty: '还没有归档的场次;点右上角「记录并重来」把当前场次存档并重置筹码。',
  matchLine: (when: string, rounds: number, aiChips: number, playerChips: number, winner: string, playerNet: number) =>
    `${when} · ${rounds} 手`,
  matchWinner: { ai: 'AI 赢', player: '我赢', tie: '平' },
  historyDealerAI: 'AI', historyDealerMe: '我',
  outcomeOf: (o: string) => o,
  rulesTitle: '怎么开局',
  rulesHtml: `
    <h4>怎么开局</h4>
    <p>点「让 AI 坐庄」或「我坐庄」→ 闲家下注 → 发牌(闲家两张全明,庄家一亮一暗)→ 闲家行动 → 庄家按规则打 → 结算。</p>
    <h4>庄闲怎么分工</h4>
    <ul>
      <li><b>AI 坐庄 = 你来决策:</b>你当闲家,下注、要牌、停牌、加倍、分牌、保险、投降都由你在面板操作;AI 当银行,按规则自动打。</li>
      <li><b>我坐庄 = AI 来打:</b>你当银行不决策,收注与赔付;AI 作为闲家自己下注、要牌、停牌;你的庄家手由引擎按规则自动补牌。</li>
    </ul>
    <h4>点数</h4>
    <ul>
      <li>A 按 1 或 11 记(算有利的那个);J / Q / K 记 10。</li>
      <li>首两张 21 = 黑杰克;庄家不足 17 必须补,到 17 停(软 17 停或补看设置,右上角标 S17 / H17)。</li>
    </ul>
    <h4>闲家动作</h4>
    <ul>
      <li><b>要牌 / 停牌:</b>爆牌立即输。</li>
      <li><b>加倍:</b>一手的前两张,翻倍、补一张、停牌。</li>
      <li><b>分牌:</b>同点两张分成两手,各配同额注、各补一张;分 A 各一张即停;分牌后的 21 不算黑杰克;限一次。</li>
      <li><b>保险:</b>庄家亮 A 时可买(最多底注一半);庄家是黑杰克按 2:1 赔,否则被收走。</li>
      <li><b>投降:</b>开局的前两张、还没动作时可弃一半注结束。</li>
    </ul>
    <h4>结算</h4>
    <ul>
      <li>闲家先行动,先爆先输;庄家爆牌闲家全赢;比点大者赢;平局退注。</li>
      <li>闲家黑杰克赔 1.5 倍;庄家黑杰克闲输;双方黑杰克平。</li>
      <li>筹码低于最小注算破产,可领救济金重新来;筹码是游戏数字,不涉及真钱。</li>
    </ul>
  `,
  rulesCloseBtn: '知道了,继续',
};

export type PanelText = typeof zh;

const en: PanelText = {
  title: 'Moonlit Table',
  rulesBtn: 'Rules',
  rulesClose: 'Hide rules',
  resetBtn: 'Archive & restart',
  roundLabel: (round, role, soft) => `Hand ${round} · ${role} · ${soft}`,
  roleText: { noGame: 'No game yet', aiDealer: 'AI is the dealer · you are the player', meDealer: 'You are the dealer (played by the rules) · AI is the player' },
  soft17Stand: 'S17',
  soft17Hit: 'H17',
  me: 'Me',
  ai: 'AI',
  roleDealer: 'dealer',
  rolePlayer: 'player',
  dealerAutoHint: 'The dealer plays by the fixed table rule',
  idleHint: 'The player acts first; the dealer hand is played by the rules',
  dealerTotal: (n) => `Dealer ${n}`,
  dealerUpTotal: (n) => `Dealer shows ${n}`,
  withHole: ' +1 hole card',
  bank: 'Bank',
  chips: 'Chips',
  stats: (w, l, p, net) => `${w}W ${l}L ${p}P · net ${net >= 0 ? '+' : ''}${net}`,
  potIdle: 'Hand settled — pick the dealer for the next one',
  potPickDealer: 'Pick the dealer to start',
  potMinEach: (n) => `from ${n} each`,
  potBet: 'Current stake',
  potWithInsurance: (n) => ` · insurance ${n}`,
  outcome: <Record<string, string>>{ win: 'win', lose: 'lose', push: 'push', blackjack: 'blackjack', bust: 'bust', surrender: 'surrender' },
  bannerHands: (round, bet, insurance, insuranceWon, hands, dealer) =>
    `Hand ${round} · stake ${bet}${insurance > 0 ? ` · insurance ${insurance}${insuranceWon ? ' won' : ' lost'}` : ''} · player ${hands} vs dealer ${dealer}`,
  waitingBet: 'Waiting for the AI to bet… (it has been notified)',
  waitingInsurance: 'Waiting for the AI to decide the insurance… (it has been notified)',
  waitingPlay: 'The AI is playing…',
  dealerPlayingAI: 'The dealer (AI) is playing by the rules…',
  dealerPlayingMe: 'Your dealer hand is being played by the rules…',
  nudge: 'Nudge',
  idleBtnAI: 'Let the AI deal',
  idleBtnMe: 'I deal',
  broke: (chips, minBet) => `You only have ${chips} chips, below the minimum bet of ${minBet}.`,
  reliefBtn: (n) => `Take relief (reset to ${n})`,
  betView: (n) => `Stake ${n}`,
  chip10: '+10', chip50: '+50', chip100: '+100', allin: 'All-in',
  clear: 'Clear',
  goBet: (cap) => `Bet & deal (cap ${cap})`,
  hit: 'Hit', stand: 'Stand', double: 'Double', splitBtn: 'Split', surrenderBtn: 'Surrender',
  insuranceAsk: (max) => `Dealer shows an Ace: take insurance? At most ${max}; it pays 2:1 if the dealer has blackjack.`,
  insuranceDecline: 'Decline',
  insuranceBuy: (n) => `Insure ${n}`,
  historyToggle: (open, n) => `${open ? '▾' : '▸'} History(${n})`,
  matchToggle: (open, n) => `${open ? '▾' : '▸'} Matches(${n})`,
  matchEmpty: 'No archived matches yet; use "Archive & restart" (top right) to save the current match and reset the chips.',
  matchLine: (when, rounds, aiChips, playerChips, winner, playerNet) => `${when} · ${rounds} hands`,
  matchWinner: { ai: 'AI wins', player: 'I win', tie: 'tie' },
  historyDealerAI: 'AI', historyDealerMe: 'Me',
  outcomeOf: (o) => o,
  rulesTitle: 'How to start',
  rulesHtml: `
    <h4>Starting a hand</h4>
    <p>Tap "Let the AI deal" or "I deal" → the player bets → cards are dealt (both player cards face up; dealer one up, one hidden) → the player acts → the dealer plays by the rule → settlement.</p>
    <h4>Who does what</h4>
    <ul>
      <li><b>AI deals = you decide:</b> you are the player — betting, hitting, standing, doubling, splitting, insurance and surrender are all yours on the panel; the AI runs the bank and plays by the rule.</li>
      <li><b>I deal = the AI plays:</b> you run the bank without decisions, collecting and paying; the AI plays its own hand as the player, and the engine draws your dealer hand by the rule.</li>
    </ul>
    <h4>Card values</h4>
    <ul>
      <li>An Ace counts 1 or 11 (whichever helps); J / Q / K count 10.</li>
      <li>Two cards totalling 21 = blackjack; the dealer must draw below 17 and stand at 17 (soft 17 stands or hits per the setting — S17 / H17 in the top right).</li>
    </ul>
    <h4>Player actions</h4>
    <ul>
      <li><b>Hit / stand:</b> busting loses immediately.</li>
      <li><b>Double:</b> the first two cards of a hand — stake doubles, one card, then stand.</li>
      <li><b>Split:</b> two equal-rank cards become two hands, each matched-bet and drawn one card; split aces get one card each; a 21 after splitting is not blackjack; one split per hand.</li>
      <li><b>Insurance:</b> when the dealer shows an Ace (up to half the bet); it pays 2:1 if the dealer has blackjack, otherwise it is collected.</li>
      <li><b>Surrender:</b> on the fresh first two cards, forfeit half the bet and end the hand.</li>
    </ul>
    <h4>Settlement</h4>
    <ul>
      <li>The player acts first and busts first; a dealer bust pays every live hand; higher total wins; ties push.</li>
      <li>A player blackjack pays 1.5×; a dealer blackjack wins the stake; both blackjack pushes.</li>
      <li>Below the minimum bet you are broke and may take relief; chips are game numbers, no real money involved.</li>
    </ul>
  `,
  rulesCloseBtn: 'Got it, continue',
};

export type PanelTables = { zh: PanelText; en: PanelText };

/** 面板语言选择:zh-Hant 暂读中文,其余语言读英文。 */
export function panelText(language: string | undefined): PanelText {
  return language === 'en' ? en : zh;
}
