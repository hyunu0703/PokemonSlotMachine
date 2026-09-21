import worldDatabaseSource from '../data/world/pokemon-world-db.json' with { type: 'json' };
import storyAreaDatabase from '../data/world/story-area-residents.json' with { type: 'json' };

// Pokémon 세계관 DB를 시장 뉴스용 장기 스토리로 변환한다.
// DB 자체는 data/world/pokemon-world-db.json에서 읽고, 시장 가격 계산은 market.js가 담당한다.

const MAX_ACTIVE_STORIES = 3;
const RECENT_ARC_LIMIT = 8;
const MAX_FOLLOWUP_TICKS = 5;
const FOLLOWUP_TICK_WEIGHTS = Object.freeze([
  Object.freeze({ ticks: 2, weight: .45 }),
  Object.freeze({ ticks: 3, weight: .35 }),
  Object.freeze({ ticks: 4, weight: .15 }),
  Object.freeze({ ticks: 5, weight: .05 }),
]);
const STORY_HISTORY_LIMIT = 160;
const STORY_STATE_VERSION = 3;
const RECENT_ROUTE_LIMIT = 18;
const ROUTE_NATURES = Object.freeze(['positive', 'neutral', 'negative']);

// 스토리 분기는 각 Stage를 독립 랜덤으로 돌리지 않는다.
// 한 번의 스토리 실행에서 초반(seed) -> 중간(branch) -> 결과(outcome) 3번만 결정해
// 가능한 조합을 최대 27개로 제한하면서도 반복 실행 때 다른 흐름이 나오도록 한다.
const ROUTE_WEIGHTS = Object.freeze({
  opening: Object.freeze({
    none: Object.freeze({ positive: .38, neutral: .34, negative: .28 }),
    positive: Object.freeze({ positive: .19, neutral: .46, negative: .35 }),
    neutral: Object.freeze({ positive: .43, neutral: .22, negative: .35 }),
    negative: Object.freeze({ positive: .49, neutral: .36, negative: .15 }),
  }),
  branch: Object.freeze({
    positive: Object.freeze({ positive: .52, neutral: .30, negative: .18 }),
    neutral: Object.freeze({ positive: .34, neutral: .38, negative: .28 }),
    negative: Object.freeze({ positive: .22, neutral: .33, negative: .45 }),
  }),
  outcome: Object.freeze({
    positive: Object.freeze({ positive: .50, neutral: .31, negative: .19 }),
    neutral: Object.freeze({ positive: .38, neutral: .37, negative: .25 }),
    negative: Object.freeze({ positive: .28, neutral: .33, negative: .39 }),
  }),
});
const DEFAULT_STORY_COOLDOWN_TICKS = Number(storyAreaDatabase?.policy?.ordinaryCooldownTicks) || 60;

let worldDatabase = worldDatabaseSource;

const TYPE_KEYS = Object.freeze([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]);

const TYPE_HINTS = Object.freeze({
  water: ['바다', '해양', '해저', '폭우', '해류', '호수', '물', '수중', '파도', '가이오가'],
  fire: ['화산', '불꽃', '고열', '용암', '햇빛', '불', '그란돈', '굴뚝산'],
  electric: ['전기', '발전소', '전력', '번개', '전기에너지'],
  grass: ['숲', '식생', '초원', '농업', '나무', '풀'],
  ice: ['얼음', '설산', '빙하', '눈', '동토'],
  fighting: ['격투', '무술', '도장', '챔피언전'],
  poison: ['독', '오염', '맹독'],
  ground: ['대지', '육지', '지각', '지면', '땅'],
  flying: ['하늘', '비행', '항공'],
  psychic: ['초능력', '정신', '시공', '시간', '공간', '우주', '염력'],
  bug: ['벌레', '곤충'],
  rock: ['암석', '바위', '광산', '화석', '운석'],
  ghost: ['유령', '영혼', '묘지', '괴현상'],
  dragon: ['용', '드래곤', '레쿠쟈', '디아루가', '펄기아'],
  dark: ['악의 조직', '범죄', '암흑', '어둠'],
  steel: ['금속', '강철', '공장', '기계', '산업'],
  fairy: ['요정', '생명', '제르네아스'],
  normal: ['일반'],
});

const POSITIVE_WORDS = [
  '안정', '해소', '회복', '재개', '출범', '성공', '진전', '발견', '확보', '봉쇄', '진정',
  '화해', '명예 회복', '철회', '종료', '개막', '복구', '보호', '구조', '정상화', '완료',
];
const NEGATIVE_WORDS = [
  '점거', '폭주', '위기', '이상', '침입', '납치', '실종', '재가동', '충돌', '강제', '범죄',
  '탈취', '붕괴', '위협', '폭우', '가뭄', '오염', '습격', '중단', '불안', '정지', '폭발', '혼란',
];
const DANGER_TAGS = new Set(['security', 'disaster', 'crime', 'weather', 'space-time', 'ultra-space']);
const POSITIVE_TAGS = new Set(['festival', 'competition', 'sports', 'tourism', 'culture', 'education']);

