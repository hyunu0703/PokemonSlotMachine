// Pure simulation/economy functions. All time and randomness can be supplied by tests.
export const MARKET_CONFIG = Object.freeze({
  tickMs: 600000, historyLimit: 145, initialTC: 500000,
  stateMin: 6, stateMax: 30, newsHours: [8, 12, 18], newsChance: .65,
  newsLimit: 40, restorationGap: .3, restorationChance: .18,
  grades: {
    normal: { average: 2000, volatility: .035, shockChance: .006, crash: [.1, .8], surge: [[.7, .1, .5], [.2, .5, 1.5], [.08, 1.5, 3], [.02, 3, 5]] },
    legendary: { average: 125000, volatility: .015, shockChance: .004, crash: [.1, .3], surge: [[1, .1, .5]] },
    mythical: { average: 1500000, volatility: .008, shockChance: .003, crash: [.1, .2], surge: [[1, .1, .3]] },
  },
});
export const STATE_BIAS = { NORMAL: 0, BULL: .006, BEAR: -.006, SIDEWAYS: 0 };
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const between = (a, b, random) => a + (b - a) * random();
const integer = (a, b, random) => Math.floor(between(a, b + 1, random));
const price = x => Math.round(clamp(x, 1, 1e12));
const weight = id => .65 + ((id * 137) % 701) / 1000;
const regime = random => ({ state: Object.keys(STATE_BIAS)[integer(0, 3, random)], remaining: integer(MARKET_CONFIG.stateMin, MARKET_CONFIG.stateMax, random) });

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
        trendStrength: 0, trendRemaining: 0, momentum: 0, priceHistory: [startingPrice] };
    }
  }
  return { cards, overall: regime(random), sectors, lastMarketUpdate: now, activeNews: [], newsHistory: [], newsSlots: [] };
}

export function validMarket(market, records) {
  const stateOK = s => s && Object.hasOwn(STATE_BIAS, s.state) && Number.isInteger(s.remaining) && s.remaining >= 0 && s.remaining <= MARKET_CONFIG.stateMax;
  const positive = n => Number.isFinite(n) && n >= 1 && n <= 1e12;
  const newsOK = n => n && typeof n.id === 'string' && typeof n.title === 'string'
    && ['all', 'normal', 'legendary', 'mythical', 'card'].includes(n.target)
    && (n.target !== 'card' || records.some(p => p.id === n.cardId))
    && [-1, 0, 1].includes(n.direction) && Number.isFinite(n.strength) && n.strength > 0 && n.strength <= 2
    && Number.isInteger(n.duration) && n.duration > 0 && n.duration <= 12
    && Number.isInteger(n.remaining) && n.remaining >= 0 && n.remaining <= n.duration && Number.isFinite(n.time);
  return !!market && Number.isFinite(market.lastMarketUpdate) && market.lastMarketUpdate >= 0
    && stateOK(market.overall) && Object.keys(MARKET_CONFIG.grades).every(g => stateOK(market.sectors?.[g]))
    && Array.isArray(market.activeNews) && market.activeNews.length <= MARKET_CONFIG.newsLimit && market.activeNews.every(newsOK)
    && Array.isArray(market.newsHistory) && market.newsHistory.length <= MARKET_CONFIG.newsLimit && market.newsHistory.every(newsOK)
    && Array.isArray(market.newsSlots) && market.newsSlots.length <= 12 && market.newsSlots.every(x => typeof x === 'string')
    && records.every(p => {
      const c = market.cards?.[p.id];
      return c && c.cardId === p.id && c.rarity === p.grade && [c.startingPrice, c.fairPrice, c.currentPrice].every(positive)
        && Number.isFinite(c.volatility) && c.volatility > 0 && c.volatility <= .1
        && [-1, 0, 1].includes(c.trend) && Number.isFinite(c.trendStrength) && c.trendStrength >= 0 && c.trendStrength <= .004
        && Number.isInteger(c.trendRemaining) && c.trendRemaining >= 0 && c.trendRemaining <= 18
        && Number.isFinite(c.momentum) && Math.abs(c.momentum) <= .08
        && Array.isArray(c.priceHistory) && c.priceHistory.length > 0 && c.priceHistory.length <= MARKET_CONFIG.historyLimit && c.priceHistory.every(positive);
    });
}

const targetLabels = { all: '포켓몬 카드', normal: '일반 카드', legendary: '전설 카드', mythical: '환상 카드' };
const headlines = {
  '1': ['수집 수요 확대… 거래 심리 개선', '신규 수집층 유입에 관심 증가', '희소성 재평가 움직임 확산'],
  '-1': ['차익 실현 매물 증가… 투자 심리 위축', '시장 과열 우려에 관망세 확대', '수요 둔화 조짐에 가격 부담 부각'],
  '0': ['매수·매도 전망 엇갈려… 변동성 주목', '수집가 평가 분분… 방향성 탐색', '거래 관심 증가 속 관망세 지속'],
};

