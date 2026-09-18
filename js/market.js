import { GRADES, TYPES, TYPE_COUNTERS } from './data.js';

// Pure simulation/economy functions. All time and randomness can be supplied by tests.
export const MARKET_CONFIG = Object.freeze({
  tickMs: 600000, historyLimit: 144, hourlyHistoryLimit: 168, initialTC: 500000,
  stateMin: 6, stateMax: 30, newsLimit: 5, restorationGap: .3, restorationChance: .18,
  grades: {
    normal: { average: 2000, volatility: .035, shockChance: .006, crash: [.1, .8], surge: [[.7, .1, .5], [.2, .5, 1.5], [.08, 1.5, 3], [.02, 3, 5]] },
    legendary: { average: 125000, volatility: .015, shockChance: .004, crash: [.1, .3], surge: [[1, .1, .5]] },
    mythical: { average: 1500000, volatility: .008, shockChance: .003, crash: [.1, .2], surge: [[1, .1, .3]] },
  },
});
export const STATE_BIAS = { NORMAL: 0, BULL: .006, BEAR: -.006, SIDEWAYS: 0 };
export const NEWS_CONFIG = Object.freeze({
  scope: Object.freeze({ rarity: .2, type: .5, card: .3 }),
  story: Object.freeze({ continue: .4, counter: .35, fresh: .25 }),
  rarityImpact: Object.freeze([.03, .10]), rarityRotation: Object.freeze([.01, .03]),
  typeImpact: Object.freeze([.05, .20]), typeWeakness: Object.freeze([.03, .15]),
  cardImpact: Object.freeze([.10, .50]), cardTypeImpact: Object.freeze([.01, .05]),
  rarityBias: .04, typeBias: .06, cardBias: .12,
});
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const between = (a, b, random) => a + (b - a) * random();
const integer = (a, b, random) => Math.floor(between(a, b + 1, random));
const price = x => Math.round(clamp(x, 1, 1e12));
const weight = id => .65 + ((id * 137) % 701) / 1000;
const regime = random => ({ state: Object.keys(STATE_BIAS)[integer(0, 3, random)], remaining: integer(MARKET_CONFIG.stateMin, MARKET_CONFIG.stateMax, random) });

const hourMs = MARKET_CONFIG.tickMs * 6;
const buffer = () => ({ values: [], head: 0, count: 0 });
const tradeBuffer = () => ({ volumes: [], volumeTotal: 0, amountTotal: 0 });
function appendTrade(trade, index, volume, quote, oldQuote) {
  const oldVolume = trade.volumes[index] ?? 0;
  trade.volumeTotal += volume - oldVolume;
  trade.amountTotal = trade.amountTotal - oldQuote * oldVolume + quote * volume;
  trade.volumes[index] = volume;
}
function append(history, value, limit) {
  history.values[history.head] = value;
  history.head = (history.head + 1) % limit;
  history.count = Math.min(history.count + 1, limit);
}
function previous(history, offset) {
  return offset > 0 && offset <= history.count
    ? history.values[(history.head - offset + history.values.length) % history.values.length] : undefined;
}
function updateStats(card, value) {
  card.highestPrice = Math.max(card.highestPrice, value);
  card.lowestPrice = Math.min(card.lowestPrice, value);
  card.averagePrice += (value - card.averagePrice) / ++card.sampleCount;
}

export function migrateMarket(market) {
  if (!market?.cards || !Number.isFinite(market.lastMarketUpdate)) return market;
  market.trade24h = { head: 0, count: 0 };
  for (const c of Object.values(market.cards)) {
    if (c && typeof c === 'object') c.trade24h = tradeBuffer();
    if (!Array.isArray(c?.priceHistory) || !c.priceHistory.length
      || !c.priceHistory.every(n => Number.isFinite(n) && n >= 1 && n <= 1e12)) continue;
    const old = c.priceHistory;
    c.priceHistory = buffer(); c.hourlyHistory = buffer();
    c.highestPrice = c.lowestPrice = c.averagePrice = old[0]; c.sampleCount = 0;
    for (let i = 0; i < old.length; i++) {
      const value = old[i], time = market.lastMarketUpdate - (old.length - 1 - i) * MARKET_CONFIG.tickMs;
      updateStats(c, value);
      if (i < old.length - 1 && i >= old.length - 1 - MARKET_CONFIG.historyLimit) append(c.priceHistory, value, MARKET_CONFIG.historyLimit);
      if (time > market.lastMarketUpdate - 7 * 24 * hourMs
        && Math.floor(time / hourMs) > Math.floor((time - MARKET_CONFIG.tickMs) / hourMs)) append(c.hourlyHistory, value, MARKET_CONFIG.hourlyHistoryLimit);
    }
  }
  return market;
}

