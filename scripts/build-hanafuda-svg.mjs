// 从主人的花札牌面 HTML 提取 SVG defs,生成 src/webui/hanafuda-cards.ts(面板内联资产)。
// 用法:node scripts/build-hanafuda-svg.mjs [源HTML路径]
// 源:E:\ai\coo\花札牌面-SVG全套48张.html(主人三轮迭代定稿,勿手改产物)。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] ?? 'E:/ai/coo/花札牌面-SVG全套48张.html';
const html = readFileSync(src, 'utf8');

const defsMatch = html.match(/<svg width="0" height="0"[^>]*>([\s\S]*?)<\/svg>/);
if (!defsMatch) throw new Error('SVG defs block not found');
const defs = defsMatch[1].trim();

// cardSVG 的正文有模板嵌套,直接从源 HTML 原样抽取并做 TS 适配,避免手抄出错。
const fnMatch = html.match(/function cardSVG[\s\S]*?\n}/);
if (!fnMatch) throw new Error('cardSVG not found');
let fn = fnMatch[0]
  .replace('function cardSVG(c,mo){', 'function cardSvg(c: CardData, mo: MonthData): string {')
  .replace(/<svg class="card" viewBox="0 0 120 200">/, '<svg viewBox="0 0 120 200">')
  .replace(/class="card"/g, '');
// clip-path 里可能的笔误防御
fn = fn.replace('url(#inner))', 'url(#inner)');
// 外框黑边自带圆角:面板悬停 tooltip 需要容器 overflow visible,圆角改由 SVG 自绘。
fn = fn.replace('<rect width="120" height="200" fill="#12100c"/>', '<rect width="120" height="200" rx="6" fill="#12100c"/>');
// 光牌提质:金内框 + 右上"光"徽(五张光牌统一标识,役种核心一眼可辨)。
fn = fn.replace(`  if(c.e&&c.e!=='moon') s+=\`<use href="#e-\${c.e}"/>\`;`, `  if(c.e&&c.e!=='moon') s+=\`<use href="#e-\${c.e}"/>\`;
  if(c.k==='光') s+=\`<use href="#g-light"/>\`;`);

