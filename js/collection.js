import { TYPES, GRADES, dexLabel, imageOrPlaceholder } from './data.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createCard(p, acquired = true, lazy = false) {
  const card = element('article', `pokemon-card ${acquired ? p.grade : 'uncollected'}`);
  if (acquired) {
    const colors = p.types.map(t => TYPES[t][1]);
    card.style.setProperty('--border', colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors[0]} 0%, ${colors[0]} 45%, ${colors[1]} 55%, ${colors[1]} 100%)`);
  }
  const content = element('div', 'card-content');
  const top = element('div', 'card-top');
  top.append(element('span', 'dex', dexLabel(p.id)), element('span', 'grade-badge', acquired ? GRADES[p.grade] : '미획득'));
  const badges = element('div', 'type-badges');
  if (acquired) for (const type of p.types) {
    const badge = element('span', 'type-badge', TYPES[type][0]);
    badge.style.setProperty('--type-color', TYPES[type][1]);
    badges.append(badge);
  }
  const illustration = element('div', 'card-illustration');
  const placeholder = element('div', 'monster');
  placeholder.setAttribute('aria-label', '몬스터 실루엣');
  illustration.append(imageOrPlaceholder(acquired ? p.cardImage : null, placeholder, acquired ? p.nameKo : '', lazy));
  content.append(top, element('h3', 'card-name', acquired ? p.nameKo : '???'), badges, illustration,
    element('div', 'card-bottom', acquired ? p.types.map(t => `◆ ${TYPES[t][0]}`).join(' · ') : '미획득'));
  card.append(content);
  return card;
}

export function filterPokemon(records, { grade, generation, type, search }) {
  const query = search.trim().toLowerCase();
  const number = /^\d+$/.test(query) ? Number(query) : null;
  return records.filter(p => (grade === 'all' || p.grade === grade)
    && (generation === 'all' || p.generation === Number(generation))
    && (type === 'all' || p.types.includes(type))
    && (!query || p.nameKo.toLowerCase().includes(query) || p.nameEn.toLowerCase().includes(query)
      || (number !== null && p.id === number)));
}

export function collectionCounts(records, ids) {
  const counts = { all: 0, normal: 0, legendary: 0, mythical: 0 };
  for (const p of records) if (ids.has(p.id)) { counts.all++; counts[p.grade]++; }
  return counts;
}

export class Collection {
  constructor(data, ids, onCard) {
    this.data = data; this.ids = ids;
    this.filters = { grade: 'all', generation: 'all', type: 'all', search: '' };
    this.grid = document.getElementById('card-grid');
    this.tabs = [...document.querySelectorAll('#collection-tabs button')];
    this.generation = document.getElementById('generation');
    this.type = document.getElementById('type');
    this.search = document.getElementById('search');
    this.count = document.getElementById('collection-count');
    this.percent = document.getElementById('collection-percent');
    this.progress = document.getElementById('collection-progress');
    this.filterCount = document.getElementById('filter-count');
    this.empty = document.getElementById('empty');
    this.buttons = new Map();
    for (let i = 1; i <= 9; i++) this.generation.add(new Option(`${i}세대`, String(i)));
    for (const [key, [label]] of Object.entries(TYPES)) this.type.add(new Option(label, key));
    for (const tab of this.tabs) tab.addEventListener('click', () => { this.filters.grade = tab.dataset.grade; this.render(); });
    for (const [key, control] of [['generation', this.generation], ['type', this.type], ['search', this.search]]) {
      control.addEventListener(key === 'search' ? 'input' : 'change', () => { this.filters[key] = control.value; this.render(); });
    }
    this.grid.addEventListener('click', event => {
      const button = event.target.closest('[data-id]');
      if (button) onCard(this.data.byId.get(Number(button.dataset.id)));
    });
  }
  render() {
    const counts = collectionCounts(this.data.records, this.ids);
    const grade = this.filters.grade;
    const total = grade === 'all' ? this.data.records.length : this.data.counts[grade];
    this.count.textContent = `${counts[grade]} / ${total}`;
    this.percent.textContent = `${(counts[grade] / total * 100).toFixed(1)}%`;
    this.progress.max = total; this.progress.value = counts[grade];
    for (const tab of this.tabs) tab.setAttribute('aria-pressed', String(tab.dataset.grade === grade));
    const filtered = filterPokemon(this.data.records, this.filters);
    const fragment = document.createDocumentFragment();
    this.buttons.clear();
    for (const p of filtered) {
      const acquired = this.ids.has(p.id);
      const button = element('button', 'collection-card');
      button.dataset.id = p.id;
      button.setAttribute('aria-label', `${dexLabel(p.id)} ${acquired ? p.nameKo : '미획득'}`);
      button.append(createCard(p, acquired, true));
      fragment.append(button); this.buttons.set(p.id, button);
    }
    this.grid.replaceChildren(fragment);
    this.filterCount.textContent = `${filtered.length.toLocaleString('ko-KR')}개의 카드`;
    this.empty.hidden = filtered.length !== 0;
  }
  reveal(id) {
    this.filters = { grade: 'all', generation: 'all', type: 'all', search: '' };
    this.generation.value = 'all'; this.type.value = 'all'; this.search.value = '';
    this.render();
    const button = this.buttons.get(id);
    requestAnimationFrame(() => {
      button?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      button?.classList.add('just-acquired');
      button?.focus({ preventScroll: true });
    });
  }
}