export function priceHistory(card, lastUpdate, period = '24H') {
  const hourly = period === 'ALL', history = hourly ? card.hourlyHistory : card.priceHistory;
  const count = hourly ? history.count : Math.min(history.count, { '1H': 6, '6H': 36, '24H': 144 }[period] ?? 144);
  const values = Array.from({ length: count }, (_, i) => previous(history, count - i));
  const step = hourly ? hourMs : MARKET_CONFIG.tickMs;
  const phase = lastUpdate % MARKET_CONFIG.tickMs;
  const end = hourly && count ? Math.floor((lastUpdate - phase) / hourMs) * hourMs + phase : lastUpdate;
  if (!hourly || !count) values.push(card.currentPrice);
  return { values, start: end - (values.length - 1) * step, end };
}

export function createMarket(records, now = Date.now(), random = Math.random) {
  const cards = {}, sectors = {};
  for (const [grade, config] of Object.entries(MARKET_CONFIG.grades)) {
    const pool = records.filter(p => p.grade === grade);
    const mean = pool.reduce((sum, p) => sum + weight(p.id), 0) / pool.length;
    sectors[grade] = regime(random);
    for (const p of pool) {
      const startingPrice = price(config.average * weight(p.id) / mean);
      cards[p.id] = { cardId: p.id, rarity: grade, startingPrice, fairPrice: startingPrice,
        currentPrice: startingPrice, volatility: config.volatility, trend: 0,
        trendStrength: 0, trendRemaining: 0, momentum: 0, trade24h: tradeBuffer(), priceHistory: buffer(), hourlyHistory: buffer(),
        highestPrice: startingPrice, lowestPrice: startingPrice, averagePrice: startingPrice, sampleCount: 1 };
    }
  }
  return { cards, trade24h: { head: 0, count: 0 }, overall: regime(random), sectors, lastMarketUpdate: now, activeNews: [], newsHistory: [],
    newsStory: { type: null, previousType: null, counterType: null, pokemonId: null, streak: 0 } };
}

