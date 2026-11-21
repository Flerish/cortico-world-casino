import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { CASINO_DEFAULTS, type CasinoConfigSection } from './config.ts';
import { CASINO_TOOL_DECLS, CasinoWorld } from './world.ts';

export const CASINO: WorldDefinition<CasinoConfigSection> = {
  id: 'casino',
  label: '月下牌桌',
  defaults: () => ({ ...CASINO_DEFAULTS }),
  // `ctx.cfg` 是 `worlds.casino` 的活引用:热改的键现读即生效。
  create: (ctx) => new CasinoWorld({ cfg: ctx.cfg, timezone: ctx.timezone, dataDir: ctx.dataDir }),
  // 自描述:可能出现的全部工具与会推出的全部事件,不进提示词。
  describe: {
    tools: describeTools(CASINO_TOOL_DECLS, {
      casino_table: { zh: '看牌桌状态:谁坐庄、到哪一步、双方的牌与筹码;查历史手。', en: 'Read the table state and hand history.' },
      casino_player: { zh: '以闲家身份行动:下注开手、要牌、停牌、加倍。', en: 'Act as the player: bet, hit, stand, double.' },
      casino_dealer: { zh: '以庄家身份行动:亮牌后要牌或停牌。', en: 'Act as the dealer: hit or stand with the hole card revealed.' },
      casino_bank: { zh: '查筹码账户;破产时领救济金。', en: 'Read the chip account; take bankruptcy relief when broke.' },
    }),
    events: [
      { type: 'casino.turn', description: { zh: '轮到 AI 行动:作为闲家下注,或作为庄家做要牌/停牌决定。', en: 'It is the AI turn to bet or to act as the dealer.' } },
      { type: 'casino.result', description: { zh: '一手结算:双方的牌、点数、输赢与筹码变化。', en: 'A hand settled with both sides cards and the chip transfer.' } },
    ],
  },
};