const safeArray = value => Array.isArray(value) ? value : [];
const choose = (items, random) => items.length ? items[Math.min(items.length - 1, Math.floor(random() * items.length))] : null;
const hashSeed = (...parts) => {
  const text = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) || 0x9e3779b9;
};
const createIndependentRandom = (...parts) => {
  let x = hashSeed(...parts);
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
};
const followupDelayTicks = (story, nextStageIndex) => {
  const random = createIndependentRandom('story-followup-timing', story?.runId ?? story?.arcId ?? 'story', nextStageIndex);
  let roll = random();
  for (const item of FOLLOWUP_TICK_WEIGHTS) {
    roll -= item.weight;
    if (roll <= 0) return item.ticks;
  }
  return MAX_FOLLOWUP_TICKS;
};
const sentence = text => {
  const value = String(text ?? '').trim();
  if (!value) return '';
  return /[.!?。]$/.test(value) ? value : `${value}.`;
};
const stripPeriod = text => String(text ?? '').trim().replace(/[.!?。]+$/, '');
const hasBatchim = text => {
  const value = String(text ?? '').trim();
  const code = value.charCodeAt(value.length - 1);
  return code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : false;
};
const particle = (text, batchim, noBatchim) => `${text}${hasBatchim(text) ? batchim : noBatchim}`;

export function setWorldNewsDatabase(database) {
  worldDatabase = database && Array.isArray(database.generations) ? database : null;
  return worldDatabase;
}

export function preloadWorldNewsDatabase() {
  return Promise.resolve(worldDatabase);
}

export function worldNewsReady() {
  return !!worldDatabase;
}

export function createWorldNewsState() {
  return {
    version: STORY_STATE_VERSION,
    sequence: 0,
    activeStories: [],
    recentArcIds: [],
    recentRoutes: [],
    storyCooldowns: {},
    storyHistory: [],
  };
}

export function migrateWorldNewsState(market) {
  if (!market || typeof market !== 'object') return null;
  const state = market.worldNewsState;
  const compatible = state && ([1, 2, STORY_STATE_VERSION].includes(state.version))
    && Array.isArray(state.activeStories) && Array.isArray(state.recentArcIds);
  if (!compatible) {
    market.worldNewsState = createWorldNewsState();
  } else {
    state.version = STORY_STATE_VERSION;
    state.sequence = Number.isSafeInteger(state.sequence) && state.sequence >= 0 ? state.sequence : 0;
    state.activeStories = state.activeStories.filter(item => item && typeof item.arcId === 'string'
      && Number.isInteger(item.stageIndex) && item.stageIndex >= 0
      && Number.isFinite(item.nextDueTime));
    for (const story of state.activeStories) {
      if (typeof story.runId !== 'string' || !story.runId) story.runId = `${story.arcId}-${Number.isFinite(story.startedAt) ? story.startedAt : 0}`;
      if (typeof story.lastType !== 'string' || !TYPE_KEYS.includes(story.lastType)) story.lastType = null;
      if (!ROUTE_NATURES.includes(story.seedNature)) story.seedNature = null;
      if (!ROUTE_NATURES.includes(story.branchNature)) story.branchNature = null;
      if (!ROUTE_NATURES.includes(story.outcomeNature)) story.outcomeNature = null;
      if (!ROUTE_NATURES.includes(story.lastNature)) story.lastNature = null;
    }
    state.recentArcIds = state.recentArcIds.filter(id => typeof id === 'string').slice(0, RECENT_ARC_LIMIT);
    if (!Array.isArray(state.recentRoutes)) state.recentRoutes = [];
    state.recentRoutes = state.recentRoutes.filter(route => route && typeof route.arcId === 'string'
      && ROUTE_NATURES.includes(route.seedNature)
      && ROUTE_NATURES.includes(route.branchNature)
      && ROUTE_NATURES.includes(route.outcomeNature))
      .slice(0, RECENT_ROUTE_LIMIT);
    if (!state.storyCooldowns || typeof state.storyCooldowns !== 'object' || Array.isArray(state.storyCooldowns)) state.storyCooldowns = {};
    state.storyCooldowns = Object.fromEntries(Object.entries(state.storyCooldowns)
      .filter(([id, until]) => typeof id === 'string' && Number.isFinite(until) && until >= 0));
    if (!Array.isArray(state.storyHistory)) state.storyHistory = [];
    state.storyHistory = state.storyHistory.filter(item => item && typeof item.storyId === 'string'
      && Number.isInteger(item.storyStage) && item.storyStage >= 1
      && typeof item.title === 'string' && typeof item.description === 'string')
      .slice(-STORY_HISTORY_LIMIT);
  }
  return market.worldNewsState;
}

function generationEntry(generation) {
  return safeArray(worldDatabase?.generations).find(item => item.generation === generation) ?? null;
}

function arcEntries() {
  return safeArray(worldDatabase?.generations).flatMap(generation =>
    safeArray(generation.storyArcs).map(arc => ({ generation, arc })));
}

function regionForArc(generation, arc) {
  const firstStageEvent = safeArray(arc.stages)
    .map(stage => safeArray(generation.events).find(event => event.id === stage.eventId))
    .find(Boolean);
  const regionId = firstStageEvent?.regionIds?.[0] ?? generation.regions?.[0]?.id ?? null;
  const region = safeArray(generation.regions).find(item => item.id === regionId) ?? generation.regions?.[0] ?? null;
  return { id: region?.id ?? regionId, nameKo: region?.nameKo ?? generation.titleKo ?? `${generation.generation}세대` };
}