export function validMarket(market, records) {
  const stateOK = s => s && Object.hasOwn(STATE_BIAS, s.state) && Number.isInteger(s.remaining) && s.remaining >= 0 && s.remaining <= MARKET_CONFIG.stateMax;
  const positive = n => Number.isFinite(n) && n >= 1 && n <= 1e12;
  const bufferOK = (h, limit) => h && Array.isArray(h.values) && Number.isInteger(h.count)
    && h.count >= 0 && h.count <= limit && h.values.length === h.count
    && Number.isInteger(h.head) && h.head >= 0 && h.head < limit
    && (h.count === limit || h.head === h.count) && h.values.every(positive);
  const typeOK = t => t === null || Object.hasOwn(TYPES, t);
  const newsOK = n => n && typeof n.id === 'string' && typeof n.title === 'string'
    && ['normal', 'legendary', 'mythical', 'type', 'card'].includes(n.target)
    && (n.target !== 'card' || records.some(p => p.id === n.cardId))
    && typeOK(n.type ?? null) && typeOK(n.opposedType ?? null)
    && ['rarity', 'continue', 'counter', 'fresh'].includes(n.transition)
    && Number.isFinite(n.impact) && n.impact > 0 && n.impact <= .5
    && Number.isFinite(n.secondaryImpact) && n.secondaryImpact >= 0 && n.secondaryImpact <= .15
    && Number.isFinite(n.time);
  const story = market?.newsStory;
  const storyOK = story && typeOK(story.type) && typeOK(story.previousType) && typeOK(story.counterType)
    && (story.pokemonId === null || records.some(p => p.id === story.pokemonId))
    && Number.isInteger(story.streak) && story.streak >= 0 && story.streak <= 1000000;
  return !!market && Number.isFinite(market.lastMarketUpdate) && market.lastMarketUpdate >= 0
    && Number.isInteger(market.trade24h?.head) && market.trade24h.head >= 0 && market.trade24h.head < MARKET_CONFIG.historyLimit
    && Number.isInteger(market.trade24h.count) && market.trade24h.count >= 0 && market.trade24h.count <= MARKET_CONFIG.historyLimit
    && (market.trade24h.count === MARKET_CONFIG.historyLimit || market.trade24h.head === market.trade24h.count)
    && stateOK(market.overall) && Object.keys(MARKET_CONFIG.grades).every(g => stateOK(market.sectors?.[g]))
    && storyOK
    && Array.isArray(market.activeNews) && market.activeNews.length <= 1 && market.activeNews.every(newsOK)
    && Array.isArray(market.newsHistory) && market.newsHistory.length <= MARKET_CONFIG.newsLimit && market.newsHistory.every(newsOK)
    && records.every(p => {
      const c = market.cards?.[p.id];
      return c && c.cardId === p.id && c.rarity === p.grade && [c.startingPrice, c.fairPrice, c.currentPrice].every(positive)
        && Number.isFinite(c.volatility) && c.volatility > 0 && c.volatility <= .1
        && [-1, 0, 1].includes(c.trend) && Number.isFinite(c.trendStrength) && c.trendStrength >= 0 && c.trendStrength <= .004
        && Number.isInteger(c.trendRemaining) && c.trendRemaining >= 0 && c.trendRemaining <= 18
        && Number.isFinite(c.momentum) && Math.abs(c.momentum) <= .08
        && bufferOK(c.priceHistory, MARKET_CONFIG.historyLimit) && bufferOK(c.hourlyHistory, MARKET_CONFIG.hourlyHistoryLimit)
        && Array.isArray(c.trade24h?.volumes) && c.trade24h.volumes.length === market.trade24h.count
        && c.trade24h.volumes.every(n => Number.isInteger(n) && n >= 1 && n <= 100)
        && Number.isInteger(c.trade24h.volumeTotal) && c.trade24h.volumeTotal === c.trade24h.volumes.reduce((sum, n) => sum + n, 0)
        && Number.isFinite(c.trade24h.amountTotal) && c.trade24h.amountTotal >= 0
        && c.priceHistory.count >= market.trade24h.count
        && [c.highestPrice, c.lowestPrice, c.averagePrice].every(positive)
        && c.lowestPrice <= c.averagePrice && c.averagePrice <= c.highestPrice
        && Number.isSafeInteger(c.sampleCount) && c.sampleCount > 0;
    });
}

const TYPE_KEYS = Object.keys(TYPES);
const GRADE_KEYS = Object.keys(MARKET_CONFIG.grades);
const choose = (items, random) => items[integer(0, items.length - 1, random)];
const typeLabel = type => `${TYPES[type][0]}타입`;

export function migrateNewsSystem(market) {
  if (!market?.cards) return market;
  const validStory = market.newsStory && (market.newsStory.type === null || Object.hasOwn(TYPES, market.newsStory.type));
  if (!validStory) {
    market.newsStory = { type: null, previousType: null, counterType: null, pokemonId: null, streak: 0 };
    market.activeNews = []; market.newsHistory = [];
  }
  delete market.newsSlots;
  return market;
}

function nextStory(story, random) {
  if (!story.type || !Object.hasOwn(TYPES, story.type)) {
    return { transition: 'fresh', type: choose(TYPE_KEYS, random), previousType: null };
  }
  const roll = random();
  if (roll < NEWS_CONFIG.story.continue) return { transition: 'continue', type: story.type, previousType: story.previousType };
  if (roll < NEWS_CONFIG.story.continue + NEWS_CONFIG.story.counter) {
    const counters = TYPE_COUNTERS[story.type];
    return { transition: 'counter', type: choose(counters, random), previousType: story.type };
  }
  const blocked = new Set([story.type, ...TYPE_COUNTERS[story.type]]);
  const unrelated = TYPE_KEYS.filter(type => !blocked.has(type));
  return { transition: 'fresh', type: choose(unrelated, random), previousType: story.type };
}

