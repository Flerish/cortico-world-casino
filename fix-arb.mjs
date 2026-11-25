import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('./src/world.ts', import.meta.url);
let s = readFileSync(p, 'utf8');

// ── 1. accept 竞态仲裁:双方互邀+互 accept 时,botId 小的一方当庄家,另一方降级为客座 ──
const oldAccept = `    if (msg.action === 'accept') {
      if (sp.session) return; // 已有会话进行中,忽略新接受
      const target = sp.invites.find((i) => i.direction === 'out' && i.peer === peer && i.status === 'pending' && (!msg.game || i.game === msg.game));
      if (!target) return;
      target.status = 'accepted';`;
const newAccept = `    if (msg.action === 'accept') {
      if (sp.session) return; // 已有会话进行中,忽略新接受
      const target = sp.invites.find((i) => i.direction === 'out' && i.peer === peer && i.status === 'pending' && (!msg.game || i.game === msg.game));
      if (!target) return;
      target.status = 'accepted';
      // 双向互邀竞态仲裁:双方互发邀约又互发 accept 时,两边都会走到这里各建庄家会话。
      // 确定性规则:botId 小的一方坐庄;大的一方不建会话,等对方 start(case 'start' 建客座会话)。
      const myId = this.myBotId();
      if (myId > peer) {
        push('casino.online_state', \`[星邮联机] 双方互发了邀约,按 ID 仲裁由 \${peer} 坐庄;等待对方开局。\`);
        return;
      }`;
if (!s.includes('按 ID 仲裁由')) s = s.replace(oldAccept, newAccept);

// ── 2. accept 处理器里原来自己取 myId 的行去掉(现在提前取了) ──
s = s.replace(`      // 我是庄家(邀约发出方):创建会话、筹码账本与引擎,开局。
      const startChips = this.opts.cfg.startChips;
      const myId = this.myBotId();
      const engine = this.newRemoteEngine(target.game, startChips);`, `      // 我是庄家(邀约发出方):创建会话、筹码账本与引擎,开局。
      const startChips = this.opts.cfg.startChips;
      const engine = this.newRemoteEngine(target.game, startChips);`);

// ── 3. case 'start' 防御:已有会话时忽略重复 start(保持仲裁结果) ──
s = s.replace(`      case 'start': {
        if (!session || session.peer !== peer) return;`, `      case 'start': {
        if (session) return; // 已有会话(含仲裁产生的庄家会话):忽略重复/冲突的 start
        void session;`);

writeFileSync(p, s);
console.log('arbitration done');
