import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { validateData } from '../js/data.js';
import { readSave, SAVE_KEY } from '../js/storage.js';
import { SLOT_CONFIG, selectCandidates, createResult, Slot } from '../js/slot.js';
import { MARKET_CONFIG as C, createMarket, validMarket, advanceMarket, marketTick, generateNews, newsModifiers, shockChange, changePercent, acquire, spend, sell, assets } from '../js/market.js';

const data = validateData(JSON.parse(fs.readFileSync(new URL('../data/pokemon-data.json', import.meta.url))));
const store = value => ({ getItem: key => key === SAVE_KEY ? JSON.stringify(value) : null });
let seed = 123456;
const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS', name); }
const now = new Date(2026, 8, 17, 7, 55).getTime();
const save = readSave(data.ids, store({ version: 1, collectedIds: [1, 1, 150, -1, 2000], soundEnabled: false }));
const ids = new Set(save.collectedIds);
save.market = createMarket(data.records, now, random);

test('V1 migration, unique discovery and initial TC', () => {
  assert.deepEqual(save.collectedIds, [1, 150]); assert.equal(save.quantity[1], 1); assert.equal(save.tc, C.initialTC); assert.equal(save.soundEnabled, false);
});
test('1025 prices normalized to rarity averages', () => {
  assert.equal(Object.keys(save.market.cards).length, 1025);
  for (const grade of Object.keys(C.grades)) {
    const cards = Object.values(save.market.cards).filter(c => c.rarity === grade);
    assert.ok(Math.abs(cards.reduce((n, c) => n + c.startingPrice, 0) / cards.length - C.grades[grade].average) < 1);
    assert.equal(SLOT_CONFIG[grade].cost / SLOT_CONFIG[grade].winRate, C.grades[grade].average);
  }
});
test('insufficient TC and exact rarity costs', () => {
  for (const config of Object.values(SLOT_CONFIG)) {
    const wallet = { tc: config.cost - 1 }; assert.equal(spend(wallet, config.cost), false); assert.equal(wallet.tc, config.cost - 1);
    wallet.tc = config.cost; assert.equal(spend(wallet, config.cost), true); assert.equal(wallet.tc, 0);
  }
});
test('complete collection still uses full pool; duplicate increases quantity', () => {
  const pool = data.records.filter(p => p.grade === 'normal');
  assert.equal(Slot.prototype.remaining.call({ grade: 'normal', pools: { normal: pool }, ids: data.ids }).length, pool.length);
  const candidates = selectCandidates(pool, 10, () => 0);
  const result = createResult(candidates, true, () => 0); assert.equal(result[0].id, 1);
  acquire(save, ids, result[0].id); acquire(save, ids, result[0].id); assert.equal(save.quantity[1], 3); assert.equal(ids.size, 2);
  const miss = createResult(candidates, false, () => 0); assert.notEqual(miss[0].id, miss[2].id);
});
test('single/all sale, exact proceeds, discovery never removed', () => {
  const quote = save.market.cards[1].currentPrice, tc = save.tc;
  assert.equal(sell(save, 1), quote); assert.equal(save.quantity[1], 2);
  assert.equal(sell(save, 1, true), quote * 2); assert.equal(save.quantity[1], 0); assert.equal(save.tc, tc + quote * 3);
  assert.ok(ids.has(1)); assert.equal(sell(save, 1), 0);
  assert.equal(assets(save).total, save.tc + save.market.cards[150].currentPrice);
});
test('37 elapsed minutes = 3 ticks, remainder and reverse time retained', () => {
  assert.deepEqual(advanceMarket(save.market, data.records, now + 37 * 60000, random), { ticks: 3, remaining: 0 });
  assert.equal(save.market.lastMarketUpdate, now + 30 * 60000);
  const snapshot = JSON.stringify(save.market);
  assert.equal(advanceMarket(save.market, data.records, now, random).ticks, 0); assert.equal(JSON.stringify(save.market), snapshot);
  assert.equal(changePercent(save.market.cards[1], 144), null);
});
test('news slots, duplicate suppression, decay, concurrent cancellation', () => {
  const m = createMarket(data.records, now, random);
  const time = now + C.tickMs;
  generateNews(m, data.records, time, () => .1); assert.equal(m.activeNews.length, 1);
  generateNews(m, data.records, time, () => .1); assert.equal(m.activeNews.length, 1);
  const n = m.activeNews[0], before = newsModifiers([n]).all.bias;
  n.remaining--; assert.ok(Math.abs(newsModifiers([n]).all.bias) < Math.abs(before));
  assert.equal(newsModifiers([n, { ...n, direction: 1 }]).all.bias, 0);
  const prices = JSON.stringify(m.cards); generateNews(m, data.records, time, () => .1); assert.equal(JSON.stringify(m.cards), prices);
  m.newsSlots = []; m.activeNews = []; m.newsHistory = [];
  for (const hour of C.newsHours) generateNews(m, data.records, new Date(2026, 8, 17, hour).getTime(), random);
  assert.equal(m.newsSlots.length, 3);
  m.activeNews = [{ ...n, remaining: 1 }]; m.lastMarketUpdate = new Date(2026, 8, 17, 10).getTime();
  marketTick(m, data.records, random); assert.equal(m.activeNews.length, 0);
});
test('shock bounds and weighted extreme tail', () => {
  for (const grade of Object.keys(C.grades)) {
    let rare = 0;
    for (let i = 0; i < 20000; i++) {
      const up = shockChange(grade, true, random), down = shockChange(grade, false, random);
      assert.ok(up >= .1 && up <= C.grades[grade].surge.at(-1)[2]);
      assert.ok(down <= -.1 && down >= -C.grades[grade].crash[1]); if (up >= 3) rare++;
    }
    if (grade === 'normal') assert.ok(rare > 250 && rare < 550);
  }
  const values = [.9999, .999999]; assert.ok(shockChange('normal', true, () => values.shift()) > 4.999);
});
test('persistent regimes, fair value drift, positive prices, bounded history and save reload', () => {
  const m = createMarket(data.records, now, random);
  m.overall = { state: 'BULL', remaining: 30 };
  const start = performance.now();
  advanceMarket(m, data.records, now + 200 * C.tickMs, random, 200);
  console.log('200 ticks / 1025 cards:', (performance.now() - start).toFixed(0), 'ms');
  assert.ok(validMarket(m, data.records));
  assert.ok(Object.values(m.cards).every(c => c.priceHistory.length === 145 && c.currentPrice > 0));
  assert.notEqual(m.cards[1].fairPrice, m.cards[1].startingPrice);
  assert.notEqual(m.cards[1].fairPrice, m.cards[1].currentPrice);
  const raw = { ...save, collectedIds: [...ids], market: m };
  const serialized = JSON.stringify(raw); console.log('Save UTF-16 storage estimate:', (serialized.length * 2 / 1024 / 1024).toFixed(2), 'MiB');
  assert.ok(serialized.length * 2 < 5 * 1024 * 1024);
  assert.deepEqual(readSave(data.ids, store(raw)), raw);
  assert.equal(readSave(data.ids, store(raw)).quantity[1], 0);
});
test('restoration is optional and uses current fairPrice', () => {
  const m = createMarket(data.records, now, () => .5), p = data.records[0], c = m.cards[p.id];
  c.currentPrice = c.fairPrice * 2; c.trendRemaining = 10; c.trend = 0;
  m.overall = { state: 'NORMAL', remaining: 30 }; m.sectors[p.grade] = { state: 'NORMAL', remaining: 30 };
  const previous = c.currentPrice; marketTick(m, [p], () => .5); assert.equal(c.currentPrice, previous);
});
test('market/news/momentum alter shock direction; regime persists', () => {
  const outcomes = [];
  for (const sign of [-1, 1]) {
    const m = createMarket(data.records, now, () => .5), p = data.records[0], c = m.cards[p.id];
    m.lastMarketUpdate = new Date(2026, 8, 17, 10).getTime();
    m.overall = { state: sign > 0 ? 'BULL' : 'BEAR', remaining: 20 };
    m.sectors[p.grade] = { state: 'NORMAL', remaining: 20 };
    c.trendRemaining = 10; c.momentum = sign * .05;
    m.activeNews = [{ id: 'test', target: 'all', direction: sign, strength: 1, remaining: 6, duration: 6 }];
    const rolls = [.5, 0, .55, .1, .5];
    const before = c.currentPrice;
    marketTick(m, [p], () => rolls.shift() ?? .5);
    assert.equal(m.overall.remaining, 19);
    outcomes.push(c.currentPrice - before);
  }
  assert.ok(outcomes[0] < 0 && outcomes[1] > 0);
});
console.log(`${passed} test groups passed.`);