export function generateNews(market, records, time, random = Math.random) {
  const current = new Date(time);
  for (const hour of MARKET_CONFIG.newsHours) {
    const slot = new Date(current.getFullYear(), current.getMonth(), current.getDate(), hour).getTime();
    if (slot <= time - MARKET_CONFIG.tickMs || slot > time) continue;
    const key = `${current.getFullYear()}-${current.getMonth() + 1}-${current.getDate()}-${hour}`;
    if (market.newsSlots.includes(key)) continue;
    market.newsSlots.push(key); market.newsSlots = market.newsSlots.slice(-12);
    if (random() >= MARKET_CONFIG.newsChance) continue;
    const target = ['all', 'normal', 'legendary', 'mythical', 'card'][integer(0, 4, random)];
    const card = target === 'card' ? records[integer(0, records.length - 1, random)] : null;
    const direction = [-1, 0, 1][integer(0, 2, random)];
    const variant = integer(0, 2, random);
    const id = `${target}-${card?.id ?? 0}-${direction}-${variant}`;
    if (market.activeNews.some(n => n.id === id)) continue;
    const duration = integer(6, 12, random);
    const news = { id, target, cardId: card?.id ?? null, direction, strength: random() < .2 ? 2 : 1,
      duration, remaining: duration, time: slot,
      title: `${card?.nameKo ?? targetLabels[target]} ${headlines[direction][variant]}` };
    market.activeNews.push(news);
    market.newsHistory.unshift({ ...news });
    market.newsHistory = market.newsHistory.slice(0, MARKET_CONFIG.newsLimit);
  }
}

// Compile additive modifiers once per tick, rather than scanning news for every card.
export function newsModifiers(news) {
  const modifiers = {};
  for (const n of news) {
    const key = n.target === 'card' ? `card-${n.cardId}` : n.target;
    const modifier = modifiers[key] ??= { bias: 0, activity: 0 };
    const strength = n.strength * n.remaining / n.duration;
    modifier.bias += n.direction * strength * .008;
    modifier.activity += strength * .15;
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

export function marketTick(market, records, random = Math.random) {
  const time = market.lastMarketUpdate + MARKET_CONFIG.tickMs;
  for (const n of market.activeNews) n.remaining--;
  market.activeNews = market.activeNews.filter(n => n.remaining > 0);
  generateNews(market, records, time, random);
  for (const state of [market.overall, ...Object.values(market.sectors)]) {
    if (--state.remaining <= 0) Object.assign(state, regime(random));
  }
  const modifiers = newsModifiers(market.activeNews);
  for (const p of records) {
    const c = market.cards[p.id], config = MARKET_CONFIG.grades[p.grade];
    let newsBias = 0, activity = 0;
    for (const key of ['all', p.grade, `card-${p.id}`]) {
      newsBias += modifiers[key]?.bias ?? 0; activity += modifiers[key]?.activity ?? 0;
    }
    if (--c.trendRemaining <= 0) {
      c.trend = integer(-1, 1, random); c.trendStrength = between(.0005, .004, random); c.trendRemaining = integer(4, 18, random);
    }
    const bias = STATE_BIAS[market.overall.state] + STATE_BIAS[market.sectors[p.grade].state] * .7 + newsBias;
    const momentum = c.momentum * (.18 + Math.min(activity, .5));
    const sideways = market.overall.state === 'SIDEWAYS' ? .65 : 1;
    let change = bias + c.trend * c.trendStrength + momentum + between(-1, 1, random) * c.volatility * (1 + activity) * sideways;
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
    c.currentPrice = next;
    c.priceHistory.push(next);
    if (c.priceHistory.length > MARKET_CONFIG.historyLimit) c.priceHistory.shift();
  }
  market.lastMarketUpdate = time;
}

export function advanceMarket(market, records, now = Date.now(), random = Math.random, maxTicks = 36) {
  const elapsed = Math.max(0, Math.floor((now - market.lastMarketUpdate) / MARKET_CONFIG.tickMs));
  const ticks = Math.min(elapsed, maxTicks);
  for (let i = 0; i < ticks; i++) marketTick(market, records, random);
  return { ticks, remaining: elapsed - ticks };
}

export function changePercent(card, ticks = 1) {
  const previous = card.priceHistory.at(-1 - ticks);
  return previous === undefined ? null : (card.currentPrice / previous - 1) * 100;
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
  ids.add(id); save.quantity[id] = (save.quantity[id] ?? 0) + 1;
}
export function sell(save, id, all = false) {
  const count = save.quantity[id] ?? 0;
  if (!count || !save.market.cards[id]) return 0;
  const quantity = all ? count : 1;
  const proceeds = save.market.cards[id].currentPrice * quantity;
  if (!Number.isSafeInteger(proceeds) || !Number.isSafeInteger(save.tc + proceeds)) return 0;
  save.quantity[id] -= quantity; save.tc += proceeds;
  return proceeds;
}
