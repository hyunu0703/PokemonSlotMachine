export const TYPES = Object.freeze({
  normal: ['일반', '#A8A29E'], fire: ['불꽃', '#F47B5A'], water: ['물', '#5BA9E6'],
  electric: ['전기', '#F2C94C'], grass: ['풀', '#6FCF7B'], ice: ['얼음', '#7FDDE3'],
  fighting: ['격투', '#C96A5B'], poison: ['독', '#A875C7'], ground: ['땅', '#CDAA6A'],
  flying: ['비행', '#8EB8E8'], psychic: ['에스퍼', '#EA7FA5'], bug: ['벌레', '#9DBB4A'],
  rock: ['바위', '#B69A67'], ghost: ['고스트', '#7F78B8'], dragon: ['드래곤', '#6E72D8'],
  dark: ['악', '#625B67'], steel: ['강철', '#9AA7B3'], fairy: ['페어리', '#ECA6D3'],
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
