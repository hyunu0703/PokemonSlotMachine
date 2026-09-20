import { TYPES, TYPE_COUNTERS, typeEffectiveness, typeMultiplier } from './data.js';

// Pure simulation/economy functions. All time and randomness can be supplied by tests.
export const MARKET_CONFIG = Object.freeze({
  tickMs: 600000, historyLimit: 144, hourlyHistoryLimit: 168, initialTC: 500000,
  stateMin: 6, stateMax: 30, newsLimit: 5,
  // 회복 기준가는 상승 가격만 천천히 따라가고, 하락 가격에는 내려가지 않는다.
  // 급등/급락 복원 조건과 확률은 등급별로 다르게 적용한다.
  recovery: Object.freeze({
    normal: Object.freeze({
      crashGap: .30, crashChance: .30, baseFollow: .001,
      // 시작가 대비 장기 수익률이 과도하게 누적되지 않도록 3단계 하락 압력을 적용한다.
      // +200% / +400% / +500%는 각각 시작가의 3배 / 5배 / 6배 가격을 뜻한다.
      longTermPressure: Object.freeze([
        Object.freeze({ gain: 5.00, chance: .90 }),
        Object.freeze({ gain: 4.00, chance: .60 }),
        Object.freeze({ gain: 2.00, chance: .30 }),
      ]),
    }),
    legendary: Object.freeze({
      crashGap: .50, crashChance: .20, baseFollow: .002, maxRisePerTick: .15,
      // 중소/중견 기술주처럼 장기 성장은 허용하되, 시작가 대비 과열 구간에서만 단계적으로 억제한다.
      longTermPressure: Object.freeze([
        Object.freeze({ gain: 10.00, chance: .85 }),
        Object.freeze({ gain: 5.00, chance: .50 }),
        Object.freeze({ gain: 2.00, chance: .20 }),
      ]),
    }),
    mythical: Object.freeze({
      surgeGap: .15, surgeChance: .30, crashGap: .20, crashChance: .20,
      baseFollow: .0005, maxRisePerTick: .10,
    }),
    baseFollow: .005, strength: .06, maxPressure: .08,
    normalShockRecoveryTicks: 10,
  }),
  // 10분 Tick당 +0.0003%. 뉴스와 무관한 아주 작은 장기 성장값이다.
  globalGrowth: .000003,
  grades: {
    normal: { average: 2000, volatility: .035, shockChance: .0004, crash: [.1, .8], surge: [[1, 1, 2.5]] },
    legendary: { average: 150000, volatility: .015, shockChance: .0002, crash: [.1, .3], surge: [[1, .1, .5]] },
    mythical: { average: 1500000, volatility: .008, shockChance: .00015, crash: [.1, .2], surge: [[1, .1, .3]] },
  },
});
export const STATE_BIAS = { NORMAL: 0, BULL: .006, BEAR: -.006, SIDEWAYS: 0 };

// 뉴스 생성 순서: 성격 -> 스토리 타입 -> 뉴스 대상.
export const NEWS_CONFIG = Object.freeze({
  nature: Object.freeze({ neutral: .30, positive: .50, negative: .20 }),
  story: Object.freeze({ continue: .65, fresh: .35, directReversal: .05 }),
  target: Object.freeze({ story: .50, opposed: .20, card: .30 }),
  // 호재/악재는 비대칭 범위. 중립은 가격 방향을 건드리지 않는다.
  price: Object.freeze({
    positive: Object.freeze({
      story: Object.freeze([-.01, .10]),
      opposed: Object.freeze([-.04, .005]),
      card: Object.freeze([-.01, .09]),
    }),
    negative: Object.freeze({
      story: Object.freeze([-.13, .01]),
      opposed: Object.freeze([-.005, .03]),
      card: Object.freeze([-.12, .015]),
    }),
  }),
  activity: Object.freeze({ neutral: .04, positive: .14, negative: .12, card: .20 }),
  tradeScale: 120,
  maxTradeVolume: 1e9,
});

const NEWS_NATURES = Object.freeze(['neutral', 'positive', 'negative']);
const NEWS_FOCUSES = Object.freeze(['story', 'opposed', 'card']);
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

const emptyNewsStory = () => ({ type: null, previousType: null, nature: null, opposedType: null, pokemonId: null, streak: 0 });