function storyTitle(news, card) {
  // Headline variety is derived from the news id so wording never consumes market RNG or changes prices.
  const pick = variants => {
    let hash = 0;
    for (let i = 0; i < news.id.length; i++) hash = (hash * 31 + news.id.charCodeAt(i)) >>> 0;
    return variants[hash % variants.length];
  };
  const type = news.type ? typeLabel(news.type) : '';
  const opposed = news.opposedType ? typeLabel(news.opposedType) : '';
  if (news.transition === 'rarity') {
    const grade = `${GRADES[news.target]} 포켓몬`;
    return pick([
      `${grade} 거래량 증가`, `${grade} 매수세 우세`, `${grade} 수요 증가`, `${grade} 시장 관심 확대`,
      `${grade} 집중 매집 포착`, `${grade} 희귀 매물 품귀`, `${grade} 가격 급등`, `${grade} 거래대금 증가`,
    ]);
  }
  if (news.target === 'card') {
    const name = card.nameKo;
    if (news.transition === 'counter') return pick([
      `${opposed} 견제 카드 ${name} 매수세 우세`, `${name} 대응 수요 증가`, `${name} 거래량 증가`, `${name} 집중 매집 포착`,
      `${name} 시장 관심 확대`, `${name} 희귀 매물 품귀`, `${opposed} 약세 속 ${name} 가격 급등`, `${name} 카운터 수요 증가`,
    ]);
    if (news.transition === 'continue') return pick([
      `${name} 거래량 증가`, `${name} 가격 급등`, `${name} 매수세 우세`, `${name} 수요 증가`,
      `${name} 시장 관심 확대`, `${name} 집중 매집 포착`, `${name} 희귀 매물 품귀`, `${type} 강세 속 ${name} 거래대금 증가`,
    ]);
    return pick([
      `${name} 신규 매수세 유입·거래량 증가`, `${name} 단기 가격 급등`, `${name} 시장 관심 확대`, `${name} 수요 증가`,
      `${name} 매수세 우세`, `${name} 집중 매집 포착`, `${name} 희귀 매물 품귀`, `${name} 거래대금 증가`,
    ]);
  }
  if (news.transition === 'counter') return pick([
    `${opposed} 견제 확산·${type} 매수세 우세`, `${type} 대응 수요 증가`, `${type} 거래량 증가`, `${opposed} 수요 감소·${type} 관심 확대`,
    `${type} 집중 매집 포착`, `${opposed} 약세 전환·${type} 시장 우세`, `${type} 관련 카드 품귀`, `${opposed} 가격 급락·${type} 수요 증가`,
  ]);
  if (news.transition === 'continue') return pick([
    `${type} 거래량 증가`, `${type} 매수세 우세`, `${type} 수요 증가`, `${type} 시장 영향력 확대`,
    `${type} 집중 매집 포착`, `${type} 인기 카드 품귀`, `${type} 단기 가격 급등`, `${type} 거래대금 증가`,
  ]);
  return pick([
    `${type} 신규 매수세 유입·거래량 증가`, `${type} 새로운 강세 흐름 포착`, `${type} 시장 관심 확대`, `${type} 수요 증가`,
    `${type} 단기 가격 급등`, `${type} 매수세 우세`, `${type} 관련 카드 품귀`, `${type} 거래대금 증가`,
  ]);
}

export function generateNews(market, records, time, random = Math.random) {
  if (market.newsHistory[0]?.time === time) return market.newsHistory[0];
  market.activeNews = [];
  const scopeRoll = random();
  let news, card = null;
  if (scopeRoll < NEWS_CONFIG.scope.rarity) {
    const target = choose(GRADE_KEYS, random);
    news = { id: `rarity-${target}-${time}`, target, cardId: null, type: null, opposedType: null, transition: 'rarity',
      impact: between(...NEWS_CONFIG.rarityImpact, random), secondaryImpact: between(...NEWS_CONFIG.rarityRotation, random), time };
  } else {
    const next = nextStory(market.newsStory, random);
    let target = scopeRoll < NEWS_CONFIG.scope.rarity + NEWS_CONFIG.scope.type ? 'type' : 'card';
    if (target === 'card') {
      const pool = records.filter(p => p.types.includes(next.type));
      if (pool.length) card = choose(pool, random); else target = 'type';
    }
    const opposedType = next.transition === 'counter' ? next.previousType
      : next.transition === 'continue' ? choose(TYPE_COUNTERS[next.type], random) : null;
    news = { id: `${target}-${card?.id ?? next.type}-${time}`, target, cardId: card?.id ?? null, type: next.type, opposedType,
      transition: next.transition, impact: between(...(target === 'card' ? NEWS_CONFIG.cardImpact : NEWS_CONFIG.typeImpact), random),
      secondaryImpact: between(...(target === 'card' ? NEWS_CONFIG.cardTypeImpact : NEWS_CONFIG.typeWeakness), random), time };
    market.newsStory = { type: next.type, previousType: next.previousType, counterType: opposedType, pokemonId: card?.id ?? null,
      streak: next.transition === 'continue' ? market.newsStory.streak + 1 : 1 };
  }
  news.title = storyTitle(news, card);
  market.activeNews.push(news); market.newsHistory.unshift({ ...news });
  market.newsHistory = market.newsHistory.slice(0, MARKET_CONFIG.newsLimit);
  return news;
}

