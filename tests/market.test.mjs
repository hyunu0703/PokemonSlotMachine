import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { TYPES, TYPE_EFFECTIVENESS, TYPE_COUNTERS, typeEffectiveness, typeMultiplier, validateData } from '../js/data.js';
import { readSave, writeSave, encodeSave, decodeSave, SAVE_KEY } from '../js/storage.js';
import { SLOT_CONFIG, selectCandidates, createResult, Slot } from '../js/slot.js';
import { MARKET_CONFIG as C, NEWS_CONFIG, createMarket, validMarket, advanceMarket, marketTick, generateNews, newsModifiers, shockChange, changePercent, priceHistory, marketReturn, currentTradeAmount, currentTradeVolume, acquire, spend, sell, assets } from '../js/market.js';

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
save.version = 4;

test('V1 migration, unique discovery and initial TC', () => {
  assert.deepEqual(save.collectedIds, [1, 150]); assert.equal(save.quantity[1], 1); assert.equal(save.tc, C.initialTC); assert.equal(save.soundEnabled, false);
});
test('official 18-type effectiveness table', () => {
  assert.deepEqual(Object.keys(TYPE_EFFECTIVENESS).sort(), Object.keys(TYPES).sort());
  for (const row of Object.values(TYPE_EFFECTIVENESS)) {
    for (const [type, value] of Object.entries(row)) {
      assert.ok(Object.hasOwn(TYPES, type)); assert.ok([0, .5, 2].includes(value));
    }
  }
  assert.equal(typeEffectiveness('water', 'fire'), 2);
  assert.equal(typeEffectiveness('electric', 'ground'), 0);
  assert.equal(typeEffectiveness('normal', 'ghost'), 0);
  assert.equal(typeEffectiveness('fairy', 'dragon'), 2);
  assert.equal(typeEffectiveness('fire', 'water'), .5);
  assert.equal(typeEffectiveness('water', 'electric'), 1);
  assert.equal(typeMultiplier('ground', ['fire', 'flying']), 0);
  assert.equal(typeMultiplier('rock', ['fire', 'flying']), 4);
  assert.deepEqual(TYPE_COUNTERS.fire, ['water', 'ground', 'rock']);
  assert.deepEqual(TYPE_COUNTERS.dragon, ['ice', 'dragon', 'fairy']);
  for (const [defend, attacks] of Object.entries(TYPE_COUNTERS)) for (const attack of attacks) assert.equal(typeEffectiveness(attack, defend), 2);
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
test('every 10-minute tick creates one story news and duplicate time is suppressed', () => {
  const m = createMarket(data.records, now, random);
  for (let i = 1; i <= 8; i++) marketTick(m, data.records, random);
  assert.equal(m.newsHistory.length, C.newsLimit);
  assert.equal(m.activeNews.length, 1);
  assert.equal(m.newsHistory[0].time, now + 8 * C.tickMs);
  const snapshot = JSON.stringify(m.newsHistory);
  generateNews(m, data.records, m.newsHistory[0].time, random);
  assert.equal(JSON.stringify(m.newsHistory), snapshot);
});
test('story transition follows 40% continue, 35% counter, 25% unrelated', () => {
  const make = () => { const m = createMarket(data.records, now, () => .5); m.newsStory = { type: 'fire', previousType: null, counterType: null, pokemonId: null, streak: 2 }; return m; };
  const withRolls = values => () => values.shift() ?? .5;
  let m = make(), n = generateNews(m, data.records, now + C.tickMs, withRolls([.3, .1, 0, .5, .5]));
  assert.equal(n.transition, 'continue'); assert.equal(n.type, 'fire'); assert.equal(m.newsStory.streak, 3);
  m = make(); n = generateNews(m, data.records, now + C.tickMs, withRolls([.3, .5, 0, .5, .5]));
  assert.equal(n.transition, 'counter'); assert.ok(TYPE_COUNTERS.fire.includes(n.type)); assert.equal(n.opposedType, 'fire');
  m = make(); n = generateNews(m, data.records, now + C.tickMs, withRolls([.3, .9, 0, .5, .5]));
  assert.equal(n.transition, 'fresh'); assert.notEqual(n.type, 'fire'); assert.ok(!TYPE_COUNTERS.fire.includes(n.type));
  assert.deepEqual(NEWS_CONFIG.story, { continue: .4, counter: .35, fresh: .25 });
});
test('rarity, type and named-card news produce strong one-tick modifiers', () => {
  let mods = newsModifiers([{ target: 'normal', impact: .1, secondaryImpact: .02 }]);
  assert.equal(mods.normal.range, .1); assert.equal(mods.normal.bias, .1 * NEWS_CONFIG.rarityBias);
  assert.equal(mods.legendary.range, .02); assert.equal(mods.legendary.bias, -.02 * NEWS_CONFIG.rarityBias);
  mods = newsModifiers([{ target: 'type', type: 'fire', opposedType: 'water', impact: .2, secondaryImpact: .1 }]);
  assert.equal(mods['type-fire'].range, .2); assert.equal(mods['type-fire'].bias, .2 * NEWS_CONFIG.typeBias);
  assert.equal(mods['type-water'].range, .1); assert.equal(mods['type-water'].bias, -.1 * NEWS_CONFIG.typeBias);
  mods = newsModifiers([{ target: 'card', cardId: 6, type: 'fire', opposedType: null, impact: .5, secondaryImpact: .05 }]);
  assert.equal(mods['card-6'].range, .5); assert.equal(mods['card-6'].bias, .5 * NEWS_CONFIG.cardBias); assert.equal(mods['type-fire'].range, .05);
});
test('specific Pokemon news is selected from the current story type', () => {
  const m = createMarket(data.records, now, () => .5);
  m.newsStory = { type: 'fire', previousType: null, counterType: null, pokemonId: null, streak: 1 };
  const rolls = [.9, .1, 0, 0, .5, .5];
  const n = generateNews(m, data.records, now + C.tickMs, () => rolls.shift() ?? .5);
  assert.equal(n.target, 'card'); assert.equal(n.type, 'fire');
  assert.ok(data.byId.get(n.cardId).types.includes('fire'));
});
test('old news schema migrates without resetting card prices or histories', () => {
  const m = createMarket(data.records, now, random), before = m.cards[1].currentPrice;
  delete m.newsStory; m.newsSlots = ['old'];
  m.activeNews = [{ id: 'old', target: 'all', direction: 1, strength: 1, duration: 6, remaining: 6, time: now, title: 'old' }];
  m.newsHistory = [...m.activeNews];
  const loaded = readSave(data.ids, store({ ...save, version: 4, market: m })).market;
  assert.equal(loaded.cards[1].currentPrice, before); assert.equal(loaded.newsSlots, undefined);
  assert.deepEqual(loaded.activeNews, []); assert.deepEqual(loaded.newsHistory, []); assert.ok(validMarket(loaded, data.records));
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
  assert.ok(Object.values(m.cards).every(c => c.priceHistory.count === 144 && c.currentPrice > 0));
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
test('market regimes and momentum still influence prices with the new news system', () => {
  const outcomes = [];
  for (const sign of [-1, 1]) {
    const m = createMarket(data.records, now, () => .5), p = data.records[0], c = m.cards[p.id];
    m.overall = { state: sign > 0 ? 'BULL' : 'BEAR', remaining: 20 };
    m.sectors[p.grade] = { state: 'NORMAL', remaining: 20 };
    c.trendRemaining = 10; c.trend = 0; c.momentum = sign * .05;
    const before = c.currentPrice; marketTick(m, [p], () => .5);
    assert.equal(m.overall.remaining, 19); outcomes.push(c.currentPrice - before);
  }
  assert.ok(outcomes[0] < 0 && outcomes[1] > 0);
});


const small = [data.records[0]];
test('145th daily and 169th hourly samples overwrite oldest; charts and statistics stay exact', () => {
  const start = 3600000, m = createMarket(small, start, random), c = m.cards[1];
  const samples = [c.currentPrice], hourly = [];
  const dailyValues = c.priceHistory.values, hourlyValues = c.hourlyHistory.values;
  for (let i = 1; i <= 169 * 6; i++) {
    marketTick(m, small, random); samples.push(c.currentPrice);
    if (i % 6 === 0) hourly.push(c.currentPrice);
    assert.equal(c.priceHistory.values, dailyValues); assert.equal(c.hourlyHistory.values, hourlyValues);
    assert.equal(c.priceHistory.count, Math.min(i, 144));
    assert.equal(c.hourlyHistory.count, Math.min(Math.floor(i / 6), 168));
    if ([144, 145, 1008, 1014].includes(i)) {
      assert.deepEqual(priceHistory(c, m.lastMarketUpdate).values, samples.slice(-145));
      assert.deepEqual(priceHistory(c, m.lastMarketUpdate, 'ALL').values, hourly.slice(-168));
      assert.equal(changePercent(c, 144), (c.currentPrice / samples.at(-145) - 1) * 100);
    }
  }
  assert.equal(c.highestPrice, Math.max(...samples)); assert.equal(c.lowestPrice, Math.min(...samples));
  assert.equal(c.sampleCount, samples.length);
  assert.ok(Math.abs(c.averagePrice - samples.reduce((a,b) => a+b,0) / samples.length) < 1e-6);
  for (const [period, count] of [['1H',7], ['6H',37], ['24H',145]]) {
    const chart = priceHistory(c,m.lastMarketUpdate,period);
    assert.deepEqual(chart.values,samples.slice(-count)); assert.equal(chart.end-chart.start,(count-1)*C.tickMs);
  }
});
test('7/30/365-day offline catchup stays bounded, reload continues identically', () => {
  const m = createMarket(small, now, () => .5);
  for (const days of [7,30,365]) {
    let result;
    do { result = advanceMarket(m,small,now+days*86400000,() => .5); } while (result.remaining);
    assert.ok(validMarket(m,small));
    assert.equal(m.cards[1].priceHistory.values.length,144); assert.equal(m.cards[1].hourlyHistory.values.length,168);
    assert.equal(m.cards[1].sampleCount,days*144+1);
  }
  const reloaded = readSave(data.ids,store({...save,market:m})).market;
  assert.deepEqual(reloaded,m);
  marketTick(reloaded,small,() => .5); marketTick(m,small,() => .5); assert.deepEqual(reloaded,m);
});
test('V2 migration trims oversized history, samples hours, preserves economy and statistics', () => {
  for (const length of [1,145,2000]) {
    const m = createMarket(small,now,random), c = m.cards[1];
    const values = Array.from({length},(_,i) => i+1);
    c.priceHistory = values; c.currentPrice = values.at(-1);
    delete c.hourlyHistory; delete c.highestPrice; delete c.lowestPrice; delete c.averagePrice; delete c.sampleCount;
    const migrated = readSave(data.ids,store({...save,version:2,market:m,tc:12345}));
    const card = migrated.market.cards[1];
    assert.equal(migrated.version,3); assert.equal(migrated.tc,12345); assert.deepEqual(migrated.quantity,save.quantity);
    assert.ok(validMarket(migrated.market,small));
    assert.deepEqual(priceHistory(card,now).values,values.slice(-145));
    const expected = values.filter((_,i) => {
      const t = now-(length-1-i)*C.tickMs;
      return t > now-7*86400000 && Math.floor(t/3600000)>Math.floor((t-C.tickMs)/3600000);
    });
    assert.deepEqual(card.hourlyHistory.count ? priceHistory(card,now,'ALL').values : [],expected);
    assert.equal(card.highestPrice,length); assert.equal(card.lowestPrice,1); assert.equal(card.averagePrice,(length+1)/2); assert.equal(card.sampleCount,length);
  }
});
test('hour boundary survives fractional timestamp and reload; corrupt buffers are rejected', () => {
  const start = 55*60000+1234, m = createMarket(small,start,random);
  marketTick(m,small,random);
  assert.equal(m.cards[1].hourlyHistory.count,1);
  assert.equal(priceHistory(m.cards[1],m.lastMarketUpdate,'ALL').end,start+C.tickMs);
  const copy = JSON.parse(JSON.stringify(m));
  advanceMarket(copy,small,start+6*C.tickMs,random,6); assert.equal(copy.cards[1].hourlyHistory.count,1);
  marketTick(copy,small,random); assert.equal(copy.cards[1].hourlyHistory.count,2);
  for (const damage of [c => c.priceHistory.head=-1,c => c.priceHistory.count=145,c => c.hourlyHistory.values.push(0),c => c.averagePrice=NaN]) {
    const broken=JSON.parse(JSON.stringify(m)); damage(broken.cards[1]); assert.equal(validMarket(broken,small),false);
  }
});
test('owned average follows weighted acquisitions, partial sale, full sale and reacquisition', () => {
  const wallet = { quantity: {}, averageAcquisitionPrice: {}, tc: 0, market: createMarket(small, now, random) }, found = new Set();
  const c = wallet.market.cards[1];
  c.currentPrice = 100; acquire(wallet, found, 1);
  c.currentPrice = 300; acquire(wallet, found, 1); assert.equal(wallet.averageAcquisitionPrice[1], 200);
  sell(wallet, 1); assert.equal(wallet.averageAcquisitionPrice[1], 200);
  c.currentPrice = 400; acquire(wallet, found, 1); assert.equal(wallet.averageAcquisitionPrice[1], 300);
  sell(wallet, 1, true); assert.equal(wallet.averageAcquisitionPrice[1], undefined);
  c.currentPrice = 250; acquire(wallet, found, 1); assert.equal(wallet.averageAcquisitionPrice[1], 250);
  const raw = { ...wallet, version: 3, collectedIds: [...found] };
  assert.deepEqual(readSave(data.ids, store(raw)).averageAcquisitionPrice, { 1: 250 });
  raw.averageAcquisitionPrice = { 1: -1, 2: 500 };
  assert.deepEqual(readSave(data.ids, store(raw)).averageAcquisitionPrice, {});
});
test('average save normalization accepts positive finite numbers and numeric strings only', () => {
  for (const [input, expected] of [[1200,1200],['1200',1200],[' 1200.5 ',1200.5],[1e15,1e15],[0,undefined],[-1,undefined],[NaN,undefined],[Infinity,undefined],['Infinity',undefined],['',undefined],['  ',undefined],['abc',undefined],[null,undefined],[undefined,undefined],[true,undefined],[[],undefined]]) {
    const loaded = readSave(data.ids, store({version:3,collectedIds:[1,2],quantity:{1:3,2:0},averageAcquisitionPrice:{1:input,2:1200}}));
    assert.equal(loaded.averageAcquisitionPrice[1],expected);
    assert.equal(loaded.averageAcquisitionPrice[2],undefined);
  }
});
test('fractional average stays unrounded through partial sale and last sale clears it', () => {
  const wallet={quantity:{1:2},averageAcquisitionPrice:{1:1100},tc:0,market:createMarket(small,now,random)};
  wallet.market.cards[1].currentPrice=900; acquire(wallet,new Set([1]),1);
  assert.equal(wallet.averageAcquisitionPrice[1],(1100*2+900)/3);
  const average=wallet.averageAcquisitionPrice[1];
  sell(wallet,1); assert.equal(wallet.averageAcquisitionPrice[1],average);
  sell(wallet,1); assert.equal(wallet.averageAcquisitionPrice[1],average);
  sell(wallet,1); assert.equal(wallet.averageAcquisitionPrice[1],undefined);
});
test('trade totals match exact tick prices through rollover and migration offset', () => {
  for (const oldTicks of [0,37,300]) {
    const m=createMarket(small,now,random);
    advanceMarket(m,small,now+oldTicks*C.tickMs,random,oldTicks,false);
    let c=m.cards[1],volumes=c.trade24h.volumes;const expected=[];
    for(let i=1;i<=450;i++) {
      marketTick(m,small,random);
      const t=c.trade24h;assert.equal(t.volumes,volumes);
      const volume=t.volumes[(m.trade24h.head+143)%144];expected.push({volume,amount:volume*c.currentPrice});
      if(expected.length>144)expected.shift();
      assert.equal(m.trade24h.count,Math.min(i,144));assert.equal(t.volumes.length,Math.min(i,144));
      assert.equal(t.volumeTotal,expected.reduce((sum,x)=>sum+x.volume,0));
      assert.equal(t.amountTotal,expected.reduce((sum,x)=>sum+x.amount,0));
      assert.deepEqual(Object.keys(t).sort(),['amountTotal','volumeTotal','volumes']);
      if(i===147){const loaded=readSave(data.ids,store({...save,market:m}));assert.deepEqual(loaded.market,m);Object.assign(m,loaded.market);c=m.cards[1];volumes=c.trade24h.volumes;}
    }
  }
});
test('trade amounts use finalized current tick price and trade noise is independent from price RNG', () => {
  const a=createMarket(small,now,()=>.5),b=structuredClone(a);
  for(const m of [a,b]) { const c=m.cards[1];m.overall.state=m.sectors.normal.state='NORMAL';c.currentPrice=c.fairPrice=1000;c.volatility=1e-10;c.trend=0;c.trendRemaining=18;c.momentum=0; }
  a.newsHistory=[{time:a.lastMarketUpdate+C.tickMs}];b.newsHistory=[{time:b.lastMarketUpdate+C.tickMs}];
  marketTick(a,small,()=>.2);marketTick(b,small,()=>.8);
  const av=a.cards[1].trade24h.volumes.at(-1),bv=b.cards[1].trade24h.volumes.at(-1);
  assert.equal(av,bv);
  assert.equal(a.cards[1].trade24h.amountTotal,av*a.cards[1].currentPrice);
  assert.equal(b.cards[1].trade24h.amountTotal,bv*b.cards[1].currentPrice);
});

test('type news makes its type dominate virtual trade activity', () => {
  const m=createMarket(data.records,now,()=>.5);
  marketTick(m,data.records,()=>.3);
  const news=m.activeNews[0];assert.equal(news.target,'type');
  const latest=(p)=>m.cards[p.id].trade24h.volumes[(m.trade24h.head+C.historyLimit-1)%C.historyLimit];
  const target=data.records.filter(p=>p.types.includes(news.type)).map(latest);
  const other=data.records.filter(p=>!p.types.includes(news.type)).map(latest);
  const average=a=>a.reduce((sum,n)=>sum+n,0)/a.length;
  assert.ok(average(target)>average(other)*5);
});

test('counter news keeps previous type active while the counter type joins the leaders', () => {
  const m=createMarket(data.records,now,()=>.5);
  m.newsStory={type:'fire',previousType:null,counterType:null,pokemonId:null,streak:3};
  const rolls=[.3,.5,.4,.5,.5];let i=0;const r=()=>rolls[i++]??.5;
  marketTick(m,data.records,r);
  const news=m.activeNews[0];assert.equal(news.target,'type');assert.equal(news.transition,'counter');assert.equal(news.opposedType,'fire');
  const latest=(p)=>m.cards[p.id].trade24h.volumes[(m.trade24h.head+C.historyLimit-1)%C.historyLimit];
  const average=a=>a.reduce((sum,n)=>sum+n,0)/a.length;
  const current=average(data.records.filter(p=>p.types.includes(news.type)).map(latest));
  const previous=average(data.records.filter(p=>p.types.includes(news.opposedType)).map(latest));
  const unrelated=average(data.records.filter(p=>!p.types.includes(news.type)&&!p.types.includes(news.opposedType)).map(latest));
  assert.ok(current>unrelated*4);assert.ok(previous>unrelated*2);
});

test('named-Pokemon news guarantees first place in current Tick trade volume and amount', () => {
  const m=createMarket(data.records,now,()=>.5);
  for(let i=0;i<20;i++)marketTick(m,data.records,()=>.3);
  const rolls=[.9,.9,.9,.5,.5];let i=0;const r=()=>rolls[i++]??.5;
  marketTick(m,data.records,r);
  const news=m.activeNews[0];assert.equal(news.target,'card');
  const named=m.cards[news.cardId];
  assert.equal(currentTradeVolume(m,named),Math.max(...Object.values(m.cards).map(c=>currentTradeVolume(m,c))));
  assert.equal(currentTradeAmount(m,named),Math.max(...Object.values(m.cards).map(c=>currentTradeAmount(m,c))));
});
test('market return uses oldest available price in O(1), including wrapped history', () => {
  const m=createMarket(small,now,random),c=m.cards[1];assert.equal(marketReturn(c),0);
  const quotes=[c.currentPrice];
  for(let i=1;i<=300;i++){marketTick(m,small,random);quotes.push(c.currentPrice);const base=quotes[Math.max(0,quotes.length-145)];assert.equal(marketReturn(c),(c.currentPrice-base)/base*100);}
  for(const value of [0,undefined,NaN,Infinity]){const bad=structuredClone(c);bad.priceHistory.values[bad.priceHistory.head]=value;assert.equal(marketReturn(bad),0);}
});
test('migration catchup is price-only; next saved version accumulates trade history', () => {
  const original=createMarket(small,now,random);delete original.trade24h;delete original.cards[1].trade24h;
  const loaded=readSave(data.ids,store({...save,version:3,market:original}));assert.equal(loaded.version,3);
  advanceMarket(loaded.market,small,now+300*C.tickMs,random,300,false);
  assert.deepEqual(loaded.market.trade24h,{head:0,count:0});assert.deepEqual(loaded.market.cards[1].trade24h,{volumes:[],volumeTotal:0,amountTotal:0});
  loaded.version=4;const reloaded=readSave(data.ids,store(loaded));advanceMarket(reloaded.market,small,now+600*C.tickMs,random,300);
  assert.equal(reloaded.market.trade24h.count,144);assert.ok(reloaded.market.cards[1].trade24h.amountTotal>0);
});
test('trade storage stays bounded after 7/30/365 days', () => {
  const m=createMarket(small,now,random);
  for(const days of [7,30,365]) {
    advanceMarket(m,small,now+days*86400000,random,days*144);
    assert.equal(m.trade24h.count,144);assert.equal(m.cards[1].trade24h.volumes.length,144);
    assert.ok(validMarket(m,small));
  }
});
test('synchronous compression is lossless for Unicode, repetition, dictionary saturation and random input', () => {
  let state=314159;const next=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const texts=['','{}','a'.repeat(100000),JSON.stringify({text:'포켓몬 🎉 \u0000',number:1033.3333333333333}),
    JSON.stringify(Array.from({length:100000},()=>Math.floor(next()*1e12)))];
  for(const text of texts)assert.equal(decodeSave(encodeSave(text)),text);
  for(let i=0;i<100;i++){const text=JSON.stringify(Array.from({length:i*7},()=>String.fromCharCode(Math.floor(next()*65536))));assert.equal(decodeSave(encodeSave(text)),text);}
});
test('damaged compression is rejected and failed writes preserve old data', () => {
  const encoded=encodeSave(JSON.stringify({...save,market:createMarket(small,now,random)}));
  const start=encoded.indexOf(':',encoded.indexOf(':',5)+1)+1;
  for(const bad of [encoded.slice(0,-1),encoded+'x',encoded.slice(0,start)+'\uffff'+encoded.slice(start+1),encoded.replace(/^PSZ1:/,'PSZ2:'),encoded.replace(/^PSZ1:[^:]+:/,'PSZ1:999999999999999:'),encoded.replace(/^PSZ1:(\d+):[0-9a-f]+:/,'PSZ1:$1:0:')]){
    const storage={getItem:()=>bad,setItem:()=>assert.fail('corrupt input was overwritten')};
    assert.throws(()=>readSave(data.ids,storage),/원본 저장은 보존/);
  }
  let raw=encoded;assert.throws(()=>writeSave(save,{setItem(){throw Error('QuotaExceededError');}}));assert.equal(raw,encoded);
});
test('7/30/365-day complete saves compress below 4 MiB and reload identically', () => {
  let state=7654;const next=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const start=1700000000000,market=createMarket(data.records,start,next);
  const full={version:4,collectedIds:data.records.map(p=>p.id),quantity:Object.fromEntries(data.records.map(p=>[p.id,100])),
    averageAcquisitionPrice:Object.fromEntries(data.records.map(p=>[p.id,market.cards[p.id].currentPrice])),tc:500000,soundEnabled:true,musicEnabled:true,market};
  let raw;const storage={getItem:()=>raw,setItem:(key,value)=>{assert.equal(key,SAVE_KEY);raw=value;}};
  for(const days of [7,30,365]){
    advanceMarket(market,data.records,start+days*86400000,next,days*144);
    const json=JSON.stringify(full),before=2*(SAVE_KEY.length+json.length),time=performance.now();writeSave(full,storage);
    const after=2*(SAVE_KEY.length+raw.length),elapsed=performance.now()-time;
    assert.equal(decodeSave(raw),json);assert.deepEqual(readSave(data.ids,storage),full);assert.equal(JSON.stringify(full),json);
    assert.ok(after<4*1024*1024);console.log(days+' days: '+(before/1024/1024).toFixed(3)+' / '+(after/1024/1024).toFixed(3)+' MiB, reduction '+((1-after/before)*100).toFixed(1)+'%, encode '+elapsed.toFixed(0)+' ms');
  }
});
console.log(`${passed} test groups passed.`);