export function createMarket(records, now = Date.now(), random = Math.random) {
  const cards = {}, sectors = {};
  for (const [grade, config] of Object.entries(MARKET_CONFIG.grades)) {
    const pool = records.filter(p => p.grade === grade);
    const mean = pool.length ? pool.reduce((sum, p) => sum + weight(p.id), 0) / pool.length : 1;
    sectors[grade] = regime(random);
    for (const p of pool) {
      const startingPrice = price(config.average * weight(p.id) / mean);
      cards[p.id] = { cardId: p.id, rarity: grade, startingPrice, fairPrice: startingPrice,
        recoveryBasePrice: startingPrice, shockRecovery: null, currentPrice: startingPrice, volatility: config.volatility, trend: 0,
        trendStrength: 0, trendRemaining: 0, momentum: 0, trade24h: tradeBuffer(), priceHistory: buffer(), hourlyHistory: buffer(),
        highestPrice: startingPrice, lowestPrice: startingPrice, averagePrice: startingPrice, sampleCount: 1 };
    }
  }
  return { cards, trade24h: { head: 0, count: 0 }, overall: regime(random), sectors, lastMarketUpdate: now, activeNews: [], newsHistory: [],
    newsStory: emptyNewsStory() };
}

export function validMarket(market, records) {
  const stateOK = s => s && Object.hasOwn(STATE_BIAS, s.state) && Number.isInteger(s.remaining) && s.remaining >= 0 && s.remaining <= MARKET_CONFIG.stateMax;
  const positive = n => Number.isFinite(n) && n >= 1 && n <= 1e12;
  const bufferOK = (h, limit) => h && Array.isArray(h.values) && Number.isInteger(h.count)
    && h.count >= 0 && h.count <= limit && h.values.length === h.count
    && Number.isInteger(h.head) && h.head >= 0 && h.head < limit
    && (h.count === limit || h.head === h.count) && h.values.every(positive);
  const typeOK = t => t === null || Object.hasOwn(TYPES, t);
  const shockRecoveryOK = (recovery, rarity) => recovery === null || (
    rarity === 'normal'
    && Number.isFinite(recovery.basePrice) && recovery.basePrice >= 1 && recovery.basePrice <= 1e12
    && Number.isFinite(recovery.premium) && recovery.premium > 0 && recovery.premium <= 1e12
    && Number.isInteger(recovery.ticksRemaining) && recovery.ticksRemaining >= 1
    && recovery.ticksRemaining <= MARKET_CONFIG.recovery.normalShockRecoveryTicks
  );
  const newsOK = n => n && typeof n.id === 'string' && typeof n.title === 'string'
    && ['type', 'card'].includes(n.target)
    && NEWS_NATURES.includes(n.nature) && NEWS_FOCUSES.includes(n.focus)
    && (n.target !== 'card' || records.some(p => p.id === n.cardId))
    && typeOK(n.type ?? null) && typeOK(n.opposedType ?? null)
    && ['continue', 'fresh'].includes(n.transition)
    && Number.isFinite(n.impact) && n.impact >= 0 && n.impact <= .5
    && Number.isFinite(n.secondaryImpact) && n.secondaryImpact >= 0 && n.secondaryImpact <= .5
    && Number.isFinite(n.time);
  const story = market?.newsStory;
  const storyOK = story && typeOK(story.type) && typeOK(story.previousType)
    && (story.nature === null || NEWS_NATURES.includes(story.nature)) && typeOK(story.opposedType)
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
      return c && c.cardId === p.id && c.rarity === p.grade
        && [c.startingPrice, c.fairPrice, c.recoveryBasePrice, c.currentPrice].every(positive)
        && c.recoveryBasePrice >= c.startingPrice
        && shockRecoveryOK(c.shockRecovery ?? null, c.rarity)
        && Number.isFinite(c.volatility) && c.volatility > 0 && c.volatility <= .1
        && [-1, 0, 1].includes(c.trend) && Number.isFinite(c.trendStrength) && c.trendStrength >= 0 && c.trendStrength <= .004
        && Number.isInteger(c.trendRemaining) && c.trendRemaining >= 0 && c.trendRemaining <= 18
        && Number.isFinite(c.momentum) && Math.abs(c.momentum) <= .08
        && bufferOK(c.priceHistory, MARKET_CONFIG.historyLimit) && bufferOK(c.hourlyHistory, MARKET_CONFIG.hourlyHistoryLimit)
        && Array.isArray(c.trade24h?.volumes) && c.trade24h.volumes.length === market.trade24h.count
        && c.trade24h.volumes.every(n => Number.isSafeInteger(n) && n >= 1 && n <= NEWS_CONFIG.maxTradeVolume)
        && Number.isInteger(c.trade24h.volumeTotal) && c.trade24h.volumeTotal === c.trade24h.volumes.reduce((sum, n) => sum + n, 0)
        && Number.isFinite(c.trade24h.amountTotal) && c.trade24h.amountTotal >= 0
        && c.priceHistory.count >= market.trade24h.count
        && [c.highestPrice, c.lowestPrice, c.averagePrice].every(positive)
        && c.lowestPrice <= c.averagePrice && c.averagePrice <= c.highestPrice
        && Number.isSafeInteger(c.sampleCount) && c.sampleCount > 0;
    });
}