// News creates a large one-tick swing range; a small directional bias makes the story target stronger without permanent price inflation.
export function newsModifiers(news) {
  const modifiers = {};
  const add = (key, range, direction, biasRate) => {
    const modifier = modifiers[key] ??= { bias: 0, range: 0, activity: 0 };
    modifier.bias += direction * range * biasRate;
    modifier.range += range;
    modifier.activity += Math.min(range * 2, 1);
  };
  for (const n of news) {
    if (GRADE_KEYS.includes(n.target)) {
      add(n.target, n.impact, 1, NEWS_CONFIG.rarityBias);
      for (const grade of GRADE_KEYS) if (grade !== n.target) add(grade, n.secondaryImpact, -1, NEWS_CONFIG.rarityBias);
      continue;
    }
    if (n.target === 'type') add(`type-${n.type}`, n.impact, 1, NEWS_CONFIG.typeBias);
    if (n.target === 'card') {
      add(`card-${n.cardId}`, n.impact, 1, NEWS_CONFIG.cardBias);
      add(`type-${n.type}`, n.secondaryImpact, 1, NEWS_CONFIG.typeBias);
    }
    if (n.opposedType) add(`type-${n.opposedType}`, n.secondaryImpact, -1, NEWS_CONFIG.typeBias);
  }
  return modifiers;
}

export function shockChange(grade, up, random = Math.random) {
  const config = MARKET_CONFIG.grades[grade];
  if (!up) return -between(...config.crash, random);
  let roll = random();
  for (const [probability, low, high] of config.surge) {
    if (roll < probability) return between(low, high, random);
    roll -= probability;
  }
  return config.surge.at(-1)[2];
}

export function marketTick(market, records, random = Math.random, recordTrades = true) {
  const time = market.lastMarketUpdate + MARKET_CONFIG.tickMs;
  market.activeNews = [];
  generateNews(market, records, time, random);
  for (const state of [market.overall, ...Object.values(market.sectors)]) {
    if (--state.remaining <= 0) Object.assign(state, regime(random));
  }
  const modifiers = newsModifiers(market.activeNews);
  for (const p of records) {
    const c = market.cards[p.id], config = MARKET_CONFIG.grades[p.grade];
    let newsBias = 0, newsRange = 0, activity = 0;
    for (const key of [p.grade, `card-${p.id}`, ...p.types.map(type => `type-${type}`)]) {
      newsBias += modifiers[key]?.bias ?? 0; newsRange += modifiers[key]?.range ?? 0; activity += modifiers[key]?.activity ?? 0;
    }
    if (--c.trendRemaining <= 0) {
      c.trend = integer(-1, 1, random); c.trendStrength = between(.0005, .004, random); c.trendRemaining = integer(4, 18, random);
    }
    const bias = STATE_BIAS[market.overall.state] + STATE_BIAS[market.sectors[p.grade].state] * .7 + newsBias;
    const momentum = c.momentum * (.18 + Math.min(activity, .5));
    const sideways = market.overall.state === 'SIDEWAYS' ? .65 : 1;
    const tickRandom = random();
    const randomDirection = -1 + 2 * tickRandom;
    let change = bias + c.trend * c.trendStrength + momentum + randomDirection * Math.min(newsRange, .65)
      + randomDirection * c.volatility * (1 + activity) * sideways;
    if (random() < config.shockChance * (1 + activity)) {
      const upChance = clamp(.5 + bias * 12 + momentum * 4, .08, .92);
      change = shockChange(p.grade, random() < upChance, random);
    } else {
      const gap = (c.currentPrice - c.fairPrice) / c.fairPrice;
      if (Math.abs(gap) > MARKET_CONFIG.restorationGap && random() < MARKET_CONFIG.restorationChance) {
        change += clamp((c.fairPrice / c.currentPrice - 1) * .06, -.08, .08);
      }
    }
    // Fair value slowly accepts sustained price discovery; it never snaps to startingPrice.
    c.fairPrice = clamp(c.fairPrice * (1 + bias * .03) + (c.currentPrice - c.fairPrice) * .002, 1, 1e12);
    const next = price(c.currentPrice * (1 + change));
    c.momentum = clamp(c.momentum * .65 + (next / c.currentPrice - 1) * .35, -.08, .08);
    // Price history excludes currentPrice: the outgoing trade is 143 ticks behind it.
    const oldQuote = recordTrades && market.trade24h.count === MARKET_CONFIG.historyLimit
      ? previous(c.priceHistory, MARKET_CONFIG.historyLimit - 1) : 0;
    append(c.priceHistory, c.currentPrice, MARKET_CONFIG.historyLimit);
    c.currentPrice = next;
    if (Math.floor(time / hourMs) > Math.floor(market.lastMarketUpdate / hourMs)) append(c.hourlyHistory, next, MARKET_CONFIG.hourlyHistoryLimit);
    updateStats(c, next);
    if (recordTrades) appendTrade(c.trade24h, market.trade24h.head, integer(1, 100, () => tickRandom), next, oldQuote);
  }
  if (recordTrades) {
    market.trade24h.head = (market.trade24h.head + 1) % MARKET_CONFIG.historyLimit;
    market.trade24h.count = Math.min(market.trade24h.count + 1, MARKET_CONFIG.historyLimit);
  }
  market.lastMarketUpdate = time;
}

