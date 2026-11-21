# cortico-world-casino · 月下牌桌

一张只存在于这台电脑里的 21 点(Blackjack)牌桌:AI 想打就打一手,主人可以从 WebUI 面板坐到
同一张桌上,各玩各的手,各自对庄家。筹码是游戏内数字,不涉及任何真实货币。

## 玩法(21 点标准规则)

- `deal` 押注开手:你两张,庄家一亮一暗;押注在配置的最小注与单手上限之间,且不超过余额。
- `hit` 要牌 / `stand` 停牌;首两张可 `double` 加倍(再扣一次注,补一张后停牌)。
- A 按 1 或 11 记,取有利的;首两张 21 是黑杰克,按 3:2 赔;爆牌即输,庄家同理;平局退注。
- 庄家规矩:总数小于 17 补牌,17 及以上停(含软 17)。
- 破产(余额低于最小注)可用 `casino_bank` 的 relief 领救济金,重新拿起始筹码,记一次破产。

## AI 怎么玩

牌桌以 World 挂载后,AI 的环境提示词里就有这张桌;它想打时用 `casino_play` 自己走
deal → hit/stand/double 的工具循环,一手一手地打。`casino_history` 查战绩,
`casino_bank` 查账户。主人开手或结算时,AI 会收到 `casino.result` 事件——聊天的由头,
不是命令。世界不主动催 AI 来打:来不来是它自己的事。

## 主人怎么玩

设置窗口 → 扩展 → 月下牌桌,「牌桌」面板:输注额,点「发牌」,再按「要牌 / 停牌 / 加倍」。
AI 侧的筹码与手牌同屏显示,面板实时更新。

## 配置(worlds.casino)

| 键 | 默认 | 含义 |
|---|---|---|
| `enabled` | false | 挂载这张桌 |
| `startChips` | 1000 | 首次开局与救济金发放的筹码数 |
| `minBet` | 10 | 最小下注;低于它的余额视为破产 |
| `maxBet` | 200 | 单手最大下注 |

存档在部署数据目录的 `casino-table.json`,每手结算后原子写;删掉它就是一张全新的桌。

## 安装

WebUI「扩展」页按包名安装 `cortico-world-casino`,或把本包目录用 `file:` 协议加进
`extensions/package.json` 后重启进程。启用:`worlds.casino.enabled: true`。

## 简化说明

每位玩家的手各自对一副独立的庄家手结算(不是真实赌场的一庄多客),除此之外按标准规则。
洗牌:52 张单副牌靴,耗尽重洗。

## 文件

| 文件 | 内容 |
|---|---|
| `src/definition.ts` | `WorldDefinition`:id、label、默认配置、`create()`、自描述 |
| `src/config.ts` | 配置段、默认值、WebUI 配置组(按语言取文案) |
| `src/world.ts` | `CasinoWorld`:工具、面板 invoke/stream、结算 |
| `src/cards.ts` | 牌、点数、庄家规则 |
| `src/table.ts` | 桌面状态与原子存档 |
| `src/ENV_PROMPT.md` | 环境提示词模板 |
| `src/webui/client.ts` | 面板源码(esbuild 打成 dist/webui.js) |
| `tests/world.test.ts` | 干装载、发牌/要牌/停牌、黑杰克赔率、破产救济、主人面板流程、存档延续 |
