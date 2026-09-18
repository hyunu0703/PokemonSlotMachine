export const TYPES = Object.freeze({
  normal: ['일반', '#A8A29E'], fire: ['불꽃', '#F47B5A'], water: ['물', '#5BA9E6'],
  electric: ['전기', '#F2C94C'], grass: ['풀', '#6FCF7B'], ice: ['얼음', '#7FDDE3'],
  fighting: ['격투', '#C96A5B'], poison: ['독', '#A875C7'], ground: ['땅', '#CDAA6A'],
  flying: ['비행', '#8EB8E8'], psychic: ['에스퍼', '#EA7FA5'], bug: ['벌레', '#9DBB4A'],
  rock: ['바위', '#B69A67'], ghost: ['고스트', '#7F78B8'], dragon: ['드래곤', '#6E72D8'],
  dark: ['악', '#625B67'], steel: ['강철', '#9AA7B3'], fairy: ['페어리', '#ECA6D3'],
});

const TYPE_SHAPES = Object.freeze({
  normal: '<circle cx="32" cy="32" r="16" fill="none" stroke="white" stroke-width="8"/>',
  fire: '<path d="M35 8c3 15 17 20 15 33C48 59 16 59 14 41c-1-10 8-18 12-24-1 12 3 14 6 15 5-8 4-16 3-24z"/>',
  water: '<path d="M32 7C25 20 13 31 13 41a19 19 0 0038 0C51 31 39 20 32 7z"/>',
  electric: '<path d="M33 5L13 36h17l-4 23 25-35H35l8-19z"/>',
  grass: '<path d="M53 10C18 8 7 27 16 44L42 22 22 51C46 60 58 36 53 10z"/>',
  ice: '<path d="M32 7v50M10 19l44 26M10 45l44-26M24 10l8 8 8-8M24 54l8-8 8 8" fill="none" stroke="white" stroke-width="5"/>',
  fighting: '<path d="M14 32V20h8V12h8v-2h8v5h8v13h6v15L40 55H24L12 43z"/>',
  poison: '<path d="M10 30a22 20 0 0144 0v10H44v13h-8V43h-8v10h-8V40H10z"/><circle cx="24" cy="30" r="5" fill="currentColor"/><circle cx="40" cy="30" r="5" fill="currentColor"/>',
  ground: '<path d="M7 51L23 15h14l20 36H7zm14-8h22L31 25z" fill-rule="evenodd"/>',
  flying: '<path d="M8 45C10 19 30 13 58 10L40 28H26l-5 5h15l-9 9H17l-5 9z"/>',
  psychic: '<path d="M30 35c-12-10 6-22 15-10 13 20-21 36-32 13C0 11 43-2 54 20" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>',
  bug: '<ellipse cx="32" cy="36" rx="14" ry="21"/><path d="M22 19L15 8m27 11 7-11M18 29H8m38 0h10M18 43 8 50m38-7 10 7M32 21v35" fill="none" stroke="white" stroke-width="4"/>',
  rock: '<path d="M9 43L16 18 39 10 55 30 49 51 25 56z"/><path d="M16 18l15 17 24-5M31 35l-6 21" fill="none" stroke="currentColor" stroke-width="3"/>',
  ghost: '<path d="M11 35a21 24 0 0142 0v18l-10-6-11 8-11-8-10 6z"/><circle cx="24" cy="31" r="4" fill="currentColor"/><circle cx="40" cy="31" r="4" fill="currentColor"/>',
  dragon: '<path d="M10 53l5-20 14-10-2-15 13 8 13-4-4 20-12 7 3 16-13-9z"/><circle cx="40" cy="24" r="3" fill="currentColor"/>',
  dark: '<path d="M42 9a24 24 0 100 46A27 27 0 0142 9z"/>',
  steel: '<path d="M19 9h26l13 23-13 23H19L6 32z"/><circle cx="32" cy="32" r="12" fill="currentColor"/>',
  fairy: '<path d="M32 5l7 19 20 8-20 7-7 20-8-20-19-7 19-8z"/>',
});

// 타입 아이콘 SVG 이미지를 생성
export function typeImage(type, className = 'reveal-type') {
  const [label, color] = TYPES[type] ?? [];
  const shape = TYPE_SHAPES[type];
  if (!label || !color || !shape) return null;
  const image = new Image();
  image.className = className; image.alt = `${label} 타입`;
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 80 80">' +
    '<circle cx="40" cy="40" r="39" fill="' + color + '"/>' +
    '<g transform="translate(8 8)" fill="white" color="' + color + '">' + shape + '</g></svg>');
  return image;
}
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
