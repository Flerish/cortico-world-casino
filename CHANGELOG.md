# Changelog

## 0.2.1

- 牌面改用手绘素材:正面模板与花纹牌背(自动裁黑边、缩放后内联进面板 bundle);
  亮牌 = 模板图上叠角标(左上/右下倒置)与中央花色,暗牌直接用花纹牌背。
  52 张牌共用一张模板图,bundle 只增约 280KB。scripts/prepare-assets.ps1 是素材准备脚本。

## 0.2.0

- 玩法重做为 AI 与玩家对战:开局在面板选庄(我坐庄 / 让 AI 坐庄),庄闲对位;
  庄家自由行动(亮暗牌后自行决定要牌/停牌),闲爆即庄赢、庄爆即闲赢、平局退注、
  黑杰克 1.5 倍。移除 v0.1.0 的「AI 对赌场庄家」单人模式。
- 事件改为 casino.turn(轮到 AI 下注/做庄)与 casino.result(结算);
  工具改为 casino_table / casino_player / casino_dealer / casino_bank。
- 面板按棋牌游戏布局重做:绿呢桌面、CSS 扑克牌面(暗牌牌背)、筹码、
  按阶段启用的操作按钮、结算横幅、可折叠历史;等待 AI 时可「催一下」。

## 0.1.0

- 第一版:本地 21 点牌桌。AI 用 casino_play / casino_history / casino_bank 自己打;
  主人经「牌桌」面板同桌开手。标准规则:A 软硬计点、黑杰克 3:2、庄家 17 停、加倍、
  破产救济。存档 casino-table.json。