const TYPE_KEYS = Object.keys(TYPES);
const choose = (items, random) => items.length ? items[integer(0, items.length - 1, random)] : null;
const typeLabel = type => `${TYPES[type][0]}타입`;
const isDirectReversal = (a, b) => (a === 'positive' && b === 'negative') || (a === 'negative' && b === 'positive');
const weakTypes = type => {
  const result = TYPE_KEYS.filter(defend => typeEffectiveness(type, defend) > 1);
  return result.length ? result : [...TYPE_COUNTERS[type]];
};
const relatedTypes = (type, nature) => nature === 'positive'
  ? weakTypes(type)
  : nature === 'negative'
    ? [...TYPE_COUNTERS[type]]
    : [...new Set([...weakTypes(type), ...TYPE_COUNTERS[type]])];

export function migrateNewsSystem(market) {
  if (!market?.cards) return market;

  // 기존 v4 저장에는 recoveryBasePrice가 없으므로 시장 가격을 초기화하지 않고 보완한다.
  // 과거 시장이 이미 성장한 경우 fairPrice를 참고하되 startingPrice보다 낮아지지는 않는다.
  for (const c of Object.values(market.cards)) {
    if (!c || typeof c !== 'object') continue;
    if (!Number.isFinite(c.recoveryBasePrice) || c.recoveryBasePrice < 1) {
      const starting = Number.isFinite(c.startingPrice) && c.startingPrice > 0 ? c.startingPrice : 1;
      const fair = Number.isFinite(c.fairPrice) && c.fairPrice > 0 ? c.fairPrice : starting;
      c.recoveryBasePrice = price(Math.max(starting, fair));
    }
    // v17 이전 저장에는 일반 포켓몬 급등 프리미엄 복원 상태가 없다.
    // 진행 중인 급등을 억지로 추정하지 않고 다음 Shock부터 새 규칙을 적용한다.
    if (!Object.hasOwn(c, 'shockRecovery')) c.shockRecovery = null;
    if (c.rarity !== 'normal') c.shockRecovery = null;
  }

  const story = market.newsStory;
  const currentSchema = story
    && (story.type === null || Object.hasOwn(TYPES, story.type))
    && Object.hasOwn(story, 'nature')
    && (story.nature === null || NEWS_NATURES.includes(story.nature));
  const historySchema = Array.isArray(market.newsHistory)
    && market.newsHistory.every(n => n && NEWS_NATURES.includes(n.nature) && NEWS_FOCUSES.includes(n.focus));
  if (!currentSchema || !historySchema) {
    market.newsStory = emptyNewsStory();
    market.activeNews = [];
    market.newsHistory = [];
  }
  delete market.newsSlots;
  return market;
}

function rollNature(random) {
  const roll = random();
  if (roll < NEWS_CONFIG.nature.neutral) return 'neutral';
  if (roll < NEWS_CONFIG.nature.neutral + NEWS_CONFIG.nature.positive) return 'positive';
  return 'negative';
}

function nextStory(story, random) {
  if (!story.type || !Object.hasOwn(TYPES, story.type)) {
    return { transition: 'fresh', type: choose(TYPE_KEYS, random), previousType: null };
  }
  if (random() < NEWS_CONFIG.story.continue) {
    return { transition: 'continue', type: story.type, previousType: story.previousType };
  }
  const candidates = TYPE_KEYS.filter(type => type !== story.type);
  return { transition: 'fresh', type: choose(candidates, random), previousType: story.type };
}

function guardDirectReversal(candidateNature, story, next, random) {
  if (next.type !== story.type || !isDirectReversal(story.nature, candidateNature)) return next;
  if (random() < NEWS_CONFIG.story.directReversal) return next;
  // 뉴스 성격 비율은 그대로 보존하고, 급반전이 막히면 스토리 타입을 바꾼다.
  const candidates = TYPE_KEYS.filter(type => type !== story.type);
  return { transition: 'fresh', type: choose(candidates, random), previousType: story.type };
}

