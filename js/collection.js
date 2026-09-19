import { TYPES, GRADES, dexLabel, imageOrPlaceholder } from './data.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const cardTextMap = new Map();
const cardTextReady = fetch('data/pokemon-card-text.json')
  .then(response => response.ok ? response.json() : [])
  .then(items => {
    if (Array.isArray(items)) items.forEach((item, index) => cardTextMap.set(index + 1, item));
  })
  .catch(() => {});

let styleApplied = false;
let descriptionVisibilityObserver = null;

function applyCardTextStyle() {
  if (styleApplied || document.getElementById('card-text-style-overrides')) return;
  styleApplied = true;

  const style = document.createElement('style');
  style.id = 'card-text-style-overrides';
  style.textContent = `
    /* 카드 하단을 3개의 고정 행: 세대 / 문장1 / 문장2 로 사용한다. */
    .card-content{
      grid-template-rows:42px 44px 34px minmax(0,1fr) 96px;
      padding:4px 14px 12px;
    }
    .card-illustration{
      align-items:center;
      padding:4px 0 8px;
      min-height:0;
    }
    .card-illustration .image-holder{
      display:flex;
      align-items:center;
      justify-content:center;
      width:100%;
      height:100%;
      min-height:0;
    }
    .card-illustration .image-holder img{
      width:72%;
      height:72%;
      max-width:72%;
      max-height:72%;
      object-fit:contain;
    }
    .monster{
      width:112px;
      height:128px;
      max-width:70%;
      max-height:72%;
    }
    .card-bottom{
      display:grid;
      grid-template-rows:24px 1fr;
      align-items:start;
      justify-items:center;
      width:100%;
      min-width:0;
      padding:8px 2px 0;
      border-top:1px solid #EDE6EF;
      color:#908194;
      text-align:center;
      overflow:hidden;
    }
    .card-generation{
      align-self:center;
      font-size:17px;
      font-weight:800;
      line-height:1;
      color:#7C7084;
      white-space:nowrap;
    }
    .card-description{
      display:grid;
      grid-template-rows:repeat(2, minmax(0,1fr));
      align-items:center;
      width:100%;
      min-width:0;
      height:70%;
      font-size:14px;
      font-weight:650;
      line-height:1;
      color:#7B6E81;
    }
    .card-description-line{
      display:block;
      width:100%;
      min-width:0;
      white-space:nowrap;
      overflow:hidden;
      text-align:center;
      line-height:1;
      letter-spacing:-0.035em;
      /* 글자를 가로로 찌그러뜨리지 않고 폰트 크기만 줄여 한 줄에 맞춘다. */
      transform:none !important;
      font-stretch:normal;
    }

    /* 도감의 작은 카드도 동일하게 3행 구조를 유지한다. */
    .collection-card{
      position:relative;
    }

    /*
     * 작은 카드에서 cqw 소수점 테두리(예: 3.1875px / 3.75px)가
     * 브라우저 안티앨리어싱으로 위·아래·좌·우 두께가 달라 보이는 현상을 막는다.
     * 컬렉션은 4px, 더 작은 멀티 스핀 결과 카드는 3px 정수 픽셀로 고정한다.
     */
    .collection-card .pokemon-card{
      border-width:4px;
      border-radius:18px;
      box-sizing:border-box;
    }
    /*
     * 멀티 SPIN의 카드 크기에 맞춰 테두리도 별도 규격으로 고정한다.
     * 공개 연출 카드는 높이가 약 100px라 4px 테두리가 과하게 두꺼워 보이므로 2px,
     * 최종 결과 카드는 3px을 사용한다. 작은 카드에서는 기본 5px 아래 그림자도
     * 테두리가 한쪽만 두꺼워 보이는 원인이 되므로 제거한다.
     */
    .collection-card.batch-reveal-card .pokemon-card{
      border-width:2px;
      border-radius:9px;
      box-shadow:none;
    }
    .collection-card.batch-result-card .pokemon-card{
      border-width:3px;
      border-radius:15px;
      box-shadow:none;
    }
    .collection-card.batch-reveal-card .pokemon-card.legendary,
    .collection-card.batch-reveal-card .pokemon-card.mythical,
    .collection-card.batch-result-card .pokemon-card.legendary,
    .collection-card.batch-result-card .pokemon-card.mythical{
      box-shadow:none;
    }

    /* 흰색 카드 면이 컬러 테두리 영역까지 번져 보이지 않도록 클리핑을 명시한다. */
    .collection-card .pokemon-card:not(.uncollected){
      background:
        linear-gradient(#FFFDFC,#FFFDFC) padding-box,
        var(--border) border-box;
      background-origin:padding-box,border-box;
      background-clip:padding-box,border-box;
    }
    .collection-card .card-content{
      grid-template-rows:13.125cqw 13.75cqw 10.625cqw minmax(0,1fr) 27cqw;
      padding:1.25cqw 2.75cqw 3cqw;
    }
    .collection-card .card-illustration{
      padding:1cqw 0 1.75cqw;
    }
    .collection-card .card-illustration .image-holder img{
      width:68%;
      height:68%;
      max-width:68%;
      max-height:68%;
    }
    .collection-card .monster{
      width:34cqw;
      height:39cqw;
      max-width:68%;
      max-height:70%;
    }
    .collection-card .card-bottom{
      grid-template-rows:7.2cqw 1fr;
      padding:1.75cqw .5cqw 0;
    }
    .collection-card .card-generation{
      font-size:5.25cqw;
    }
    .collection-card .card-description{
      font-size:4.45cqw;
      line-height:1;
    }
    .collection-card .card-description-line{
      letter-spacing:-0.05em;
    }

    /* 보유 수량과 멀티 SPIN 획득 수량을 n세대 위 가로선 오른쪽에 맞춘다. */
    .collection-card .quantity-badge,
    .collection-card.batch-result-card .batch-result-quantity{
      top:auto;
      right:3cqw;
      bottom:30cqw;
      min-width:0;
      font-size:10px;
      line-height:1;
      padding:4px 7px;
      z-index:4;
    }

    /* 클릭해서 크게 본 카드도 같은 비율과 한 문장 한 줄 규칙을 사용한다. */
    #modal-card .card-content{
      grid-template-rows:42px 44px 34px minmax(0,1fr) 96px;
      padding:4px 14px 12px;
    }
    #modal-card .card-illustration .image-holder img{
      width:72%;
      height:72%;
      max-width:72%;
      max-height:72%;
    }
    #modal-card .card-generation{
      font-size:17px;
    }
    #modal-card .card-description{
      font-size:14px;
    }

    @media(max-width:370px){
      #modal-card .card-content{
        grid-template-rows:38px 40px 30px minmax(0,1fr) 90px;
        padding:4px 12px 10px;
      }
      #modal-card .card-generation{font-size:16px}
      #modal-card .card-description{font-size:13px}
    }
  `;
  document.head.append(style);
}

