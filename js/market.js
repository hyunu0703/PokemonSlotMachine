import { TYPES, TYPE_COUNTERS, typeEffectiveness, typeMultiplier } from './data.js';
import { createWorldNewsState, generateWorldStoryNews, migrateWorldNewsState } from './world-news.js';
import storyAreaDatabase from '../data/world/story-area-residents.json' with { type: 'json' };

// Pure simulation/economy functions. All time and randomness can be supplied by tests.
export const MARKET_CONFIG = Object.freeze({
  tickMs: 600000, historyLimit: 144, hourlyHistoryLimit: 168, longHistoryLimit: 120, initialTC: 500000,
  stateMin: 6, stateMax: 30, newsLimit: 5,
  // v34 이전 저장 데이터와 외부 호환을 위한 legacy recovery 설정.
  // v35의 실제 가격 방향은 technical 패턴 엔진이 결정하며, recovery는 recoveryBasePrice 보존에만 남겨둔다.
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
  // 장기 가격의 기준선(fairPrice)은 완만하게 우상향하고, 실제 가격은 아래 technical 패턴을 따라 움직인다.
  // 기존 globalGrowth는 외부 호환을 위해 유지하되, 새 기술적 패턴 엔진은 등급별 growth를 사용한다.
  globalGrowth: .000003,
  technical: Object.freeze({
    // 일반: 저가·투기주. 같은 뉴스에도 반응 편차가 크고 드문 급등/급락 꼬리가 존재한다.
    normal: Object.freeze({ growth: .00015, noise: .0045, pull: .42, duration: [22, 44], amplitude: [.07, .15], maxAmplitude: .28, eventMaxAmplitude: 1.25, eventMaxDownAmplitude: .52, maxStepUp: .085, maxStepDown: .075, eventStepUp: 3.8, eventStepDown: 3.5, regimeInfluence: .035, newsInfluence: .0025 }),
    // 전설: 중소·중견 성장주. 종목별 민감도는 다르지만 일반보다 극단 꼬리는 작다.
    legendary: Object.freeze({ growth: .00010, noise: .0028, pull: .38, duration: [28, 56], amplitude: [.05, .11], maxAmplitude: .20, eventMaxAmplitude: .58, eventMaxDownAmplitude: .42, maxStepUp: .060, maxStepDown: .055, eventStepUp: 3.1, eventStepDown: 2.9, regimeInfluence: .030, newsInfluence: .0020 }),
    // 환상: 대형주. 반응 분산과 극단 꼬리가 가장 작지만 강한 사건에서는 갭·급락이 가능하다.
    mythical: Object.freeze({ growth: .00005, noise: .0016, pull: .34, duration: [36, 72], amplitude: [.032, .072], maxAmplitude: .12, eventMaxAmplitude: .26, eventMaxDownAmplitude: .26, maxStepUp: .038, maxStepDown: .035, eventStepUp: 2.4, eventStepDown: 2.3, regimeInfluence: .025, newsInfluence: .0015 }),
  }),
  // average는 초기 가격, shockChance는 뉴스가 없는 상황의 드문 자발적 돌파 패턴 확률에 사용한다.
  // volatility/crash/surge는 기존 export 호환용이며 v35 marketTick의 일상 변동에는 직접 사용하지 않는다.
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
      story: Object.freeze([-.01, .20]),
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
  // 같은 섹터라도 종목별 베타·뉴스 민감도·유동성·점프 위험이 달라지도록 반응을 분산한다.
  reaction: Object.freeze({
    sectorDispersion: Object.freeze([.55, 1.55]),
    directBoost: 1.30,
    mutedChance: .14,
    overreactChance: .12,
    fadeChance: .08,
    whipsawChance: .05,
    contrarianChance: .035,
    extremePositiveChance: .035,
    extremeNegativeChance: .055,
  }),
  tradeScale: 120,
  maxTradeVolume: 1e9,
});

const NEWS_NATURES = Object.freeze(['neutral', 'positive', 'negative']);
const NEWS_FOCUSES = Object.freeze(['story', 'opposed', 'card']);
const LOCAL_NON_RESIDENT_IMPACT = Number(storyAreaDatabase?.policy?.localNonResidentImpactMultiplier) || .15;
const LOCAL_RESIDENT_SPILLOVER = Number(storyAreaDatabase?.policy?.localResidentSpilloverMultiplier) || .55;
const TYPE_STREAK_HARD_LIMIT = 9; // 10번째 연속 Tick에 들어가기 전에 다른 타입으로 강제 전환한다.
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const between = (a, b, random) => a + (b - a) * random();
const integer = (a, b, random) => Math.floor(between(a, b + 1, random));
const price = x => Math.round(clamp(x, 1, 1e12));
const weight = id => .65 + ((id * 137) % 701) / 1000;
const regime = random => ({ state: Object.keys(STATE_BIAS)[integer(0, 3, random)], remaining: integer(MARKET_CONFIG.stateMin, MARKET_CONFIG.stateMax, random) });

// 실제 주식 차트에서 자주 보이는 가격 구조를 단순화한 패턴 코드.
// 저장 용량을 줄이기 위해 card.tech에는 짧은 키를 사용한다.
// 배열 인덱스: [pattern, age, duration, basePrice, amplitude, newsLock]
const TECH_PATTERN = Object.freeze({
  RANGE: 0, ASCENDING_TRIANGLE: 1, DESCENDING_TRIANGLE: 2, BULL_FLAG: 3, BEAR_FLAG: 4,
  DOUBLE_BOTTOM: 5, DOUBLE_TOP: 6, BREAKOUT_RETEST: 7, BREAKDOWN_RETEST: 8,
  PARABOLIC_SURGE: 9, GAP_UP_RUN: 10, SPIKE_FADE: 11, PANIC_SELL: 12,
  GAP_DOWN_RECOVERY: 13, V_REVERSAL: 14, FALSE_BREAKOUT: 15, FALSE_BREAKDOWN: 16,
  DEAD_CAT_BOUNCE: 17, WHIPSAW: 18,
});
const TECH_PATTERN_LABELS = Object.freeze([
  '박스권 횡보', '상승 삼각형', '하락 삼각형', '불 플래그', '베어 플래그',
  '더블 바텀', '더블 탑', '상방 돌파·리테스트', '하방 이탈·리테스트',
  '포물선 급등', '갭상승·추세 지속', '급등 후 뉴스매도', '패닉 급락',
  '갭하락 후 회복', 'V자 반전', '페이크 돌파', '페이크 이탈', '데드캣 바운스', '휩쏘 변동',
]);

