import type { ConfigGroup } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';

/** config.json 的 worlds.casino 段,默认禁用;bot 或部署可启用。 */
export interface CasinoConfigSection {
  enabled: boolean;
  /** 起始/救济筹码数。热改:救济与首次开局时现读。 */
  startChips: number;
  /** 最小下注;低于它的余额视为破产。 */
  minBet: number;
  /** 单手最大下注。 */
  maxBet: number;
  /** 庄家软 17 是否补牌(H17);false = 软 17 停(S17)。热改:本手内即按现值。 */
  dealerHitsSoft17: boolean;
}

export const CASINO_DEFAULTS: CasinoConfigSection = {
  enabled: false,
  startChips: 1000,
  minBet: 10,
  maxBet: 200,
  dealerHitsSoft17: false,
};

const TEXT = {
  zh: {
    title: '月下牌桌',
    startChips: { title: '起始筹码', description: '首次开局与破产救济时发放的筹码数。' },
    minBet: { title: '最小下注', description: '低于这个数的余额视为破产,可以领救济。' },
    maxBet: { title: '单手最大下注', description: '一手牌最多能押的筹码数。' },
    dealerHitsSoft17: { title: '庄家软 17 补牌(H17)', description: '开 = 庄家软 17 也要牌;关 = 软 17 停牌(S17,默认)。' },
  },
  en: {
    title: 'Moonlit Table',
    startChips: { title: 'Starting chips', description: 'Chips granted on first start and on bankruptcy relief.' },
    minBet: { title: 'Minimum bet', description: 'A balance below this counts as broke and may take relief.' },
    maxBet: { title: 'Maximum bet per hand', description: 'The most one hand may stake.' },
    dealerHitsSoft17: { title: 'Dealer hits soft 17 (H17)', description: 'On = dealer draws to soft 17; off = dealer stands on all 17s (S17, default).' },
  },
} as const;

function pick(language: Language): (typeof TEXT)[keyof typeof TEXT] {
  return language === 'en' ? TEXT.en : TEXT.zh;
}

/** World 配置的 JSON Schema 声明;显示文本按请求语言现取。 */
export function casinoConfigGroup(language: Language): ConfigGroup {
  const t = pick(language);
  return {
    id: 'world:casino',
    owner: 'world:casino',
    schema: {
      type: 'object',
      title: t.title,
      properties: {
        'worlds.casino.startChips': {
          type: 'number',
          title: t.startChips.title,
          description: t.startChips.description,
          minimum: 1,
          'x-hot': true,
        },
        'worlds.casino.minBet': {
          type: 'number',
          title: t.minBet.title,
          description: t.minBet.description,
          minimum: 1,
          'x-hot': true,
        },
        'worlds.casino.maxBet': {
          type: 'number',
          title: t.maxBet.title,
          description: t.maxBet.description,
          minimum: 1,
          'x-hot': true,
        },
        'worlds.casino.dealerHitsSoft17': {
          type: 'boolean',
          title: t.dealerHitsSoft17.title,
          description: t.dealerHitsSoft17.description,
          'x-hot': true,
        },
      },
    },
  };
}
