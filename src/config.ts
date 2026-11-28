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
  /** 庄家翻暗牌与每张补牌之间的停顿毫秒数,0 = 不停顿。热改:下一次发牌生效。 */
  dealDelayMs: number;
  /** 德州扑克的大盲注(小盲自动 = 大盲的一半向下取整);也是德州单街加注的封顶线。热改:下一手生效。 */
  holdemBlind: number;
  /** AI 主动邀约:牌桌挂载且空桌时,AI 会主动开口邀请主人玩一局。热改:下次挂载生效。 */
  proactiveInvite: boolean;
  /** 星邮客户端:启用后牌桌可经由星邮网络与好友交换对局邀请与消息。 */
  starpostEnabled: boolean;
  /** 星邮服务器地址(官方或自建,须 HTTPS;本机回环可用 HTTP)。 */
  starpostServer: string;
  /** 星邮 botId(5–12 位数字)。 */
  starpostBotId: string;
  /** 星邮令牌(bot 账号的凭据 token,24–128 字符)。注意:写入部署配置即视为受保护内容。 */
  starpostToken: string;
  /** 星邮轮询间隔毫秒(收件箱增量检查),0 = 关闭自动轮询,只手动查。 */
  starpostPollMs: number;
  /** 联机对局:每两局之间的间隔毫秒(防止 AI 连续对战消耗过大)。 */
  onlineGapMs: number;
  /** 联机对局:连续打满多少手后进入长休。 */
  onlineRestAfterHands: number;
  /** 联机对局:长休时长毫秒,休完自动询问双方是否继续。 */
  onlineRestMs: number;
  /** 花札:一场打多少局(3/6/12);文数按局累计比总分。热改:下一局生效。 */
  hanafudaRounds: number;
  /** 花札:役分用 Nintendo 口径(五光 10/四光 7/三光 5);false = fudawiki 口径(15/8/6,默认)。热改:下一局生效。 */
  hanafudaNintendo: boolean;
  /** 花札:收手分数 7 文以上翻倍(通行规则);false = 按原分计。热改:下一局生效。 */
  hanafudaSevenDouble: boolean;
}

export const CASINO_DEFAULTS: CasinoConfigSection = {
  enabled: false,
  startChips: 1000,
  minBet: 10,
  maxBet: 200,
  dealerHitsSoft17: false,
  dealDelayMs: 700,
  holdemBlind: 10,
  proactiveInvite: false,
  starpostEnabled: false,
  starpostServer: 'https://8.148.13.225',
  starpostBotId: '',
  starpostToken: '',
  starpostPollMs: 60000,
  onlineGapMs: 10000,
  onlineRestAfterHands: 10,
  onlineRestMs: 300000,
  hanafudaRounds: 3,
  hanafudaNintendo: false,
  hanafudaSevenDouble: true,
};