function fitDescriptionLine(line) {
  if (!line?.isConnected) return;

  /*
   * 레이아웃을 여러 번 강제로 다시 계산하지 않는다.
   * 기본 크기에서 한 번 측정한 뒤 비율로 폰트 크기를 계산하고,
   * 오차가 있을 때만 한 번 더 보정한다.
   */
  line.style.fontSize = '';
  line.style.transform = 'none';

  const available = line.clientWidth;
  if (!available) return;

  const naturalWidth = line.scrollWidth;
  if (naturalWidth <= available) return;

  const baseSize = Number.parseFloat(getComputedStyle(line).fontSize) || 12;
  let nextSize = Math.max(1.5, baseSize * (available / naturalWidth) * 0.96);
  line.style.fontSize = `${nextSize}px`;

  /* 글꼴 렌더링 오차로 아주 조금 넘치는 경우만 1회 추가 보정한다. */
  const fittedWidth = line.scrollWidth;
  if (fittedWidth > available) {
    nextSize = Math.max(1.5, nextSize * (available / fittedWidth) * 0.98);
    line.style.fontSize = `${nextSize}px`;
  }
}

function observeDescriptionLine(line) {
  /*
   * 이전 ResizeObserver 방식은 컬렉션 1,025장 × 2문장 전체를 계속 감시했다.
   * 화면 전환 시에도 수천 개의 측정 콜백이 발생할 수 있으므로,
   * 실제 화면에 보이는 문장만 한 번 맞춘 뒤 관찰을 종료한다.
   */
  if (typeof IntersectionObserver === 'undefined') {
    requestAnimationFrame(() => fitDescriptionLine(line));
    return;
  }

  if (!descriptionVisibilityObserver) {
    descriptionVisibilityObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        fitDescriptionLine(entry.target);
        descriptionVisibilityObserver.unobserve(entry.target);
      }
    }, { rootMargin: '120px 0px' });
  }

  descriptionVisibilityObserver.observe(line);
}

function cardText(p) {
  const item = cardTextMap.get(p.id);
  if (item && Array.isArray(item.lines) && item.lines.length) {
    return {
      generation: item.generation ?? `${p.generation}세대`,
      lines: item.lines.filter(Boolean).slice(0, 2),
    };
  }

  return {
    generation: `${p.generation}세대`,
    lines: p.cardText?.lines?.filter(Boolean).slice(0, 2) ?? [],
  };
}