export function advanceMarket(market, records, now = Date.now(), random = Math.random, maxTicks = 36, recordTrades = true) {
  const elapsed = Math.max(0, Math.floor((now - market.lastMarketUpdate) / MARKET_CONFIG.tickMs));
  const ticks = Math.min(elapsed, maxTicks);
  for (let i = 0; i < ticks; i++) marketTick(market, records, random, recordTrades);
  return { ticks, remaining: elapsed - ticks };
}

// Development-only helper: run the exact market Tick logic a fixed number of times.
export function advanceDebugTicks(market, records, count, random = Math.random, recordTrades = true) {
  if (!Number.isInteger(count) || count < 1 || count > 100) return 0;
  for (let i = 0; i < count; i++) marketTick(market, records, random, recordTrades);
  return count;
}

export function changePercent(card, ticks = 1) {
  const value = previous(card.priceHistory, ticks);
  return value === undefined ? null : (card.currentPrice / value - 1) * 100;
}
export function marketReturn(card) {
  const base = previous(card.priceHistory, card.priceHistory.count);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(card.currentPrice)) return 0;
  const result = (card.currentPrice - base) / base * 100;
  return Number.isFinite(result) ? result : 0;
}
export function assets(save) {
  const cards = Object.entries(save.quantity).reduce((sum, [id, count]) => sum + count * (save.market.cards[id]?.currentPrice ?? 0), 0);
  return { cards, tc: save.tc, total: save.tc + cards };
}
export function spend(save, cost) {
  if (!Number.isSafeInteger(cost) || cost <= 0 || save.tc < cost) return false;
  save.tc -= cost; return true;
}
export function acquire(save, ids, id) {
  const count = save.quantity[id] ?? 0, quote = save.market.cards[id].currentPrice;
  save.averageAcquisitionPrice ??= {};
  const average = count > 0 ? save.averageAcquisitionPrice[id] ?? quote : quote;
  save.averageAcquisitionPrice[id] = average + (quote - average) / (count + 1);
  ids.add(id); save.quantity[id] = count + 1;
}
export function sell(save, id, all = false) {
  const count = save.quantity[id] ?? 0;
  if (!count || !save.market.cards[id]) return 0;
  const quantity = all ? count : 1;
  const proceeds = save.market.cards[id].currentPrice * quantity;
  if (!Number.isSafeInteger(proceeds) || !Number.isSafeInteger(save.tc + proceeds)) return 0;
  save.quantity[id] -= quantity; save.tc += proceeds;
  if (!save.quantity[id] && save.averageAcquisitionPrice) delete save.averageAcquisitionPrice[id];
  return proceeds;
}