const ts = `/** 花札 48 张 SVG 牌面资产(由 scripts/build-hanafuda-svg.mjs 从主人定稿的
 *  花札牌面-SVG全套48张.html 生成;勿手改产物,改源头后重跑脚本)。
 *  viewBox 120x200;DEFS 每个面板根注入一次,hanafudaCardSvg 按牌渲染。 */

export const HANAFUDA_SVG_DEFS = \`<svg width="0" height="0" style="position:absolute">${defs}</svg>\`;

interface MonthData { m: number; n: string; p: string; bg: string; }
interface CardData { m: number; k: '光' | '种' | '短' | '粕'; e?: string; r?: string; t?: string; dark?: number; dual?: number; }

const MONTHS: MonthData[] = [
  { m: 1, n: '松', p: 'pine', bg: '#f7ecd2' },
  { m: 2, n: '梅', p: 'plum', bg: '#f7e8e4' },
  { m: 3, n: '樱', p: 'cherry', bg: '#f6e9ee' },
  { m: 4, n: '藤', p: 'wisteria', bg: '#eee9f2' },
  { m: 5, n: '菖蒲', p: 'iris', bg: '#e6ecdc' },
  { m: 6, n: '牡丹', p: 'peony', bg: '#f3ead6' },
  { m: 7, n: '萩', p: 'hagi', bg: '#f0ecdc' },
  { m: 8, n: '芒', p: 'susuki', bg: '#e9e6d2' },
  { m: 9, n: '菊', p: 'kiku', bg: '#eef0dc' },
  { m: 10, n: '红叶', p: 'momiji', bg: '#f5e8d4' },
  { m: 11, n: '柳', p: 'yanagi', bg: '#e4ecdc' },
  { m: 12, n: '桐', p: 'kiri', bg: '#eee9f0' },
];

const CARDS: CardData[] = [
  { m: 1, k: '光', e: 'crane' },
  { m: 1, k: '短', r: 'aka', t: 'あかよろし' },
  { m: 1, k: '粕' }, { m: 1, k: '粕' },
  { m: 2, k: '种', e: 'warbler' },
  { m: 2, k: '短', r: 'aka', t: 'あかよろし' },
  { m: 2, k: '粕' }, { m: 2, k: '粕' },
  { m: 3, k: '光', e: 'curtain' },
  { m: 3, k: '短', r: 'aka', t: 'みよしのの' },
  { m: 3, k: '粕' }, { m: 3, k: '粕' },
  { m: 4, k: '种', e: 'cuckoo' },
  { m: 4, k: '短', r: 'plain' },
  { m: 4, k: '粕' }, { m: 4, k: '粕' },
  { m: 5, k: '种', e: 'bridge' },
  { m: 5, k: '短', r: 'plain' },
  { m: 5, k: '粕' }, { m: 5, k: '粕' },
  { m: 6, k: '种', e: 'butterfly' },
  { m: 6, k: '短', r: 'ao' },
  { m: 6, k: '粕' }, { m: 6, k: '粕' },
  { m: 7, k: '种', e: 'boar' },
  { m: 7, k: '短', r: 'plain' },
  { m: 7, k: '粕' }, { m: 7, k: '粕' },
  { m: 8, k: '光', e: 'moon', dark: 1 },
  { m: 8, k: '种', e: 'geese', dark: 1 },
  { m: 8, k: '粕', dark: 1 }, { m: 8, k: '粕', dark: 1 },
  { m: 9, k: '种', e: 'cup', dual: 1 },
  { m: 9, k: '短', r: 'ao' },
  { m: 9, k: '粕' }, { m: 9, k: '粕' },
  { m: 10, k: '种', e: 'deer' },
  { m: 10, k: '短', r: 'ao' },
  { m: 10, k: '粕' }, { m: 10, k: '粕' },
  { m: 11, k: '光', e: 'rain', dark: 2 },
  { m: 11, k: '种', e: 'swallow' },
  { m: 11, k: '短', r: 'plain' },
  { m: 11, k: '粕' },
  { m: 12, k: '光', e: 'phoenix' },
  { m: 12, k: '粕' }, { m: 12, k: '粕' }, { m: 12, k: '粕' },
];

/** 类别 → 数据表 k 值;suit 编码沿用 cards.ts(0♠光 / 1♥种 / 2♣粕 / 3♦短册)。 */
const KIND_OF_SUIT = ['光', '种', '粕', '短'];

${fn}

/** 渲染一张花札牌面(rank = 月 1~12,suit = 类别编码,id = 同月同类的第几张,默认 0)。
 *  返回完整 <svg> 字符串,由调用方控制显示尺寸;DEFS 需已在文档中。 */
export function hanafudaCardSvg(rank: number, suit: number, id = 0): string {
  const mo = MONTHS[rank - 1];
  if (!mo) throw new Error('bad month ' + rank);
  const kind = KIND_OF_SUIT[suit] as CardData['k'];
  const c = CARDS.filter((d) => d.m === rank && d.k === kind)[id];
  if (!c) throw new Error('no card ' + rank + '/' + kind + '#' + id);
  return cardSvg(c, mo);
}

/** 48 张牌的中文名(月 + 组合),回执与事件文案用;粕/短册无专名,落月名+类名。 */
const HANAFUDA_KIND_KASU = 2;
const HANAFUDA_KIND_TAN = 3;
const NAMES: Record<string, string> = {
  '1-0': '松上鹤', '3-0': '樱上幕', '8-0': '芒上月', '11-0': '柳间雨', '12-0': '桐上凤凰',
  '2-1': '梅上莺', '4-1': '藤上杜鹃', '5-1': '菖蒲八桥', '6-1': '牡丹蝶', '7-1': '萩上猪', '8-1': '芒上雁', '9-1': '菊上杯', '10-1': '红叶鹿', '11-1': '柳上燕',
  '1-3': '松赤短', '2-3': '梅赤短', '3-3': '樱赤短', '4-3': '藤短册', '5-3': '菖蒲短册', '6-3': '牡丹青短', '7-3': '萩短册', '9-3': '菊青短', '10-3': '红叶青短', '11-3': '柳短册',
};
export function hanafudaCardName(rank: number, suit: number): string {
  return NAMES[rank + '-' + suit] ?? (MONTHS[rank - 1]?.n ?? '') + (suit === HANAFUDA_KIND_KASU ? '粕' : suit === HANAFUDA_KIND_TAN ? '短册' : '');
}

/** 牌的悬停标签:名字 + 类别 + 月份(菊上杯标注兼粕);给不熟花札的玩家一目了然。 */
export function hanafudaCardLabel(rank: number, suit: number): string {
  const kind = ['光', '种', '粕', '短册'][suit] ?? '';
  const dual = rank === 9 && suit === 1 ? '(兼粕)' : '';
  const month = MONTHS[rank - 1]?.n ?? '';
  return \`\${hanafudaCardName(rank, suit)} · \${kind}\${dual}(\${month}月)\`;
}
`;

const outPath = join(here, '..', 'src', 'webui', 'hanafuda-cards.ts');
// 光牌提质层:金内框 + 右上"光"徽(卡片组装时对 c.k==='光' 追加 use)。
const GOLD_LIGHT = `
  <symbol id="g-light" viewBox="0 0 120 200">
    <rect x="7" y="7" width="106" height="186" fill="none" stroke="#e8c766" stroke-width="1.6" rx="4"/>
    <rect x="10.5" y="10.5" width="99" height="179" fill="none" stroke="#e8c766" stroke-width="0.8" opacity=".65" rx="3"/>
    <circle cx="103" cy="16" r="9" fill="#e8c766" stroke="#8a6a20" stroke-width="1"/>
    <text x="103" y="19.6" font-size="10" fill="#3a2a10" text-anchor="middle" font-family="serif" font-weight="700">光</text>
  </symbol>`;
const tsWithGold = ts.replace('export const HANAFUDA_SVG_DEFS = `<svg width="0" height="0" style="position:absolute">', `export const HANAFUDA_SVG_DEFS = \`<svg width="0" height="0" style="position:absolute">${GOLD_LIGHT}`);
writeFileSync(outPath, tsWithGold, 'utf8');
console.log('wrote', outPath, tsWithGold.length, 'chars');