function chooseStoryCard(records, storyType, nature, random) {
  let allowed = nature === 'positive'
    ? records.filter(p => typeMultiplier(storyType, p.types) <= 1)
    : records.slice();
  if (!allowed.length) allowed = records.slice();
  if (!allowed.length) return null;

  // 같은 타입만 반복하지 않되 스토리 연결감은 유지한다.
  const relation = new Set(relatedTypes(storyType, nature));
  const same = allowed.filter(p => p.types.includes(storyType));
  const related = allowed.filter(p => !p.types.includes(storyType) && p.types.some(type => relation.has(type)));
  const other = allowed.filter(p => !p.types.includes(storyType) && !p.types.some(type => relation.has(type)));
  const roll = random();
  const preferred = roll < .50 ? same : roll < .75 ? related : other;
  return choose(preferred.length ? preferred : allowed, random);
}

function targetChoice(random) {
  const roll = random();
  if (roll < NEWS_CONFIG.target.story) return 'story';
  if (roll < NEWS_CONFIG.target.story + NEWS_CONFIG.target.opposed) return 'opposed';
  return 'card';
}

function storyTitle(news, card) {
  const pick = variants => {
    let hash = 0;
    for (let i = 0; i < news.id.length; i++) hash = (hash * 31 + news.id.charCodeAt(i)) >>> 0;
    return variants[hash % variants.length];
  };
  const type = typeLabel(news.type);
  const opposed = news.opposedType ? typeLabel(news.opposedType) : '';
  const name = card?.nameKo ?? '해당 포켓몬';

  if (news.nature === 'positive') {
    if (news.target === 'card') return pick([
      `${name} 매수세 유입`, `${name} 거래량 증가`, `${name} 시장 관심 확대`, `${type} 강세 속 ${name} 수요 증가`,
      `${name} 거래대금 증가`, `${name} 단기 강세`,
    ]);
    if (news.focus === 'opposed') return pick([
      `${type} 강세 속 ${opposed} 약세 전환`, `${opposed} 매도세 확대`, `${opposed} 수요 둔화`, `${type} 우세·${opposed} 약세`,
    ]);
    return pick([
      `${type} 매수세 강화`, `${type} 강세 확대`, `${type} 수요 증가`, `${type} 시장 관심 확대`,
      `${type} 거래대금 증가`, `${type} 상승 흐름 지속`,
    ]);
  }

  if (news.nature === 'negative') {
    if (news.target === 'card') return pick([
      `${name} 매도세 증가`, `${name} 수요 둔화`, `${name} 단기 약세`, `${name} 거래 공방 확대`,
      `${name} 시장 경계감 확대`, `${name} 가격 하방 압력`,
    ]);
    if (news.focus === 'opposed') return pick([
      `${type} 약세 속 ${opposed} 관심 증가`, `${opposed} 소폭 반등`, `${opposed} 대체 수요 유입`, `${opposed} 거래량 증가`,
    ]);
    return pick([
      `${type} 매도세 확대`, `${type} 수요 둔화`, `${type} 약세 전환`, `${type} 시장 경계감 확대`,
      `${type} 가격 하방 압력`, `${type} 거래 심리 위축`,
    ]);
  }

  if (news.target === 'card') return pick([
    `${name} 거래량 증가`, `${name} 거래대금 증가`, `${name} 매수·매도 공방`, `${name} 시장 관심 집중`,
    `${name} 변동성 확대`, `${name} 관망세 속 거래 활발`,
  ]);
  if (news.focus === 'opposed') return pick([
    `${type}·${opposed} 거래 공방 확대`, `${opposed} 거래량 증가`, `${type}와 ${opposed} 관망세`, `${opposed} 시장 관심 증가`,
  ]);
  return pick([
    `${type} 거래량 증가`, `${type} 매수·매도 공방 확대`, `${type} 변동성 확대`, `${type} 시장 관심 집중`,
    `${type} 거래대금 증가`, `${type} 관망세 지속`,
  ]);
}

