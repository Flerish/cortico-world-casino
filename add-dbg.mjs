import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('../src/world.ts', import.meta.url);
let s = readFileSync(p, 'utf8');
const anchor = '    // —— 意向层(不受会话状态限制,但会话进行中忽略新邀约) ——';
const dbg = "    console.log('[DBG]', msg.action, peer, JSON.stringify(msg.kv), session ? 'session:' + session.role : 'no-session');\n";
if (!s.includes('[DBG]')) s = s.replace(anchor, dbg + anchor);
writeFileSync(p, s);
console.log('dbg added');