// 각 패턴의 시간 진행률(0~1)에 따른 상대 위치. 이벤트 패턴은 급등·급락·선반영·뉴스매도까지 포함한다.
const TECH_PATTERN_POINTS = Object.freeze({
  [TECH_PATTERN.RANGE]: Object.freeze([[0, 0], [.12, .46], [.25, -.46], [.39, .38], [.53, -.38], [.68, .43], [.83, -.31], [1, .10]]),
  [TECH_PATTERN.ASCENDING_TRIANGLE]: Object.freeze([[0, -.34], [.14, .56], [.28, -.18], [.42, .56], [.56, .02], [.70, .56], [.82, .20], [1, 1.08]]),
  [TECH_PATTERN.DESCENDING_TRIANGLE]: Object.freeze([[0, .34], [.14, -.56], [.28, .18], [.42, -.56], [.56, -.02], [.70, -.56], [.82, -.20], [1, -1.08]]),
  [TECH_PATTERN.BULL_FLAG]: Object.freeze([[0, 0], [.16, 1.00], [.32, .78], [.48, .86], [.64, .70], [.79, .80], [1, 1.24]]),
  [TECH_PATTERN.BEAR_FLAG]: Object.freeze([[0, 0], [.16, -1.00], [.32, -.78], [.48, -.86], [.64, -.70], [.79, -.80], [1, -1.24]]),
  [TECH_PATTERN.DOUBLE_BOTTOM]: Object.freeze([[0, .04], [.18, -.76], [.38, .30], [.58, -.68], [.76, .34], [1, 1.05]]),
  [TECH_PATTERN.DOUBLE_TOP]: Object.freeze([[0, -.04], [.18, .76], [.38, -.30], [.58, .68], [.76, -.34], [1, -1.05]]),
  [TECH_PATTERN.BREAKOUT_RETEST]: Object.freeze([[0, 0], [.18, .36], [.34, .70], [.48, 1.00], [.64, .57], [.80, .77], [1, 1.20]]),
  [TECH_PATTERN.BREAKDOWN_RETEST]: Object.freeze([[0, 0], [.18, -.36], [.34, -.70], [.48, -1.00], [.64, -.57], [.80, -.77], [1, -1.20]]),
  [TECH_PATTERN.PARABOLIC_SURGE]: Object.freeze([[0, 0], [.10, .12], [.22, .32], [.36, .62], [.52, 1.02], [.68, 1.38], [.84, 1.78], [1, 2.20]]),
  [TECH_PATTERN.GAP_UP_RUN]: Object.freeze([[0, 0], [.06, .82], [.18, .70], [.34, .96], [.55, .88], [.76, 1.12], [1, 1.38]]),
  [TECH_PATTERN.SPIKE_FADE]: Object.freeze([[0, 0], [.08, 1.22], [.22, 1.02], [.42, .62], [.62, .30], [.82, .04], [1, -.18]]),
  [TECH_PATTERN.PANIC_SELL]: Object.freeze([[0, 0], [.06, -.72], [.18, -1.08], [.34, -1.34], [.52, -1.10], [.72, -1.48], [1, -1.22]]),
  [TECH_PATTERN.GAP_DOWN_RECOVERY]: Object.freeze([[0, 0], [.06, -1.00], [.20, -.88], [.40, -.58], [.62, -.28], [.82, -.06], [1, .12]]),
  [TECH_PATTERN.V_REVERSAL]: Object.freeze([[0, 0], [.18, -.68], [.36, -1.00], [.54, -.52], [.72, .06], [.86, .46], [1, .76]]),
  [TECH_PATTERN.FALSE_BREAKOUT]: Object.freeze([[0, 0], [.20, .42], [.38, .92], [.50, 1.18], [.66, .58], [.82, .08], [1, -.34]]),
  [TECH_PATTERN.FALSE_BREAKDOWN]: Object.freeze([[0, 0], [.20, -.42], [.38, -.92], [.50, -1.18], [.66, -.58], [.82, -.08], [1, .34]]),
  [TECH_PATTERN.DEAD_CAT_BOUNCE]: Object.freeze([[0, 0], [.14, -.86], [.30, -1.20], [.48, -.68], [.66, -.48], [.80, -.82], [1, -1.10]]),
  [TECH_PATTERN.WHIPSAW]: Object.freeze([[0, 0], [.14, .72], [.28, -.62], [.44, .86], [.60, -.76], [.78, .52], [1, .04]]),
});

