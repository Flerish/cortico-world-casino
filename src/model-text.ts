/**
 * What the bot reads from this World (events, tool receipts, error texts), in Chinese and in
 * English; `en: typeof zh` keeps the two tables' keys and signatures the same. The deployment's
 * `language` config picks the table (see modelLanguage()); anything but `en` reads Chinese.
 * What the person typed or clicked on the panel goes into these lines as it came.
 *
 * 称呼:对面玩家的称呼不是写死的——表里用 {{owner}} / {{Owner}} 占位,由
 * worlds.casino.ownerLabel 配置替换(留空 = zh「用户」/ en "the user");主仆等关系
 * 在设置里自定义(如「主人」),模型与面板保持一致。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ModelLanguage = 'zh' | 'en';

const zh = {
  statusGameBlackjack: '【21 点】',
  statusGameOldMaid: '【抽鬼牌】',
  statusGameHoldem: '【德州扑克】',
  statusGameHanafuda: '【花札 こいこい】',
  hanafudaNewRound: (round: number, rounds: number) => `花札第 ${round} 局开始(共 ${rounds} 局),8 张手牌、8 张场牌;配对只看月份,成役后收手或喊こいこい。`,
  hanafudaTurnNotify: '轮到你在花札里打牌了:用 casino_table 看你的手牌与场牌,再用 hanafuda_act 的 play(带 index)打一张——有同月的场牌会自动收走,随后引擎替你翻山札;成役后你会收到こいこい/收手的决策通知。',
  hanafudaDecideNotify: '你成役了:用 hanafuda_act 的 koikoi 继续搏更高役(被反超对方翻倍),或 stop 收手落袋。',
  hanafudaStatusHead: (round: number, rounds: number) => `第 ${round}/${rounds} 局`,
  hanafudaStatusScore: (ai: number, owner: number, matchAi: number, matchOwner: number) => `役分:你 ${ai} — {{owner}} ${owner};累计文:你 ${matchAi} — {{owner}} ${matchOwner}。`,
  hanafudaStatusCounts: (al: number, at: number, an: number, ak: number, pl: number, pt: number, pn: number, pk: number) =>
    `收集:你 光${al}/种${at}/短${an}/粕${ak} — {{owner}} 光${pl}/种${pt}/短${pn}/粕${pk}。`,
  hanafudaStatusHands: (aiHand: string, ownerCount: number, fieldCount: number, deckCount: number) => `你的手(${aiHand.split(' ').length} 张):${aiHand};{{owner}}手 ${ownerCount} 张(暗);场牌 ${fieldCount} 张;山札 ${deckCount} 张。`,
  hanafudaStatusYaku: (yaku: string) => `当前役:${yaku}。`,
  hanafudaStatusChips: (ai: number, owner: number) => `筹码(本游戏):你 ${ai} — {{owner}} ${owner}。`,
  hanafudaStatusTurnYou: '轮到你打牌(用 hanafuda_act play)。',
  hanafudaStatusTurnOwner: '轮到{{owner}}打牌。',
  hanafudaStatusDecideYou: '你成役了:hanafuda_act 选 koikoi(继续)或 stop(收手)。',
  hanafudaStatusDecideOwner: '{{owner}}成役,正在决定收手还是继续。',
  hanafudaMatchDone: (matchAi: number, matchOwner: number) => `整场打完:你 ${matchAi} 文 — {{owner}} ${matchOwner} 文。`,
  hanafudaBadIndex: (count: number) => `index 要在 0 到 ${count - 1} 之间(手牌现有 ${count} 张)。`,
  hanafudaPickPrompt: (cardA: string, cardB: string) => `场上有两张同月牌(${cardA} / ${cardB}):用 hanafuda_act 的 pick(带 index 0 或 1)选收哪一张,另一张留在场。`,
  hanafudaNothingToPick: '现在没有场牌选择要做。',
  hanafudaNothingToDecide: '现在没有成役决策要做。',
  hanafudaNotYourPhase: '现在不是打牌阶段(先处理选择或决策)。',
  hanafudaNotYourTurn: '还没轮到你。',
  hanafudaUnknownAct: 'hanafuda_act 的动作要写 play / pick / koikoi / stop。',
  hanafudaYakuFormed: (yaku: string, score: number) => `成役:${yaku}(当前 ${score} 文)。koikoi 继续搏更高,或收手落袋?`,
  hanafudaNoYakuPass: '没有成役,换对方行动。',
  hanafudaKoikoiCalled: 'こいこい!继续打——被对方反超收手的话,对方翻倍。',
  hanafudaMatchOver: '整场花札已结束,面板可再来一场。',
  hanafudaRoundResult: (round: number, winner: string, score: number, matchAi: number, matchOwner: number, aiChips: number, ownerChips: number) =>
    `花札第 ${round} 局:${winner},${score} 文。累计文:你 ${matchAi} — {{owner}} ${matchOwner}。筹码:你 ${aiChips} — {{owner}} ${ownerChips}。`,
  hanafudaDrawResult: (round: number, matchOver: number) =>
    matchOver ? `花札第 ${round} 局流局,整场就此打完。` : `花札第 ${round} 局流局(双方都没收手),下一局重新发牌。`,
  hanafudaHistoryTitle: (n: number) => `最近 ${n} 局花札:`,
  hanafudaHistoryLine: (i: number, round: number, winner: string, aiScore: number, ownerScore: number) =>
    `${i}. 第 ${round} 局:${winner}(你 ${aiScore} — {{owner}} ${ownerScore} 文)。`,
  oldMaidTurnYou: (ownerCount: number) => `轮到你抽牌:从{{owner}}手中抽一张(对方现有 ${ownerCount} 张)。`,
  oldMaidTurnOwner: (aiCount: number) => `轮到{{owner}}抽牌(你现有 ${aiCount} 张)。`,
  oldMaidTurnNotify: (ownerCount: number) => `轮到你在抽鬼牌里抽牌了:从{{owner}}手中(现有 ${ownerCount} 张,背面朝上)随机抽一张。用 oldmaid_draw。`,
  oldMaidYourHand: (summary: string, count: number) => `你的手(${count} 张):${summary}`,
  oldMaidOwnerHand: (count: number) => `{{owner}}的手:${count} 张(背面朝上)。`,
  oldMaidDiscards: (n: number) => `已弃对子:${n} 对。`,
  oldMaidScore: (ai: number, owner: number) => `抽鬼牌胜场:你 ${ai} — {{owner}} ${owner}。`,
  oldMaidDrawReceipt: (card: string, ownSummary: string, ownCount: number, ownerCount: number, newPairs: number) =>
    `你抽到了 ${card}。你现有 ${ownCount} 张(${ownSummary});{{owner}}剩 ${ownerCount} 张。${newPairs > 0 ? `刚凑成 ${newPairs} 对,已弃掉。` : '未成对。'}`,
  oldMaidEndLine: (winner: string, aiCount: number, ownerCount: number, aiScore: number, ownerScore: number, hidden: string, ghost: string) =>
    `抽鬼牌一局结束:${winner}。开局藏起来的牌是 ${hidden}——它同点的落单牌就是鬼牌${ghost ? `,输家手里最后剩的正是 ${ghost}` : ''}。终局牌数——你 ${aiCount} 张,{{owner}} ${ownerCount} 张。胜场:你 ${aiScore} — {{owner}} ${ownerScore}。`,
  oldMaidBadIndex: (count: number) => `index 要在 0 到 ${count - 1} 之间(对方现有 ${count} 张)。`,
  returnedToLobby: '已返回大厅,这一手作废(筹码未动)。',
  oldMaidOver: (winner: string) => `抽鬼牌已结束(${winner})。`,
  oldMaidOverAlready: '这一局已经结束了。',
  oldMaidNotYourTurn: '还没轮到你抽牌。',
  errNewgameKind: '游戏要写 blackjack、oldmaid、holdem 或 hanafuda。',
  errWrongGame: '牌桌上现在进行的不是这个游戏。',
  oldMaidHistoryTitle: (n: number) => `最近 ${n} 场抽鬼牌:`,
  oldMaidHistoryLine: (i: number, winner: string) => `${i}. ${winner}。`,
  dealerRole: '庄家',
  playerRole: '闲家',
  // ── 通用 ──
  handInProgress: '手还在进行。',
  ownersHandInProgress: '{{owner}}的手还在进行。',
  noHandDeal: '现在没有进行中的手,先 deal。',
  handSettledDeal: '这一手已经结算了,先 deal 开新手。',
  notYourTurnAsDealer: '这一桌你是庄家(机械银行,引擎按规则替你打),没有闲家动作可做;{{owner}}的牌就是你的牌。',
  noGameYet: '还没开局,{{owner}}在面板选庄后才有你的角色。',
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
  betPlaced: (amount: number) => `{{owner}}下注 ${amount},让你坐庄。`,
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
  // ── 保险 ──
  notInsuranceTime: '现在不是决定保险的时候(只有庄家亮 A 才有)。',
  insuranceNotInteger: '保险金额要是非负整数,0 表示不买。',
  insuranceMaxIs: (n: number) => `保险最多 ${n}(底注的一半)。`,
  cannotAffordInsurance: (chips: number, amount: number) => `余额 ${chips} 付不起 ${amount} 的保险。`,
  insuranceBought: (amount: number) => `{{owner}}买保险 ${amount}。`,
  insuranceDeclined: '{{owner}}看了眼庄家的明牌 A,决定不买保险。',
  insuranceDecideFirst: '先决定保险(或声明不买),再打牌。',
  insurancePrompt: (max: number) => `庄家亮 A:先用 casino_player 的 insurance 决定保险(amount:0 为不买,最多 ${max})。`,
  insuranceTurn: (max: number, balance: number, bank: number) =>
    `庄家明牌是 A,你可以买保险:最多 ${max}(底注的一半),庄家是黑杰克就按 2:1 赔,不是就被收走;不想买就 amount:0。你的余额 ${balance},{{owner}}的银行 ${bank}。用 casino_player 的 insurance 决定。`,
  // ── 动作通知(AI 坐庄时{{owner}}的动作) ──
  ownerBets: (amount: number) => `{{owner}}下注 ${amount},让你坐庄。`,
  ownerHits: (card: string, cards: string, total: number, bust: string) => `{{owner}}要牌,拿到 ${card}:闲家手 ${cards}(${total} 点${bust})。`,
  ownerStands: (total: number, cards: string) => `{{owner}}停在 ${total} 点(${cards})。`,
  ownerDoubles: (bet: number, card: string, total: number, bust: string) => `{{owner}}加倍:注翻到 ${bet},补一张 ${card},停在 ${total} 点${bust}。`,
  ownerSplits: (bet: number, hand0: string, hand1: string, aces: string) => `{{owner}}把一对同点牌分成两手,各押 ${bet}:一手 ${hand0},二手 ${hand1}${aces}。`,
  ownerInsured: (amount: number) => `{{owner}}买保险 ${amount}。`,
  ownerDeclined: '{{owner}}看了眼庄家的明牌 A,决定不买保险。',
  ownerSurrendered: '{{owner}}投降,弃一半注结束这手。',
  bustNote: ',爆',
  // ── 结算 ──
  settleLine: (round: number, dealer: string, hands: string, dealerCards: string, dealerTotal: number, dealerBust: string, delta: string, aiChips: number, ownerChips: number) =>
    `第 ${round} 手结算(庄:${dealer})。 闲家 ${hands} 对 庄家 ${dealerCards}(${dealerTotal}${dealerBust})。 净 ${delta}。 你的筹码 ${aiChips},{{owner}} ${ownerChips}。`,
  outcomeWin: '赢',
  outcomeLose: '输',
  outcomePush: '平',
  outcomeBlackjack: '黑杰克',
  outcomeBust: '爆牌',
  outcomeSurrender: '投降',
  dealerBustNote: ',爆',
  // ── 场次 ──
  matchArchived: (rounds: number, aiChips: number, ownerChips: number, winner: string, startChips: number) =>
    `{{owner}}把这一场(${rounds} 手)归档了:结束时你 ${aiChips} / {{owner}} ${ownerChips} 筹码,${winner}。双方重新拿 ${startChips},新的一场等选庄开始。`,
  matchYouWin: '你赢',
  matchOwnerWins: '{{owner}}赢',
  matchTie: '打平',
  // ── 救济 ──
  reliefOnlyWhenBroke: (chips: number, minBet: number) => `救济只给破产的人:你的余额 ${chips} 还够最小注 ${minBet}。`,
  reliefGranted: (startChips: number, chips: number, count: number) => `救济金 ${startChips} 已到账,余额 ${chips};这是你第 ${count} 次破产。牌桌不记账外的东西。`,
  bankStatus: (chips: number, wins: number, losses: number, pushes: number, net: string, bankruptcies: number, ownerChips: number, ownerWins: number, ownerLosses: number, ownerPushes: number) =>
    `你的余额:${chips}(累计 ${wins} 胜 / ${losses} 负 / ${pushes} 平,净 ${net},破产 ${bankruptcies} 次)。{{owner}}余额:${ownerChips}(${ownerWins} 胜 / ${ownerLosses} 负 / ${ownerPushes} 平)。`,
  bankStatusOwn: (chips: number) => `你的余额 ${chips}`,
  // ── 状态 ──
  statusNoGame: '还没开局({{owner}}在面板选庄后开始)。',
  statusYouDealer: '你是庄家(机械银行,引擎按规则替你打),{{owner}}是闲家。',
  statusYouPlayer: '你是闲家,{{owner}}是庄家。',
  statusIdle: '等开下一手',
  statusBettingYou: '等你(闲家)下注',
  statusBettingOwner: '等{{owner}}(闲家)下注',
  statusActingYou: '等你(闲家)要牌/停牌/加倍',
  statusActingOwner: '等{{owner}}(闲家)要牌/停牌/加倍',
  statusInsuranceYou: '等你(闲家)决定保险',
  statusInsuranceOwner: '等{{owner}}(闲家)决定保险',
  statusRound: (round: number, lastBet: number) => `第 ${round} 手(上一手押 ${lastBet})。`,
  statusRoundZero: '还没打过。',
  statusChips: (ai: number, owner: number, start: number, minBet: number, maxBet: number, soft: string) =>
    `你的筹码:${ai};{{owner}}筹码:${owner}(起始 ${start},最小注 ${minBet},单手上限 ${maxBet},庄家${soft})。`,
  dealerSoftStands: '软 17 停(S17)',
  dealerSoftHits: '软 17 也补(H17)',
  statusBet: (bet: number) => `底注 ${bet}。`,
  statusDealerRevealed: (cards: string, total: number) => `庄家手(已亮):${cards}(${total})。`,
  statusDealerUpcard: (card: string) => `庄家明牌:${card},暗牌未翻。`,
  bettingTurn: (minBet: number, maxBet: number, balance: number, bank: number) =>
    `轮到你下注。你是闲家,{{owner}}坐庄。最小注 ${minBet},单手上限 ${maxBet},你的余额 ${balance},{{owner}}的银行 ${bank};押注不能超过两边较小的那个。用 casino_player 的 bet 开手。`,
  statusHandLine: (mark: string, cards: string, total: number, soft: boolean, bet: number, doubled: boolean, stood: boolean) =>
    `${mark}闲家手:${cards}(${total}${soft ? ' 软' : ''}),押 ${bet}${doubled ? '(已加倍)' : ''}${stood ? '(已停)' : ''}`,
  statusHandCurrentMark: '[当前]',
  statusInsuranceNote: (insurance: number, resolved: string) => (insurance > 0 ? `,保险 ${insurance}${resolved}` : ''),
  insurancePending: '待定',
  insuranceLostNote: '已输',
  insuranceWonNote: '已赢',
  ownerHandInProgressLabel: '{{owner}}的手还在进行。',
  yourHandInProgressLabel: '手还在进行。',
  holeHiddenNote: '暗牌未翻。',
  dealerUpcardNote: (card: string) => `庄家明牌:${card},暗牌未翻。`,
  // ── 历史 ──
  noHistoryYet: '还没有记录。',
  historyTitle: (n: number) => `最近 ${n} 手:`,
  historyLine: (i: number, round: number, dealer: string, bet: number, insurance: number, insuranceWon: boolean, playerCards: string, dealerCards: string, delta: string) =>
    `${i}. 第${round}手 庄:${dealer} 押 ${bet}${insurance > 0 ? `,保险 ${insurance}${insuranceWon ? '(赢)' : '(输)'}` : ''},闲家 ${playerCards} 对 庄家 ${dealerCards} — 闲家净 ${delta}`,
  historyDealerYou: '你',
  historyDealerOwner: '{{owner}}',
  // ── 提示(回执尾部) ──
  playerNextHint: '接下来用 casino_player 继续。',
  playerActingHint: '接下来用 casino_player 的 hit / stand / double;停牌后庄家按规则自动打完。',
  // ── 德州扑克 ──
  holdemPhaseName: { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', runout: '发牌中', idle: '等下一手' },
  holdemStatusTurnYou: '轮到你行动(弃/过/跟/下注/加注)。',
  holdemStatusTurnOwner: '轮到{{owner}}行动。',
  holdemStatusHead: (round: number, phase: string, buttonLabel: string, turnLabel: string) =>
    `第 ${round} 手 · ${phase} · 庄位(小盲):${buttonLabel} · ${turnLabel}`,
  holdemStatusBlinds: (sb: number, bb: number, cap: number) => `盲注 ${sb}/${bb},单街投入封顶 ${cap}。`,
  holdemStatusPot: (pot: number, aiCommitted: number, playerCommitted: number, toCall: number, minTo: string) =>
    `底池 ${pot}(你已投 ${aiCommitted},{{owner}}已投 ${playerCommitted});要跟 ${toCall},${minTo}。`,
  holdemYourHole: (cards: string) => `你的底牌:${cards}。`,
  holdemCommunity: (cards: string) => `公共牌:${cards}。`,
  holdemCommunityEmpty: '公共牌还没发。',
  holdemOwnerHoleHidden: (n: number) => `{{owner}}底牌 ${n} 张(背面)。`,
  holdemOwnerHoleShown: (cards: string) => `{{owner}}底牌(已亮):${cards}。`,
  holdemStatusChips: (ai: number, owner: number) => `筹码:你 ${ai} — {{owner}} ${owner}。`,
  holdemHandOver: '这一手已经结束了,等{{owner}}发下一手。',
  holdemDealFirst: '还没发牌,{{owner}}点「发下一手」开始。',
  holdemDealing: '牌正在发,稍等。',
  holdemNotYourTurn: '还没轮到你行动。',
  holdemNotYourTurnOwner: '现在还轮不到{{owner}}行动。',
  holdemNothingToCall: '没有注要跟:该过牌(check)或下注(bet)。',
  holdemCannotCheck: '有注要跟,不能过牌:用 call、raise 或 fold。',
  holdemBetNotInteger: (raw: string) => `下注额要是整数,收到 ${raw}。`,
  holdemBetTooSmall: (min: number) => `下注至少 ${min}(大盲)。`,
  holdemBetOverCap: (cap: number) => `本街投入封顶 ${cap}。`,
  holdemBetOverBalance: (avail: number) => `你的余额只够 ${avail}。`,
  holdemRaiseTooSmall: (minTo: number) => `加注至少到 ${minTo}(现注 + 最小加注增量)。`,
  holdemRaiseIsBet: '这一街还没有人下注,用 bet 而不是 raise。',
  holdemFacingAllIn: '对方已全押,只能 call 或 fold。',
  holdemActionFold: (who: string) => `${who}弃牌。`,
  holdemActionCheck: (who: string) => `${who}过牌。`,
  holdemActionCall: (who: string, pay: number, allin: string) => `${who}跟注 ${pay}${allin}。`,
  holdemActionBet: (who: string, amt: number, allin: string) => `${who}下注 ${amt}${allin}。`,
  holdemActionRaise: (who: string, to: number, allin: string) => `${who}加注到 ${to}${allin}。`,
  holdemAllInMark: '(全押)',
  holdemBlindsPosted: (sb: number, sbWho: string, bb: number, bbWho: string, buttonLabel: string) =>
    `盲注:小盲 ${sb}(${sbWho}),大盲 ${bb}(${bbWho});庄位在${buttonLabel}。`,
  holdemNewHand: (round: number, sb: number, bb: number, buttonLabel: string) =>
    `德州第 ${round} 手开始:盲注 ${sb}/${bb},庄位(小盲)在${buttonLabel}。`,
  holdemTurnNotify: (round: number, phase: string, pot: number, toCall: number, minTo: number) =>
    `轮到你在德州扑克行动(第 ${round} 手,${phase}):底池 ${pot},要跟 ${toCall},最小加注到 ${minTo}。先用 casino_table 看你的底牌与牌面,再用 holdem_act 行动(fold / check / call / bet / raise;bet、raise 必须带 amount:bet 是下注额,raise 是本街投入到的总额)。`,
  holdemTurnNotifyRaiseClosed: (round: number, phase: string, pot: number, toCall: number, cap: number) =>
    `轮到你在德州扑克行动(第 ${round} 手,${phase}):底池 ${pot},要跟 ${toCall};本街注额已达封顶 ${cap},不能常规加注,只能跟注或弃牌(筹码不足时全押跟注即可)。先用 casino_table 看你的底牌与牌面,再用 holdem_act 行动(fold / check / call)。`,
  holdemTurnNotifyAllinOnly: (round: number, phase: string, pot: number, toCall: number, allinTo: number) =>
    `轮到你在德州扑克行动(第 ${round} 手,${phase}):底池 ${pot},要跟 ${toCall};常规加注的最小额度已超过单街封顶,要加注只能不足额全押到 ${allinTo},否则只能跟注或弃牌。先用 casino_table 看你的底牌与牌面,再用 holdem_act 行动(fold / check / call / raise 到 ${allinTo} 即全押)。`,
  holdemTurnNotifyFaceAllin: (round: number, phase: string, pot: number, toCall: number) =>
    `轮到你在德州扑克行动(第 ${round} 手,${phase}):底池 ${pot},要跟 ${toCall};对方已全押,只能跟注或弃牌。先用 casino_table 看你的底牌与牌面,再用 holdem_act 行动(fold / call)。`,
  holdemRaiseCapClosed: (cap: number) =>
    `本街注额已达封顶 ${cap},不能常规加注;只能跟注、弃牌,或不足额全押(raise 到你的全部余额)。`,
  holdemActReceipt: (actionText: string, cards: string, community: string, pot: string, next: string) =>
    `你${actionText} 你的底牌:${cards}。公共牌:${community}。${pot}${next}`,
  holdemNextYouAct: '接下来还是你行动,用 holdem_act 继续。',
  holdemNextOwnerAct: '等{{owner}}行动。',
  holdemNextStreetDealt: (street: string, cards: string) => `${street}发出:${cards}。`,
  holdemResultFold: (round: number, winnerLabel: string, pot: number, delta: string, aiChips: number, ownerChips: number, board: string) =>
    `第 ${round} 手:${winnerLabel}收下底池 ${pot}(${delta})。公共牌 ${board}。筹码:你 ${aiChips} — {{owner}} ${ownerChips}。`,
  holdemResultShowdown: (round: number, yourMade: string, ownerMade: string, board: string, winnerLabel: string, pot: number, delta: string, aiChips: number, ownerChips: number) =>
    `第 ${round} 手摊牌:你 ${yourMade},{{owner}} ${ownerMade};牌面 ${board}。${winnerLabel}底池 ${pot}(${delta})。筹码:你 ${aiChips} — {{owner}} ${ownerChips}。`,
  holdemYouWinPot: '你赢下',
  holdemOwnerWinsPot: '{{owner}}赢下',
  holdemSplitPot: '双方平分',
  holdemSplitNote: '(平分底池)',
  holdemMadeName: (cat: number, r: string[]) =>
    cat === 8 ? `同花顺(${r[0]} 高)`
      : cat === 7 ? `四条 ${r[0]}`
        : cat === 6 ? `葫芦(${r[0]} 带 ${r[1]})`
          : cat === 5 ? `同花(${r[0]} 高)`
            : cat === 4 ? `顺子(${r[0]} 高)`
              : cat === 3 ? `三条 ${r[0]}`
                : cat === 2 ? `两对 ${r[0]} 和 ${r[1]}`
                  : cat === 1 ? `一对 ${r[0]}`
                    : `高牌 ${r[0]}`,
  holdemHistoryTitle: (n: number) => `最近 ${n} 手德州:`,
  holdemHistoryLine: (i: number, round: number, winnerLabel: string, by: string, pot: number, delta: string) =>
    `${i}. 第${round}手 ${winnerLabel}${by === 'fold' ? '(弃牌)' : '(摊牌)'} 底池 ${pot} — 净 ${delta}`,
  holdemPotNote: (pot: number) => `底池 ${pot}。`,
  matchResetBusy: '这一手还没打完,等结算后再归档重开。',
  // ── 面板动作错误(部署语言) ──
  handNotFinished: '这一手还没打完。',
  matchResetDealerPlaying: '庄家正在按规则打牌,等这一手结算完再归档重开。',
  errNewgameDealerArg: '庄家要写 ai 或 player。',
  errAINotWaiting: '现在没有在等 AI。',
  casinoInvite: '月下牌桌空着呢。主动邀请{{owner}}来玩一局:在聊天里自然地提起牌桌,提议玩 21 点、抽鬼牌或德州扑克之一,说说你为什么想玩这个;可以顺带提一句目前的战绩(筹码或胜场)。别自作主张开局,主人答应后等他自己在面板上选游戏,或询问他想玩哪个再等他点头。一次就好,别反复催。',
  sessionArchived: (game: string, rounds: number, winnerLabel: string) => `主人在面板上选择不继续上一局,${game}的未完对局已作废归档(共 ${rounds} 手/局,按筹码算${winnerLabel});筹码不清零。这一局没什么好复盘的,主人重新开了新局。`,
  statusPausedGames: (names: string) => `桌上还有没打完的对局:${names}。主人在面板上打开对应游戏时可以继续或重新开始。`,
  errNothingToResume: '那个游戏没有可以继续的对局。',
  errAgainOnlyFinished: '这一局还没打完,打完才能再来一局。',
  errUnknownActionPanel: (action: string) => `未知动作 ${action}。`,
};

export type ModelText = typeof zh;

const en: ModelText = {
  statusGameBlackjack: '[Blackjack]',
  statusGameOldMaid: '[Old Maid]',
  statusGameHoldem: '[Texas Hold\'em]',
  statusGameHanafuda: '[Hanafuda Koi-Koi]',
  hanafudaNewRound: (round, rounds) => `Hanafuda round ${round} of ${rounds} starts: 8-card hand, 8 field cards; pairs match by month only — form a yaku, then stop or call koikoi.`,
  hanafudaTurnNotify: 'Your turn to play a card in Hanafuda: check your hand and the field with casino_table, then use hanafuda_act play (with index) — a matching field card is taken automatically and the engine draws your deck card; after forming a yaku you get the koikoi/stop prompt.',
  hanafudaDecideNotify: 'You formed a yaku: use hanafuda_act koikoi to keep going (if overtaken the opponent doubles) or stop to bank your points.',
  hanafudaStatusHead: (round, rounds) => `round ${round}/${rounds}`,
  hanafudaStatusScore: (ai, owner, matchAi, matchOwner) => `Points: you ${ai} — {{owner}} ${owner}; match totals: you ${matchAi} — {{owner}} ${matchOwner}.`,
  hanafudaStatusCounts: (al, at, an, ak, pl, pt, pn, pk) =>
    `Collected: you L${al}/S${at}/T${an}/C${ak} — {{owner}} L${pl}/S${pt}/T${pn}/C${pk}.`,
  hanafudaStatusHands: (aiHand, ownerCount, fieldCount, deckCount) => `Your hand (${aiHand.split(' ').length}): ${aiHand}; {{owner}} holds ${ownerCount} face-down; field ${fieldCount}, deck ${deckCount}.`,
  hanafudaStatusYaku: (yaku) => `Current yaku: ${yaku}.`,
  hanafudaStatusChips: (ai, owner) => `Chips (this game): you ${ai} — {{owner}} ${owner}.`,
  hanafudaStatusTurnYou: 'Your turn to play (hanafuda_act play).',
  hanafudaStatusTurnOwner: "{{owner}}'s turn to play.",
  hanafudaStatusDecideYou: 'You formed a yaku: hanafuda_act koikoi or stop.',
  hanafudaStatusDecideOwner: '{{owner}} formed a yaku and is deciding.',
  hanafudaMatchDone: (matchAi, matchOwner) => `Match over: you ${matchAi} — {{owner}} ${matchOwner} points.`,
  hanafudaBadIndex: (count) => `index must be between 0 and ${count - 1} (hand has ${count} cards).`,
  hanafudaPickPrompt: (cardA, cardB) => `Two matching field cards (${cardA} / ${cardB}): use hanafuda_act pick (index 0 or 1) to take one; the other stays on the field.`,
  hanafudaNothingToPick: 'There is no field-card pick to make right now.',
  hanafudaNothingToDecide: 'There is no yaku decision to make right now.',
  hanafudaNotYourPhase: 'Not the play phase (settle the pick or decision first).',
  hanafudaNotYourTurn: 'Not your turn yet.',
  hanafudaUnknownAct: 'hanafuda_act action must be play / pick / koikoi / stop.',
  hanafudaYakuFormed: (yaku, score) => `Yaku formed: ${yaku} (${score} points now). Koikoi for more, or stop to bank it?`,
  hanafudaNoYakuPass: 'No yaku — turn passes to the opponent.',
  hanafudaKoikoiCalled: 'Koikoi! Play on — if the opponent overtakes and stops, they double.',
  hanafudaMatchOver: 'The Hanafuda match is over; start a new one from the panel.',
  hanafudaRoundResult: (round, winner, score, matchAi, matchOwner, aiChips, ownerChips) =>
    `Hanafuda round ${round}: ${winner}, ${score} points. Match totals: you ${matchAi} — {{owner}} ${matchOwner}. Chips: you ${aiChips} — {{owner}} ${ownerChips}.`,
  hanafudaDrawResult: (round, matchOver) =>
    matchOver ? `Hanafuda round ${round} drawn; that ends the match.` : `Hanafuda round ${round} drawn (nobody stopped); dealing the next round.`,
  hanafudaHistoryTitle: (n) => `The last ${n} Hanafuda rounds:`,
  hanafudaHistoryLine: (i, round, winner, aiScore, ownerScore) =>
    `${i}. round ${round}: ${winner} (you ${aiScore} — {{owner}} ${ownerScore}).`,
  oldMaidTurnYou: (ownerCount) => `Your turn to draw: take one card from {{owner}}'s hand (they hold ${ownerCount}).`,
  oldMaidTurnOwner: (aiCount) => `It is {{owner}}'s turn to draw (you hold ${aiCount}).`,
  oldMaidTurnNotify: (ownerCount) => `Your turn to draw in Old Maid: take one random card from {{owner}}'s hand (they hold ${ownerCount}, face down). Use oldmaid_draw.`,
  oldMaidYourHand: (summary, count) => `Your hand (${count} cards): ${summary}`,
  oldMaidOwnerHand: (count) => `{{owner}}'s hand: ${count} cards (face down).`,
  oldMaidDiscards: (n) => `Discarded pairs: ${n}.`,
  oldMaidScore: (ai, owner) => `Old Maid wins: you ${ai} — {{owner}} ${owner}.`,
  oldMaidDrawReceipt: (card, ownSummary, ownCount, ownerCount, newPairs) =>
    `You drew ${card}. You now hold ${ownCount} cards (${ownSummary}); {{owner}} has ${ownerCount} left. ${newPairs > 0 ? `That made ${newPairs} pair${newPairs > 1 ? 's' : ''}, discarded.` : 'No pair formed.'}`,
  oldMaidEndLine: (winner, aiCount, ownerCount, aiScore, ownerScore, hidden, ghost) =>
    `Old Maid hand over: ${winner}. The card hidden at the deal was ${hidden} — its rank-mate is the Old Maid${ghost ? `, and the loser is left holding it: ${ghost}` : ''}. Cards at the end — you ${aiCount}, {{owner}} ${ownerCount}. Wins: you ${aiScore} — {{owner}} ${ownerScore}.`,
  oldMaidBadIndex: (count) => `index must be between 0 and ${count - 1} (they hold ${count} cards).`,
  returnedToLobby: 'Back to the lobby — the hand is void (chips untouched).',
  oldMaidOver: (winner) => `The Old Maid hand is over (${winner}).`,
  oldMaidOverAlready: 'This hand is already over.',
  oldMaidNotYourTurn: 'It is not your turn to draw.',
  errNewgameKind: "The game must be blackjack, oldmaid, holdem, or hanafuda.",
  errWrongGame: 'The table is not running that game right now.',
  oldMaidHistoryTitle: (n) => `The last ${n} Old Maid games:`,
  oldMaidHistoryLine: (i, winner) => `${i}. ${winner}.`,
  dealerRole: 'dealer',
  playerRole: 'player',
  handInProgress: 'Your hand is still in progress.',
  ownersHandInProgress: "{{owner}}'s hand is still in progress.",
  noHandDeal: 'No hand in progress; deal first.',
  handSettledDeal: 'That hand is settled; deal to start a new one.',
  notYourTurnAsDealer: 'You are the dealer on this table (a mechanical bank played by the engine); there is no player action for you. The cards on the table are yours to watch.',
  noGameYet: 'No game yet; the player seat opens once {{owner}} picks the dealer on the panel.',
  youAreDealerNote: 'You are the dealer on this table (a mechanical bank played by the engine); there is no player action for you.',
  dealerTurnInProgress: 'The dealer is playing by the table rules; wait for the settlement.',
  decideInsuranceFirst: 'Decide the insurance (or decline it) before playing cards.',
  betFirst: 'Place a bet first; there is nothing to play yet.',
  unknownAction: (action, actions) => `Unknown action ${action}; use ${actions}.`,
  betNotInteger: (raw) => `The bet must be an integer, got ${raw}.`,
  minBetIs: (n) => `The minimum bet is ${n}.`,
  maxBetIs: (n) => `The maximum bet per hand is ${n}.`,
  cannotAffordBet: (chips, bet) => `Your balance is ${chips}; you cannot stake ${bet}.`,
  betPlaced: (amount) => `{{owner}} bets ${amount} and makes you the dealer.`,
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
  notInsuranceTime: 'It is not time to decide the insurance (the dealer must be showing an Ace).',
  insuranceNotInteger: 'The insurance amount must be a non-negative integer; 0 declines.',
  insuranceMaxIs: (n) => `Insurance is at most ${n} (half the bet).`,
  cannotAffordInsurance: (chips, amount) => `Your balance of ${chips} cannot cover ${amount} of insurance.`,
  insuranceBought: (amount) => `{{owner}} buys ${amount} of insurance.`,
  insuranceDeclined: '{{owner}} looks at the dealer upcard, an Ace, and declines the insurance.',
  insuranceDecideFirst: 'Decide the insurance (or decline it) before playing cards.',
  insurancePrompt: (max) => `Dealer shows an Ace: use casino_player's insurance to decide (amount:0 declines, at most ${max}).`,
  insuranceTurn: (max, balance, bank) =>
    `Dealer shows an Ace: you may take insurance, at most ${max} (half the bet). It pays 2:1 if the dealer has blackjack, otherwise it is collected; amount:0 declines. Your balance ${balance}, {{owner}}'s bank ${bank}. Use casino_player's insurance.`,
  ownerBets: (amount) => `{{owner}} bets ${amount} and makes you the dealer.`,
  ownerHits: (card, cards, total, bust) => `{{owner}} hits and draws ${card}: player hand ${cards} (${total}${bust}).`,
  ownerStands: (total, cards) => `{{owner}} stands at ${total} (${cards}).`,
  ownerDoubles: (bet, card, total, bust) => `{{owner}} doubles: the stake is ${bet}, one card ${card}, standing at ${total}${bust}.`,
  ownerSplits: (bet, hand0, hand1, aces) => `{{owner}} splits the pair into two hands of ${bet} each: one ${hand0}, the other ${hand1}${aces}.`,
  ownerInsured: (amount) => `{{owner}} buys ${amount} of insurance.`,
  ownerDeclined: '{{owner}} looks at the dealer upcard, an Ace, and declines the insurance.',
  ownerSurrendered: '{{owner}} surrenders and forfeits half the bet.',
  bustNote: ', busted',
  settleLine: (round, dealer, hands, dealerCards, dealerTotal, dealerBust, delta, aiChips, ownerChips) =>
    `Hand ${round} settled (dealer: ${dealer}). Player ${hands} against dealer ${dealerCards} (${dealerTotal}${dealerBust}). Net ${delta}. Your chips ${aiChips}, {{owner}} ${ownerChips}.`,
  outcomeWin: 'win',
  outcomeLose: 'lose',
  outcomePush: 'push',
  outcomeBlackjack: 'blackjack',
  outcomeBust: 'bust',
  outcomeSurrender: 'surrender',
  dealerBustNote: ', busted',
  matchArchived: (rounds, aiChips, ownerChips, winner, startChips) =>
    `{{owner}} archived this match (${rounds} hands): at the end you held ${aiChips} against {{owner}}'s ${ownerChips}, ${winner}. Both sides start over with ${startChips}; a new match waits for the dealer choice.`,
  matchYouWin: 'you win',
  matchOwnerWins: '{{owner}} wins',
  matchTie: 'a tie',
  reliefOnlyWhenBroke: (chips, minBet) => `Relief is for the broke only: your balance of ${chips} still covers the minimum bet of ${minBet}.`,
  reliefGranted: (startChips, chips, count) => `Relief of ${startChips} has arrived, balance ${chips}; that is your ${count}th bankruptcy. The table keeps no books beyond itself.`,
  bankStatus: (chips, wins, losses, pushes, net, bankruptcies, ownerChips, ownerWins, ownerLosses, ownerPushes) =>
    `Your balance: ${chips} (${wins} won / ${losses} lost / ${pushes} pushed, net ${net}, ${bankruptcies} bankruptcies). {{owner}}: ${ownerChips} (${ownerWins} won / ${ownerLosses} lost / ${ownerPushes} pushed).`,
  bankStatusOwn: (chips) => `your balance ${chips}`,
  statusNoGame: 'No game yet ({{owner}} picks the dealer on the panel to start).',
  statusYouDealer: 'You are the dealer (a mechanical bank played by the engine); {{owner}} is the player.',
  statusYouPlayer: 'You are the player; {{owner}} is the dealer.',
  statusIdle: 'waiting for the next hand',
  statusBettingYou: 'waiting for you (the player) to bet',
  statusBettingOwner: 'waiting for {{owner}} (the player) to bet',
  statusActingYou: 'waiting for you (the player) to hit/stand/double',
  statusActingOwner: 'waiting for {{owner}} (the player) to hit/stand/double',
  statusInsuranceYou: 'waiting for you (the player) to decide the insurance',
  statusInsuranceOwner: 'waiting for {{owner}} (the player) to decide the insurance',
  statusRound: (round, lastBet) => `Hand ${round} (the last one staked ${lastBet}).`,
  statusRoundZero: 'Nothing played yet.',
  statusChips: (ai, owner, start, minBet, maxBet, soft) =>
    `Your chips: ${ai}; {{owner}}: ${owner} (start ${start}, minimum bet ${minBet}, maximum per hand ${maxBet}, dealer ${soft}).`,
  dealerSoftStands: 'stands on soft 17 (S17)',
  dealerSoftHits: 'hits soft 17 (H17)',
  statusBet: (bet) => `Current stake ${bet}.`,
  statusDealerRevealed: (cards, total) => `Dealer hand (revealed): ${cards} (${total}).`,
  statusDealerUpcard: (card) => `Dealer upcard: ${card}, hole card still hidden.`,
  bettingTurn: (minBet, maxBet, balance, bank) =>
    `Your turn to bet. You are the player and {{owner}} is the dealer. Minimum bet ${minBet}, maximum per hand ${maxBet}, your balance ${balance}, {{owner}}'s bank ${bank}; the stake cannot exceed the smaller of the two. Use casino_player's bet to open the hand.`,
  statusHandLine: (mark, cards, total, soft, bet, doubled, stood) =>
    `${mark}Player hand: ${cards} (${total}${soft ? ' soft' : ''}), stake ${bet}${doubled ? ' (doubled)' : ''}${stood ? ' (stood)' : ''}`,
  statusHandCurrentMark: '[current]',
  statusInsuranceNote: (insurance, resolved) => (insurance > 0 ? `, insurance ${insurance}${resolved}` : ''),
  insurancePending: 'pending',
  insuranceLostNote: 'lost',
  insuranceWonNote: 'won',
  ownerHandInProgressLabel: "{{owner}}'s hand is still in progress.",
  yourHandInProgressLabel: 'Your hand is still in progress.',
  holeHiddenNote: 'hole card still hidden.',
  dealerUpcardNote: (card) => `Dealer upcard: ${card}, hole card still hidden.`,
  noHistoryYet: 'No records yet.',
  historyTitle: (n) => `The last ${n} hands:`,
  historyLine: (i, round, dealer, bet, insurance, insuranceWon, playerCards, dealerCards, delta) =>
    `${i}. Hand ${round}, dealer: ${dealer}, stake ${bet}${insurance > 0 ? `, insurance ${insurance}${insuranceWon ? ' (won)' : ' (lost)'}` : ''}; player ${playerCards} against dealer ${dealerCards} — player net ${delta}`,
  historyDealerYou: 'you',
  historyDealerOwner: '{{owner}}',
  playerNextHint: 'Continue with casino_player.',
  playerActingHint: 'Continue with casino_player hit / stand / double; once you stand the dealer plays out by the table rule.',
  holdemPhaseName: { preflop: 'pre-flop', flop: 'flop', turn: 'turn', river: 'river', runout: 'dealing', idle: 'between hands' },
  holdemStatusTurnYou: 'Your turn to act (fold/check/call/bet/raise).',
  holdemStatusTurnOwner: 'Waiting for {{owner}} to act.',
  holdemStatusHead: (round, phase, buttonLabel, turnLabel) =>
    `Hand ${round} · ${phase} · button (small blind): ${buttonLabel} · ${turnLabel}`,
  holdemStatusBlinds: (sb, bb, cap) => `Blinds ${sb}/${bb}, each street capped at ${cap}.`,
  holdemStatusPot: (pot, aiCommitted, playerCommitted, toCall, minTo) =>
    `Pot ${pot} (you have put in ${aiCommitted}, {{owner}} ${playerCommitted}); to call ${toCall}, ${minTo}.`,
  holdemYourHole: (cards) => `Your hole cards: ${cards}.`,
  holdemCommunity: (cards) => `Board: ${cards}.`,
  holdemCommunityEmpty: 'The board has not been dealt yet.',
  holdemOwnerHoleHidden: (n) => `{{owner}}'s hole cards: ${n} (face down).`,
  holdemOwnerHoleShown: (cards) => `{{owner}}'s hole cards (revealed): ${cards}.`,
  holdemStatusChips: (ai, owner) => `Chips: you ${ai} — {{owner}} ${owner}.`,
  holdemHandOver: 'This hand is over; wait for {{owner}} to deal the next one.',
  holdemDealFirst: 'No cards out yet; {{owner}} taps "Deal next hand" to start.',
  holdemDealing: 'Cards are being dealt; wait a moment.',
  holdemNotYourTurn: 'It is not your turn to act.',
  holdemNotYourTurnOwner: 'It is not {{owner}}\'s turn to act.',
  holdemNothingToCall: 'There is no bet to call: check or bet instead.',
  holdemCannotCheck: 'There is a bet to call: use call, raise, or fold.',
  holdemBetNotInteger: (raw) => `The bet must be an integer, got ${raw}.`,
  holdemBetTooSmall: (min) => `A bet must be at least ${min} (the big blind).`,
  holdemBetOverCap: (cap) => `This street is capped at ${cap}.`,
  holdemBetOverBalance: (avail) => `Your balance only covers ${avail}.`,
  holdemRaiseTooSmall: (minTo) => `A raise must be to at least ${minTo} (current bet + minimum raise).`,
  holdemRaiseIsBet: 'Nobody has bet this street yet; use bet, not raise.',
  holdemFacingAllIn: 'The opponent is all-in; only call or fold.',
  holdemActionFold: (who) => `${who} folds.`,
  holdemActionCheck: (who) => `${who} checks.`,
  holdemActionCall: (who, pay, allin) => `${who} calls ${pay}${allin}.`,
  holdemActionBet: (who, amt, allin) => `${who} bets ${amt}${allin}.`,
  holdemActionRaise: (who, to, allin) => `${who} raises to ${to}${allin}.`,
  holdemAllInMark: ' (all-in)',
  holdemBlindsPosted: (sb, sbWho, bb, bbWho, buttonLabel) =>
    `Blinds: small blind ${sb} (${sbWho}), big blind ${bb} (${bbWho}); the button is with ${buttonLabel}.`,
  holdemNewHand: (round, sb, bb, buttonLabel) =>
    `Hold'em hand ${round} begins: blinds ${sb}/${bb}, the button (small blind) is with ${buttonLabel}.`,
  holdemTurnNotify: (round, phase, pot, toCall, minTo) =>
    `Your turn to act in Hold'em (hand ${round}, ${phase}): pot ${pot}, to call ${toCall}, minimum raise to ${minTo}. Check casino_table for your hole cards and the board first, then act with holdem_act (fold / check / call / bet / raise; bet and raise take amount: for bet it is the stake, for raise it is the street total to raise to).`,
  holdemTurnNotifyRaiseClosed: (round, phase, pot, toCall, cap) =>
    `Your turn to act in Hold'em (hand ${round}, ${phase}): pot ${pot}, to call ${toCall}; this street has reached the cap of ${cap}, so no regular raise is possible — call or fold (a short all-in call is fine if short-stacked). Check casino_table for your hole cards first, then act with holdem_act (fold / check / call).`,
  holdemTurnNotifyAllinOnly: (round, phase, pot, toCall, allinTo) =>
    `Your turn to act in Hold'em (hand ${round}, ${phase}): pot ${pot}, to call ${toCall}; the minimum regular raise exceeds the street cap, so raising is only possible as a short all-in to ${allinTo} — otherwise call or fold. Check casino_table for your hole cards first, then act with holdem_act (fold / check / call, or raise to ${allinTo} to shove).`,
  holdemTurnNotifyFaceAllin: (round, phase, pot, toCall) =>
    `Your turn to act in Hold'em (hand ${round}, ${phase}): pot ${pot}, to call ${toCall}; the opponent is all-in, so only call or fold. Check casino_table for your hole cards first, then act with holdem_act (fold / call).`,
  holdemRaiseCapClosed: (cap) =>
    `This street has reached the cap of ${cap}; no regular raise. Call, fold, or shove by raising to your full remaining stack.`,
  holdemActReceipt: (actionText, cards, community, pot, next) =>
    `You ${actionText} Your hole cards: ${cards}. Board: ${community}. ${pot}${next}`,
  holdemNextYouAct: 'You act again; continue with holdem_act.',
  holdemNextOwnerAct: 'Waiting for {{owner}} to act.',
  holdemNextStreetDealt: (street, cards) => `${street} dealt: ${cards}.`,
  holdemResultFold: (round, winnerLabel, pot, delta, aiChips, ownerChips, board) =>
    `Hand ${round}: ${winnerLabel} the pot of ${pot} (${delta}). Board ${board}. Chips: you ${aiChips} — {{owner}} ${ownerChips}.`,
  holdemResultShowdown: (round, yourMade, ownerMade, board, winnerLabel, pot, delta, aiChips, ownerChips) =>
    `Hand ${round} showdown: you hold ${yourMade}, {{owner}} ${ownerMade}; board ${board}. ${winnerLabel} the pot of ${pot} (${delta}). Chips: you ${aiChips} — {{owner}} ${ownerChips}.`,
  holdemYouWinPot: 'you take',
  holdemOwnerWinsPot: '{{owner}} takes',
  holdemSplitPot: 'the pot is split',
  holdemSplitNote: ' (split pot)',
  holdemMadeName: (cat, r) =>
    cat === 8 ? `straight flush (${r[0]} high)`
      : cat === 7 ? `four of a kind, ${r[0]}s`
        : cat === 6 ? `full house (${r[0]}s over ${r[1]}s)`
          : cat === 5 ? `flush (${r[0]} high)`
            : cat === 4 ? `straight (${r[0]} high)`
              : cat === 3 ? `three of a kind, ${r[0]}s`
                : cat === 2 ? `two pair, ${r[0]}s and ${r[1]}s`
                  : cat === 1 ? `a pair of ${r[0]}s`
                    : `high card ${r[0]}`,
  holdemHistoryTitle: (n) => `The last ${n} Hold'em hands:`,
  holdemHistoryLine: (i, round, winnerLabel, by, pot, delta) =>
    `${i}. Hand ${round} ${winnerLabel}${by === 'fold' ? ' (fold)' : ' (showdown)'}, pot ${pot} — net ${delta}`,
  holdemPotNote: (pot) => `Pot ${pot}.`,
  matchResetBusy: 'The current hand is not finished; wait for the settlement before archiving.',
  handNotFinished: 'The current hand is not finished yet.',
  matchResetDealerPlaying: 'The dealer is playing by the rules; wait for the hand to settle before archiving.',
  errNewgameDealerArg: 'The dealer must be ai or player.',
  errAINotWaiting: 'The AI is not waiting for anything right now.',
  casinoInvite: 'The card table sits empty. Proactively invite {{owner}} for a game: bring it up naturally in chat, suggest one of blackjack, Old Maid or Texas Hold\'em, and say why you feel like it; mentioning the current score (chips or wins) is a nice touch. Do not start the game yourself — once they agree, wait for them to pick on the panel, or ask which one they want and wait for a yes. Ask once; do not nag.',
  sessionArchived: (game, rounds, winnerLabel) => `The owner chose not to continue; the unfinished ${game} was voided and archived (${rounds} hand(s)/game(s), by chips ${winnerLabel}); chips were not reset. Nothing to review there — they started a fresh game.`,
  statusPausedGames: (names) => `There are unfinished games on the table: ${names}. When the owner opens one on the panel they can continue it or start over.`,
  errNothingToResume: 'There is no saved game to continue for that one.',
  errAgainOnlyFinished: 'This game is not finished yet; play it out before starting another.',
  errUnknownActionPanel: (action) => `Unknown action ${action}.`,
};

const tables = { zh, en } as { zh: ModelText; en: ModelText };

/** 部署语言 → 模型语言:只有英文部署读英文表,其余(含未知)一律中文。 */
export function toModelLanguage(language: string | undefined): ModelLanguage {
  return language === 'en' ? 'en' : 'zh';
}