export function generateNews(market, records, time, random = Math.random) {
  if (market.newsHistory[0]?.time === time) return market.newsHistory[0];
  market.activeNews = [];

  const nature = rollNature(random);
  const proposedStory = nextStory(market.newsStory, random);
  const next = guardDirectReversal(nature, market.newsStory, proposedStory, random);
  let focus = targetChoice(random);
  const opposedPool = relatedTypes(next.type, nature);
  const opposedType = choose(opposedPool, random);
  let card = null;
  let target = 'type';

  if (focus === 'card') {
    card = chooseStoryCard(records, next.type, nature, random);
    if (card) target = 'card';
    else focus = 'story';
  }

  const mainRange = nature === 'neutral' ? [0, 0] : NEWS_CONFIG.price[nature].story;
  const opposedRange = nature === 'neutral' ? [0, 0] : NEWS_CONFIG.price[nature].opposed;
  const impact = Math.max(Math.abs(mainRange[0]), Math.abs(mainRange[1]), NEWS_CONFIG.activity[nature]);
  const secondaryImpact = Math.max(Math.abs(opposedRange[0]), Math.abs(opposedRange[1]));
  const news = {
    id: `${nature}-${focus}-${card?.id ?? next.type}-${time}`,
    nature, focus, target, cardId: card?.id ?? null, type: next.type, opposedType,
    transition: next.transition, impact, secondaryImpact, time,
  };
  news.title = storyTitle(news, card);

  market.newsStory = {
    type: next.type,
    previousType: next.previousType,
    nature,
    opposedType,
    pokemonId: card?.id ?? null,
    streak: next.transition === 'continue' ? market.newsStory.streak + 1 : 1,
  };
  market.activeNews.push(news);
  market.newsHistory.unshift({ ...news });
  market.newsHistory = market.newsHistory.slice(0, MARKET_CONFIG.newsLimit);
  return news;
}

function addEffect(effect, range, activity) {
  effect.min += range[0];
  effect.max += range[1];
  effect.activity += activity;
}

// 실제 포켓몬의 최종 상성 배율을 사용해 듀얼 타입까지 반영한다.
export function newsEffect(news, pokemon) {
  const effect = { min: 0, max: 0, activity: 0 };
  for (const n of news) {
    const named = n.target === 'card' && n.cardId === pokemon.id;
    const storySector = pokemon.types.includes(n.type);
    const focusedOpposed = n.opposedType && pokemon.types.includes(n.opposedType);

    if (n.nature === 'neutral') {
      const active = n.focus === 'story' ? storySector : n.focus === 'opposed' ? focusedOpposed : named;
      if (active) effect.activity += NEWS_CONFIG.activity.neutral + (named ? NEWS_CONFIG.activity.card : 0);
      continue;
    }

    const config = NEWS_CONFIG.price[n.nature];
    if (storySector) {
      addEffect(effect, config.story, NEWS_CONFIG.activity[n.nature]);
    } else if (n.nature === 'positive' && typeMultiplier(n.type, pokemon.types) > 1) {
      addEffect(effect, config.opposed, NEWS_CONFIG.activity[n.nature]);
    } else if (n.nature === 'negative' && pokemon.types.some(type => TYPE_COUNTERS[n.type].includes(type))) {
      addEffect(effect, config.opposed, NEWS_CONFIG.activity[n.nature]);
    }

    if (named) addEffect(effect, config.card, NEWS_CONFIG.activity.card);
  }
  effect.activity = Math.min(effect.activity, 1);
  return effect;
}

