/**
 * What the bot reads from this World (events, tool receipts, error texts), in Chinese and in
 * English; `en: typeof zh` keeps the two tables' keys and signatures the same. The deployment's
 * `language` config picks the table (see modelLanguage()); anything but `en` reads Chinese.
 * What the person typed or clicked on the panel goes into these lines as it came.
 *
 * 称呼:zh 里对面的玩家是「主人」,en 里是 "the owner";AI 一律以 you 称呼。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ModelLanguage = 'zh' | 'en';

const zh = {
  owner: '主人',
  ownerDefinite: '主人',
  dealerRole: '庄家',
  playerRole: '闲家',
  // ── 通用 ──
  handInProgress: '手还在进行。',
  ownersHandInProgress: '主人的手还在进行。',
  noHandDeal: '现在没有进行中的手,先 deal。',
  handSettledDeal: '这一手已经结算了,先 deal 开新手。',
  notYourTurnAsDealer: '这一桌你是庄家(机械银行,引擎按规则替你打),没有闲家动作可做;主人的牌就是你的牌。',
  noGameYet: '还没开局,主人在面板选庄后才有你的角色。',
  youAreDealerNote: '这一桌你是庄家(机械银行,引擎按规则替你打),没有闲家动作可做。',
  dealerTurnInProgress: '庄家正在按规则打牌,稍等结算。',
  decideInsuranceFirst: '先决定保险(或声明不买),再打牌。',
  betFirst: '先下注,才有手可打。',
  unknownAction: (action: string, actions: string) => `未知动作 ${action};取 ${actions}。`,
  // ── 下注 ──
  betNotInteger: (raw: string) => `下注要是整数,收到 ${raw}。`,
  minBetIs: (n: number) => `最小下注 ${n}。`,
  maxBetIs: (n: number) => `单手上限 ${n}。`,
  cannotAffordBet: (chips: number, bet: number) => `余额 ${chips},押不起 ${bet}。`,
  betPlaced: (amount: number) => `主人下注 ${amount},让你坐庄。`,
  handAlreadyOpen: '这一手已经开了,别重复下注。',
  doubledOverMax: (n: number) => `加倍后会超过单手上限 ${n}。`,
  doubledOverBalance: (total: number, chips: number) => `加倍后你的总注 ${total} 超出了你的余额 ${chips}。`,
  doubleTwoCardsOnly: '只有一手的前两张牌能加倍。',
  splitOnceOnly: '这只允许分一次(两手)。',
  splitTwoCardsOnly: '只有刚发的两张牌能分。',
  splitSameRank: '两张牌点数相同才能分。',
  splitOverLimits: (total: number, chips: number) => `分牌后总注 ${total} 超出上限或你的余额 ${chips}。`,
  splitAcesNote: ',分 A 各一张即停',
  surrenderFreshOnly: '投降只在开局的前两张、还没分过牌的时候可以。',
  bettingTurn: (minBet: number, maxBet: number, balance: number, bank: number) =>
    `轮到你下注。你是闲家,主人坐庄。最小注 ${minBet},单手上限 ${maxBet},你的余额 ${balance},庄家银行 ${bank};押注不能超过两边较小的那个。用 casino_player 的 bet 开手。`,
  // ── 状态行附带 ──
  statusHandLine: (mark: string, cards: string, total: number, soft: boolean, bet: number, doubled: boolean, stood: boolean) =>
    `${mark}闲家手:${cards}(${total}${soft ? ' 软' : ''}),押 ${bet}${doubled ? '(已加倍)' : ''}${stood ? '(已停)' : ''}`,
  statusHandCurrentMark: '[当前]',
  statusInsuranceNote: (insurance: number, resolved: string) => (insurance > 0 ? `,保险 ${insurance}${resolved}` : ''),
  insurancePending: '待定',
  insuranceLostNote: '已输',
  insuranceWonNote: '已赢',
  ownerHandInProgressLabel: '主人的手还在进行。',
  yourHandInProgressLabel: '手还在进行。',
  holeHiddenNote: '暗牌未翻。',
  // ── 保险 ──
  notInsuranceTime: '现在不是决定保险的时候(只有庄家亮 A 才有)。',
  insuranceNotInteger: '保险金额要是非负整数,0 表示不买。',
  insuranceMaxIs: (n: number) => `保险最多 ${n}(底注的一半)。`,
  cannotAffordInsurance: (chips: number, amount: number) => `余额 ${chips} 付不起 ${amount} 的保险。`,
  insuranceBought: (amount: number) => `主人买保险 ${amount}。`,
  insuranceDeclined: '主人看了眼庄家的明牌 A,决定不买保险。',
  insuranceDecideFirst: '先决定保险(或声明不买),再打牌。',
  insurancePrompt: (max: number) => `庄家亮 A:先用 casino_player 的 insurance 决定保险(amount:0 为不买,最多 ${max})。`,
  insuranceTurn: (max: number, balance: number, bank: number) =>
    `庄家明牌是 A,你可以买保险:最多 ${max}(底注的一半),庄家是黑杰克就按 2:1 赔,不是就被收走;不想买就 amount:0。你的余额 ${balance},庄家银行 ${bank}。用 casino_player 的 insurance 决定。`,
  // ── 动作通知(AI 坐庄时主人的动作) ──
  ownerBets: (amount: number) => `主人下注 ${amount},让你坐庄。`,
  ownerHits: (card: string, cards: string, total: number, bust: string) => `主人要牌,拿到 ${card}:闲家手 ${cards}(${total} 点${bust})。`,
  ownerStands: (total: number, cards: string) => `主人停在 ${total} 点(${cards})。`,
  ownerDoubles: (bet: number, card: string, total: number, bust: string) => `主人加倍:注翻到 ${bet},补一张 ${card},停在 ${total} 点${bust}。`,
  ownerSplits: (bet: number, hand0: string, hand1: string, aces: string) => `主人把一对同点牌分成两手,各押 ${bet}:一手 ${hand0},二手 ${hand1}${aces}。`,
  ownerInsured: (amount: number) => `主人买保险 ${amount}。`,
  ownerDeclinedInsurance: '主人看了眼庄家的明牌 A,决定不买保险。',
  ownerSurrendered: '主人投降,弃一半注结束这手。',
  bustNote: ',爆',
  // ── 结算 ──
  settleLine: (round: number, dealer: string, hands: string, dealerCards: string, dealerTotal: number, dealerBust: string, delta: string, aiChips: number, ownerChips: number) =>
    `第 ${round} 手结算(庄:${dealer})。 闲家 ${hands} 对 庄家 ${dealerCards}(${dealerTotal}${dealerBust})。 净 ${delta}。 你的筹码 ${aiChips},主人 ${ownerChips}。`,
  outcomeWin: '赢',
  outcomeLose: '输',
  outcomePush: '平',
  outcomeBlackjack: '黑杰克',
  outcomeBust: '爆牌',
  outcomeSurrender: '投降',
  handTotalLabel: (n: number) => `${n}`,
  dealerBustNote: ',爆',
  // ── 场次 ──
  matchArchived: (rounds: number, aiChips: number, ownerChips: number, winner: string, startChips: number) =>
    `主人把这一场(${rounds} 手)归档了:结束时你 ${aiChips} / 主人 ${ownerChips} 筹码,${winner}。双方重新拿 ${startChips},新的一场等选庄开始。`,
  matchYouWin: '你赢',
  matchOwnerWins: '主人赢',
  matchTie: '打平',
  // ── 救济 ──
  reliefOnlyWhenBroke: (chips: number, minBet: number) => `救济只给破产的人:你的余额 ${chips} 还够最小注 ${minBet}。`,
  reliefGranted: (startChips: number, chips: number, count: number) => `救济金 ${startChips} 已到账,余额 ${chips};这是你第 ${count} 次破产。牌桌不记账外的东西。`,
  bankStatus: (chips: number, wins: number, losses: number, pushes: number, net: string, bankruptcies: number, ownerChips: number, ownerWins: number, ownerLosses: number, ownerPushes: number) =>
    `你的余额:${chips}(累计 ${wins} 胜 / ${losses} 负 / ${pushes} 平,净 ${net},破产 ${bankruptcies} 次)。主人余额:${ownerChips}(${ownerWins} 胜 / ${ownerLosses} 负 / ${ownerPushes} 平)。`,
  bankStatusOwn: (chips: number) => `你的余额 ${chips}`,
  handNotFinished: '这一手还没打完。',
  matchResetDealerPlaying: '庄家正在按规则打牌,等这一手结算完再归档重开。',
  errNewgameDealerArg: '庄家要写 ai 或 player。',
  errAINotWaiting: '现在没有在等 AI。',
  errUnknownActionPanel: (action: string) => `未知动作 ${action}。`,
  // ── 状态 ──
  statusNoGame: '还没开局(主人在面板选庄后开始)。',
  statusYouDealer: '你是庄家(机械银行,引擎按规则替你打),主人是闲家。',
  statusYouPlayer: '你是闲家,主人是庄家。',
  statusIdle: '等开下一手',
  statusBettingYou: '等你(闲家)下注',
  statusBettingOwner: '等主人(闲家)下注',
  statusActingYou: '等你(闲家)要牌/停牌/加倍',
  statusActingOwner: '等主人(闲家)要牌/停牌/加倍',
  statusInsuranceYou: '等你(闲家)决定保险',
  statusInsuranceOwner: '等主人(闲家)决定保险',
  statusRound: (round: number, lastBet: number) => `第 ${round} 手(上一手押 ${lastBet})。`,
  statusRoundZero: '还没打过。',
  statusChips: (ai: number, owner: number, start: number, minBet: number, maxBet: number, soft: string) =>
    `你的筹码:${ai};主人筹码:${owner}(起始 ${start},最小注 ${minBet},单手上限 ${maxBet},庄家${soft})。`,
  dealerSoftStands: '软 17 停(S17)',
  dealerSoftHits: '软 17 也补(H17)',
  statusBet: (bet: number) => `底注 ${bet}。`,
  statusIdlerHand: (cards: string, total: string) => `闲家手:${cards}(${total})。`,
  statusDealerRevealed: (cards: string, total: number) => `庄家手(已亮):${cards}(${total})。`,
  statusDealerUpcard: (card: string) => `庄家明牌:${card},暗牌未翻。`,
  noHistoryYet: '还没有记录。',
  historyTitle: (n: number) => `最近 ${n} 手:`,
  historyLine: (i: number, round: number, dealer: string, bet: number, insurance: number, insuranceWon: boolean, playerCards: string, dealerCards: string, delta: string) =>
    `${i}. 第${round}手 庄:${dealer} 押 ${bet}${insurance > 0 ? `,保险 ${insurance}${insuranceWon ? '(赢)' : '(输)'}` : ''},闲家 ${playerCards} 对 庄家 ${dealerCards} — 闲家净 ${delta}`,
  historyDealerYou: '你',
  historyDealerOwner: '主人',
  // ── 提示(回执尾部) ──
  playerNextHint: '接下来用 casino_player 继续。',
  playerActingHint: '接下来用 casino_player 的 hit / stand / double;停牌后庄家按规则自动打完。',
  // ── 面板 invoke 的错误(按浏览器语言走表,见 webui/strings.ts)──
};

export type ModelText = typeof zh;

const en: ModelText = {
  owner: 'the owner',
  ownerDefinite: 'the owner',
  dealerRole: 'dealer',
  playerRole: 'player',
  handInProgress: 'Your hand is still in progress.',
  ownersHandInProgress: "The owner's hand is still in progress.",
  noHandDeal: 'No hand in progress; deal first.',
  handSettledDeal: 'That hand is settled; deal to start a new one.',
  notYourTurnAsDealer: 'You are the dealer on this table (a mechanical bank played by the engine); there is no player action for you. The cards on the table are yours to watch.',
  noGameYet: 'No game yet; the owner picks the dealer on the panel first.',
  youAreDealerNote: 'You are the dealer on this table (a mechanical bank played by the engine); there is no player action for you.',
  dealerTurnInProgress: 'The dealer is playing by the table rules; wait for the settlement.',
  decideInsuranceFirst: 'Decide the insurance (or decline it) before playing cards.',
  betFirst: 'Place a bet first; there is nothing to play yet.',
  unknownAction: (action, actions) => `Unknown action ${action}; use ${actions}.`,
  betNotInteger: (raw) => `The bet must be an integer, got ${raw}.`,
  minBetIs: (n) => `The minimum bet is ${n}.`,
  maxBetIs: (n) => `The maximum bet per hand is ${n}.`,
  cannotAffordBet: (chips, bet) => `Your balance is ${chips}; you cannot stake ${bet}.`,
  betPlaced: (amount) => `The owner bets ${amount} and makes you the dealer.`,
  handAlreadyOpen: 'This hand is already open; do not bet twice.',
  doubledOverMax: (n) => `Doubling would exceed the per-hand maximum of ${n}.`,
  doubledOverBalance: (total, chips) => `Doubling would put your total stake at ${total}, over your balance of ${chips}.`,
  doubleTwoCardsOnly: 'Only the first two cards of a hand can be doubled.',
  splitOnceOnly: 'A single split per hand (two hands).',
  splitTwoCardsOnly: 'Only the freshly dealt two cards can be split.',
  splitSameRank: 'Both cards must be of the same rank to split.',
  splitOverLimits: (total, chips) => `Splitting would put the total stake at ${total}, over the maximum or your balance of ${chips}.`,
  splitAcesNote: '; split aces get one card each and stand',
  surrenderFreshOnly: 'Surrender is only available on the fresh first two cards, before any split.',
  bettingTurn: (minBet, maxBet, balance, bank) =>
    `Your turn to bet. You are the player and the owner is the dealer. Minimum bet ${minBet}, maximum per hand ${maxBet}, your balance ${balance}, the dealer bank ${bank}; the stake cannot exceed the smaller of the two. Use casino_player's bet to open the hand.`,
  statusHandLine: (mark, cards, total, soft, bet, doubled, stood) =>
    `${mark}Player hand: ${cards} (${total}${soft ? ' soft' : ''}), stake ${bet}${doubled ? ' (doubled)' : ''}${stood ? ' (stood)' : ''}`,
  statusHandCurrentMark: '[current]',
  statusInsuranceNote: (insurance, resolved) => (insurance > 0 ? `, insurance ${insurance}${resolved}` : ''),
  insurancePending: 'pending',
  insuranceLostNote: 'lost',
  insuranceWonNote: 'won',
  ownerHandInProgressLabel: "The owner's hand is still in progress.",
  yourHandInProgressLabel: 'Your hand is still in progress.',
  holeHiddenNote: 'hole card still hidden.',
  notInsuranceTime: 'It is not time to decide the insurance (the dealer must be showing an Ace).',
  insuranceNotInteger: 'The insurance amount must be a non-negative integer; 0 declines.',
  insuranceMaxIs: (n) => `Insurance is at most ${n} (half the bet).`,
  cannotAffordInsurance: (chips, amount) => `Your balance of ${chips} cannot cover ${amount} of insurance.`,
  insuranceBought: (amount) => `The owner buys ${amount} of insurance.`,
  insuranceDeclined: 'The owner looks at the dealer upcard, an Ace, and declines the insurance.',
  insuranceDecideFirst: 'Decide the insurance (or decline it) before playing cards.',
  insurancePrompt: (max) => `Dealer shows an Ace: use casino_player's insurance to decide (amount:0 declines, at most ${max}).`,
  insuranceTurn: (max, balance, bank) =>
    `Dealer shows an Ace: you may take insurance, at most ${max} (half the bet). It pays 2:1 if the dealer has blackjack, otherwise it is collected; amount:0 declines. Your balance ${balance}, the dealer bank ${bank}. Use casino_player's insurance.`,
  ownerBets: (amount) => `The owner bets ${amount} and makes you the dealer.`,
  ownerHits: (card, cards, total, bust) => `The owner hits and draws ${card}: player hand ${cards} (${total}${bust}).`,
  ownerStands: (total, cards) => `The owner stands at ${total} (${cards}).`,
  ownerDoubles: (bet, card, total, bust) => `The owner doubles: the stake is ${bet}, one card ${card}, standing at ${total}${bust}.`,
  ownerSplits: (bet, hand0, hand1, aces) => `The owner splits the pair into two hands of ${bet} each: one ${hand0}, the other ${hand1}${aces}.`,
  ownerInsured: (amount) => `The owner buys ${amount} of insurance.`,
  ownerDeclinedInsurance: 'The owner looks at the dealer upcard, an Ace, and declines the insurance.',
  ownerSurrendered: 'The owner surrenders and forfeits half the bet.',
  bustNote: ', busted',
  settleLine: (round, dealer, hands, dealerCards, dealerTotal, dealerBust, delta, aiChips, ownerChips) =>
    `Hand ${round} settled (dealer: ${dealer}). Player ${hands} against dealer ${dealerCards} (${dealerTotal}${dealerBust}). Net ${delta}. Your chips ${aiChips}, the owner ${ownerChips}.`,
  outcomeWin: 'win',
  outcomeLose: 'lose',
  outcomePush: 'push',
  outcomeBlackjack: 'blackjack',
  outcomeBust: 'bust',
  outcomeSurrender: 'surrender',
  handTotalLabel: (n) => `${n}`,
  dealerBustNote: ', busted',
  matchArchived: (rounds, aiChips, ownerChips, winner, startChips) =>
    `The owner archived this match (${rounds} hands): at the end you held ${aiChips} against the owner's ${ownerChips}, ${winner}. Both sides start over with ${startChips}; a new match waits for the dealer choice.`,
  matchYouWin: 'you win',
  matchOwnerWins: 'the owner wins',
  matchTie: 'a tie',
  reliefOnlyWhenBroke: (chips, minBet) => `Relief is for the broke only: your balance of ${chips} still covers the minimum bet of ${minBet}.`,
  reliefGranted: (startChips, chips, count) => `Relief of ${startChips} has arrived, balance ${chips}; that is your ${count}th bankruptcy. The table keeps no books beyond itself.`,
  bankStatus: (chips, wins, losses, pushes, net, bankruptcies, ownerChips, ownerWins, ownerLosses, ownerPushes) =>
    `Your balance: ${chips} (${wins} won / ${losses} lost / ${pushes} pushed, net ${net}, ${bankruptcies} bankruptcies). The owner: ${ownerChips} (${ownerWins} won / ${ownerLosses} lost / ${ownerPushes} pushed).`,
  bankStatusOwn: (chips) => `your balance ${chips}`,
  handNotFinished: 'The current hand is not finished yet.',
  matchResetDealerPlaying: 'The dealer is playing by the rules; wait for the hand to settle before archiving.',
  errNewgameDealerArg: 'The dealer must be ai or player.',
  errAINotWaiting: 'The AI is not waiting for anything right now.',
  errUnknownActionPanel: (action) => `Unknown action ${action}.`,
  statusNoGame: 'No game yet (the owner picks the dealer on the panel to start).',
  statusYouDealer: 'You are the dealer (a mechanical bank played by the engine); the owner is the player.',
  statusYouPlayer: 'You are the player; the owner is the dealer.',
  statusIdle: 'waiting for the next hand',
  statusBettingYou: 'waiting for you (the player) to bet',
  statusBettingOwner: 'waiting for the owner (the player) to bet',
  statusActingYou: 'waiting for you (the player) to hit/stand/double',
  statusActingOwner: 'waiting for the owner (the player) to hit/stand/double',
  statusInsuranceYou: 'waiting for you (the player) to decide the insurance',
  statusInsuranceOwner: 'waiting for the owner (the player) to decide the insurance',
  statusRound: (round, lastBet) => `Hand ${round} (the last one staked ${lastBet}).`,
  statusRoundZero: 'Nothing played yet.',
  statusChips: (ai, owner, start, minBet, maxBet, soft) =>
    `Your chips: ${ai}; the owner: ${owner} (start ${start}, minimum bet ${minBet}, maximum per hand ${maxBet}, dealer ${soft}).`,
  dealerSoftStands: 'stands on soft 17 (S17)',
  dealerSoftHits: 'hits soft 17 (H17)',
  statusBet: (bet) => `Current stake ${bet}.`,
  statusIdlerHand: (cards, total) => `Player hand: ${cards} (${total}).`,
  statusDealerRevealed: (cards, total) => `Dealer hand (revealed): ${cards} (${total}).`,
  statusDealerUpcard: (card) => `Dealer upcard: ${card}, hole card still hidden.`,
  noHistoryYet: 'No records yet.',
  historyTitle: (n) => `The last ${n} hands:`,
  historyLine: (i, round, dealer, bet, insurance, insuranceWon, playerCards, dealerCards, delta) =>
    `${i}. Hand ${round}, dealer: ${dealer}, stake ${bet}${insurance > 0 ? `, insurance ${insurance}${insuranceWon ? ' (won)' : ' (lost)'}` : ''}; player ${playerCards} against dealer ${dealerCards} — player net ${delta}`,
  historyDealerYou: 'you',
  historyDealerOwner: 'the owner',
  playerNextHint: 'Continue with casino_player.',
  playerActingHint: 'Continue with casino_player hit / stand / double; once you stand the dealer plays out by the table rule.',
};

/** `en: typeof zh` 之外的两个键:日期占位等留空即可。 */
export type ModelTextFull = ModelText & { zh: ModelText; en: ModelText };

const tables = { zh, en } as ModelTextFull;

/** 部署语言 → 模型语言:只有英文部署读英文表,其余(含未知)一律中文。 */
export function toModelLanguage(language: string | undefined): ModelLanguage {
  return language === 'en' ? 'en' : 'zh';
}

export function modelText(language: ModelLanguage): ModelText {
  return tables[language] ?? tables.zh;
}

/** 读部署 config.json 的 language;读不到或损坏时按中文处理。每次使用时现读,改语言无需重启。 */
export function readModelLanguage(botDir: string): ModelLanguage {
  try {
    const parsed = JSON.parse(readFileSync(join(botDir, 'config.json'), 'utf8')) as { language?: string };
    return toModelLanguage(parsed?.language);
  } catch {
    return 'zh';
  }
}
