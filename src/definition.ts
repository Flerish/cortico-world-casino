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
      casino_play: { zh: '在月下牌桌打一手 21 点:下注开手、要牌、停牌、加倍。', en: 'Play one blackjack hand on the Moonlit Table.' },
      casino_history: { zh: '查牌桌最近的手与累计战绩。', en: 'Read recent hands and running totals.' },
      casino_bank: { zh: '查筹码账户;破产时领救济金。', en: 'Read the chip account; take bankruptcy relief when broke.' },
    }),
    events: [
      { type: 'casino.result', description: { zh: '主人在面板上结算了一手 21 点(谁、点数、输赢、筹码)。', en: 'The owner settled a blackjack hand on the panel.' } },
    ],
  },
};
