export const TYPES = Object.freeze({
  normal: ['일반', '#A8A29E'], fire: ['불꽃', '#F47B5A'], water: ['물', '#5BA9E6'],
  electric: ['전기', '#F2C94C'], grass: ['풀', '#6FCF7B'], ice: ['얼음', '#7FDDE3'],
  fighting: ['격투', '#C96A5B'], poison: ['독', '#A875C7'], ground: ['땅', '#CDAA6A'],
  flying: ['비행', '#8EB8E8'], psychic: ['에스퍼', '#EA7FA5'], bug: ['벌레', '#9DBB4A'],
  rock: ['바위', '#B69A67'], ghost: ['고스트', '#7F78B8'], dragon: ['드래곤', '#6E72D8'],
  dark: ['악', '#625B67'], steel: ['강철', '#9AA7B3'], fairy: ['페어리', '#ECA6D3'],
});
export const TYPE_EFFECTIVENESS = Object.freeze({
  normal: Object.freeze({ rock: .5, ghost: 0, steel: .5 }),
  fire: Object.freeze({ fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5, steel: 2 }),
  water: Object.freeze({ fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 }),
  electric: Object.freeze({ water: 2, electric: .5, grass: .5, ground: 0, flying: 2, dragon: .5 }),
  grass: Object.freeze({ fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5, steel: .5 }),
  ice: Object.freeze({ fire: .5, water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2, steel: .5 }),
  fighting: Object.freeze({ normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: .5 }),
  poison: Object.freeze({ grass: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0, fairy: 2 }),
  ground: Object.freeze({ fire: 2, electric: 2, grass: .5, poison: 2, flying: 0, bug: .5, rock: 2, steel: 2 }),
  flying: Object.freeze({ electric: .5, grass: 2, fighting: 2, bug: 2, rock: .5, steel: .5 }),
  psychic: Object.freeze({ fighting: 2, poison: 2, psychic: .5, dark: 0, steel: .5 }),
  bug: Object.freeze({ fire: .5, grass: 2, fighting: .5, poison: .5, flying: .5, psychic: 2, ghost: .5, dark: 2, steel: .5, fairy: .5 }),
  rock: Object.freeze({ fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2, steel: .5 }),
  ghost: Object.freeze({ normal: 0, psychic: 2, ghost: 2, dark: .5 }),
  dragon: Object.freeze({ dragon: 2, steel: .5, fairy: 0 }),
  dark: Object.freeze({ fighting: .5, psychic: 2, ghost: 2, dark: .5, fairy: .5 }),
  steel: Object.freeze({ fire: .5, water: .5, electric: .5, ice: 2, rock: 2, steel: .5, fairy: 2 }),
  fairy: Object.freeze({ fire: .5, fighting: 2, poison: .5, dragon: 2, dark: 2, steel: .5 }),
});
export const typeEffectiveness = (attackType, defendType) => TYPE_EFFECTIVENESS[attackType]?.[defendType] ?? 1;
export const typeMultiplier = (attackType, defendTypes) => defendTypes.reduce((value, type) => value * typeEffectiveness(attackType, type), 1);

export const TYPE_COUNTERS = Object.freeze({
  normal: Object.freeze(['fighting']), fire: Object.freeze(['water', 'ground', 'rock']),
  water: Object.freeze(['electric', 'grass']), electric: Object.freeze(['ground']),
  grass: Object.freeze(['fire', 'ice', 'poison', 'flying', 'bug']), ice: Object.freeze(['fire', 'fighting', 'rock', 'steel']),
  fighting: Object.freeze(['flying', 'psychic', 'fairy']), poison: Object.freeze(['ground', 'psychic']),
  ground: Object.freeze(['water', 'grass', 'ice']), flying: Object.freeze(['electric', 'ice', 'rock']),
  psychic: Object.freeze(['bug', 'ghost', 'dark']), bug: Object.freeze(['fire', 'flying', 'rock']),
  rock: Object.freeze(['water', 'grass', 'fighting', 'ground', 'steel']), ghost: Object.freeze(['ghost', 'dark']),
  dragon: Object.freeze(['ice', 'dragon', 'fairy']), dark: Object.freeze(['fighting', 'bug', 'fairy']),
  steel: Object.freeze(['fire', 'fighting', 'ground']), fairy: Object.freeze(['poison', 'steel']),
});

export const GRADES = Object.freeze({ normal: '일반', legendary: '전설', mythical: '환상' });
export const dexLabel = id => `No.${String(id).padStart(3, '0')}`;

export function validateData(records) {
  if (!Array.isArray(records) || records.length !== 1025) throw new Error('데이터는 정확히 1,025개여야 합니다.');
  const ids = new Set();
  const counts = { normal: 0, legendary: 0, mythical: 0 };
  const ordered = new Array(1025);
  for (const p of records) {
    if (!Number.isInteger(p.id) || p.id < 1 || p.id > 1025 || ids.has(p.id)
      || p.dexNumber !== p.id || typeof p.nameKo !== 'string' || !p.nameKo
      || typeof p.nameEn !== 'string' || !p.nameEn || !Number.isInteger(p.generation)
      || p.generation < 1 || p.generation > 9 || !Object.hasOwn(GRADES, p.grade)
      || !Array.isArray(p.types) || p.types.length < 1 || p.types.length > 2
      || new Set(p.types).size !== p.types.length || p.types.some(t => !Object.hasOwn(TYPES, t))
      || ![p.slotImage, p.cardImage].every(path => path === null || (typeof path === 'string' && /^assets\/[\w./-]+$/.test(path) && !path.includes('..')))) {
      throw new Error(`포켓몬 데이터 검증 실패: ${p.id}`);
    }
    ids.add(p.id); counts[p.grade]++; ordered[p.id - 1] = p;
  }
  // Counts come from the source. A future source difference must never be "corrected" by reclassifying species.
  return { records: ordered, ids, counts, byId: new Map(ordered.map(p => [p.id, p])) };
}

export async function loadData() {
  const response = await fetch('data/pokemon-data.json');
  if (!response.ok) throw new Error('로컬 도감 데이터를 불러오지 못했습니다.');
  return validateData(await response.json());
}

const imageLoads = new Map();

export function preloadImages(paths) {
  return Promise.all([...new Set(paths.filter(Boolean))].map(path => {
    if (!imageLoads.has(path)) {
      imageLoads.set(path, new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = path;
      }));
    }
    return imageLoads.get(path);
  }));
}

export function imageOrPlaceholder(path, fallback, alt = '', lazy = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-holder';
  wrapper.append(fallback);
  if (path) {
    const image = new Image();
    image.alt = alt;
    // Keep the element in layout so native lazy loading can observe its position.
    image.loading = lazy ? 'lazy' : 'eager';
    image.decoding = 'async';
    image.style.opacity = '0';
    const show = () => { fallback.hidden = true; image.style.opacity = ''; wrapper.classList.add('image-loaded'); };
    image.addEventListener('load', show, { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = path;
    wrapper.append(image);
    if (image.complete && image.naturalWidth > 0) show();
  }
  return wrapper;
}
