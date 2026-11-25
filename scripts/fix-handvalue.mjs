import { readFileSync, writeFileSync } from 'node:fs';
let s = readFileSync(new URL('./src/remote-blackjack.ts', import.meta.url), 'utf8');
// handValue 返回 {total, soft, natural}:全部改用 .total,天然判定用 .natural
s = s.replace(/handValue\(([^)]+)\) > 21/g, 'handValue($1).total > 21');
s = s.replace(/handValue\(([^)]+)\) < 21/g, 'handValue($1).total < 21');
s = s.replace(/handValue\(([^)]+)\) === 21/g, 'handValue($1).total === 21');
s = s.replace('const player = handValue(h.playerCards);', 'const player = handValue(h.playerCards).total;');
s = s.replace('const dealer = handValue(h.dealerCards);', 'const dealer = handValue(h.dealerCards).total;');
s = s.replace('const playerNatural = h.playerCards.length === 2 && player === 21;', 'const playerNatural = h.playerCards.length === 2 && handValue(h.playerCards).natural;');
s = s.replace('const dealerNatural = h.dealerCards.length === 2 && dealer === 21;', 'const dealerNatural = h.dealerCards.length === 2 && handValue(h.dealerCards).natural;');
s = s.replace('playerTotal(): number { return this.hand ? handValue(this.hand.playerCards) : 0; }', 'playerTotal(): number { return this.hand ? handValue(this.hand.playerCards).total : 0; }');
s = s.replace('dealerUpTotal(): number { return this.hand ? handValue([this.hand.dealerCards[0]!]) : 0; }', 'dealerUpTotal(): number { return this.hand ? handValue([this.hand.dealerCards[0]!]).total : 0; }');
s = s.replace('dealerTotal(): number { return this.hand ? handValue(this.hand.dealerCards) : 0; }', 'dealerTotal(): number { return this.hand ? handValue(this.hand.dealerCards).total : 0; }');
s = s.replace('`total=${handValue(h.playerCards)}`', '`total=${handValue(h.playerCards).total}`');
s = s.replace('`dealerUp=${handValue([h.dealerCards[0]!])}`', '`dealerUp=${handValue([h.dealerCards[0]!]).total}`');
s = s.replace('(${handValue(h.playerCards)} 点)', '(${handValue(h.playerCards).total} 点)');
s = s.replace('(${handValue(h.dealerCards)} 点)', '(${handValue(h.dealerCards).total} 点)');
writeFileSync(new URL('./src/remote-blackjack.ts', import.meta.url), s);
console.log('handValue usages fixed');