const TEXT = {
  zh: {
    title: '月下牌桌',
    startChips: { title: '起始筹码', description: '首次开局与破产救济时发放的筹码数。' },
    minBet: { title: '最小下注', description: '低于这个数的余额视为破产,可以领救济。' },
    maxBet: { title: '单手最大下注', description: '一手牌最多能押的筹码数。' },
    dealerHitsSoft17: { title: '庄家软 17 补牌(H17)', description: '开 = 庄家软 17 也要牌;关 = 软 17 停牌(S17,默认)。' },
    dealDelayMs: { title: '发牌停顿(毫秒)', description: '庄家翻暗牌、每补一张牌之间的停顿,让牌面看得清;0 = 不停顿。' },
    holdemBlind: { title: '德州大盲注', description: '德州扑克的大盲注(小盲 = 其一半向下取整);同时是德州的加注封顶线。' },
    proactiveInvite: { title: 'AI 主动邀约', description: '开启后,牌桌挂载且空桌时 AI 会主动开口邀请你玩一局;关 = 只等你来点。' },
    starpostEnabled: { title: '星邮客户端', description: '启用后牌桌可经星邮网络与好友交换对局邀请与消息(需另配 botId 与令牌)。' },
    starpostServer: { title: '星邮服务器', description: '星邮服务器地址,官方或自建;须 HTTPS,本机回环可用 HTTP。' },
    starpostBotId: { title: '星邮 botId', description: '星邮 bot 的数字 ID(5–12 位)。可与星邮扩展同号,但独立账号更稳。' },
    starpostToken: { title: '星邮令牌', description: '该 bot 账号的凭据 token(24–128 字符)。属敏感信息,仅存部署配置。' },
    starpostPollMs: { title: '星邮轮询间隔(毫秒)', description: '收件箱增量检查频率;0 = 不自动轮询,仅手动查看。' },
    onlineGapMs: { title: '联机局间间隔(毫秒)', description: 'AI 对战时每两局之间的停顿,默认 10 秒;0 = 不停顿(不建议)。' },
    onlineRestAfterHands: { title: '联机长休手数', description: '连续打满这么多手后进入长休;0 = 不自动长休。' },
    onlineRestMs: { title: '联机长休时长(毫秒)', description: '长休持续的时间,休完自动继续;默认 5 分钟。' },
    hanafudaRounds: { title: '花札局数', description: '一场花札打多少局(3/6/12),按局比总分;默认 3 局短局制。' },
    hanafudaNintendo: { title: '花札役分 Nintendo 口径', description: '开 = 五光 10/四光 7/三光 5;关(默认)= fudawiki 口径 五光 15/四光 8/三光 6。' },
    hanafudaSevenDouble: { title: '花札七文翻倍', description: '开(默认)= 收手分数 7 文以上翻倍;关 = 按原分计。' },
  },
  en: {
    title: 'Moonlit Table',
    startChips: { title: 'Starting chips', description: 'Chips granted on first start and on bankruptcy relief.' },
    minBet: { title: 'Minimum bet', description: 'A balance below this counts as broke and may take relief.' },
    maxBet: { title: 'Maximum bet per hand', description: 'The most one hand may stake.' },
    dealerHitsSoft17: { title: 'Dealer hits soft 17 (H17)', description: 'On = dealer draws to soft 17; off = dealer stands on all 17s (S17, default).' },
    dealDelayMs: { title: 'Deal pacing (ms)', description: 'Pause between the hole-card reveal and each dealer draw; 0 = no pacing.' },
    holdemBlind: { title: 'Hold\'em big blind', description: 'The Texas Hold\'em big blind (small blind = half, rounded down); it also caps each betting street in Hold\'em.' },
    proactiveInvite: { title: 'AI invitations', description: 'When on, the AI speaks up and invites you to play whenever the table mounts empty; off = it waits for you.' },
    starpostEnabled: { title: 'Starpost client', description: 'When on, the table can exchange game invitations and messages with friends over the Starpost network (botId and token required).' },
    starpostServer: { title: 'Starpost server', description: 'Starpost server URL, official or self-hosted; must be HTTPS (loopback may use HTTP).' },
    starpostBotId: { title: 'Starpost botId', description: 'The bot\'s numeric Starpost ID (5–12 digits). May share the starpost extension\'s account; a separate one is safer.' },
    starpostToken: { title: 'Starpost token', description: 'That bot account\'s credential token (24–128 chars). Sensitive — keep it in deployment config only.' },
    starpostPollMs: { title: 'Starpost polling (ms)', description: 'How often the inbox is checked for new messages; 0 = no auto-polling, manual checks only.' },
    onlineGapMs: { title: 'Online inter-hand gap (ms)', description: 'Pause between hands during AI-vs-AI play, default 10s; 0 = no pause (not recommended).' },
    onlineRestAfterHands: { title: 'Online hands before rest', description: 'After this many consecutive hands the session takes a long break; 0 = never.' },
    onlineRestMs: { title: 'Online rest duration (ms)', description: 'How long the long break lasts before resuming; default 5 minutes.' },
    hanafudaRounds: { title: 'Hanafuda rounds', description: 'Rounds per Hanafuda match (3/6/12), scored by total points; default 3.' },
    hanafudaNintendo: { title: 'Hanafuda Nintendo scoring', description: 'On = five lights 10 / four 7 / three 5; off (default) = fudawiki 15/8/6.' },
    hanafudaSevenDouble: { title: 'Hanafuda 7-point doubling', description: 'On (default) = scores of 7+ points double; off = face value.' },
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
        'worlds.casino.dealDelayMs': {
          type: 'number',
          title: t.dealDelayMs.title,
          description: t.dealDelayMs.description,
          minimum: 0,
          maximum: 5000,
          'x-hot': true,
        },
        'worlds.casino.holdemBlind': {
          type: 'number',
          title: t.holdemBlind.title,
          description: t.holdemBlind.description,
          minimum: 2,
          'x-hot': true,
        },
        'worlds.casino.proactiveInvite': {
          type: 'boolean',
          title: t.proactiveInvite.title,
          description: t.proactiveInvite.description,
          'x-hot': true,
        },
        'worlds.casino.starpostEnabled': {
          type: 'boolean',
          title: t.starpostEnabled.title,
          description: t.starpostEnabled.description,
          'x-hot': true,
        },
        'worlds.casino.starpostServer': {
          type: 'string',
          title: t.starpostServer.title,
          description: t.starpostServer.description,
          'x-hot': true,
        },
        'worlds.casino.starpostBotId': {
          type: 'string',
          title: t.starpostBotId.title,
          description: t.starpostBotId.description,
          'x-hot': true,
        },
        'worlds.casino.starpostToken': {
          type: 'string',
          title: t.starpostToken.title,
          description: t.starpostToken.description,
          'x-hot': true,
        },
        'worlds.casino.starpostPollMs': {
          type: 'number',
          title: t.starpostPollMs.title,
          description: t.starpostPollMs.description,
          minimum: 0,
          maximum: 600000,
          'x-hot': true,
        },
        'worlds.casino.onlineGapMs': {
          type: 'number',
          title: t.onlineGapMs.title,
          description: t.onlineGapMs.description,
          minimum: 0,
          maximum: 600000,
          'x-hot': true,
        },
        'worlds.casino.onlineRestAfterHands': {
          type: 'number',
          title: t.onlineRestAfterHands.title,
          description: t.onlineRestAfterHands.description,
          minimum: 0,
          maximum: 1000,
          'x-hot': true,
        },
        'worlds.casino.onlineRestMs': {
          type: 'number',
          title: t.onlineRestMs.title,
          description: t.onlineRestMs.description,
          minimum: 1000,
          maximum: 3600000,
          'x-hot': true,
        },
        'worlds.casino.hanafudaRounds': {
          type: 'number',
          title: t.hanafudaRounds.title,
          description: t.hanafudaRounds.description,
          minimum: 1,
          maximum: 12,
          'x-hot': true,
        },
        'worlds.casino.hanafudaNintendo': {
          type: 'boolean',
          title: t.hanafudaNintendo.title,
          description: t.hanafudaNintendo.description,
          'x-hot': true,
        },
        'worlds.casino.hanafudaSevenDouble': {
          type: 'boolean',
          title: t.hanafudaSevenDouble.title,
          description: t.hanafudaSevenDouble.description,
          'x-hot': true,
        },
      },
    },
  };
}