function eventForStage(generation, stage) {
  return stage?.eventId ? safeArray(generation.events).find(event => event.id === stage.eventId) ?? null : null;
}

export function storyCooldownTicks(arcOrId) {
  const id = typeof arcOrId === 'string' ? arcOrId : arcOrId?.id;
  const configured = Number(storyAreaDatabase?.storyCooldownTicks?.[id]);
  if (Number.isFinite(configured) && configured >= 1) return Math.round(configured);
  const tags = new Set(safeArray(arcOrId?.tags));
  const legendaryScale = ['legendary', 'mythical', 'disaster', 'weather', 'space', 'space-time', 'ultra-space', 'multiverse', 'area-zero', 'terastal', 'paradox', 'mega', 'mega-evolution'];
  const important = ['security', 'research', 'history', 'technology', 'energy', 'corporate', 'company', 'myth', 'culture', 'education', 'sports', 'battle', 'academy', 'folklore', 'expedition', 'tourism', 'festival'];
  if (legendaryScale.some(tag => tags.has(tag))) return Number(storyAreaDatabase?.policy?.legendaryCooldownTicks) || 150;
  if (important.some(tag => tags.has(tag))) return Number(storyAreaDatabase?.policy?.importantCooldownTicks) || 100;
  return DEFAULT_STORY_COOLDOWN_TICKS;
}

const storyCooldownClass = ticks => ticks >= 150 ? 'legendary' : ticks >= 100 ? 'important' : 'ordinary';

function scopeForStage(arc, stage, stageIndex) {
  const stageNumber = Number.isInteger(stage?.stage) ? stage.stage : stageIndex + 1;
  const configured = storyAreaDatabase?.stageScopes?.[`${arc.id}:${stageNumber}`];
  const scopeKind = configured?.scopeKind === 'local' ? 'local' : 'broad';
  const residentPokemonDexIds = [...new Set(safeArray(configured?.residentPokemonDexIds)
    .filter(id => Number.isInteger(id) && id >= 1 && id <= 1025))];
  return {
    scopeKind,
    scopePlaces: safeArray(configured?.places).filter(value => typeof value === 'string' && value),
    residentPokemonDexIds,
  };
}

function scopeCandidateTypes(records, generation, scope, card = null) {
  const ids = new Set(scope.scopeKind === 'local' ? scope.residentPokemonDexIds : []);
  const pool = scope.scopeKind === 'local'
    ? records.filter(p => ids.has(p.id))
    : records.filter(p => p.generation === generation.generation);
  const values = [...new Set(pool.flatMap(p => safeArray(p.types)).filter(type => TYPE_KEYS.includes(type)))];
  if (card) for (const type of safeArray(card.types)) if (TYPE_KEYS.includes(type) && !values.includes(type)) values.push(type);
  return values.length ? values : [...TYPE_KEYS];
}

function storyPhase(stageIndex, stageCount) {
  const stageNumber = stageIndex + 1;
  if (stageCount <= 1) return 'outcome';
  const outcomeCount = stageCount >= 7 ? 2 : 1;
  const openingCount = Math.min(stageCount - outcomeCount - 1, Math.max(1, Math.round(stageCount * .34)));
  const outcomeStart = Math.max(openingCount + 1, stageCount - outcomeCount + 1);
  if (stageNumber <= openingCount) return 'opening';
  if (stageNumber >= outcomeStart) return 'outcome';
  return 'branch';
}

function routeNature(route, phase) {
  if (!route) return null;
  if (phase === 'opening') return route.seedNature ?? null;
  if (phase === 'branch') return route.branchNature ?? null;
  return route.outcomeNature ?? null;
}

function recentRouteForArc(state, arcId) {
  return safeArray(state?.recentRoutes).find(route => route.arcId === arcId) ?? null;
}

