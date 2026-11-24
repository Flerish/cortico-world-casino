import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { CASINO_DEFAULTS, type CasinoConfigSection } from './config.ts';
import { CASINO_TOOL_DECLS, CasinoWorld } from './world.ts';

export const CASINO: WorldDefinition<CasinoConfigSection> = {
  id: 'casino',
  label: '月下牌桌',
  defaults: () => ({ ...CASINO_DEFAULTS }),
  // `ctx.cfg` 是 `worlds.casino` 的活引用:热改的键现读即生效。
  create: (ctx) => new CasinoWorld({ cfg: ctx.cfg, timezone: ctx.timezone, dataDir: ctx.dataDir, botDir: ctx.botDir }),
  // 自描述:可能出现的全部工具与会推出的全部事件,不进提示词。
  describe: {
    tools: describeTools(CASINO_TOOL_DECLS, {
      casino_table: { zh: '看牌桌状态:当前游戏、轮到谁、双方的牌与筹码;查三个游戏的历史。', en: 'Read the table state, the running score and the games history.' },
      casino_player: { zh: '以 21 点闲家身份行动:下注开手、要牌、停牌、加倍、分牌、保险、投降。庄家由引擎按规则自动打。', en: 'Act as the blackjack player: bet, hit, stand, double, split, insurance, surrender. The dealer is played by the engine.' },
      casino_bank: { zh: '查筹码账户(筹码按游戏分开计,这里显示的是当前对局);破产时领救济金。', en: 'Read the chip account (chips are tracked per game; this shows the current one); take bankruptcy relief when broke.' },
      oldmaid_draw: { zh: '抽鬼牌里轮到你时,从{{owner}}手中随机抽一张牌。', en: 'Draw one random card from the owner hand on your Old Maid turn.' },
      holdem_act: { zh: '德州扑克里轮到你时行动:弃牌、过牌、跟注、下注、加注(下注/加注要带金额)。', en: 'Act on your Hold\'em turn: fold, check, call, bet or raise (bet and raise take an amount).' },
    }),
    events: [
      { type: 'casino.turn', description: { zh: '轮到 AI 下注或决定保险(它坐 21 点闲家时)。', en: 'It is the AI turn to bet or take insurance as the blackjack player.' } },
      { type: 'casino.action', description: { zh: '主人的一个动作:下注、要牌、停牌、加倍、分牌、保险、投降(21 点,AI 坐庄时)。', en: 'One of the owner moves in a blackjack hand while the AI is the dealer.' } },
      { type: 'casino.result', description: { zh: '一手 21 点结算:双方的牌、点数、输赢与筹码变化。', en: 'A blackjack hand settled with both sides cards and the chip transfer.' } },
      { type: 'oldmaid.turn', description: { zh: '抽鬼牌里轮到 AI 从{{owner}}手中抽牌。', en: 'It is the AI turn to draw a card from the owner hand in Old Maid.' } },
      { type: 'oldmaid.result', description: { zh: '一局抽鬼牌结束:谁赢了与胜场。', en: 'An Old Maid game ended with the winner and the running score.' } },
      { type: 'holdem.turn', description: { zh: '德州扑克里轮到 AI 行动(弃/过/跟/下注/加注)。', en: 'The AI turn to act in Hold\'em (fold/check/call/bet/raise).' } },
      { type: 'holdem.action', description: { zh: '{{owner}}在德州扑克里的动作:开新手、过牌、下注、加注、跟注或弃牌。', en: 'One of the owner moves in Hold\'em: dealing a hand, checking, betting, raising, calling or folding.' } },
      { type: 'holdem.result', description: { zh: '一手德州扑克结算:底池归属、成牌与筹码变化。', en: 'A Hold\'em hand settled: pot winner, made hands and the chip transfer.' } },
      { type: 'casino.invite', description: { zh: '开启「AI 主动邀约」且空桌挂载时触发:邀请 AI 主动开口约主人玩一局。', en: 'Fires on an empty-table mount when AI invitations are enabled: prompts the AI to ask the owner for a game.' } },
    ],
  },
};