// 기존 외부 호출 호환용. 새 가격 계산은 newsEffect()가 실제 듀얼 타입 상성을 기준으로 처리한다.
export function newsModifiers(news) {
  const modifiers = {};
  for (const n of news) {
    const put = (key, range, activity) => {
      const m = modifiers[key] ??= { min: 0, max: 0, activity: 0 };
      m.min += range[0]; m.max += range[1]; m.activity = Math.min(1, m.activity + activity);
    };
    if (n.nature === 'neutral') {
      if (n.focus === 'story') put(`type-${n.type}`, [0, 0], NEWS_CONFIG.activity.neutral);
      if (n.focus === 'opposed' && n.opposedType) put(`type-${n.opposedType}`, [0, 0], NEWS_CONFIG.activity.neutral);
      if (n.target === 'card') put(`card-${n.cardId}`, [0, 0], NEWS_CONFIG.activity.neutral + NEWS_CONFIG.activity.card);
      continue;
    }
    const config = NEWS_CONFIG.price[n.nature];
    put(`type-${n.type}`, config.story, NEWS_CONFIG.activity[n.nature]);
    if (n.opposedType) put(`type-${n.opposedType}`, config.opposed, NEWS_CONFIG.activity[n.nature]);
    if (n.target === 'card') put(`card-${n.cardId}`, config.card, NEWS_CONFIG.activity.card);
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

function recoveryPressure(card, random) {
  const recovery = MARKET_CONFIG.recovery;
  const config = recovery[card.rarity];
  const base = card.recoveryBasePrice;
  if (!config || !Number.isFinite(base) || base <= 0) return 0;

  // 장기 성장형 등급은 시작가를 장기 앵커로 삼아 과열 구간에서 단계적으로 하락 압력을 준다.
  // 일반은 동전주/지폐주, 전설은 중소/중견 기술주 성격으로 서로 다른 구간과 확률을 사용한다.
  if (Array.isArray(config.longTermPressure)) {
    const starting = Math.max(1, card.startingPrice);
    const gainFromStart = card.currentPrice / starting - 1;
    const tier = config.longTermPressure.find(item => gainFromStart >= item.gain);
    if (tier && random() < tier.chance) {
      // 시작가를 장기 앵커로 사용해 높은 가격일수록 자연스럽게 더 강한 음수 압력이 생긴다.
      return clamp((starting / card.currentPrice - 1) * recovery.strength, -recovery.maxPressure, 0);
    }
  } else {
    const gap = card.currentPrice / base - 1;
    if (gap >= config.surgeGap) {
      if (random() >= config.surgeChance) return 0;
      return clamp((base / card.currentPrice - 1) * recovery.strength, -recovery.maxPressure, 0);
    }
  }

  // 급락 복원은 기존 recoveryBasePrice 기준을 그대로 사용한다.
  const gap = card.currentPrice / base - 1;
  if (gap <= -config.crashGap) {
    if (random() >= config.crashChance) return 0;
    return clamp((base / card.currentPrice - 1) * recovery.strength, 0, recovery.maxPressure);
  }
  return 0;
}

function updateRecoveryBase(card, nextPrice) {
  const recovery = MARKET_CONFIG.recovery;
  const gradeConfig = recovery[card.rarity] ?? {};
  const followRate = gradeConfig.baseFollow ?? recovery.baseFollow;
  const currentBase = Math.max(card.startingPrice, card.recoveryBasePrice);

  // 회복 기준가는 상승 가격만 천천히 따라가며, 급락으로는 내려가지 않는다.
  if (nextPrice <= currentBase) {
    card.recoveryBasePrice = currentBase;
    return;
  }

  card.recoveryBasePrice = price(
    currentBase + (nextPrice - currentBase) * followRate,
  );
}

function limitRisePerTick(card, nextPrice) {
  const maxRise = MARKET_CONFIG.recovery[card.rarity]?.maxRisePerTick;
  if (!Number.isFinite(maxRise) || maxRise <= 0) return nextPrice;
  const maxPrice = price(card.currentPrice * (1 + maxRise));
  return Math.min(nextPrice, maxPrice);
}

function beginNormalShockRecovery(card, shockedPrice) {
  const premium = Math.max(0, shockedPrice - card.currentPrice);
  if (card.rarity !== 'normal' || premium <= 0) return;
  card.shockRecovery = {
    basePrice: card.currentPrice,
    premium,
    ticksRemaining: MARKET_CONFIG.recovery.normalShockRecoveryTicks,
  };
  // 급등 자체가 다음 Tick 모멘텀으로 다시 증폭되지 않도록 초기화한다.
  card.momentum = 0;
}

function advanceNormalShockRecovery(card, baseChange) {
  const recovery = card.shockRecovery;
  if (card.rarity !== 'normal' || !recovery?.ticksRemaining) return null;

  // Shock 프리미엄을 제외한 기준 가격만 기존 시장 요인으로 움직인다.
  const baseNext = price(recovery.basePrice * (1 + baseChange));
  const nextTicks = recovery.ticksRemaining - 1;
  const premiumRemaining = recovery.premium * (nextTicks / MARKET_CONFIG.recovery.normalShockRecoveryTicks);
  const next = price(baseNext + premiumRemaining);

  if (nextTicks <= 0) card.shockRecovery = null;
  else card.shockRecovery = { ...recovery, basePrice: baseNext, ticksRemaining: nextTicks };

  return { next, baseNext };
}

function tradeRoll(time, id) {
  let x = (Math.floor(time / MARKET_CONFIG.tickMs) ^ Math.imul(id, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function newsTradeVolume(time, id, activity) {
  const base = 1 + Math.floor(tradeRoll(time, id) * 100);
  return Math.min(NEWS_CONFIG.maxTradeVolume, Math.max(1, Math.round(base * (1 + activity * NEWS_CONFIG.tradeScale))));
}

export function marketTick(market, records, random = Math.random, recordTrades = true) {
  const time = market.lastMarketUpdate + MARKET_CONFIG.tickMs;
  market.activeNews = [];
  generateNews(market, records, time, random);
  for (const state of [market.overall, ...Object.values(market.sectors)]) {
    if (--state.remaining <= 0) Object.assign(state, regime(random));
  }
  const trades = [];
  for (const p of records) {
    const c = market.cards[p.id], config = MARKET_CONFIG.grades[p.grade];
    const effect = newsEffect(market.activeNews, p);
    const newsMove = effect.min === effect.max ? effect.min : between(effect.min, effect.max, random);
    const newsCenter = (effect.min + effect.max) * .5;
    const activity = effect.activity;

    if (--c.trendRemaining <= 0) {
      c.trend = integer(-1, 1, random); c.trendStrength = between(.0005, .004, random); c.trendRemaining = integer(4, 18, random);
    }
    const marketBias = STATE_BIAS[market.overall.state] + STATE_BIAS[market.sectors[p.grade].state] * .7;
    const inNormalShockRecovery = p.grade === 'normal' && !!c.shockRecovery?.ticksRemaining;
    // 일반 포켓몬 급등 복원 중에는 Shock으로 만들어진 모멘텀을 다시 가격에 더하지 않는다.
    const momentum = inNormalShockRecovery ? 0 : c.momentum * (.18 + Math.min(activity, .5));
    const sideways = market.overall.state === 'SIDEWAYS' ? .65 : 1;
    const randomDirection = -1 + 2 * random();
    let change = MARKET_CONFIG.globalGrowth + marketBias + c.trend * c.trendStrength + momentum + newsMove
      + randomDirection * c.volatility * (1 + activity) * sideways;

    let startedNormalShockRecovery = false;
    let legendaryUpShock = false;
    let normalRecoveryResult = null;
    if (inNormalShockRecovery) {
      // 복원 중에는 새 Shock을 겹치지 않는다. 10 Tick 동안 기존 Shock 프리미엄만 단계적으로 제거한다.
      normalRecoveryResult = advanceNormalShockRecovery(c, change);
    } else if (random() < config.shockChance * (1 + activity)) {
      // Shock은 해당 Tick 변동률을 교체한다. 일반 상승 Shock은 +100~250% 급등 후 10 Tick 복원을 시작한다.
      const upChance = clamp(.5 + (marketBias + MARKET_CONFIG.globalGrowth + newsCenter) * 12 + momentum * 4, .08, .92);
      const up = random() < upChance;
      change = shockChange(p.grade, up, random);
      if (p.grade === 'normal' && up) startedNormalShockRecovery = true;
      if (p.grade === 'legendary' && up) legendaryUpShock = true;
    } else {
      // 별도 회복 기준가를 기준으로 등급별 급등/급락 복원 규칙을 적용한다.
      change += recoveryPressure(c, random);
    }

    const fairBias = marketBias + MARKET_CONFIG.globalGrowth + newsCenter;
    // 일반 Shock 프리미엄은 fairPrice에 흡수하지 않고, Shock을 제외한 기준 가격을 따라가게 한다.
    const fairReference = normalRecoveryResult?.baseNext ?? c.shockRecovery?.basePrice ?? c.currentPrice;
    c.fairPrice = clamp(c.fairPrice * (1 + fairBias * .03) + (fairReference - c.fairPrice) * .002, 1, 1e12);

    let next;
    let recoveryBaseReference;
    if (normalRecoveryResult) {
      next = normalRecoveryResult.next;
      recoveryBaseReference = normalRecoveryResult.baseNext;
    } else {
      const rawNext = price(c.currentPrice * (1 + change));
      // 전설은 평상시 한 Tick 최대 +15%로 제한하지만, 드문 상승 Shock(+10~50%)은 기술주 급등 연출로 예외 허용한다.
      // 환상은 기존대로 뉴스/쇼크/모멘텀이 겹쳐도 한 Tick 최대 +10% 상승 제한을 유지한다.
      // 하락에는 이 제한을 적용하지 않아 기존 하락 변동성은 그대로 유지한다.
      next = legendaryUpShock ? rawNext : limitRisePerTick(c, rawNext);
      recoveryBaseReference = next;
      if (startedNormalShockRecovery) {
        beginNormalShockRecovery(c, next);
        // 일반 Shock 프리미엄은 장기 회복 기준가에 반영하지 않는다.
        recoveryBaseReference = c.shockRecovery?.basePrice ?? c.currentPrice;
      }
    }

    c.momentum = c.shockRecovery
      ? 0
      : clamp(c.momentum * .65 + (next / c.currentPrice - 1) * .35, -.08, .08);
    const oldQuote = recordTrades && market.trade24h.count === MARKET_CONFIG.historyLimit
      ? previous(c.priceHistory, MARKET_CONFIG.historyLimit - 1) : 0;
    append(c.priceHistory, c.currentPrice, MARKET_CONFIG.historyLimit);
    c.currentPrice = next;
    // Shock 프리미엄은 제외하고 회복 기준가를 갱신한다. 환상은 차이의 0.05% 속도로만 추종한다.
    updateRecoveryBase(c, recoveryBaseReference);
    if (Math.floor(time / hourMs) > Math.floor(market.lastMarketUpdate / hourMs)) append(c.hourlyHistory, next, MARKET_CONFIG.hourlyHistoryLimit);
    updateStats(c, next);

    if (recordTrades) {
      const oldVolume = c.trade24h.volumes[market.trade24h.head] ?? 0;
      trades.push({ c, id: p.id, quote: next, oldQuote, oldVolume, volume: newsTradeVolume(time, p.id, activity) });
    }
  }

  if (recordTrades) {
    // 특정 포켓몬 뉴스는 해당 Tick의 거래량/거래대금 1위를 보장한다.
    const namedId = market.activeNews[0]?.target === 'card' ? market.activeNews[0].cardId : null;
    const named = trades.find(t => t.id === namedId);
    if (named) {
      let maxVolume = 0, maxAmount = 0;
      for (const trade of trades) if (trade !== named) {
        maxVolume = Math.max(maxVolume, trade.volume);
        maxAmount = Math.max(maxAmount, trade.quote * trade.volume);
      }
      const volumeLead = Math.floor(maxVolume) + 1;
      const amountLead = Math.ceil((maxAmount + 1) / named.quote);
      named.volume = Math.min(NEWS_CONFIG.maxTradeVolume, Math.max(named.volume, volumeLead, amountLead));
    }
    for (const trade of trades) appendTrade(trade.c.trade24h, market.trade24h.head, trade.volume, trade.quote, trade.oldQuote);
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

export function advanceDebugTicks(market, records, count, random = Math.random, recordTrades = true) {
  if (!Number.isInteger(count) || count < 1 || count > 100) return 0;
  for (let i = 0; i < count; i++) marketTick(market, records, random, recordTrades);
  return count;
}

export function currentTradeVolume(market, card) {
  if (!market?.trade24h?.count || !card?.trade24h?.volumes) return 0;
  const index = (market.trade24h.head - 1 + MARKET_CONFIG.historyLimit) % MARKET_CONFIG.historyLimit;
  return card.trade24h.volumes[index] ?? 0;
}
export function currentTradeAmount(market, card) {
  return currentTradeVolume(market, card) * (card?.currentPrice ?? 0);
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
export function acquire(save, ids, id, quantity = 1) {
  const amount = Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
  const count = save.quantity[id] ?? 0, quote = save.market.cards[id].currentPrice;
  save.averageAcquisitionPrice ??= {};
  const average = count > 0 ? save.averageAcquisitionPrice[id] ?? quote : quote;
  save.averageAcquisitionPrice[id] = count > 0 ? (average * count + quote * amount) / (count + amount) : quote;
  ids.add(id); save.quantity[id] = count + amount;
}
export function sell(save, id, quantity = 1) {
  const count = save.quantity[id] ?? 0;
  if (!count || !save.market.cards[id]) return 0;
  const sellCount = quantity === true ? count : Math.min(count, Math.max(1, Math.floor(Number(quantity) || 1)));
  const proceeds = save.market.cards[id].currentPrice * sellCount;
  if (!Number.isSafeInteger(proceeds) || !Number.isSafeInteger(save.tc + proceeds)) return 0;
  save.quantity[id] -= sellCount; save.tc += proceeds;
  if (!save.quantity[id] && save.averageAcquisitionPrice) delete save.averageAcquisitionPrice[id];
  return proceeds;
}