/**
 * 对面玩家的称呼与桌宠一致:读部署 config.json 的 `worlds.desktop-pet.user`;
 * 留空或没有桌宠配置时,用桌宠 i18n 的 defaultUser(zh「伙伴」/ en "Pal")。
 * 每次使用时现读,改称呼无需重启。
 */
const PET_DEFAULT_USER: Record<ModelLanguage, string> = { zh: '伙伴', en: 'Pal' };

export function readOwnerLabel(botDir: string, language: ModelLanguage): string {
  try {
    const parsed = JSON.parse(readFileSync(join(botDir, 'config.json'), 'utf8')) as {
      worlds?: { 'desktop-pet'?: { user?: string } };
    };
    const user = parsed?.worlds?.['desktop-pet']?.user;
    if (typeof user === 'string' && user.trim()) return user.trim();
  } catch { }
  return PET_DEFAULT_USER[language] ?? PET_DEFAULT_USER.zh!;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** 取一份替换过称呼的表:{{owner}} / {{Owner}}(句首大写)。函数键包一层,输出同样替换。 */
export function modelText(language: ModelLanguage, ownerLabel: string): ModelText {
  const owner = ownerLabel;
  const Owner = capitalize(owner);
  const sub = (s: string): string => s.replace(/\{\{owner\}\}/g, owner).replace(/\{\{Owner\}\}/g, Owner);
  const base = tables[language] ?? tables.zh;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === 'string') out[key] = sub(value);
    else if (typeof value === 'function') {
      const fn = value as (...a: unknown[]) => unknown;
      out[key] = (...a: unknown[]) => sub(String(fn(...a)));
    } else out[key] = value;
  }
  return out as ModelText;
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