function cardBottom(p, acquired) {
  const bottom = element('div', 'card-bottom');
  if (!acquired) {
    bottom.textContent = '미획득';
    return bottom;
  }

  const text = cardText(p);
  bottom.append(element('div', 'card-generation', text.generation));

  const description = element('div', 'card-description');
  const lines = text.lines.slice(0, 2);
  while (lines.length < 2) lines.push('');

  for (const textLine of lines) {
    const line = element('div', 'card-description-line', textLine);
    description.append(line);
    observeDescriptionLine(line);
  }

  bottom.append(description);
  return bottom;
}

export function createCard(p, acquired = true, lazy = false) {
  applyCardTextStyle();

  const card = element('article', `pokemon-card ${acquired ? p.grade : 'uncollected'}`);
  if (acquired) {
    const colors = p.types.map(t => TYPES[t][1]);
    card.style.setProperty('--border', colors.length === 1
      ? colors[0]
      : `linear-gradient(135deg, ${colors[0]} 0%, ${colors[0]} 45%, ${colors[1]} 55%, ${colors[1]} 100%)`);
  }

  const content = element('div', 'card-content');
  const top = element('div', 'card-top');
  top.append(
    element('span', 'dex', dexLabel(p.id)),
    element('span', 'grade-badge', acquired ? GRADES[p.grade] : '미획득'),
  );

  const badges = element('div', 'type-badges');
  if (acquired) {
    for (const type of p.types) {
      const badge = element('span', 'type-badge', TYPES[type][0]);
      badge.style.setProperty('--type-color', TYPES[type][1]);
      badges.append(badge);
    }
  }

  const illustration = element('div', 'card-illustration');
  const placeholder = element('div', 'monster');
  placeholder.setAttribute('aria-label', '몬스터 실루엣');
  illustration.append(imageOrPlaceholder(acquired ? p.cardImage : null, placeholder, acquired ? p.nameKo : '', lazy));

  content.append(
    top,
    element('h3', 'card-name', acquired ? p.nameKo : '???'),
    badges,
    illustration,
    cardBottom(p, acquired),
  );
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
  for (const p of records) {
    if (ids.has(p.id)) {
      counts.all++;
      counts[p.grade]++;
    }
  }
  return counts;
}

export class Collection {
  constructor(data, ids, onCard, quantity = {}) {
    this.data = data;
    this.ids = ids;
    this.quantity = quantity;
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

    for (const tab of this.tabs) {
      tab.addEventListener('click', () => {
        this.filters.grade = tab.dataset.grade;
        this.render();
      });
    }

    for (const [key, control] of [['generation', this.generation], ['type', this.type], ['search', this.search]]) {
      control.addEventListener(key === 'search' ? 'input' : 'change', () => {
        this.filters[key] = control.value;
        this.render();
      });
    }

    this.grid.addEventListener('click', event => {
      const button = event.target.closest('[data-id]');
      if (button) onCard(this.data.byId.get(Number(button.dataset.id)));
    });

    void cardTextReady.then(() => {
      const collectionScreen = document.getElementById('collection');
      if (collectionScreen && !collectionScreen.hidden) this.render();
    });
  }

  render() {
    const counts = collectionCounts(this.data.records, this.ids);
    const grade = this.filters.grade;
    const total = grade === 'all' ? this.data.records.length : this.data.counts[grade];

    this.count.textContent = `${counts[grade]} / ${total}`;
    this.percent.textContent = `${(counts[grade] / total * 100).toFixed(1)}%`;
    this.progress.max = total;
    this.progress.value = counts[grade];

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

      if (acquired) button.append(element('span', 'quantity-badge', `보유 ${this.quantity[p.id] ?? 0}장`));

      fragment.append(button);
      this.buttons.set(p.id, button);
    }

    this.grid.replaceChildren(fragment);
    this.filterCount.textContent = `${filtered.length.toLocaleString('ko-KR')}개의 카드`;
    this.empty.hidden = filtered.length !== 0;
  }

  reveal(id) {
    this.filters = { grade: 'all', generation: 'all', type: 'all', search: '' };
    this.generation.value = 'all';
    this.type.value = 'all';
    this.search.value = '';
    this.render();

    const button = this.buttons.get(id);
    requestAnimationFrame(() => {
      button?.scrollIntoView({
        block: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      button?.classList.add('just-acquired');
      button?.focus({ preventScroll: true });
    });
  }
}