function weightedNature(weights, random) {
  const entries = ROUTE_NATURES.map(nature => [nature, Math.max(0, Number(weights?.[nature]) || 0)]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return choose(ROUTE_NATURES, random) ?? 'neutral';
  let roll = random() * total;
  for (const [nature, value] of entries) {
    roll -= value;
    if (roll <= 0) return nature;
  }
  return entries[entries.length - 1][0];
}

function rollRouteNature(state, arcId, phase, previousNature, story = null) {
  const random = createIndependentRandom('story-route', story?.runId ?? arcId, phase);
  const latest = safeArray(state.recentRoutes)[0] ?? null;
  const latestNature = routeNature(latest, phase);
  const baseKey = phase === 'opening' ? (latestNature ?? 'none') : (previousNature ?? 'neutral');
  const base = ROUTE_WEIGHTS[phase]?.[baseKey] ?? ROUTE_WEIGHTS.opening.none;
  const weights = Object.fromEntries(ROUTE_NATURES.map(nature => [nature, Number(base[nature]) || .01]));

  // 최근 6개 루트에서 자주 나온 성격은 다음 추첨에서 자연스럽게 확률을 낮춘다.
  for (const route of safeArray(state.recentRoutes).slice(0, 6)) {
    const nature = routeNature(route, phase);
    if (nature && weights[nature] != null) weights[nature] *= .82;
  }
  if (latestNature && weights[latestNature] != null) weights[latestNature] *= .62;

  // 같은 스토리를 다시 보게 됐을 때 직전 루트와 같은 방향이 연속으로 나오는 것도 억제한다.
  const sameArc = recentRouteForArc(state, arcId);
  const sameArcNature = routeNature(sameArc, phase);
  if (sameArcNature && weights[sameArcNature] != null) weights[sameArcNature] *= .48;

  // 최종 결과까지 직전과 완전히 같은 3단계 루트가 반복되는 것은 막는다.
  if (phase === 'outcome' && sameArc && story
      && sameArc.seedNature === story.seedNature
      && sameArc.branchNature === story.branchNature
      && weights[sameArc.outcomeNature] != null) {
    weights[sameArc.outcomeNature] = 0;
  }
  return weightedNature(weights, random);
}

function ensureStoryRoute(state, story, arc, stageIndex) {
  const phase = storyPhase(stageIndex, safeArray(arc.stages).length);
  if (!ROUTE_NATURES.includes(story.seedNature)) {
    story.seedNature = rollRouteNature(state, arc.id, 'opening', null, story);
  }
  if (phase !== 'opening' && !ROUTE_NATURES.includes(story.branchNature)) {
    story.branchNature = rollRouteNature(state, arc.id, 'branch', story.seedNature, story);
  }
  if (phase === 'outcome' && !ROUTE_NATURES.includes(story.outcomeNature)) {
    story.outcomeNature = rollRouteNature(state, arc.id, 'outcome', story.branchNature ?? story.seedNature, story);
  }
  const nature = phase === 'opening'
    ? story.seedNature
    : phase === 'branch'
      ? story.branchNature
      : story.outcomeNature;
  story.lastNature = nature;
  return { phase, nature };
}

function routeKey(story) {
  return [story.seedNature, story.branchNature, story.outcomeNature].filter(Boolean).join('>');
}

function rememberCompletedRoute(state, story, arc, time) {
  const seedNature = ROUTE_NATURES.includes(story.seedNature) ? story.seedNature : 'neutral';
  const branchNature = ROUTE_NATURES.includes(story.branchNature) ? story.branchNature : seedNature;
  const outcomeNature = ROUTE_NATURES.includes(story.outcomeNature) ? story.outcomeNature : branchNature;
  state.recentRoutes.unshift({
    arcId: arc.id,
    seedNature,
    branchNature,
    outcomeNature,
    routeKey: `${seedNature}>${branchNature}>${outcomeNature}`,
    time,
  });
  state.recentRoutes = state.recentRoutes.slice(0, RECENT_ROUTE_LIMIT);
}

function startStory(state, time, random) {
  const all = arcEntries();
  if (!all.length) return null;
  const activeIds = new Set(state.activeStories.map(item => item.arcId));
  for (const [id, until] of Object.entries(state.storyCooldowns ?? {})) {
    if (!Number.isFinite(until) || until <= time) delete state.storyCooldowns[id];
  }
  const candidates = all.filter(({ arc }) => !activeIds.has(arc.id) && (state.storyCooldowns?.[arc.id] ?? 0) <= time);
  if (!candidates.length) return null;
  const selected = choose(candidates, random);
  const region = regionForArc(selected.generation, selected.arc);
  const story = {
    arcId: selected.arc.id,
    runId: `${selected.arc.id}-${time}`,
    generation: selected.generation.generation,
    regionId: region.id,
    stageIndex: 0,
    startedAt: time,
    lastTime: null,
    nextDueTime: time,
    lastTitle: '',
    lastType: null,
    seedNature: null,
    branchNature: null,
    outcomeNature: null,
    lastNature: null,
  };
  state.activeStories.push(story);
  return story;
}

function storyDefinition(story) {
  const generation = generationEntry(story.generation);
  if (!generation) return null;
  const arc = safeArray(generation.storyArcs).find(item => item.id === story.arcId);
  if (!arc) return null;
  return { generation, arc, region: regionForArc(generation, arc) };
}

function chooseStory(state, time, random) {
  state.activeStories = state.activeStories.filter(story => !!storyDefinition(story));
  const due = state.activeStories.filter(story => time >= story.nextDueTime);
  if (due.length && (state.activeStories.length >= MAX_ACTIVE_STORIES || random() < .78)) {
    return choose(due, random);
  }
  if (state.activeStories.length < MAX_ACTIVE_STORIES) {
    return startStory(state, time, random) ?? choose(due, random);
  }
  if (due.length) return choose(due, random);
  return [...state.activeStories].sort((a, b) => a.nextDueTime - b.nextDueTime)[0] ?? null;
}

function classifyNature(arc, stage, event, stageIndex) {
  // 과거 저장 데이터 복원용 fallback. 새 스토리 생성에는 ensureStoryRoute()의 랜덤 분기를 사용한다.
  const headline = stage?.headlineSeed ?? '';
  const body = `${headline} ${event?.sixW?.what ?? ''}`;
  const tags = new Set([...(arc?.tags ?? []), ...(event?.tags ?? [])]);
  const finalStage = stageIndex >= safeArray(arc?.stages).length - 1;
  if (POSITIVE_WORDS.some(word => body.includes(word))) return 'positive';
  if (finalStage && [...tags].some(tag => DANGER_TAGS.has(tag)) && !/(위기|폭주|침입|점거|재가동)/.test(headline)) return 'positive';
  if (NEGATIVE_WORDS.some(word => body.includes(word))) return 'negative';
  if ([...tags].some(tag => DANGER_TAGS.has(tag))) return stageIndex === 0 ? 'neutral' : 'negative';
  if ([...tags].some(tag => POSITIVE_TAGS.has(tag))) return stageIndex === 0 ? 'neutral' : 'positive';
  if (tags.has('research') || tags.has('history') || tags.has('legendary')) return stageIndex === 0 ? 'neutral' : 'positive';
  return 'neutral';
}

function fullStoryText(arc, stage, event) {
  const sixW = event?.sixW ?? {};
  return [
    arc?.nameKo, arc?.summary, stage?.headlineSeed, event?.nameKo,
    ...safeArray(sixW.who), ...safeArray(sixW.where), sixW.what, sixW.why, sixW.how, event?.outcome,
    ...(arc?.tags ?? []), ...(event?.tags ?? []),
  ].filter(Boolean).join(' ');
}

function namedPokemon(records, generation, text) {
  const direct = records.find(p => p.generation === generation.generation && text.includes(p.nameKo));
  if (direct) return direct;
  for (const entry of safeArray(generation.legendaryPokemon)) {
    if (text.includes(entry.nameKo)) {
      const record = records.find(p => p.id === entry.dex);
      if (record) return record;
    }
  }
  return null;
}

function inferType(records, generation, text, card, random, candidateTypes = TYPE_KEYS) {
  const candidates = safeArray(candidateTypes).filter(type => TYPE_KEYS.includes(type));
  const allowed = candidates.length ? candidates : TYPE_KEYS;
  if (card?.types?.length) {
    const cardType = card.types.find(type => allowed.includes(type));
    if (cardType) return cardType;
  }
  for (const type of allowed) {
    if (safeArray(TYPE_HINTS[type]).some(hint => text.includes(hint))) return type;
  }
  const sameGeneration = records.filter(p => p.generation === generation.generation && p.types.some(type => allowed.includes(type)));
  const record = choose(sameGeneration, random);
  return record?.types?.find(type => allowed.includes(type)) ?? choose(allowed, random) ?? 'normal';
}

function findMention(generation, text, groups) {
  for (const group of groups) {
    const record = safeArray(generation[group]).find(item => item?.nameKo && text.includes(item.nameKo));
    if (record) return record.nameKo;
  }
  return '';
}

function makeTitle(generation, arc, stage, event, nature = 'neutral', phase = 'opening') {
  const seed = stripPeriod(stage?.headlineSeed || event?.nameKo || arc?.nameKo || '포켓몬 세계 소식')
    .replace(/^후속:\s*/, '')
    .replace(/^후일담:\s*/, '');
  const stageText = [seed, event?.nameKo, ...(event?.sixW?.who ?? [])].filter(Boolean).join(' ');
  const who = event?.sixW?.who?.[0]
    || findMention(generation, stageText, ['characters', 'organizations', 'institutions', 'companies'])
    || '';
  const base = who && !seed.includes(who) ? `${who}, ${seed}` : seed;
  const suffix = {
    opening: {
      positive: '초기 대응 진전', neutral: '상황 확인 진행', negative: '초기 우려 확대',
    },
    branch: {
      positive: '개선 흐름 확인', neutral: '조사와 대응 계속', negative: '영향 범위 확대',
    },
    outcome: {
      positive: '안정화 진전', neutral: '후속 영향 점검', negative: '불안 요소 지속',
    },
  }[phase]?.[nature];
  return suffix ? `${base} — ${suffix}` : base;
}

function reasonSentence(text) {
  const value = stripPeriod(text);
  if (!value) return '';
  if (value.endsWith('위해서')) return `그 이유는 ${value}다.`;
  if (value.endsWith('때문이다')) return `${value}.`;
  if (value.endsWith('때문에')) return `${value.slice(0, -1)}이다.`;
  if (value.endsWith('때문')) return `${value}이다.`;
  return sentence(value);
}

function routeSentence(nature, phase) {
  if (phase === 'opening') {
    if (nature === 'positive') return '초기 진행은 비교적 순조롭고, 관련 인물과 기관의 대응이나 조사가 안정적으로 이어지고 있다.';
    if (nature === 'negative') return '초기 단계부터 예상하지 못한 문제와 부담이 커지면서, 관련 인물과 기관이 추가 대응을 준비하고 있다.';
    return '아직 사건의 영향과 의미가 모두 확인되지 않아, 현장에서는 새로운 정보와 주변 변화를 함께 확인하고 있다.';
  }
  if (phase === 'branch') {
    if (nature === 'positive') return '중간 과정에서 해결에 도움이 되는 단서와 성과가 확인되면서, 사건은 조금씩 나아지는 방향으로 움직이고 있다.';
    if (nature === 'negative') return '중간 과정에서 새로운 문제가 확인되면서, 기존 계획이나 대응만으로는 상황을 정리하기 어려워지고 있다.';
    return '중간 과정에서는 뚜렷한 개선이나 악화가 확인되지 않아, 조사와 현장 대응이 동시에 이어지고 있다.';
  }
  if (nature === 'positive') return '최종 단계에서 핵심 문제와 불확실성이 크게 줄었고, 관련 지역과 인물들은 다음 단계로 넘어갈 수 있는 상태에 가까워지고 있다.';
  if (nature === 'negative') return '최종 단계에서도 핵심 문제와 불확실성이 남아 있어, 관련 지역과 인물들에게 후속 대응과 추가 조사가 필요한 상황이다.';
  return '최종 단계의 큰 흐름은 정리됐지만 원인과 후속 영향이 모두 확인된 것은 아니어서, 추가 조사와 관찰이 이어지고 있다.';
}

function makeDescription(generation, arc, stage, event, region, previousTitle, stageIndex, nature = 'neutral', phase = 'opening') {
  const sixW = event?.sixW ?? {};
  const who = safeArray(sixW.who).join('·');
  const where = safeArray(sixW.where).join('·') || region.nameKo;
  const pieces = [];

  if (!event) {
    const seed = stripPeriod(stage?.headlineSeed || arc?.nameKo || '새로운 소식');
    const summary = stripPeriod(arc?.summary || '관련 사건의 흐름이 이어지고 있다');
    pieces.push(`${region.nameKo}에서 ${arc.nameKo}와 관련된 새로운 변화가 확인됐다.`);
    pieces.push(`이번 단계의 핵심은 '${seed}'이다.`);
    pieces.push(`이 소식은 '${summary}' 흐름 속에서 나온 변화다.`);
    pieces.push(routeSentence(nature, phase));
    return pieces.join(' ').replace(/\.\s*\./g, '.');
  }

  if (who) pieces.push(`${where}에서 ${particle(who, '이', '가')} 이번 사건의 중심에 있다.`);
  else pieces.push(`${where}에서 새로운 사건이 확인됐다.`);

  if (sixW.what) pieces.push(sentence(sixW.what));
  if (sixW.why) pieces.push(reasonSentence(sixW.why));
  if (sixW.how) pieces.push(`현장에서는 ${sentence(sixW.how)}`);

  const finalStage = phase === 'outcome';
  if (finalStage && nature === 'positive' && event.outcome) {
    pieces.push(`결과적으로 ${sentence(event.outcome)}`);
  } else {
    pieces.push(routeSentence(nature, phase));
  }

  // 한 문장만 길어지는 것을 피하면서도 사건의 장소·인물·행동·이유·대응을 최대 5문장까지 남긴다.
  return pieces.filter(Boolean).slice(0, 5).join(' ').replace(/\.\s*\./g, '.');
}

function makeInterlude(definition, story, records, random, typeSelector = null) {
  const { generation, arc, region } = definition;
  const text = `${arc.nameKo} ${arc.summary} ${story.lastTitle}`;
  const card = namedPokemon(records, generation, text);
  const completedStage = Math.max(1, Math.min(story.stageIndex, safeArray(arc.stages).length));
  const stage = safeArray(arc.stages)[completedStage - 1] ?? null;
  const scope = scopeForStage(arc, stage, completedStage - 1);
  const candidateTypes = scopeCandidateTypes(records, generation, scope, card);
  const preferredType = story.lastType && candidateTypes.includes(story.lastType)
    ? story.lastType : inferType(records, generation, text, card, random, candidateTypes);
  const type = typeof typeSelector === 'function' ? typeSelector(preferredType, candidateTypes) : preferredType;
  return {
    worldStory: true,
    generation: generation.generation,
    regionId: region.id,
    regionName: region.nameKo,
    storyId: arc.id,
    storyRunId: story.runId,
    storyName: arc.nameKo,
    storyStage: completedStage,
    storyStageCount: safeArray(arc.stages).length,
    storyEventId: null,
    isFollowUp: true,
    isInterlude: true,
    // 브리핑은 같은 사건을 반복해 가격에 중복 충격을 주지 않도록 시장 성격은 중립으로 유지한다.
    nature: 'neutral',
    type,
    directCardId: card?.id ?? null,
    scopeKind: scope.scopeKind,
    scopePlaces: scope.scopePlaces,
    residentPokemonDexIds: scope.residentPokemonDexIds,
    cooldownTicks: storyCooldownTicks(arc),
    cooldownClass: storyCooldownClass(storyCooldownTicks(arc)),
    title: `${arc.nameKo} 후속 브리핑`,
    description: `${region.nameKo}에서 ${arc.nameKo} 관련 확인이 이어지고 있다. 직전 단계의 영향이 계속 남아 있어 현장에서는 추가 정보와 대응 결과를 확인하고 있다. 다음 핵심 단계가 확인되기 전까지는 현재 흐름이 유지된다.`,
    sixW: null,
  };
}

function recordStoryEpisode(state, story, result, time) {
  if (!result || result.isInterlude) return;
  const entry = {
    storyRunId: story.runId,
    storyId: result.storyId,
    storyName: result.storyName,
    generation: result.generation,
    regionId: result.regionId,
    regionName: result.regionName,
    storyStage: result.storyStage,
    storyStageCount: result.storyStageCount,
    storyEventId: result.storyEventId,
    storyPhase: result.storyPhase ?? null,
    storySeedNature: result.storySeedNature ?? null,
    storyBranchNature: result.storyBranchNature ?? null,
    storyOutcomeNature: result.storyOutcomeNature ?? null,
    storyRouteKey: result.storyRouteKey ?? '',
    nature: result.nature,
    type: result.type,
    directCardId: result.directCardId,
    scopeKind: result.scopeKind ?? 'broad',
    scopePlaces: safeArray(result.scopePlaces),
    residentPokemonDexIds: safeArray(result.residentPokemonDexIds),
    cooldownTicks: result.cooldownTicks ?? storyCooldownTicks(result.storyId),
    cooldownClass: result.cooldownClass ?? storyCooldownClass(result.cooldownTicks ?? DEFAULT_STORY_COOLDOWN_TICKS),
    title: result.title,
    description: result.description,
    sixW: result.sixW ? {
      who: safeArray(result.sixW.who),
      when: result.sixW.when ?? '',
      where: safeArray(result.sixW.where),
      what: result.sixW.what ?? '',
      why: result.sixW.why ?? '',
      how: result.sixW.how ?? '',
    } : null,
    time,
  };
  const key = `${entry.storyRunId}:${entry.storyStage}`;
  const existing = state.storyHistory.findIndex(item => `${item.storyRunId}:${item.storyStage}` === key);
  if (existing >= 0) state.storyHistory[existing] = entry;
  else state.storyHistory.push(entry);
  if (state.storyHistory.length > STORY_HISTORY_LIMIT) state.storyHistory.splice(0, state.storyHistory.length - STORY_HISTORY_LIMIT);
}

function finalizeStoryState(state, story, arc, title, time, tickMs) {
  const nextIndex = story.stageIndex + 1;
  story.lastTime = time;
  story.lastTitle = title;
  if (nextIndex >= safeArray(arc.stages).length) {
    rememberCompletedRoute(state, story, arc, time);
    state.activeStories = state.activeStories.filter(item => item !== story);
    state.recentArcIds = [arc.id, ...state.recentArcIds.filter(id => id !== arc.id)].slice(0, RECENT_ARC_LIMIT);
    state.storyCooldowns[arc.id] = time + storyCooldownTicks(arc) * tickMs;
    return;
  }
  story.stageIndex = nextIndex;
  const delayTicks = followupDelayTicks(story, nextIndex);
  story.nextDueTime = time + delayTicks * tickMs;
}

function capLegacyPendingDelays(state, time, tickMs) {
  const maxLegacyWait = 4 * tickMs;
  for (const story of safeArray(state?.activeStories)) {
    if (!story?.lastTime || !Number.isFinite(story.nextDueTime)) continue;
    if (story.nextDueTime - time > maxLegacyWait) story.nextDueTime = time + maxLegacyWait;
  }
}

export function generateWorldStoryNews(market, records, time, random = Math.random, tickMs = 600000, typeSelector = null) {
  if (!worldDatabase || !Array.isArray(records) || !records.length) return null;
  const state = migrateWorldNewsState(market);
  capLegacyPendingDelays(state, time, tickMs);
  const story = chooseStory(state, time, random);
  if (!story) return null;
  const definition = storyDefinition(story);
  if (!definition) return null;

  const { generation, arc, region } = definition;
  const stages = safeArray(arc.stages);
  if (story.lastTime && time < story.nextDueTime) {
    const interim = makeInterlude(definition, story, records, random, typeSelector);
    story.lastType = interim.type;
    interim.worldSequence = ++state.sequence;
    return interim;
  }
  const stageIndex = Math.min(story.stageIndex, Math.max(0, stages.length - 1));
  const stage = stages[stageIndex];
  if (!stage) return null;
  const event = eventForStage(generation, stage);
  const text = fullStoryText(arc, stage, event);
  const card = namedPokemon(records, generation, text);
  const scope = scopeForStage(arc, stage, stageIndex);
  const candidateTypes = scopeCandidateTypes(records, generation, scope, card);
  const preferredType = inferType(records, generation, text, card, random, candidateTypes);
  const type = typeof typeSelector === 'function' ? typeSelector(preferredType, candidateTypes) : preferredType;
  const route = ensureStoryRoute(state, story, arc, stageIndex);
  const nature = route.nature;
  const isFollowUp = !!story.lastTime;
  const title = makeTitle(generation, arc, stage, event, nature, route.phase);
  const description = makeDescription(generation, arc, stage, event, region, story.lastTitle, stageIndex, nature, route.phase);
  const sequence = ++state.sequence;

  const result = {
    worldStory: true,
    worldSequence: sequence,
    generation: generation.generation,
    regionId: region.id,
    regionName: region.nameKo,
    storyId: arc.id,
    storyRunId: story.runId,
    storyName: arc.nameKo,
    storyStage: stageIndex + 1,
    storyStageCount: stages.length,
    storyEventId: event?.id ?? null,
    storyPhase: route.phase,
    storySeedNature: story.seedNature,
    storyBranchNature: story.branchNature,
    storyOutcomeNature: story.outcomeNature,
    storyRouteKey: routeKey(story),
    isFollowUp,
    nature,
    type,
    directCardId: card?.id ?? null,
    scopeKind: scope.scopeKind,
    scopePlaces: scope.scopePlaces,
    residentPokemonDexIds: scope.residentPokemonDexIds,
    cooldownTicks: storyCooldownTicks(arc),
    cooldownClass: storyCooldownClass(storyCooldownTicks(arc)),
    title,
    description,
    sixW: event?.sixW ? {
      who: safeArray(event.sixW.who),
      when: event.sixW.when ?? '',
      where: safeArray(event.sixW.where),
      what: event.sixW.what ?? '',
      why: event.sixW.why ?? '',
      how: event.sixW.how ?? '',
    } : null,
  };

  story.lastType = type;
  recordStoryEpisode(state, story, result, time);
  finalizeStoryState(state, story, arc, title, time, tickMs);
  return result;
}

export function getWorldStoryEpisodes(market, news) {
  if (!news?.worldStory || typeof news.storyId !== 'string') return [];
  const state = migrateWorldNewsState(market);
  const currentRunId = news.storyRunId || state.activeStories.find(item => item.arcId === news.storyId)?.runId || null;
  const merged = new Map();
  const put = entry => {
    const legacyInterlude = typeof entry?.description === 'string'
      && entry.description.includes('아직 다음 단계로 이어질 새로운 핵심 변화는 확인되지 않았으며');
    if (!entry || entry.isInterlude || legacyInterlude || !Number.isInteger(entry.storyStage) || entry.storyStage < 1) return;
    if (entry.storyId !== news.storyId) return;
    if (currentRunId && entry.storyRunId && entry.storyRunId !== currentRunId) return;
    const key = entry.storyStage;
    const previous = merged.get(key);
    if (!previous || (Number.isFinite(entry.time) && (!Number.isFinite(previous.time) || entry.time >= previous.time))) merged.set(key, entry);
  };

  for (const entry of state.storyHistory) put(entry);
  for (const entry of safeArray(market?.newsHistory)) put(entry);
  put(news);

  const generation = generationEntry(news.generation);
  const arc = safeArray(generation?.storyArcs).find(item => item.id === news.storyId) ?? null;
  const stageCount = Number.isInteger(news.storyStageCount) ? news.storyStageCount : safeArray(arc?.stages).length;
  const visibleStage = Math.min(Number.isInteger(news.storyStage) ? news.storyStage : stageCount, stageCount || 0);
  const activeRoute = state.activeStories.find(item => item.runId === currentRunId) ?? null;
  const historyRoute = state.storyHistory.find(item => item.storyRunId === currentRunId
    && (item.storySeedNature || item.storyBranchNature || item.storyOutcomeNature)) ?? null;
  const routeSeedNature = news.storySeedNature ?? activeRoute?.seedNature ?? historyRoute?.storySeedNature ?? null;
  const routeBranchNature = news.storyBranchNature ?? activeRoute?.branchNature ?? historyRoute?.storyBranchNature ?? null;
  const routeOutcomeNature = news.storyOutcomeNature ?? activeRoute?.outcomeNature ?? historyRoute?.storyOutcomeNature ?? null;
  let previousTitle = '';

  for (let stageNumber = 1; stageNumber <= visibleStage; stageNumber++) {
    const existing = merged.get(stageNumber);
    if (existing) {
      previousTitle = existing.title;
      continue;
    }
    const stage = arc?.stages?.[stageNumber - 1];
    if (!stage || !generation) continue;
    const event = eventForStage(generation, stage);
    const region = regionForArc(generation, arc);
    const phase = storyPhase(stageNumber - 1, stageCount);
    const storedNature = phase === 'opening'
      ? routeSeedNature
      : phase === 'branch'
        ? routeBranchNature
        : routeOutcomeNature;
    const nature = ROUTE_NATURES.includes(storedNature) ? storedNature : classifyNature(arc, stage, event, stageNumber - 1);
    const title = makeTitle(generation, arc, stage, event, nature, phase);
    const description = makeDescription(generation, arc, stage, event, region, previousTitle, stageNumber - 1, nature, phase);
    const reconstructed = {
      storyRunId: currentRunId,
      storyId: news.storyId,
      storyName: arc.nameKo,
      generation: generation.generation,
      regionId: region.id,
      regionName: region.nameKo,
      storyStage: stageNumber,
      storyStageCount: stageCount,
      storyEventId: event?.id ?? null,
      storyPhase: phase,
      storySeedNature: routeSeedNature,
      storyBranchNature: routeBranchNature,
      storyOutcomeNature: routeOutcomeNature,
      storyRouteKey: [routeSeedNature, routeBranchNature, routeOutcomeNature].filter(Boolean).join('>'),
      nature,
      type: news.type,
      directCardId: null,
      ...scopeForStage(arc, stage, stageNumber - 1),
      cooldownTicks: storyCooldownTicks(arc),
      cooldownClass: storyCooldownClass(storyCooldownTicks(arc)),
      title,
      description,
      sixW: event?.sixW ? {
        who: safeArray(event.sixW.who),
        when: event.sixW.when ?? '',
        where: safeArray(event.sixW.where),
        what: event.sixW.what ?? '',
        why: event.sixW.why ?? '',
        how: event.sixW.how ?? '',
      } : null,
      time: null,
      reconstructed: true,
    };
    merged.set(stageNumber, reconstructed);
    previousTitle = title;
  }

  return [...merged.values()]
    .filter(entry => entry.storyStage <= visibleStage)
    .sort((a, b) => a.storyStage - b.storyStage);
}