const seededCardRandom = id => {
  let x = (Math.imul(Number(id) || 1, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
};

const hashUnit = (...parts) => {
  const text = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const lerp = (a, b, t) => a + (b - a) * t;

// 각 포켓몬이 동일 섹터 안에서도 서로 다른 주식처럼 움직이도록 고정된 시장 성향을 만든다.
// 저장 공간을 늘리지 않기 위해 id+등급에서 결정적으로 계산한다.
export function marketReactionProfile(pokemon) {
  const grade = pokemon?.grade ?? 'normal';
  const ranges = grade === 'normal'
    ? { market:[.55,1.55], news:[.45,1.85], jump:[.55,1.90], up:[.65,1.65], down:[.65,1.75], vol:[.75,1.55], volume:[.55,1.90] }
    : grade === 'legendary'
      ? { market:[.70,1.35], news:[.65,1.55], jump:[.60,1.45], up:[.75,1.45], down:[.75,1.50], vol:[.80,1.35], volume:[.70,1.55] }
      : { market:[.82,1.20], news:[.78,1.30], jump:[.70,1.25], up:[.82,1.28], down:[.82,1.30], vol:[.86,1.22], volume:[.80,1.35] };
  const id = pokemon?.id ?? pokemon?.cardId ?? 1;
  const sample = (key, [low, high]) => lerp(low, high, hashUnit('profile', id, grade, key));
  return {
    marketBeta: sample('market', ranges.market), newsBeta: sample('news', ranges.news), jumpBeta: sample('jump', ranges.jump),
    upsideBeta: sample('up', ranges.up), downsideBeta: sample('down', ranges.down), volatilityBeta: sample('vol', ranges.vol),
    volumeBeta: sample('volume', ranges.volume),
  };
}

export function newsSeverity(entry) {
  if (!entry) return { score: 0, tier: 'none' };
  const u = hashUnit('severity', entry.id ?? entry.time ?? 0, entry.nature ?? 'neutral');
  const direct = entry.target === 'card';
  let score;
  if (entry.nature === 'positive') {
    if (u < .50) score = lerp(.45, .78, u / .50);
    else if (u < .82) score = lerp(.78, 1.08, (u - .50) / .32);
    else if (u < .965) score = lerp(1.08, 1.52, (u - .82) / .145);
    else score = lerp(1.52, 2.25, (u - .965) / .035);
  } else if (entry.nature === 'negative') {
    if (u < .42) score = lerp(.50, .82, u / .42);
    else if (u < .78) score = lerp(.82, 1.15, (u - .42) / .36);
    else if (u < .945) score = lerp(1.15, 1.62, (u - .78) / .165);
    else score = lerp(1.62, 2.40, (u - .945) / .055);
  } else {
    score = lerp(.20, .72, u);
  }
  if (direct) score += .18;
  if (entry.isFollowUp) score += .05;
  const stage = Number(entry.storyStage);
  if (Number.isFinite(stage) && stage > 1) score += Math.min(.12, (stage - 1) * .025);
  score = clamp(score, .15, 2.6);
  const tier = score >= 1.60 ? 'extreme' : score >= 1.12 ? 'strong' : score >= .72 ? 'normal' : 'mild';
  return { score, tier };
}

const REACTION_STYLE = Object.freeze({ FOLLOW:'follow', MUTED:'muted', OVERREACT:'overreact', FADE:'fade', WHIPSAW:'whipsaw', CONTRARIAN:'contrarian' });

export function marketReactionSignal(news, pokemon, effect = null) {
  const entry = news?.[0] ?? null;
  if (!entry) return { relevant:false, direct:false, nature:'neutral', strength:0, style:REACTION_STYLE.MUTED, explosive:false, volatilityBoost:1, volumeBoost:1, fairCenter:0, severity:newsSeverity(null) };
  // worldStory 뉴스의 세대 범위를 reaction 단계에서도 한 번 더 막아
  // 직접 지목 뉴스라도 다른 세대 포켓몬이 패턴을 시작하지 않게 한다.
  const scopeWeight = newsScopeMultiplier(entry, pokemon);
  if (scopeWeight <= 0) {
    return { relevant:false, direct:false, nature:'neutral', strength:0, style:REACTION_STYLE.MUTED, explosive:false, volatilityBoost:1, volumeBoost:1, fairCenter:0, severity:newsSeverity(entry), scopeWeight:0 };
  }
  const resolved = effect ?? newsEffect(news, pokemon);
  const direct = entry.target === 'card' && entry.cardId === pokemon.id;
  const center = (resolved.min + resolved.max) * .5;
  const relevant = direct || resolved.activity > 0 || Math.abs(center) > .00001;
  if (!relevant) return { relevant:false, direct:false, nature:'neutral', strength:0, style:REACTION_STYLE.MUTED, explosive:false, volatilityBoost:1, volumeBoost:1, fairCenter:0, severity:newsSeverity(entry) };

  const profile = marketReactionProfile(pokemon);
  const severity = newsSeverity(entry);
  let nature = center > .004 ? 'positive' : center < -.004 ? 'negative' : entry.nature ?? 'neutral';
  const reaction = NEWS_CONFIG.reaction;
  const styleRoll = hashUnit('style', entry.id, pokemon.id);
  let style = REACTION_STYLE.FOLLOW;
  let edge = reaction.mutedChance;
  if (styleRoll < edge) style = REACTION_STYLE.MUTED;
  else if (styleRoll < (edge += reaction.overreactChance)) style = REACTION_STYLE.OVERREACT;
  else if (styleRoll < (edge += reaction.fadeChance)) style = REACTION_STYLE.FADE;
  else if (styleRoll < (edge += reaction.whipsawChance)) style = REACTION_STYLE.WHIPSAW;
  else if (styleRoll < (edge += reaction.contrarianChance)) style = REACTION_STYLE.CONTRARIAN;

  const [dispLow, dispHigh] = reaction.sectorDispersion;
  const dispersion = lerp(dispLow, dispHigh, hashUnit('dispersion', entry.id, pokemon.id));
  const sideBeta = nature === 'negative' ? profile.downsideBeta : profile.upsideBeta;
  const relationBoost = direct ? reaction.directBoost : 1;
  let strength = (.20 + Math.abs(center) * 7 + resolved.activity * .85) * severity.score * profile.newsBeta * sideBeta * dispersion * relationBoost;
  const styleMultiplier = style === REACTION_STYLE.MUTED ? lerp(.16, .42, hashUnit('muted', entry.id, pokemon.id))
    : style === REACTION_STYLE.OVERREACT ? lerp(1.45, 2.35, hashUnit('overreact', entry.id, pokemon.id))
      : style === REACTION_STYLE.FADE ? lerp(.95, 1.45, hashUnit('fade', entry.id, pokemon.id))
        : style === REACTION_STYLE.WHIPSAW ? lerp(.90, 1.55, hashUnit('whipsaw', entry.id, pokemon.id))
          : style === REACTION_STYLE.CONTRARIAN ? lerp(.55, 1.05, hashUnit('contrarian', entry.id, pokemon.id))
            : lerp(.72, 1.22, hashUnit('follow', entry.id, pokemon.id));
  strength = clamp(strength * styleMultiplier * scopeWeight, .02, 4.5);

  // 실제 시장처럼 호재인데 재료소멸로 하락하거나, 악재인데 선반영 후 반등하는 희귀 반응도 허용한다.
  if (style === REACTION_STYLE.CONTRARIAN && nature !== 'neutral') nature = nature === 'positive' ? 'negative' : 'positive';

  const tailRoll = hashUnit('tail', entry.id, pokemon.id);
  const tailChanceBase = entry.nature === 'negative' ? reaction.extremeNegativeChance : reaction.extremePositiveChance;
  const tailChance = clamp(tailChanceBase * profile.jumpBeta * Math.max(.45, severity.score) * (direct ? 1.35 : 1), 0, .32);
  const explosive = scopeWeight >= .5 && nature !== 'neutral' && style !== REACTION_STYLE.MUTED && (tailRoll < tailChance || (style === REACTION_STYLE.OVERREACT && strength >= 2.25));
  const rawVolatilityBoost = clamp(profile.volatilityBeta * (1 + strength * .18) * (style === REACTION_STYLE.WHIPSAW ? 1.65 : 1), .55, 3.0);
  const rawVolumeBoost = clamp(profile.volumeBeta * (1 + severity.score * .55) * (direct ? 1.4 : 1) * (explosive ? 1.45 : 1), .35, 4.0);
  const volatilityBoost = 1 + (rawVolatilityBoost - 1) * scopeWeight;
  const volumeBoost = 1 + (rawVolumeBoost - 1) * scopeWeight;
  const sign = nature === 'positive' ? 1 : nature === 'negative' ? -1 : 0;
  const fairStyle = [REACTION_STYLE.FADE, REACTION_STYLE.WHIPSAW].includes(style) ? .28 : style === REACTION_STYLE.MUTED ? .35 : 1;
  const fairCenter = sign * Math.min(.18, Math.max(Math.abs(center), .004) * Math.min(2.8, strength) * fairStyle) * scopeWeight;
  return { relevant:true, direct, nature, strength, style, explosive, volatilityBoost, volumeBoost, fairCenter, severity, profile, scopeWeight };
}

const technicalConfig = rarity => MARKET_CONFIG.technical[rarity] ?? MARKET_CONFIG.technical.normal;
const technicalProgress = card => card.tech?.[2] > 0 ? clamp(card.tech[1] / card.tech[2], 0, 1) : 1;
const patternBreakoutAt = pattern => {
  if ([TECH_PATTERN.BULL_FLAG, TECH_PATTERN.BEAR_FLAG].includes(pattern)) return .12;
  if ([TECH_PATTERN.BREAKOUT_RETEST, TECH_PATTERN.BREAKDOWN_RETEST].includes(pattern)) return .38;
  if ([TECH_PATTERN.DOUBLE_BOTTOM, TECH_PATTERN.DOUBLE_TOP].includes(pattern)) return .78;
  if ([TECH_PATTERN.ASCENDING_TRIANGLE, TECH_PATTERN.DESCENDING_TRIANGLE].includes(pattern)) return .82;
  return 1;
};

function patternValue(pattern, progress) {
  const points = TECH_PATTERN_POINTS[pattern] ?? TECH_PATTERN_POINTS[TECH_PATTERN.RANGE];
  for (let i = 1; i < points.length; i++) {
    const [rightT, rightV] = points[i];
    if (progress <= rightT) {
      const [leftT, leftV] = points[i - 1];
      const span = rightT - leftT || 1;
      const t = clamp((progress - leftT) / span, 0, 1);
      return leftV + (rightV - leftV) * t;
    }
  }
  return points.at(-1)[1];
}

function pickPatternForNature(nature, random) {
  const roll = random();
  if (nature === 'positive') {
    if (roll < .30) return TECH_PATTERN.BREAKOUT_RETEST;
    if (roll < .55) return TECH_PATTERN.BULL_FLAG;
    if (roll < .80) return TECH_PATTERN.ASCENDING_TRIANGLE;
    return TECH_PATTERN.DOUBLE_BOTTOM;
  }
  if (nature === 'negative') {
    if (roll < .30) return TECH_PATTERN.BREAKDOWN_RETEST;
    if (roll < .55) return TECH_PATTERN.BEAR_FLAG;
    if (roll < .80) return TECH_PATTERN.DESCENDING_TRIANGLE;
    return TECH_PATTERN.DOUBLE_TOP;
  }
  return TECH_PATTERN.RANGE;
}

function pickPatternForReaction(signal, random) {
  if (!signal?.relevant || signal.nature === 'neutral') return signal?.style === REACTION_STYLE.WHIPSAW ? TECH_PATTERN.WHIPSAW : TECH_PATTERN.RANGE;
  if (signal.nature === 'positive') {
    if (signal.explosive) return random() < .62 ? TECH_PATTERN.PARABOLIC_SURGE : TECH_PATTERN.GAP_UP_RUN;
    if (signal.style === REACTION_STYLE.FADE) return random() < .58 ? TECH_PATTERN.SPIKE_FADE : TECH_PATTERN.FALSE_BREAKOUT;
    if (signal.style === REACTION_STYLE.WHIPSAW) return TECH_PATTERN.WHIPSAW;
    if (signal.style === REACTION_STYLE.MUTED) return random() < .65 ? TECH_PATTERN.RANGE : TECH_PATTERN.ASCENDING_TRIANGLE;
    if (signal.style === REACTION_STYLE.OVERREACT && signal.strength > 1.45) return random() < .55 ? TECH_PATTERN.GAP_UP_RUN : TECH_PATTERN.BULL_FLAG;
    return pickPatternForNature('positive', random);
  }
  if (signal.explosive) return TECH_PATTERN.PANIC_SELL;
  if (signal.style === REACTION_STYLE.FADE) return random() < .58 ? TECH_PATTERN.GAP_DOWN_RECOVERY : TECH_PATTERN.V_REVERSAL;
  if (signal.style === REACTION_STYLE.WHIPSAW) return TECH_PATTERN.WHIPSAW;
  if (signal.style === REACTION_STYLE.MUTED) return random() < .65 ? TECH_PATTERN.RANGE : TECH_PATTERN.DESCENDING_TRIANGLE;
  if (signal.style === REACTION_STYLE.OVERREACT && signal.strength > 1.45) return random() < .58 ? TECH_PATTERN.PANIC_SELL : TECH_PATTERN.DEAD_CAT_BOUNCE;
  const roll = random();
  if (roll < .18) return TECH_PATTERN.DEAD_CAT_BOUNCE;
  if (roll < .34) return TECH_PATTERN.FALSE_BREAKDOWN;
  return pickPatternForNature('negative', random);
}

const EVENT_FREE_PATTERNS = new Set([
  TECH_PATTERN.PARABOLIC_SURGE, TECH_PATTERN.GAP_UP_RUN, TECH_PATTERN.SPIKE_FADE, TECH_PATTERN.PANIC_SELL,
  TECH_PATTERN.GAP_DOWN_RECOVERY, TECH_PATTERN.V_REVERSAL, TECH_PATTERN.FALSE_BREAKOUT, TECH_PATTERN.FALSE_BREAKDOWN,
  TECH_PATTERN.DEAD_CAT_BOUNCE, TECH_PATTERN.WHIPSAW,
]);
const bullishEventPattern = pattern => [TECH_PATTERN.PARABOLIC_SURGE, TECH_PATTERN.GAP_UP_RUN, TECH_PATTERN.SPIKE_FADE, TECH_PATTERN.FALSE_BREAKOUT].includes(pattern);
const bearishEventPattern = pattern => [TECH_PATTERN.PANIC_SELL, TECH_PATTERN.GAP_DOWN_RECOVERY, TECH_PATTERN.V_REVERSAL, TECH_PATTERN.FALSE_BREAKDOWN, TECH_PATTERN.DEAD_CAT_BOUNCE].includes(pattern);
const eventPatternBoost = pattern => pattern === TECH_PATTERN.PARABOLIC_SURGE ? 2.20
  : pattern === TECH_PATTERN.GAP_UP_RUN ? 1.72
    : pattern === TECH_PATTERN.PANIC_SELL ? 1.85
      : [TECH_PATTERN.SPIKE_FADE, TECH_PATTERN.GAP_DOWN_RECOVERY, TECH_PATTERN.V_REVERSAL, TECH_PATTERN.DEAD_CAT_BOUNCE].includes(pattern) ? 1.55
        : [TECH_PATTERN.FALSE_BREAKOUT, TECH_PATTERN.FALSE_BREAKDOWN, TECH_PATTERN.WHIPSAW].includes(pattern) ? 1.38 : 1;

function defaultPatternForMarket(market, rarity, random) {
  const overall = market?.overall?.state ?? 'NORMAL';
  const sector = market?.sectors?.[rarity]?.state ?? 'NORMAL';
  const roll = random();
  if ((overall === 'BULL' || sector === 'BULL') && roll < .38) return TECH_PATTERN.ASCENDING_TRIANGLE;
  if ((overall === 'BEAR' || sector === 'BEAR') && roll < .38) return TECH_PATTERN.DESCENDING_TRIANGLE;
  if (roll < .12) return random() < .5 ? TECH_PATTERN.DOUBLE_BOTTOM : TECH_PATTERN.DOUBLE_TOP;
  return TECH_PATTERN.RANGE;
}

function startTechnicalPattern(card, pattern, random, strength = 0, newsDriven = false) {
  const config = technicalConfig(card.rarity);
  let duration = integer(config.duration[0], config.duration[1], random);
  if (newsDriven) duration = Math.max(10, Math.round(duration * between(.62, .92, random)));
  const neutral = pattern === TECH_PATTERN.RANGE;
  const baseAmplitude = between(config.amplitude[0], config.amplitude[1], random);
  let amplitude = baseAmplitude * (neutral ? .68 : 1 + clamp(strength, 0, 4.5) * .34) * eventPatternBoost(pattern);
  const eventCap = bullishEventPattern(pattern) ? config.eventMaxAmplitude
    : bearishEventPattern(pattern) ? config.eventMaxDownAmplitude
      : pattern === TECH_PATTERN.WHIPSAW ? Math.max(config.maxAmplitude, config.eventMaxDownAmplitude * .72)
        : config.maxAmplitude;
  amplitude = clamp(amplitude, .01, eventCap ?? config.maxAmplitude);
  const baseBlend = newsDriven ? 0 : .18;
  const basePrice = price(card.currentPrice * (1 - baseBlend) + card.fairPrice * baseBlend);
  card.tech = [pattern, 0, duration, basePrice, amplitude, newsDriven ? Math.max(7, Math.round(duration * .58)) : 0];
  return card.tech;
}

function ensureTechnicalState(card, random = null) {
  const valid = Array.isArray(card?.tech) && card.tech.length === 6
    && Number.isInteger(card.tech[0]) && card.tech[0] >= 0 && card.tech[0] < TECH_PATTERN_LABELS.length
    && Number.isInteger(card.tech[1]) && card.tech[1] >= 0
    && Number.isInteger(card.tech[2]) && card.tech[2] >= 8 && card.tech[2] <= 120
    && Number.isFinite(card.tech[3]) && card.tech[3] >= 1
    && Number.isFinite(card.tech[4]) && card.tech[4] > 0 && card.tech[4] <= 1.5
    && Number.isInteger(card.tech[5]) && card.tech[5] >= 0 && card.tech[5] <= 120;
  if (valid) return card.tech;
  const seeded = random ?? seededCardRandom(card?.cardId ?? 1);
  return startTechnicalPattern(card, TECH_PATTERN.RANGE, seeded, 0, false);
}

function technicalNewsSignal(news, pokemon, effect) {
  return marketReactionSignal(news, pokemon, effect);
}

export function technicalLevels(card) {
  if (!card?.tech) return null;
  const t = card.tech, progress = technicalProgress(card);
  const pattern = t[0], base = Math.max(1, t[3]), amp = clamp(t[4], .001, 1.5);
  let support = base * (1 - amp * .48);
  let resistance = base * (1 + amp * .48);
  const bullish = [TECH_PATTERN.ASCENDING_TRIANGLE, TECH_PATTERN.BULL_FLAG, TECH_PATTERN.DOUBLE_BOTTOM, TECH_PATTERN.BREAKOUT_RETEST].includes(pattern);
  const bearish = [TECH_PATTERN.DESCENDING_TRIANGLE, TECH_PATTERN.BEAR_FLAG, TECH_PATTERN.DOUBLE_TOP, TECH_PATTERN.BREAKDOWN_RETEST].includes(pattern);
  if (pattern === TECH_PATTERN.ASCENDING_TRIANGLE) support = base * (1 - amp * Math.max(.06, .38 * (1 - progress)));
  if (pattern === TECH_PATTERN.DESCENDING_TRIANGLE) resistance = base * (1 + amp * Math.max(.06, .38 * (1 - progress)));
  if (pattern === TECH_PATTERN.DOUBLE_BOTTOM) { support = base * (1 - amp * .76); resistance = base * (1 + amp * .30); }
  if (pattern === TECH_PATTERN.DOUBLE_TOP) { support = base * (1 - amp * .30); resistance = base * (1 + amp * .76); }
  const breakoutAt = patternBreakoutAt(pattern);
  if (bullish && progress >= breakoutAt) { support = Math.max(support, base * (1 + amp * .48)); resistance = base * (1 + amp * 1.28); }
  if (bearish && progress >= breakoutAt) { resistance = Math.min(resistance, base * (1 - amp * .48)); support = base * (1 - amp * 1.28); }
  return {
    pattern: TECH_PATTERN_LABELS[pattern] ?? TECH_PATTERN_LABELS[0], patternCode: pattern, progress,
    support: price(Math.max(1, support)), resistance: price(Math.max(1, resistance)),
  };
}

function technicalTarget(card) {
  const t = ensureTechnicalState(card);
  const progress = technicalProgress(card);
  const shape = patternValue(t[0], progress);
  // 패턴의 상대 움직임 + 장기 공정가치의 완만한 이동을 함께 반영한다.
  const patternPrice = t[3] * (1 + t[4] * shape);
  const fairBlend = (card.fairPrice - t[3]) * progress * .30;
  return price(Math.max(1, patternPrice + fairBlend));
}

function applySupportResistance(card, target) {
  const levels = technicalLevels(card);
  if (!levels) return target;
  const p = card.tech[0], progress = levels.progress;
  // 갭·패닉·뉴스매도 같은 이벤트 패턴은 지지/저항을 순간적으로 무시할 수 있어야 실제 급등락이 나온다.
  if (EVENT_FREE_PATTERNS.has(p)) return target;
  const breakoutAt = patternBreakoutAt(p);
  const bullishBreakout = [TECH_PATTERN.ASCENDING_TRIANGLE, TECH_PATTERN.BULL_FLAG, TECH_PATTERN.DOUBLE_BOTTOM, TECH_PATTERN.BREAKOUT_RETEST].includes(p) && progress >= breakoutAt;
  const bearishBreakout = [TECH_PATTERN.DESCENDING_TRIANGLE, TECH_PATTERN.BEAR_FLAG, TECH_PATTERN.DOUBLE_TOP, TECH_PATTERN.BREAKDOWN_RETEST].includes(p) && progress >= breakoutAt;
  let adjusted = target;
  if (!bullishBreakout && adjusted > levels.resistance) adjusted = levels.resistance;
  if (!bearishBreakout && adjusted < levels.support) adjusted = levels.support;
  return adjusted;
}

function maybeStartTechnicalPattern(card, pokemon, market, effect, random) {
  ensureTechnicalState(card, random);
  if (card.tech[5] > 0) card.tech[5]--;
  const signal = technicalNewsSignal(market.activeNews, pokemon, effect);
  const completed = card.tech[1] >= card.tech[2];
  if (signal.relevant && (signal.direct || card.tech[5] <= 0)) {
    startTechnicalPattern(card, pickPatternForReaction(signal, random), random, signal.strength, true);
    return signal;
  }
  const config = MARKET_CONFIG.grades[card.rarity];
  if (!signal.relevant && card.tech[5] <= 0 && card.tech[1] >= Math.floor(card.tech[2] * .35) && random() < config.shockChance) {
    const profile = marketReactionProfile(pokemon);
    const marketBias = STATE_BIAS[market.overall.state] + STATE_BIAS[market.sectors[card.rarity].state] * .7;
    const up = random() < clamp(.52 + marketBias * profile.marketBeta * 20, .20, .80);
    const tail = random() < .10 * profile.jumpBeta;
    const pattern = tail ? (up ? TECH_PATTERN.PARABOLIC_SURGE : TECH_PATTERN.PANIC_SELL)
      : (up ? TECH_PATTERN.BREAKOUT_RETEST : TECH_PATTERN.BREAKDOWN_RETEST);
    const synthetic = { relevant:true, direct:false, nature:up ? 'positive' : 'negative', strength:tail ? 2.2 : 1.2,
      style:tail ? REACTION_STYLE.OVERREACT : REACTION_STYLE.FOLLOW, explosive:tail,
      volatilityBoost:profile.volatilityBeta * (tail ? 1.8 : 1.15), volumeBoost:profile.volumeBeta * (tail ? 1.8 : 1.15),
      fairCenter:0, severity:{ score:tail ? 1.7 : .9, tier:tail ? 'extreme' : 'normal' }, profile };
    startTechnicalPattern(card, pattern, random, synthetic.strength, true);
    return synthetic;
  }
  if (completed) startTechnicalPattern(card, defaultPatternForMarket(market, card.rarity, random), random, 0, false);
  return signal;
}

function updateTechnicalFairPrice(card, marketBias, newsCenter) {
  const config = technicalConfig(card.rarity);
  const regimeDrift = marketBias * config.regimeInfluence;
  const newsDrift = clamp(newsCenter, -.12, .12) * config.newsInfluence;
  const growth = config.growth + regimeDrift + newsDrift;
  const floor = Math.max(1, card.startingPrice * .25);
  card.fairPrice = price(clamp(card.fairPrice * (1 + growth), floor, 1e12));
}

const hourMs = MARKET_CONFIG.tickMs * 6;
const longHistoryMs = hourMs * 6; // 6시간 간격, 최대 30일(120개)
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
    c.priceHistory = buffer(); c.hourlyHistory = buffer(); c.longHistory = buffer();
    c.highestPrice = c.lowestPrice = c.averagePrice = old[0]; c.sampleCount = 0;
    for (let i = 0; i < old.length; i++) {
      const value = old[i], time = market.lastMarketUpdate - (old.length - 1 - i) * MARKET_CONFIG.tickMs;
      updateStats(c, value);
      if (i < old.length - 1 && i >= old.length - 1 - MARKET_CONFIG.historyLimit) append(c.priceHistory, value, MARKET_CONFIG.historyLimit);
      if (time > market.lastMarketUpdate - 7 * 24 * hourMs
        && Math.floor(time / hourMs) > Math.floor((time - MARKET_CONFIG.tickMs) / hourMs)) append(c.hourlyHistory, value, MARKET_CONFIG.hourlyHistoryLimit);
      if (time > market.lastMarketUpdate - 30 * 24 * hourMs
        && Math.floor(time / longHistoryMs) > Math.floor((time - MARKET_CONFIG.tickMs) / longHistoryMs)) append(c.longHistory, value, MARKET_CONFIG.longHistoryLimit);
    }
  }
  return market;
}

function historyBufferShapeOK(history, limit) {
  return history && Array.isArray(history.values) && Number.isInteger(history.count)
    && history.count >= 0 && history.count <= limit && history.values.length === history.count
    && Number.isInteger(history.head) && history.head >= 0 && history.head < limit
    && (history.count === limit || history.head === history.count);
}

function orderedHistoryValues(history) {
  return Array.from({ length: history?.count ?? 0 }, (_, i) => previous(history, history.count - i));
}

function alignedHistoryEnd(lastUpdate, step) {
  const phase = lastUpdate % MARKET_CONFIG.tickMs;
  return Math.floor((lastUpdate - phase) / step) * step + phase;
}

function timedHistory(history, step, end) {
  const values = orderedHistoryValues(history);
  const times = values.map((_, i) => end - (values.length - 1 - i) * step);
  return { values, times };
}

function seedLongHistoryFromHourly(card, lastUpdate) {
  card.longHistory = buffer();
  if (!Number.isFinite(lastUpdate) || !historyBufferShapeOK(card.hourlyHistory, MARKET_CONFIG.hourlyHistoryLimit) || !card.hourlyHistory.count) return;
  const hourlyEnd = alignedHistoryEnd(lastUpdate, hourMs);
  const hourly = timedHistory(card.hourlyHistory, hourMs, hourlyEnd);
  for (let i = 0; i < hourly.values.length; i++) {
    const time = hourly.times[i];
    if (Math.floor(time / longHistoryMs) > Math.floor((time - hourMs) / longHistoryMs)) {
      append(card.longHistory, hourly.values[i], MARKET_CONFIG.longHistoryLimit);
    }
  }
}

function ensureLongHistory(card, lastUpdate) {
  if (historyBufferShapeOK(card.longHistory, MARKET_CONFIG.longHistoryLimit)) return;
  seedLongHistoryFromHourly(card, lastUpdate);
}

export function priceHistory(card, lastUpdate, period = '24H') {
  if (period === '7D') {
    const end = alignedHistoryEnd(lastUpdate, hourMs);
    const history = timedHistory(card.hourlyHistory, hourMs, end);
    if (!history.values.length) return { values: [card.currentPrice], times: [lastUpdate], start: lastUpdate, end: lastUpdate };
    return { values: history.values, times: history.times, start: history.times[0], end: history.times.at(-1) };
  }

  if (period === 'ALL') {
    const hourly = timedHistory(card.hourlyHistory, hourMs, alignedHistoryEnd(lastUpdate, hourMs));
    const long = timedHistory(card.longHistory, longHistoryMs, alignedHistoryEnd(lastUpdate, longHistoryMs));
    const hourlyStart = hourly.times[0] ?? Infinity;
    const values = [], times = [];

    // 최근 7일은 1시간 데이터가 더 정밀하므로, 6시간 데이터와 겹치는 구간은 제외한다.
    for (let i = 0; i < long.values.length; i++) {
      if (long.times[i] >= hourlyStart) continue;
      values.push(long.values[i]); times.push(long.times[i]);
    }
    values.push(...hourly.values); times.push(...hourly.times);

    if (!values.length) return { values: [card.currentPrice], times: [lastUpdate], start: lastUpdate, end: lastUpdate };
    return { values, times, start: times[0], end: times.at(-1) };
  }

  const count = Math.min(card.priceHistory.count, { '1H': 6, '6H': 36, '24H': 144 }[period] ?? 144);
  const values = Array.from({ length: count }, (_, i) => previous(card.priceHistory, count - i));
  values.push(card.currentPrice);
  const start = lastUpdate - (values.length - 1) * MARKET_CONFIG.tickMs;
  const times = values.map((_, i) => start + i * MARKET_CONFIG.tickMs);
  return { values, times, start, end: lastUpdate };
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
      const card = { cardId: p.id, rarity: grade, startingPrice, fairPrice: startingPrice,
        recoveryBasePrice: startingPrice, currentPrice: startingPrice, volatility: config.volatility, trend: 0,
        trendStrength: 0, trendRemaining: 0, momentum: 0, trade24h: tradeBuffer(), priceHistory: buffer(), hourlyHistory: buffer(), longHistory: buffer(),
        highestPrice: startingPrice, lowestPrice: startingPrice, averagePrice: startingPrice, sampleCount: 1 };
      startTechnicalPattern(card, TECH_PATTERN.RANGE, random, 0, false);
      cards[p.id] = card;
    }
  }
  return { cards, trade24h: { head: 0, count: 0 }, overall: regime(random), sectors, lastMarketUpdate: now, activeNews: [], newsHistory: [],
    newsStory: emptyNewsStory(), newsTypeCycle: createNewsTypeCycle(), worldNewsState: createWorldNewsState() };
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
  const technicalOK = tech => Array.isArray(tech) && tech.length === 6
    && Number.isInteger(tech[0]) && tech[0] >= 0 && tech[0] < TECH_PATTERN_LABELS.length
    && Number.isInteger(tech[1]) && tech[1] >= 0 && tech[1] <= 120
    && Number.isInteger(tech[2]) && tech[2] >= 8 && tech[2] <= 120
    && Number.isFinite(tech[3]) && tech[3] >= 1 && tech[3] <= 1e12
    && Number.isFinite(tech[4]) && tech[4] > 0 && tech[4] <= 1.5
    && Number.isInteger(tech[5]) && tech[5] >= 0 && tech[5] <= 120;
  const newsOK = n => n && typeof n.id === 'string' && typeof n.title === 'string'
    && ['type', 'card'].includes(n.target)
    && NEWS_NATURES.includes(n.nature) && NEWS_FOCUSES.includes(n.focus)
    && (n.target !== 'card' || records.some(p => p.id === n.cardId))
    && typeOK(n.type ?? null) && typeOK(n.opposedType ?? null)
    && ['continue', 'fresh'].includes(n.transition)
    && Number.isFinite(n.impact) && n.impact >= 0 && n.impact <= .5
    && Number.isFinite(n.secondaryImpact) && n.secondaryImpact >= 0 && n.secondaryImpact <= .5
    && Number.isFinite(n.time);
  const typeCycle = market?.newsTypeCycle;
  const typeCycleOK = typeCycle && Array.isArray(typeCycle.remaining)
    && typeCycle.remaining.every(type => Object.hasOwn(TYPES, type))
    && new Set(typeCycle.remaining).size === typeCycle.remaining.length
    && (typeCycle.lastType === null || Object.hasOwn(TYPES, typeCycle.lastType))
    && Number.isInteger(typeCycle.streak) && typeCycle.streak >= 0 && typeCycle.streak <= TYPE_STREAK_HARD_LIMIT
    && Number.isSafeInteger(typeCycle.cycle) && typeCycle.cycle >= 0;
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
    && typeCycleOK && storyOK
    && Array.isArray(market.activeNews) && market.activeNews.length <= 1 && market.activeNews.every(newsOK)
    && Array.isArray(market.newsHistory) && market.newsHistory.length <= MARKET_CONFIG.newsLimit && market.newsHistory.every(newsOK)
    && records.every(p => {
      const c = market.cards?.[p.id];
      return c && c.cardId === p.id && c.rarity === p.grade
        && [c.startingPrice, c.fairPrice, c.recoveryBasePrice, c.currentPrice].every(positive)
        && c.recoveryBasePrice >= c.startingPrice
        && shockRecoveryOK(c.shockRecovery ?? null, c.rarity)
        && technicalOK(c.tech)
        && Number.isFinite(c.volatility) && c.volatility > 0 && c.volatility <= .1
        && [-1, 0, 1].includes(c.trend) && Number.isFinite(c.trendStrength) && c.trendStrength >= 0 && c.trendStrength <= .004
        && Number.isInteger(c.trendRemaining) && c.trendRemaining >= 0 && c.trendRemaining <= 18
        && Number.isFinite(c.momentum) && Math.abs(c.momentum) <= .08
        && bufferOK(c.priceHistory, MARKET_CONFIG.historyLimit) && bufferOK(c.hourlyHistory, MARKET_CONFIG.hourlyHistoryLimit)
        && bufferOK(c.longHistory, MARKET_CONFIG.longHistoryLimit)
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

function createNewsTypeCycle() {
  return { remaining: [...TYPE_KEYS], lastType: null, streak: 0, cycle: 0 };
}

function ensureNewsTypeCycle(market) {
  const state = market?.newsTypeCycle;
  const valid = state && Array.isArray(state.remaining)
    && state.remaining.every(type => TYPE_KEYS.includes(type))
    && new Set(state.remaining).size === state.remaining.length
    && (state.lastType === null || TYPE_KEYS.includes(state.lastType))
    && Number.isInteger(state.streak) && state.streak >= 0 && state.streak <= TYPE_STREAK_HARD_LIMIT
    && Number.isSafeInteger(state.cycle) && state.cycle >= 0;
  if (!valid) {
    const lastType = TYPE_KEYS.includes(market?.newsHistory?.[0]?.type) ? market.newsHistory[0].type : null;
    market.newsTypeCycle = createNewsTypeCycle();
    market.newsTypeCycle.lastType = lastType;
    if (lastType) {
      market.newsTypeCycle.remaining = TYPE_KEYS.filter(type => type !== lastType);
      market.newsTypeCycle.streak = 1;
    }
  }
  return market.newsTypeCycle;
}

export function chooseRotatingNewsType(market, preferredType, candidateTypes = TYPE_KEYS, random = Math.random) {
  const state = ensureNewsTypeCycle(market);
  if (!state.remaining.length) {
    state.remaining = [...TYPE_KEYS];
    state.cycle++;
  }
  let eligible = [...new Set((Array.isArray(candidateTypes) ? candidateTypes : TYPE_KEYS).filter(type => TYPE_KEYS.includes(type)))];
  if (!eligible.length) eligible = [...TYPE_KEYS];

  // 장소 뉴스는 해당 장소에 어울리는 후보 타입을 우선 유지한다. 그 안에서 아직 이번 순환에
  // 나오지 않은 타입을 먼저 고르고, 큰 지역/일반 뉴스가 남은 타입을 채우며 18개 순환을 완성한다.
  let pool = eligible.filter(type => state.remaining.includes(type));
  if (!pool.length) pool = [...eligible];

  // 같은 타입이 10 Tick 연속으로 진입하지 못하도록 10번째 전에 강제로 다른 타입을 고른다.
  if (state.lastType && state.streak >= TYPE_STREAK_HARD_LIMIT) {
    const alternatives = pool.filter(type => type !== state.lastType);
    if (alternatives.length) pool = alternatives;
    else {
      const globalAlternatives = TYPE_KEYS.filter(type => type !== state.lastType && state.remaining.includes(type));
      if (globalAlternatives.length) pool = globalAlternatives;
    }
  } else if (state.lastType && pool.length > 1) {
    // 순환 중에는 가능한 경우 바로 같은 타입을 반복하지 않는다.
    const alternatives = pool.filter(type => type !== state.lastType);
    if (alternatives.length) pool = alternatives;
  }

  let chosen = pool.includes(preferredType) ? preferredType : choose(pool, random);
  if (!chosen) chosen = TYPE_KEYS.includes(preferredType) ? preferredType : choose(TYPE_KEYS, random);

  const index = state.remaining.indexOf(chosen);
  if (index >= 0) state.remaining.splice(index, 1);
  if (chosen === state.lastType) state.streak++;
  else { state.lastType = chosen; state.streak = 1; }
  return chosen;
}
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
  migrateWorldNewsState(market);

  // 기존 v4 저장에는 recoveryBasePrice가 없으므로 시장 가격을 초기화하지 않고 보완한다.
  // 과거 시장이 이미 성장한 경우 fairPrice를 참고하되 startingPrice보다 낮아지지는 않는다.
  for (const c of Object.values(market.cards)) {
    if (!c || typeof c !== 'object') continue;
    ensureLongHistory(c, market.lastMarketUpdate);
    if (!Number.isFinite(c.recoveryBasePrice) || c.recoveryBasePrice < 1) {
      const starting = Number.isFinite(c.startingPrice) && c.startingPrice > 0 ? c.startingPrice : 1;
      const fair = Number.isFinite(c.fairPrice) && c.fairPrice > 0 ? c.fairPrice : starting;
      c.recoveryBasePrice = price(Math.max(starting, fair));
    }
    // v35부터 단일 Tick Shock 대신 기술적 패턴 엔진을 사용하므로 이전 Shock 복원 상태는 제거한다.
    delete c.shockRecovery;
    ensureTechnicalState(c);
  }

  ensureNewsTypeCycle(market);

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

  // 세계관 DB가 로드되어 있으면 StoryArc 진행 상황을 우선 사용한다.
  // 진행 상태는 market.worldNewsState에 저장되므로 새로고침/오프라인 진행 후에도 후속 뉴스가 이어진다.
  const typeSelector = (preferredType, candidateTypes) => chooseRotatingNewsType(market, preferredType, candidateTypes, random);
  const worldStory = generateWorldStoryNews(market, records, time, random, MARKET_CONFIG.tickMs, typeSelector);
  if (worldStory) {
    const nature = worldStory.nature;
    const type = Object.hasOwn(TYPES, worldStory.type) ? worldStory.type : choose(TYPE_KEYS, random);
    const card = worldStory.directCardId ? records.find(p => p.id === worldStory.directCardId) ?? null : null;
    const focus = card ? 'card' : 'story';
    const target = card ? 'card' : 'type';
    const opposedPool = relatedTypes(type, nature);
    const opposedType = choose(opposedPool, random);
    const mainRange = nature === 'neutral' ? [0, 0] : NEWS_CONFIG.price[nature].story;
    const opposedRange = nature === 'neutral' ? [0, 0] : NEWS_CONFIG.price[nature].opposed;
    const impact = Math.max(Math.abs(mainRange[0]), Math.abs(mainRange[1]), NEWS_CONFIG.activity[nature]);
    const secondaryImpact = Math.max(Math.abs(opposedRange[0]), Math.abs(opposedRange[1]));
    const previousType = market.newsStory?.type ?? null;
    const news = {
      id: `world-${worldStory.storyId}-${worldStory.storyStage}-${worldStory.worldSequence}-${time}`,
      nature, focus, target, cardId: card?.id ?? null, type, opposedType,
      transition: worldStory.isFollowUp ? 'continue' : 'fresh', impact, secondaryImpact, time,
      generation: worldStory.generation, regionId: worldStory.regionId, regionName: worldStory.regionName,
      storyId: worldStory.storyId, storyRunId: worldStory.storyRunId, storyName: worldStory.storyName, storyStage: worldStory.storyStage,
      storyStageCount: worldStory.storyStageCount, storyEventId: worldStory.storyEventId,
      worldStory: true, isFollowUp: worldStory.isFollowUp, isInterlude: worldStory.isInterlude === true, description: worldStory.description,
      scopeKind: worldStory.scopeKind ?? 'broad', scopePlaces: worldStory.scopePlaces ?? [],
      residentPokemonDexIds: worldStory.residentPokemonDexIds ?? [], cooldownTicks: worldStory.cooldownTicks ?? null, cooldownClass: worldStory.cooldownClass ?? null,
      sixW: worldStory.sixW,
    };
    news.title = worldStory.title;

    market.newsStory = {
      type, previousType, nature, opposedType, pokemonId: card?.id ?? null,
      streak: worldStory.isFollowUp ? (market.newsStory?.streak ?? 0) + 1 : 1,
    };
    market.activeNews.push(news);
    market.newsHistory.unshift({ ...news });
    market.newsHistory = market.newsHistory.slice(0, MARKET_CONFIG.newsLimit);
    return news;
  }

  const nature = rollNature(random);
  const proposedStory = nextStory(market.newsStory, random);
  const next = guardDirectReversal(nature, market.newsStory, proposedStory, random);
  next.type = chooseRotatingNewsType(market, next.type, TYPE_KEYS, random);
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

// 세계관 DB에서 만들어진 장소/스토리 뉴스는 그 사건의 세대에만 가격 영향을 준다.
// 일반 시장 뉴스(worldStory !== true)는 세대 제한 없이 기존처럼 전 세대에 적용한다.
// 과거 저장 호환을 위해 generation이 없는 오래된 세계관 뉴스는 기존 전역 동작을 유지한다.
export function newsScopeMultiplier(entry, pokemon) {
  if (!entry?.worldStory) return 1;
  if (entry.target === 'card' && entry.cardId === pokemon?.id) return 1;
  if (!Number.isInteger(entry.generation)) return 1;
  if (pokemon?.generation !== entry.generation) return 0;
  if (entry.scopeKind !== 'local') return 1;
  const residents = Array.isArray(entry.residentPokemonDexIds) ? entry.residentPokemonDexIds : [];
  return residents.includes(pokemon.id) ? 1 : LOCAL_NON_RESIDENT_IMPACT;
}

export function newsScopeMatchesPokemon(entry, pokemon) {
  return newsScopeMultiplier(entry, pokemon) > 0;
}

// 실제 포켓몬의 최종 상성 배율을 사용해 듀얼 타입까지 반영한다.
export function newsEffect(news, pokemon) {
  const effect = { min: 0, max: 0, activity: 0 };
  for (const n of news) {
    const scopeWeight = newsScopeMultiplier(n, pokemon);
    if (scopeWeight <= 0) continue;

    const named = n.target === 'card' && n.cardId === pokemon.id;
    const residents = Array.isArray(n.residentPokemonDexIds) ? n.residentPokemonDexIds : [];
    const localResident = n.worldStory === true && n.scopeKind === 'local' && residents.includes(pokemon.id);
    const storySector = pokemon.types.includes(n.type);
    const focusedOpposed = n.opposedType && pokemon.types.includes(n.opposedType);
    const scaleRange = (range, factor) => [range[0] * factor, range[1] * factor];

    if (n.nature === 'neutral') {
      const active = n.focus === 'story' ? storySector : n.focus === 'opposed' ? focusedOpposed : named;
      if (active) effect.activity += (NEWS_CONFIG.activity.neutral + (named ? NEWS_CONFIG.activity.card : 0)) * scopeWeight;
      else if (localResident) effect.activity += NEWS_CONFIG.activity.neutral * LOCAL_RESIDENT_SPILLOVER;
      continue;
    }

    const config = NEWS_CONFIG.price[n.nature];
    let related = false;
    if (storySector) {
      addEffect(effect, scaleRange(config.story, scopeWeight), NEWS_CONFIG.activity[n.nature] * scopeWeight);
      related = true;
    } else if (n.nature === 'positive' && typeMultiplier(n.type, pokemon.types) > 1) {
      addEffect(effect, scaleRange(config.opposed, scopeWeight), NEWS_CONFIG.activity[n.nature] * scopeWeight);
      related = true;
    } else if (n.nature === 'negative' && pokemon.types.some(type => TYPE_COUNTERS[n.type].includes(type))) {
      addEffect(effect, scaleRange(config.opposed, scopeWeight), NEWS_CONFIG.activity[n.nature] * scopeWeight);
      related = true;
    }

    // 세부 장소 뉴스에서는 명시적 서식 포켓몬이 핵심 대상이다.
    // 타입 상성이 직접 맞지 않아도 지역 전체 사건의 파급을 받아 중간 강도의 움직임이 생긴다.
    if (localResident && !related && !named) {
      addEffect(effect, scaleRange(config.story, LOCAL_RESIDENT_SPILLOVER), NEWS_CONFIG.activity[n.nature] * LOCAL_RESIDENT_SPILLOVER);
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
    const c = market.cards[p.id];
    const gradeConfig = technicalConfig(p.grade);
    const effect = newsEffect(market.activeNews, p);
    const marketBias = STATE_BIAS[market.overall.state] + STATE_BIAS[market.sectors[p.grade].state] * .7;

    // 1) 뉴스는 섹터 전체에 동일한 %를 강제하지 않는다. 포켓몬별 고정 베타 + 사건별 반응 스타일로 분산한다.
    const signal = maybeStartTechnicalPattern(c, p, market, effect, random);
    const profile = signal.profile ?? marketReactionProfile(p);

    // 2) 장기 공정가치도 종목별 market beta와 실제 반응 방향을 약하게 반영한다.
    updateTechnicalFairPrice(c, marketBias * profile.marketBeta, signal.fairCenter ?? 0);

    // 3) 패턴 목표를 따라가며, 평상시는 지지/저항을 사용하고 갭·패닉 이벤트만 순간적으로 이를 무시한다.
    let target = technicalTarget(c);
    target = applySupportResistance(c, target);
    const targetMove = target / Math.max(1, c.currentPrice) - 1;

    // 4) 이벤트 때 변동성 군집이 생기되, 동일 섹터 종목마다 volatility beta가 달라 같은 모양이 되지 않는다.
    const activity = effect.activity;
    const newsNoise = 1 + Math.min(activity, .5) * .45 + (signal.direct ? .25 : 0);
    const noise = (-1 + 2 * random()) * gradeConfig.noise * newsNoise * (signal.volatilityBoost ?? profile.volatilityBeta);
    let change = targetMove * gradeConfig.pull + noise;

    const pattern = c.tech[0];
    const eventUp = [TECH_PATTERN.PARABOLIC_SURGE, TECH_PATTERN.GAP_UP_RUN, TECH_PATTERN.SPIKE_FADE, TECH_PATTERN.FALSE_BREAKOUT, TECH_PATTERN.V_REVERSAL, TECH_PATTERN.GAP_DOWN_RECOVERY, TECH_PATTERN.WHIPSAW].includes(pattern);
    const eventDown = [TECH_PATTERN.PANIC_SELL, TECH_PATTERN.GAP_DOWN_RECOVERY, TECH_PATTERN.FALSE_BREAKDOWN, TECH_PATTERN.DEAD_CAT_BOUNCE, TECH_PATTERN.V_REVERSAL, TECH_PATTERN.SPIKE_FADE, TECH_PATTERN.WHIPSAW].includes(pattern);
    const upLimit = Math.min(.35, gradeConfig.maxStepUp * (eventUp ? gradeConfig.eventStepUp : 1));
    const downLimit = Math.min(.32, gradeConfig.maxStepDown * (eventDown ? gradeConfig.eventStepDown : 1));
    change = clamp(change, -downLimit, upLimit);

    const next = price(c.currentPrice * (1 + change));

    // legacy 필드는 저장 호환/기존 UI·검증을 위해 유지하되 새 가격 결정에는 사용하지 않는다.
    c.trend = change > .0001 ? 1 : change < -.0001 ? -1 : 0;
    c.trendStrength = clamp(Math.abs(change) * .04, 0, .004);
    c.trendRemaining = Math.max(0, Math.min(18, c.tech[2] - c.tech[1]));
    c.momentum = clamp(c.momentum * .70 + change * .30, -.08, .08);

    const oldQuote = recordTrades && market.trade24h.count === MARKET_CONFIG.historyLimit
      ? previous(c.priceHistory, MARKET_CONFIG.historyLimit - 1) : 0;
    append(c.priceHistory, c.currentPrice, MARKET_CONFIG.historyLimit);
    c.currentPrice = next;
    updateRecoveryBase(c, next);
    c.tech[1] = Math.min(120, c.tech[1] + 1);

    if (Math.floor(time / hourMs) > Math.floor(market.lastMarketUpdate / hourMs)) append(c.hourlyHistory, next, MARKET_CONFIG.hourlyHistoryLimit);
    if (Math.floor(time / longHistoryMs) > Math.floor(market.lastMarketUpdate / longHistoryMs)) append(c.longHistory, next, MARKET_CONFIG.longHistoryLimit);
    updateStats(c, next);

    if (recordTrades) {
      const oldVolume = c.trade24h.volumes[market.trade24h.head] ?? 0;
      trades.push({ c, id: p.id, quote: next, oldQuote, oldVolume, volume: newsTradeVolume(time, p.id, Math.min(1, activity * (signal.volumeBoost ?? profile.volumeBeta))) });
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
