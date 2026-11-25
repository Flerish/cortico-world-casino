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
  statsWLP: (w: number, l: number, p: number) => `${w}胜 ${l}负 ${p}平`,
  netLabel: '净',
  betWord: '押',
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
  backBtn: '← 返回',
  rulesBlackjackHtml: `
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
  rulesOldmaidHtml: `
    <h4>怎么开局</h4>
    <p>点「开局」→ 整副 52 张里先随机藏起一张,谁也不给——它同点的同伴就是「鬼牌」→ 剩下 51 张轮流发完 → 双方先弃掉手里成对的牌 → 你先抽。</p>
    <h4>怎么抽牌</h4>
    <ul>
      <li><b>你的回合:</b>点对方任意一张背面牌抽走它——挑哪张全凭记忆和直觉。</li>
      <li><b>AI 的回合:</b>它从你手里随机抽一张;抽走了什么你不知道,只会看到手牌少一张。</li>
      <li>抽到的牌与手里同点即成对,立刻弃入弃牌堆(花色不限,点数相同即成对)。</li>
    </ul>
    <h4>胜负与鬼牌</h4>
    <ul>
      <li>先把手抽空的人赢;最后剩在输家手里的,必然是那张同点落单的鬼牌。</li>
      <li>终局亮出开局藏的那张牌,一局的心理战就此揭晓。</li>
      <li>弃牌堆会展示最近弃掉的对子——据此推理对方手里还留着什么、鬼牌落在谁那边。</li>
    </ul>
  `,
  rulesHoldemHtml: `
    <h4>怎么开局</h4>
    <p>点「开局」→ 每手点「发下一手」:庄位(每手轮换)自动押小盲、对方押大盲 → 各发 2 张底牌 → 翻牌前下注 → 翻牌 3 张 → 下注 → 转牌 → 下注 → 河牌 → 下注 → 摊牌。</p>
    <h4>单挑行动顺序</h4>
    <ul>
      <li><b>翻牌前:</b>庄位(小盲)先行动,大盲最后——没人加注时大盲可以免费过牌。</li>
      <li><b>翻牌后:</b>反过来,大盲先行动,庄位永远后手(庄位的补偿优势)。</li>
    </ul>
    <h4>下注规则(限注桌)</h4>
    <ul>
      <li>动作:弃牌、过牌、跟注、下注、加注;单街投入封顶 = 配置的「单手最大下注」。</li>
      <li>最小加注 = 现注 + 加注增量;筹码不足时可以全押(短筹码加注不再加价)。</li>
      <li>一方全押后直接发完公共牌摊牌,不再有弃牌。</li>
    </ul>
    <h4>比牌(7 张选最强 5 张)</h4>
    <ul>
      <li>从大到小:同花顺 &gt; 四条 &gt; 葫芦 &gt; 同花 &gt; 顺子 &gt; 三条 &gt; 两对 &gt; 一对 &gt; 高牌;平局平分底池(奇数筹码归大盲)。</li>
      <li>A 可作 A-2-3-4-5 的轮子(最小顺子)。</li>
      <li>弃牌局不亮弃牌方的底牌;摊牌局双方亮牌。</li>
    </ul>
  `,
  rulesCloseBtn: '知道了,继续',
  modeMenu: {
    subtitle: '选择模式',
    localTitle: '本地模式',
    localTag: 'LOCAL',
    localDesc: '和你的 AI 同桌:21 点、抽鬼牌、德州扑克,牌桌已就绪。',
    localBtn: '进入牌桌',
    onlineTitle: '联机模式',
    onlineTag: 'ONLINE',
    onlineDesc: '多人对局的入口:更多座位、更多牌搭子、跨桌对决。',
    onlineBtn: '看看入口',
    backToMenu: '← 模式',
    onlineWip: '🚧 联机模式正在建设中',
    onlineWipDesc: '这里将是多人对局的入口——更多座位、更多牌搭子、跨桌对决都在计划里。眼下先把本地牌桌打磨好,敬请期待。',
    backBtn: '← 返回主菜单',
  },
  online: {
    friendsTitle: '好友列表',
    statusTitle: '本地 AI 状态',
    statusIdle: '空闲',
    statusPlaying: '游戏中',
    statusResting: '休息中',
    selfId: '我的 ID:',
    unknown: '未知',
    vsLabel: '对局:',
    handsLabel: '手数:',
    chipsMe: '我的筹码',
    chipsPeer: '对方筹码',
    youAreBank: '本手你是庄家',
    peerIsBank: '本手对方坐庄',
    restHint: '长休中,到点自动换庄继续,无需操作。',
    stopBtn: '终止对局',
    idleHint: '空闲中。等 AI 自己邀约,或点好友右侧的 + 主动发起。',
    notEnabled: '星邮客户端未启用:请在扩展设置打开 worlds.casino.starpostEnabled。',
    notConfigured: '星邮已启用但 botId/令牌未配置。',
    clientNotReady: '星邮客户端未就绪:',
    lastErr: '最近错误:',
    noFriends: '还没有星邮好友:去星邮加好友后这里会显示。',
    inviteBtnTitle: '邀请对局',
    inviteTitle: '邀请对局',
    gameBlackjack: '21 点',
    gameOldmaid: '抽鬼牌',
    gameHoldem: '德州扑克',
  },
  gamePicker: {
    title: '选一个游戏开局',    blackjackTitle: '21 点',
    blackjackTag: 'BLACKJACK',
    blackjackDesc: '经典比点:庄家由引擎按死规则打,闲家自由决策——分牌、保险、投降一应俱全。',
    blackjackAI: '让 AI 坐庄',
    blackjackMe: '我坐庄',
    oldmaidTitle: '抽鬼牌',
    oldmaidTag: 'OLD MAID',
    oldmaidDesc: '开局整副牌里藏起一张,它的同点同伴就是鬼牌——先抽空手牌的人赢,最后剩着鬼牌的输。',
    oldmaidStart: '开局',
    holdemTitle: '德州扑克',
    holdemTag: "HOLD 'EM",
    holdemDesc: '两人单挑:两张底牌加五张公共牌,限注单挑——庄位每手轮换,加注封顶,平局分池。',
    holdemStart: '开局',
    searchPlaceholder: '搜索游戏…',
    noMatch: '没有匹配的游戏。',
    pausedTag: '上局未完',
    resumeTitle: '上一次的对局还没打完',
    resumeText: '继续之前的牌局,还是重新开始?选「重新开始」会把上一局作废并记入场次记录。',
    resumeContinue: '继续上一局',
    resumeRestart: '重新开始',
    resumeCancel: '取消',
    chipsLine: (ai: number, p: number) => `本局筹码:AI ${ai} · 你 ${p}`,
    blackjackKw: ['21点', '二十一点', '21 点', 'blackjack', '比点', '庄家', 'bj'],
    oldmaidKw: ['抽鬼牌', '鬼牌', 'old maid', 'oldmaid', '抽牌'],
    holdemKw: ['德州', '德州扑克', '扑克', 'holdem', "hold 'em", 'texas', '单挑', 'poker'],
  },
  oldmaid: {
    yourTurn: '轮到你:点对方一张背面牌,把它抽走',
    aiTurn: 'AI 正在从你手中抽牌…(它已收到通知)',
    aiHand: (n: number) => `AI 手牌 ${n} 张`,
    ownerHand: (n: number) => `对方手牌 ${n} 张`,
    discards: (n: number) => `已弃对子 ${n}`,
    score: (a: number, p: number) => `胜场 你 ${a} — 对方 ${p}`,
    winBanner: '你赢了这一局!',
    loseBanner: '对方赢了这一局。',
    againBtn: '再来一局',
    backLobbyBtn: '返回主菜单',
    hiddenReveal: (h: string) => `开局藏起的牌:${h}(它同点的落单牌就是鬼牌)`,
    historyLine: (when: string, pairs: number, hidden: string) => hidden ? `${when} · 弃 ${pairs} 对 · 藏 ${hidden}` : `${when} · 弃 ${pairs} 对`,
  },
  holdem: {
    potLabel: '底池',
    blindsLabel: (sb: number, bb: number) => `盲注 ${sb}/${bb}`,
    buttonBadge: '庄',
    roundLabel: (round: number, phase: string) => `第 ${round} 手 · ${phase}`,
    phaseName: { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', runout: '发牌中', idle: '等下一手' },
    yourTurn: '轮到你行动',
    aiTurn: 'AI 行动中…(它已收到通知)',
    dealing: '发牌中…',
    aiThinkingTurn: (n: number) => `等 AI 行动(要跟 ${n})…`,
    dealBtn: '发下一手',
    dealFirst: '点「发下一手」开始(庄位自动下盲注)',
    fold: '弃牌',
    check: '过牌',
    call: (n: number) => `跟注 ${n}`,
    bet: '下注',
    raiseTo: (n: number) => `加注到 ${n}`,
    raiseView: (n: number) => `加注到 ${n}`,
    betView: (n: number) => `下注 ${n}`,
    betWord: '下注',
    raiseWord: '加注到',
    minRaiseIs: (n: number) => `最小加到 ${n}`,
    allinOnlyHint: (n: number) => `常规加注已封顶,只能全押到 ${n}`,
    capIs: (n: number) => `单街封顶 ${n}`,
    allinShort: '全押不足最小加注',
    allin: '全押',
    aiHoleShown: (cards: string) => `AI 底牌:${cards}`,
    aiHoleHidden: (n: number) => `AI 底牌 ${n} 张(背面)`,
    yourFolded: '你已弃牌',
    aiFolded: 'AI 已弃牌',
    winnerBanner: (winner: 'ai' | 'player' | 'split', pot: number) => winner === 'player' ? `你收下底池 ${pot}` : winner === 'ai' ? `AI 收下底池 ${pot}` : `平分底池 ${pot}`,
    madeLine: (aiMade: string, playerMade: string) => `你 ${playerMade} · AI ${aiMade}`,
    foldLine: '以弃牌结束,底牌不亮。',
    historyLine: (when: string, round: number, winner: string, by: string, pot: number, delta: number) =>
      `${when} · 第${round}手 ${winner}${by === 'fold' ? '(弃)' : '(摊)'} 底池 ${pot}`,
  },
  pokerMade: (cat: number, r: string[]): string =>
    cat === 8 ? `同花顺(${r[0]} 高)`
      : cat === 7 ? `四条 ${r[0]}`
        : cat === 6 ? `葫芦(${r[0]} 带 ${r[1]})`
          : cat === 5 ? `同花(${r[0]} 高)`
            : cat === 4 ? `顺子(${r[0]} 高)`
              : cat === 3 ? `三条 ${r[0]}`
                : cat === 2 ? `两对 ${r[0]} 和 ${r[1]}`
                  : cat === 1 ? `一对 ${r[0]}`
                    : `高牌 ${r[0]}`,
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
  statsWLP: (w, l, p) => `${w}W ${l}L ${p}P`,
  netLabel: 'net',
  betWord: 'Stake',
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
  backBtn: '← Back',
  rulesBlackjackHtml: `
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
  rulesOldmaidHtml: `
    <h4>Starting a game</h4>
    <p>Tap "Start" → one card is hidden away from the full 52-card deck, dealt to no one — its rank-mate becomes the "Old Maid" → the remaining 51 cards are dealt around → both sides discard their pairs first → you draw first.</p>
    <h4>Drawing</h4>
    <ul>
      <li><b>Your turn:</b> click any face-down card of the opponent to take it — memory and gut feeling are your tools.</li>
      <li><b>The AI's turn:</b> it takes a random card from your hand; you never learn which one, your hand just shrinks.</li>
      <li>A drawn card matching a rank you hold forms a pair and is discarded at once (suits don't matter, rank does).</li>
    </ul>
    <h4>Winning and the Old Maid</h4>
    <ul>
      <li>Whoever empties their hand first wins; the loser is inevitably left holding that lone rank-mate — the Old Maid.</li>
      <li>When the hand ends the hidden card is revealed and the mind game is settled.</li>
      <li>The discards pile shows the latest pairs — reason about what the opponent still holds and where the Old Maid sits.</li>
    </ul>
  `,
  rulesHoldemHtml: `
    <h4>Starting a hand</h4>
    <p>Tap "Start" → each hand begins with "Deal next hand": the button (swapped every hand) posts the small blind, the other side posts the big blind → two hole cards each → pre-flop betting → flop (3 cards) → betting → turn → betting → river → betting → showdown.</p>
    <h4>Heads-up action order</h4>
    <ul>
      <li><b>Pre-flop:</b> the button (small blind) acts first; the big blind acts last and may check for free if nobody raised.</li>
      <li><b>Post-flop:</b> the order flips — the big blind acts first and the button always acts last (the button's compensation).</li>
    </ul>
    <h4>Betting rules (capped table)</h4>
    <ul>
      <li>Actions: fold, check, call, bet, raise; each street is capped at the configured maximum stake.</li>
      <li>Minimum raise = current bet + last raise size; a short stack may go all-in for less (no re-opening).</li>
      <li>When a side is all-in the rest of the board is dealt and the hand goes to showdown — no more folds.</li>
    </ul>
    <h4>Comparing hands (best 5 of 7)</h4>
    <ul>
      <li>From the top: straight flush &gt; four of a kind &gt; full house &gt; flush &gt; straight &gt; three of a kind &gt; two pair &gt; one pair &gt; high card; ties split the pot (odd chip to the big blind).</li>
      <li>An ace may also play low in A-2-3-4-5 (the wheel).</li>
      <li>A folded hand is never revealed; both hands are shown at showdown.</li>
    </ul>
  `,
  rulesCloseBtn: 'Got it, continue',
  modeMenu: {
    subtitle: 'Pick a mode',
    localTitle: 'Local table',
    localTag: 'LOCAL',
    localDesc: "Face your AI across the felt: Blackjack, Old Maid and Texas Hold'em, all ready to deal.",
    localBtn: 'Enter the table',
    onlineTitle: 'Online mode',
    onlineTag: 'ONLINE',
    onlineDesc: 'The doorway to multiplayer: more seats, more card partners, cross-table duels.',
    onlineBtn: 'Take a look',
    backToMenu: '← Modes',
    onlineWip: '🚧 Online mode is under construction',
    onlineWipDesc: 'This will be the doorway to multiplayer — more seats, more card partners and cross-table duels are on the blueprint. For now the local table gets all the polish. Stay tuned.',
    backBtn: '← Back to menu',
  },
  online: {
    friendsTitle: 'Friends',
    statusTitle: 'Local AI status',
    statusIdle: 'Idle',
    statusPlaying: 'In game',
    statusResting: 'Resting',
    selfId: 'My ID:',
    unknown: 'unknown',
    vsLabel: 'Playing vs',
    handsLabel: 'Hands:',
    chipsMe: 'my chips',
    chipsPeer: 'peer chips',
    youAreBank: 'You are the bank this hand',
    peerIsBank: 'The peer is the bank this hand',
    restHint: 'Resting — the session resumes automatically, nothing to do.',
    stopBtn: 'End session',
    idleHint: 'Idle. Wait for your AI to invite someone, or tap + beside a friend.',
    notEnabled: 'Starpost client is off: enable worlds.casino.starpostEnabled in settings.',
    notConfigured: 'Starpost is on but botId/token are missing.',
    clientNotReady: 'Starpost client not ready:',
    lastErr: 'Last error:',
    noFriends: 'No Starpost friends yet: add friends on Starpost and they show up here.',
    inviteBtnTitle: 'Invite to play',
    inviteTitle: 'Invite to play',
    gameBlackjack: 'Blackjack',
    gameOldmaid: 'Old Maid',
    gameHoldem: "Hold'em",
  },
  gamePicker: {
    title: 'Pick a game to start',
    blackjackTitle: 'Blackjack',
    blackjackTag: 'CLASSIC 21',
    blackjackDesc: 'The classic comparison: the bank is played by fixed rules while the player decides — split, insurance and surrender all in.',
    blackjackAI: 'Let the AI deal',
    blackjackMe: 'I deal',
    oldmaidTitle: 'Old Maid',
    oldmaidTag: '抽鬼牌',
    oldmaidDesc: 'One card is hidden from the full deck at the deal — its rank-mate is the Old Maid. Empty your hand first to win; last one holding it loses.',
    oldmaidStart: 'Start',
    holdemTitle: "Texas Hold'em",
    holdemTag: 'HEADS-UP',
    holdemDesc: 'Two players, two hole cards and five community cards; capped-limit heads-up — the button swaps every hand, ties split the pot.',
    holdemStart: 'Start',
    searchPlaceholder: 'Search games…',
    noMatch: 'No matching game.',
    pausedTag: 'UNFINISHED',
    resumeTitle: 'Your last game is unfinished',
    resumeText: 'Continue where you left off, or start over? "Start over" voids the unfinished game and archives it to the match records.',
    resumeContinue: 'Continue',
    resumeRestart: 'Start over',
    resumeCancel: 'Cancel',
    chipsLine: (ai: number, p: number) => `Chips: AI ${ai} · you ${p}`,
    blackjackKw: ['blackjack', '21', 'twenty-one', 'dealer', 'bj', '二十一点', '21点'],
    oldmaidKw: ['old maid', 'oldmaid', 'draw', '抽鬼牌', '鬼牌'],
    holdemKw: ["hold'em", 'hold em', 'holdem', 'texas', 'poker', 'heads-up', '德州', '德州扑克'],
  },
  oldmaid: {
    yourTurn: 'Your turn: click a face-down card to take it',
    aiTurn: 'The AI is drawing from your hand… (it has been notified)',
    aiHand: (n: number) => `AI holds ${n} cards`,
    ownerHand: (n: number) => `The other hand holds ${n} cards`,
    discards: (n: number) => `${n} pairs discarded`,
    score: (a: number, p: number) => `Wins: you ${a} — them ${p}`,
    winBanner: 'You won this game!',
    loseBanner: 'They won this game.',
    againBtn: 'Play again',
    backLobbyBtn: 'Main menu',
    hiddenReveal: (h: string) => `Hidden at the deal: ${h} (its rank-mate is the Old Maid)`,
    historyLine: (when: string, pairs: number, hidden: string) => hidden ? `${when} · ${pairs} pairs · hid ${hidden}` : `${when} · ${pairs} pairs`,
  },
  holdem: {
    potLabel: 'Pot',
    blindsLabel: (sb: number, bb: number) => `Blinds ${sb}/${bb}`,
    buttonBadge: 'D',
    roundLabel: (round: number, phase: string) => `Hand ${round} · ${phase}`,
    phaseName: { preflop: 'pre-flop', flop: 'flop', turn: 'turn', river: 'river', runout: 'dealing', idle: 'between hands' },
    yourTurn: 'Your turn to act',
    aiTurn: 'The AI is acting… (it has been notified)',
    dealing: 'Dealing…',
    aiThinkingTurn: (n: number) => `Waiting for the AI (to call ${n})…`,
    dealBtn: 'Deal next hand',
    dealFirst: 'Tap "Deal next hand" to begin (blinds post automatically)',
    fold: 'Fold',
    check: 'Check',
    call: (n: number) => `Call ${n}`,
    bet: 'Bet',
    raiseTo: (n: number) => `Raise to ${n}`,
    raiseView: (n: number) => `Raise to ${n}`,
    betView: (n: number) => `Bet ${n}`,
    betWord: 'Bet',
    raiseWord: 'Raise to',
    minRaiseIs: (n: number) => `min raise to ${n}`,
    allinOnlyHint: (n: number) => `regular raise capped; all-in only, to ${n}`,
    capIs: (n: number) => `street cap ${n}`,
    allinShort: 'all-in below min raise',
    allin: 'All-in',
    aiHoleShown: (cards: string) => `AI hole cards: ${cards}`,
    aiHoleHidden: (n: number) => `AI hole cards: ${n} (face down)`,
    yourFolded: 'You folded',
    aiFolded: 'The AI folded',
    winnerBanner: (winner: 'ai' | 'player' | 'split', pot: number) => winner === 'player' ? `You take the pot of ${pot}` : winner === 'ai' ? `The AI takes the pot of ${pot}` : `Split pot of ${pot}`,
    madeLine: (aiMade: string, playerMade: string) => `You ${playerMade} · AI ${aiMade}`,
    foldLine: 'Ended by a fold; the folded hand stays hidden.',
    historyLine: (when: string, round: number, winner: string, by: string, pot: number, delta: number) =>
      `${when} · Hand ${round} ${winner}${by === 'fold' ? ' (fold)' : ' (showdown)'} pot ${pot}`,
  },
  pokerMade: (cat: number, r: string[]): string =>
    cat === 8 ? `straight flush (${r[0]} high)`
      : cat === 7 ? `four of a kind, ${r[0]}s`
        : cat === 6 ? `full house (${r[0]}s over ${r[1]}s)`
          : cat === 5 ? `flush (${r[0]} high)`
            : cat === 4 ? `straight (${r[0]} high)`
              : cat === 3 ? `three of a kind, ${r[0]}s`
                : cat === 2 ? `two pair, ${r[0]}s and ${r[1]}s`
                  : cat === 1 ? `a pair of ${r[0]}s`
                    : `high card ${r[0]}`,
};

export type PanelTables = { zh: PanelText; en: PanelText };

/** 面板语言选择:zh-Hant 暂读中文,其余语言读英文。 */
export function panelText(language: string | undefined): PanelText {
  return language === 'en' ? en : zh;
}
