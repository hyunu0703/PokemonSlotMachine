import worldDatabaseSource from '../data/world/pokemon-world-db.json' with { type: 'json' };

// Pokémon 세계관 DB를 시장 뉴스용 장기 스토리로 변환한다.
// DB 자체는 data/world/pokemon-world-db.json에서 읽고, 시장 가격 계산은 market.js가 담당한다.

const MAX_ACTIVE_STORIES = 3;
const RECENT_ARC_LIMIT = 8;
const MIN_FOLLOWUP_TICKS = 2;
const MAX_FOLLOWUP_TICKS = 5;

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
const integer = (low, high, random) => low + Math.floor(random() * (high - low + 1));
const choose = (items, random) => items.length ? items[Math.min(items.length - 1, Math.floor(random() * items.length))] : null;
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
    version: 1,
    sequence: 0,
    activeStories: [],
    recentArcIds: [],
  };
}

export function migrateWorldNewsState(market) {
  if (!market || typeof market !== 'object') return null;
  const state = market.worldNewsState;
  if (!state || state.version !== 1 || !Array.isArray(state.activeStories) || !Array.isArray(state.recentArcIds)) {
    market.worldNewsState = createWorldNewsState();
  } else {
    state.sequence = Number.isSafeInteger(state.sequence) && state.sequence >= 0 ? state.sequence : 0;
    state.activeStories = state.activeStories.filter(item => item && typeof item.arcId === 'string'
      && Number.isInteger(item.stageIndex) && item.stageIndex >= 0
      && Number.isFinite(item.nextDueTime));
    state.recentArcIds = state.recentArcIds.filter(id => typeof id === 'string').slice(0, RECENT_ARC_LIMIT);
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

function startStory(state, time, random) {
  const all = arcEntries();
  if (!all.length) return null;
  const activeIds = new Set(state.activeStories.map(item => item.arcId));
  const recentIds = new Set(state.recentArcIds);
  let candidates = all.filter(({ arc }) => !activeIds.has(arc.id) && !recentIds.has(arc.id));
  if (!candidates.length) candidates = all.filter(({ arc }) => !activeIds.has(arc.id));
  if (!candidates.length) return null;
  const selected = choose(candidates, random);
  const region = regionForArc(selected.generation, selected.arc);
  const story = {
    arcId: selected.arc.id,
    generation: selected.generation.generation,
    regionId: region.id,
    stageIndex: 0,
    startedAt: time,
    lastTime: null,
    nextDueTime: time,
    lastTitle: '',
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

function inferType(records, generation, text, card, random) {
  if (card?.types?.length) return card.types[0];
  for (const type of TYPE_KEYS) {
    if (safeArray(TYPE_HINTS[type]).some(hint => text.includes(hint))) return type;
  }
  const sameGeneration = records.filter(p => p.generation === generation.generation);
  const record = choose(sameGeneration, random);
  return record?.types?.[0] ?? choose(TYPE_KEYS, random) ?? 'normal';
}

function findMention(generation, text, groups) {
  for (const group of groups) {
    const record = safeArray(generation[group]).find(item => item?.nameKo && text.includes(item.nameKo));
    if (record) return record.nameKo;
  }
  return '';
}

function makeTitle(generation, arc, stage, event, nature, isFollowUp, random) {
  const seed = stripPeriod(stage?.headlineSeed || event?.nameKo || arc?.nameKo || '포켓몬 세계 소식');
  const stageText = [seed, event?.nameKo, ...(event?.sixW?.who ?? []), ...(event?.sixW?.where ?? [])].filter(Boolean).join(' ');
  const where = event?.sixW?.where?.[0] || findMention(generation, stageText, ['places']) || '';
  const who = event?.sixW?.who?.[0] || findMention(generation, stageText, ['characters', 'organizations', 'institutions', 'companies']) || '';
  const lead = where && !seed.includes(where) ? `${where}, ` : '';
  const subject = who && !seed.includes(who) ? `${who} 관련 ` : '';
  const endings = isFollowUp
    ? ['후속 상황 확인', '추가 정황 포착', '관련 조사 이어져', '현지 후속 대응 진행']
    : nature === 'negative'
      ? ['현장 대응 착수', '지역 경계 강화', '긴급 조사 진행', '상황 파악 나서']
      : nature === 'positive'
        ? ['진전 확인', '후속 조치 진행', '긍정적 변화 포착', '관련 조사 성과']
        : ['현지 조사 착수', '추가 정보 수집', '관계기관 확인 나서', '상황 관찰 시작'];
  return `${lead}${subject}${seed}…${choose(endings, random)}`;
}

function makeDescription(generation, arc, stage, event, region, previousTitle, stageIndex) {
  const sixW = event?.sixW ?? {};
  const who = safeArray(sixW.who).join('·');
  const where = safeArray(sixW.where).join('·') || region.nameKo;
  const pieces = [];

  if (previousTitle) {
    pieces.push(`앞서 전해진 '${previousTitle}' 소식에 이어 ${particle(arc.nameKo, '과', '와')} 관련된 후속 상황이 확인됐다.`);
  } else {
    pieces.push(`${region.nameKo}에서 ${particle(arc.nameKo, '과', '와')} 관련된 새로운 움직임이 포착됐다.`);
  }

  if (event) {
    const actor = who ? `${particle(who, '이', '가')} 관여한 것으로 확인됐으며, ` : '';
    pieces.push(`${where}에서 ${actor}${sentence(sixW.what)}`.replace(/\s+\./g, '.'));
    if (sixW.how) pieces.push(`현장에서는 ${sentence(sixW.how)}`);
    if (sixW.why) pieces.push(`사건의 배경에 대해서는 '${stripPeriod(sixW.why)}'라는 설명이 전해졌다.`);
    if (event.outcome && stageIndex >= safeArray(arc.stages).length - 1) pieces.push(`현재까지 확인된 결과는 ${sentence(event.outcome)}`);
  } else {
    pieces.push(`${sentence(stage?.headlineSeed)} ${sentence(arc.summary)}`);
  }

  pieces.push(`이번 보도는 ${generation.generation}세대 ${region.nameKo}의 '${arc.nameKo}' 스토리 ${stageIndex + 1}/${safeArray(arc.stages).length} 단계다.`);
  return pieces.filter(Boolean).join(' ').replace(/\.\s*\./g, '.');
}

function makeInterlude(definition, story, records, random) {
  const { generation, arc, region } = definition;
  const text = `${arc.nameKo} ${arc.summary} ${story.lastTitle}`;
  const card = namedPokemon(records, generation, text);
  const type = inferType(records, generation, text, card, random);
  const completedStage = Math.max(1, Math.min(story.stageIndex, safeArray(arc.stages).length));
  const endings = ['현지 확인 계속', '후속 조사 진행 중', '추가 발표 대기', '관련 기관 상황 점검'];
  return {
    worldStory: true,
    generation: generation.generation,
    regionId: region.id,
    regionName: region.nameKo,
    storyId: arc.id,
    storyName: arc.nameKo,
    storyStage: completedStage,
    storyStageCount: safeArray(arc.stages).length,
    storyEventId: null,
    isFollowUp: true,
    isInterlude: true,
    nature: 'neutral',
    type,
    directCardId: card?.id ?? null,
    title: `${arc.nameKo} 후속 브리핑…${choose(endings, random)}`,
    description: `앞서 전해진 '${story.lastTitle}' 이후 ${region.nameKo}에서는 ${particle(arc.nameKo, '과', '와')} 관련된 확인 작업이 이어지고 있다. 아직 다음 단계로 이어질 새로운 핵심 변화는 확인되지 않았으며, 관계자들은 기존 상황을 계속 점검하고 있다.`,
    sixW: null,
  };
}

function finalizeStoryState(state, story, arc, title, time, tickMs, random) {
  const nextIndex = story.stageIndex + 1;
  story.lastTime = time;
  story.lastTitle = title;
  if (nextIndex >= safeArray(arc.stages).length) {
    state.activeStories = state.activeStories.filter(item => item !== story);
    state.recentArcIds = [arc.id, ...state.recentArcIds.filter(id => id !== arc.id)].slice(0, RECENT_ARC_LIMIT);
    return;
  }
  story.stageIndex = nextIndex;
  story.nextDueTime = time + integer(MIN_FOLLOWUP_TICKS, MAX_FOLLOWUP_TICKS, random) * tickMs;
}

export function generateWorldStoryNews(market, records, time, random = Math.random, tickMs = 600000) {
  if (!worldDatabase || !Array.isArray(records) || !records.length) return null;
  const state = migrateWorldNewsState(market);
  const story = chooseStory(state, time, random);
  if (!story) return null;
  const definition = storyDefinition(story);
  if (!definition) return null;

  const { generation, arc, region } = definition;
  const stages = safeArray(arc.stages);
  if (story.lastTime && time < story.nextDueTime) {
    const interim = makeInterlude(definition, story, records, random);
    interim.worldSequence = ++state.sequence;
    return interim;
  }
  const stageIndex = Math.min(story.stageIndex, Math.max(0, stages.length - 1));
  const stage = stages[stageIndex];
  if (!stage) return null;
  const event = eventForStage(generation, stage);
  const text = fullStoryText(arc, stage, event);
  const card = namedPokemon(records, generation, text);
  const type = inferType(records, generation, text, card, random);
  const nature = classifyNature(arc, stage, event, stageIndex);
  const isFollowUp = !!story.lastTime;
  const title = makeTitle(generation, arc, stage, event, nature, isFollowUp, random);
  const description = makeDescription(generation, arc, stage, event, region, story.lastTitle, stageIndex);
  const sequence = ++state.sequence;

  const result = {
    worldStory: true,
    worldSequence: sequence,
    generation: generation.generation,
    regionId: region.id,
    regionName: region.nameKo,
    storyId: arc.id,
    storyName: arc.nameKo,
    storyStage: stageIndex + 1,
    storyStageCount: stages.length,
    storyEventId: event?.id ?? null,
    isFollowUp,
    nature,
    type,
    directCardId: card?.id ?? null,
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

  finalizeStoryState(state, story, arc, title, time, tickMs, random);
  return result;
}

