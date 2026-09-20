import { GRADES, TYPES, imageOrPlaceholder, typeImage } from './data.js';
import { assets, changePercent, currentTradeAmount, currentTradeVolume, priceHistory, MARKET_CONFIG } from './market.js';
import { getWorldStoryEpisodes } from './world-news.js';

export const money = n => n.toLocaleString('ko-KR') + ' TC';
const percent = n => n === null ? '기록 부족' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const signedMoney = n => `${n > 0 ? '+' : ''}${Math.round(n).toLocaleString('ko-KR')} TC`;
const directionClass = n => n > 0 ? 'market-up' : n < 0 ? 'market-down' : 'muted';
const targetLabel = (n, data) => {
  if (n.target === 'card') return data.byId.get(n.cardId)?.nameKo ?? '해당 포켓몬';
  const type = n.focus === 'opposed' && n.opposedType ? n.opposedType : n.type;
  return `${TYPES[type]?.[0] ?? type}타입`;
};

const NEWS_SOURCES = {
  media: ['호연 TV · 기자 개비', '홀로캐스터 · 파키라', '도나존 · 모야모'],
  research: ['오박사 연구소', '공박사 연구소', '털보박사 연구소', '마박사 연구소', '주박사 연구소', '플라타느박사 연구소', '쿠쿠이박사 연구소', '소니아 연구팀', '팔데아 연구팀'],
  official: ['신오리그 · 챔피언 난천', '호연리그 · 챔피언 성호', '가라르리그 · 챔피언 단델', '팔데아리그 · 테사', '에테르재단 공식 발표'],
};
const stableSource = (sources, key) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return sources[hash % sources.length];
};
const newsSource = n => {
  if (n.target === 'card') return stableSource(NEWS_SOURCES.media, n.id);
  if (n.nature === 'negative') return stableSource([...NEWS_SOURCES.media, ...NEWS_SOURCES.official], n.id);
  return stableSource(NEWS_SOURCES.research, n.id);
};
const NEWS_NATURE_META = Object.freeze({
  positive: { label: '호재', className: 'market-up' },
  neutral: { label: '중립', className: 'muted' },
  negative: { label: '악재', className: 'market-down' },
});

const cleanStoryDescription = text => String(text ?? '').replace(/\s*이번 보도는\s+[^.]*?스토리\s+\d+\/\d+\s*단계다\.\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

const newsDescription = (n, data) => {
  if (n.worldStory && typeof n.description === 'string' && n.description) return cleanStoryDescription(n.description);
  const type = `${TYPES[n.type]?.[0] ?? n.type}타입`;
  const opposed = n.opposedType ? `${TYPES[n.opposedType]?.[0] ?? n.opposedType}타입` : '관련 타입';
  const pokemon = n.target === 'card' ? (data.byId.get(n.cardId)?.nameKo ?? '해당 포켓몬') : '';

  if (n.nature === 'positive') {
    if (n.target === 'card') return `${type} 강세 스토리와 함께 ${pokemon}에 시장의 관심이 집중되고 있습니다. ${pokemon}은 약점 포켓몬 후보에서 제외된 뒤 선택되며, 해당 종목에는 상승 쪽으로 기운 비대칭 변동이 적용됩니다. 다만 기존 추세·모멘텀·쇼크에 따라 실제 결과는 달라질 수 있습니다.`;
    if (n.focus === 'opposed') return `${type} 호재가 이어지는 가운데 ${opposed}에는 강한 하락 편향이 적용됩니다. 강세 섹터로 수요가 이동하는 흐름을 표현하며, 실제 가격은 기존 시장 상태와 개별 추세를 함께 반영합니다.`;
    return `${type}에 호재가 발생해 강한 상승 편향이 적용됩니다. 동시에 ${type}에 실제 상성상 약한 포켓몬 쪽에는 강한 하락 편향이 적용됩니다. 상승은 보장되지 않지만 플러스 쪽 확률과 폭이 더 크게 설계되어 있습니다.`;
  }

  if (n.nature === 'negative') {
    if (n.target === 'card') return `${type} 악재 스토리 속에서 ${pokemon}이 주요 종목으로 언급되고 있습니다. 해당 종목에는 하락 쪽으로 기운 비대칭 변동이 적용되며, 기존 추세·모멘텀·쇼크가 함께 가격을 결정합니다.`;
    if (n.focus === 'opposed') return `${type} 악재로 해당 섹터에는 강한 하락 편향이 적용됩니다. 반대되는 ${opposed}에는 자금 이동을 반영해 횡보에서 소폭 상승 정도의 편향만 적용됩니다.`;
    return `${type}에 악재가 발생해 강한 하락 편향이 적용됩니다. 반대되는 타입에는 같은 크기의 반대 효과를 주지 않고, 횡보에서 소폭 상승 정도만 허용합니다.`;
  }

  if (n.target === 'card') return `${pokemon}의 거래량과 시장 관심이 늘어난 중립 뉴스입니다. 가격 방향 자체는 강제하지 않으며 기존 시장 상태·추세·모멘텀·변동성·쇼크 계산을 그대로 사용합니다.`;
  if (n.focus === 'opposed') return `${type}와 ${opposed} 사이의 거래 공방을 다루는 중립 뉴스입니다. 뉴스 자체는 상승·하락 방향을 만들지 않고 거래 활동만 높이며 가격은 기존 계산을 유지합니다.`;
  return `${type}의 거래량과 시장 관심이 높아진 중립 뉴스입니다. 별도의 상승·하락 편향 없이 기존 가격 계산을 그대로 유지합니다.`;
};

const newsImpactLabel = n => {
  if (n.nature === 'positive') return n.focus === 'opposed'
    ? '호재 반대 섹터: 강한 하락 편향'
    : '호재: 강한 상승 편향 · 약점 섹터 강한 하락';
  if (n.nature === 'negative') return n.focus === 'opposed'
    ? '악재 반대 섹터: 횡보~소폭 상승'
    : '악재: 강한 하락 편향 · 반대 섹터 소폭 상승';
  return '중립: 기존 가격 계산 유지';
};

const dateLabel = t => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const node = (tag, text, className = '') => {
  const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
};
const keywordValues = (entry, data, text = '') => {
  const sixW = entry?.sixW ?? {};
  const cardId = entry?.cardId ?? entry?.directCardId ?? null;
  const values = [
    entry?.storyName,
    entry?.regionName,
    ...(Array.isArray(sixW.who) ? sixW.who : []),
    ...(Array.isArray(sixW.where) ? sixW.where : []),
    cardId ? data.byId.get(cardId)?.nameKo : null,
    entry?.type ? `${TYPES[entry.type]?.[0] ?? entry.type}타입` : null,
  ];
  if (entry?.worldStory && Number.isInteger(entry.generation) && text) {
    for (const pokemon of data.records) {
      if (pokemon.generation === entry.generation && pokemon.nameKo && text.includes(pokemon.nameKo)) values.push(pokemon.nameKo);
    }
  }
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(value => value.length >= 2))]
    .sort((a, b) => b.length - a.length);
};
const appendHighlightedText = (element, text, keywords) => {
  const value = String(text ?? '');
  const terms = [...new Set((keywords ?? []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!value || !terms.length) { element.textContent = value; return element; }
  let cursor = 0;
  while (cursor < value.length) {
    let bestIndex = -1, bestTerm = '';
    for (const term of terms) {
      const index = value.indexOf(term, cursor);
      if (index < 0) continue;
      if (bestIndex < 0 || index < bestIndex || (index === bestIndex && term.length > bestTerm.length)) {
        bestIndex = index; bestTerm = term;
      }
    }
    if (bestIndex < 0) { element.append(document.createTextNode(value.slice(cursor))); break; }
    if (bestIndex > cursor) element.append(document.createTextNode(value.slice(cursor, bestIndex)));
    element.append(node('span', bestTerm, 'market-news-keyword'));
    cursor = bestIndex + bestTerm.length;
  }
  return element;
};
const typeIcons = (types, containerClass = 'market-type-icons', iconClass = 'market-type-icon') => {
  const icons = node('span', '', containerClass);
  for (const type of types) {
    const image = typeImage(type, iconClass);
    if (image) icons.append(image);
  }
  return icons;
};

const STORY_MODAL_STYLE_ID = 'market-story-history-style';
const ensureStoryModalStyles = () => {
  if (document.getElementById(STORY_MODAL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STORY_MODAL_STYLE_ID;
  style.textContent = `
    #market-story-history-modal{width:min(900px,calc(100vw - 32px));max-width:none;border:0;padding:0;background:transparent;color:inherit}
    #market-story-history-modal::backdrop{background:rgba(41,29,49,.45);backdrop-filter:blur(2px)}
    .market-story-history-inner{position:relative;width:100%;max-height:calc(100dvh - 32px);overflow-y:auto;background:#FFFDFC;border-radius:24px;box-shadow:0 18px 50px rgba(58,48,66,.22);padding:34px 38px}
    .market-story-history-close{position:absolute;right:16px;top:16px;width:38px;height:38px;padding:0;border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#F3EAF6;color:#87659D;font-size:20px;font-weight:800;line-height:1;cursor:pointer;box-shadow:0 4px 14px #513A5622}
    .market-story-history-close-mark{position:relative;display:block;width:16px;height:16px;flex:none}
    .market-story-history-close-mark:before,.market-story-history-close-mark:after{content:"";position:absolute;left:50%;top:50%;width:2px;height:18px;border-radius:999px;background:currentColor;transform-origin:center}
    .market-story-history-close-mark:before{transform:translate(-50%,-50%) rotate(45deg)}.market-story-history-close-mark:after{transform:translate(-50%,-50%) rotate(-45deg)}
    .market-story-history-head{padding-right:48px;margin-bottom:24px}.market-story-history-head .eyebrow{display:block;color:#AF7896;margin-bottom:8px}.market-story-history-head h2{margin:0 0 8px;font-size:24px;color:#3A3042}.market-story-history-head p{margin:0;color:var(--muted);font-size:12px;line-height:1.7}
    .market-story-timeline{display:grid;gap:14px}.market-story-episode{position:relative;padding:20px 20px 18px;border:1px solid #EDE2EE;border-radius:18px;background:#FFF9FC}.market-story-episode.current{border-color:#B69AE8;box-shadow:0 0 0 2px rgba(182,154,232,.12)}
    .market-story-episode-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:11px;font-weight:800}.market-story-stage{color:#87659D}.market-story-current{padding:3px 7px;border-radius:999px;background:#F0E7FA;color:#87659D}
    .market-story-episode h3{margin:0;font-size:16px;line-height:1.6;color:#3A3042}.market-story-episode p{margin:10px 0 0;color:var(--muted);font-size:14px;line-height:1.95}.market-story-reconstructed{font-size:10px;color:#A399A8;margin-top:9px}
    .market-news-keyword{font-size:inherit;font-weight:900;color:inherit;letter-spacing:inherit}
    .market-news-copy{font-size:12px!important;line-height:1.85!important}
    .market-story-link{display:inline-block;width:auto;border:0;background:transparent;padding:0;margin:12px 0 0;color:#87659D;font:inherit;font-size:11px;line-height:1.7;font-weight:800;text-align:left;cursor:pointer}.market-story-link:hover{text-decoration:underline;color:#A782E3}.market-story-link:focus-visible{outline:3px solid #A782E3;outline-offset:3px;border-radius:4px}
    @media(max-width:767px){#market-story-history-modal{width:calc(100vw - 20px)}.market-story-history-inner{padding:26px 18px 20px;max-height:calc(100dvh - 20px)}.market-story-history-close{right:10px;top:10px}.market-story-history-head{padding-right:40px}.market-story-history-head h2{font-size:20px}.market-story-episode{padding:16px}.market-story-episode h3{font-size:14px}.market-story-episode p{font-size:13px;line-height:1.9}.market-news-copy{font-size:12px!important}}
  `;
  document.head.append(style);
};

const createStoryHistoryModal = () => {
  ensureStoryModalStyles();
  let dialog = document.getElementById('market-story-history-modal');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'market-story-history-modal';
  const inner = node('div', '', 'market-story-history-inner');
  const close = node('button', '', 'market-story-history-close');
  const closeMark = node('span', '', 'market-story-history-close-mark'); closeMark.setAttribute('aria-hidden', 'true'); close.append(closeMark);
  close.type = 'button'; close.setAttribute('aria-label', '스토리 기록 닫기');
  const content = node('div', ''); content.id = 'market-story-history-content';
  inner.append(close, content); dialog.append(inner); document.body.append(dialog);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  return dialog;
};

export class MarketView {
  constructor(data, save, onSell) {
    this.data = data; this.save = save; this.selected = data.records[0].id;
    this.storyHistoryModal = createStoryHistoryModal();
    this.storyHistoryContent = this.storyHistoryModal.querySelector('#market-story-history-content');
    this.page = 0; this.pageSize = 20; this.listLimit = 100; this.period = '1H'; this.ownedSort = 'price'; this.ownedPage = 0; this.ownedPageSize = 10;
    this.ui = Object.fromEntries(['market', 'market-assets', 'market-detail-modal', 'market-detail', 'market-detail-close', 'market-news', 'market-sales', 'market-rows', 'market-grade', 'market-type', 'market-search', 'market-sort', 'market-page', 'market-prev', 'market-next', 'market-time', 'market-owned-sort', 'market-owned-rows', 'market-owned-empty', 'market-owned-pagination', 'market-owned-page', 'market-owned-prev', 'market-owned-next'].map(id => [id, document.getElementById(id)]));
    for (const [type, [label]] of Object.entries(TYPES)) { const option = node('option', label); option.value = type; this.ui['market-type'].append(option); }
    for (const id of ['market-grade', 'market-type', 'market-search', 'market-sort']) this.ui[id].addEventListener(id === 'market-search' ? 'input' : 'change', () => { this.page = 0; this.renderList(); });
    this.ui['market-prev'].addEventListener('click', () => { this.page--; this.renderList(); });
    this.ui['market-next'].addEventListener('click', () => { this.page++; this.renderList(); });
    this.ui['market-owned-sort'].addEventListener('click', event => {
      const button = event.target.closest('[data-sort]');
      if (button) { this.ownedSort = button.dataset.sort; this.ownedPage = 0; this.renderOwned(); }
    });
    this.ui['market-owned-prev'].addEventListener('click', () => { this.ownedPage--; this.renderOwned(); });
    this.ui['market-owned-next'].addEventListener('click', () => { this.ownedPage++; this.renderOwned(); });
    for (const id of ['market-rows', 'market-owned-rows']) this.ui[id].addEventListener('click', event => {
      const button = event.target.closest('[data-card]');
      if (button) this.openDetail(Number(button.dataset.card));
    });
    this.ui['market-news'].addEventListener('click', event => {
      const button = event.target.closest('[data-story-history]');
      if (!button) return;
      const news = this.save.market.newsHistory.find(item => item.id === button.dataset.storyHistory);
      if (news) this.openStoryHistory(news);
    });
    this.ui['market-detail-close'].addEventListener('click', () => this.ui['market-detail-modal'].close());
    this.ui['market-detail'].addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.dataset.period) { this.period = button.dataset.period; this.renderDetail(); }
      if (button?.dataset.sell) {
        const input = this.ui['market-detail'].querySelector('[data-sell-quantity]');
        const quantity = Math.max(1, Number(input?.value) || 1);
        onSell(this.selected, quantity);
      }
    });
  }
  openStoryHistory(news) {
    const episodes = getWorldStoryEpisodes(this.save.market, news);
    const meta = NEWS_NATURE_META[news.nature] ?? NEWS_NATURE_META.neutral;
    const head = node('header', '', 'market-story-history-head');
    head.append(
      node('span', `${news.generation}세대 · ${news.regionName ?? '지역 미상'} · ${meta.label}`, `eyebrow ${meta.className}`),
      node('h2', news.storyName ?? '스토리 기록'),
      node('p', `현재 ${news.storyStage}/${news.storyStageCount} 단계 · 지금까지 확인된 에피소드 ${episodes.length}개`)
    );
    const timeline = node('div', '', 'market-story-timeline');
    for (const episode of episodes) {
      const article = node('article', '', `market-story-episode${episode.storyStage === news.storyStage ? ' current' : ''}`);
      const episodeMeta = node('div', '', 'market-story-episode-meta');
      const nature = NEWS_NATURE_META[episode.nature] ?? NEWS_NATURE_META.neutral;
      episodeMeta.append(
        node('span', `${episode.storyStage}/${episode.storyStageCount} 단계`, 'market-story-stage'),
        node('span', nature.label, nature.className),
        ...(episode.storyStage === news.storyStage ? [node('span', '현재', 'market-story-current')] : [])
      );
      const episodeTitle = node('h3', '');
      const episodeDescription = node('p', '');
      const episodeText = `${episode.title ?? ''} ${cleanStoryDescription(episode.description)}`;
      const episodeKeywords = keywordValues(episode, this.data, episodeText);
      appendHighlightedText(episodeTitle, episode.title, episodeKeywords);
      appendHighlightedText(episodeDescription, cleanStoryDescription(episode.description), episodeKeywords);
      article.append(episodeMeta, episodeTitle, episodeDescription);
      if (episode.reconstructed) article.append(node('div', '이전 저장 기록이 없어 세계관 DB를 기준으로 복원한 에피소드입니다.', 'market-story-reconstructed'));
      timeline.append(article);
    }
    if (!episodes.length) timeline.append(node('p', '표시할 스토리 기록이 없습니다.', 'muted'));
    this.storyHistoryContent.replaceChildren(head, timeline);
    if (!this.storyHistoryModal.open) this.storyHistoryModal.showModal();
  }

  // 선택한 포켓몬의 시장 상세 모달 표시
  openDetail(id) {
    this.selected = id;
    this.period = '1H';
    this.renderDetail();
    if (!this.ui['market-detail-modal'].open) this.ui['market-detail-modal'].showModal();
  }
  render() {
    if (this.ui.market.hidden) return;
    const summary = assets(this.save), market = this.save.market;
    const basis = Object.entries(this.save.quantity).reduce((sum, [id, count]) => {
      if (count <= 0) return sum;
      const average = this.save.averageAcquisitionPrice?.[id];
      return Number.isFinite(average) && average > 0 ? sum + average * count : NaN;
    }, 0);
    const totalReturn = Number.isFinite(basis) && basis > 0 ? (summary.cards - basis) / basis * 100 : null;
    this.ui['market-assets'].replaceChildren(...[
      ['총 자산', money(summary.total)], ['보유 TC', money(summary.tc)], ['보유 카드 평가액', money(summary.cards), totalReturn],
    ].map(([label, value, gain]) => {
      const box = node('div', '', 'panel market-stat'), amount = node('strong', value);
      if (Number.isFinite(gain)) {
        amount.className = 'market-valuation';
        const change = node('span', percent(gain), 'market-total-return ' + (gain === 0 ? '' : directionClass(gain)));
        change.setAttribute('aria-label', '전체 수익률 ' + percent(gain)); amount.append(change);
        if (label === '보유 카드 평가액' && Number.isFinite(basis)) {
          const profit = summary.cards - basis;
          const profitNode = node('span', signedMoney(profit), 'market-total-return ' + (profit === 0 ? '' : directionClass(profit)));
          profitNode.setAttribute('aria-label', '전체 손익 ' + signedMoney(profit)); amount.append(profitNode);
        }
      }
      box.append(node('span', label, 'muted'), amount); return box;
    }));
    this.ui['market-time'].textContent = `최근 갱신 ${dateLabel(market.lastMarketUpdate)} · 다음 ${dateLabel(market.lastMarketUpdate + MARKET_CONFIG.tickMs)} · 10분마다 갱신`;

    if (this.ui['market-detail-modal'].open) this.renderDetail();
    this.renderList(); this.renderNews(); this.renderSales(); this.renderOwned();
  }
  // 선택한 포켓몬의 가격/차트/매도 정보 갱신
  renderDetail() {
    const p = this.data.byId.get(this.selected), card = this.save.market.cards[p.id], count = this.save.quantity[p.id] ?? 0;
    const heading = node('div', '', 'market-card-heading');
    const fallback = node('span', '✧');
    heading.append(imageOrPlaceholder(p.cardImage, fallback, p.nameKo));
    const info = node('div', '');
    const title = node('div', '', 'market-title-line');
    title.append(node('h2', p.nameKo), typeIcons(p.types));
    info.append(node('span', `${GRADES[p.grade]} · No.${p.id}`, 'eyebrow'), title, node('strong', money(card.currentPrice), 'market-price'));
    heading.append(info);
    const changes = node('div', '', 'market-changes');
    for (const [label, ticks] of [['10분', 1], ['1시간', 6], ['24시간', 144]]) {
      const change = changePercent(card, ticks); changes.append(node('span', `${label} ${percent(change)}`, directionClass(change)));
    }
    const periods = node('div', '', 'tabs market-periods');
    for (const period of ['1H', '6H', '24H', 'ALL']) {
      const button = node('button', period); button.dataset.period = period; button.setAttribute('aria-pressed', String(period === this.period)); periods.append(button);
    }
    const { values: history, start, end } = priceHistory(card, this.save.market.lastMarketUpdate, this.period);
    const average = this.save.averageAcquisitionPrice?.[p.id];
    const hasAverage = Number.isFinite(average) && average > 0;
    const low = Math.min(...history), high = Math.max(...history);
    const scaleLow = hasAverage ? Math.min(low, average) : low, scaleHigh = hasAverage ? Math.max(high, average) : high;
    const spread = scaleHigh - scaleLow || Math.max(scaleHigh * .05, 1);
    const xAt = index => 20 + index / Math.max(1, history.length - 1) * 560;
    const yAt = value => 165 - (value - scaleLow) / spread * 140;
    const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chart.setAttribute('viewBox', '0 0 600 190'); chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `${p.nameKo} ${this.period} 가격 차트. 최저 ${low} TC, 최고 ${high} TC${hasAverage ? `, 평균 획득가 ${Math.round(average)} TC` : ''}`); chart.classList.add('market-chart');
    const chartText = (text, x, y, anchor = 'middle') => {
      const label = document.createElementNS(chart.namespaceURI, 'text');
      label.textContent = text; label.setAttribute('x', x); label.setAttribute('y', y); label.setAttribute('text-anchor', anchor);
      label.setAttribute('fill', '#625B67'); label.setAttribute('font-size', '7'); label.setAttribute('font-weight', '700');
      label.setAttribute('style', 'paint-order:stroke;stroke:#FCF9FF;stroke-width:2px;stroke-linejoin:round');
      return label;
    };
    const pointLabel = (text, index, y) => {
      const pointX = xAt(index);
      const anchor = pointX < 85 ? 'start' : pointX > 515 ? 'end' : 'middle';
      const x = anchor === 'start' ? Math.max(22, pointX + 2) : anchor === 'end' ? Math.min(578, pointX - 2) : pointX;
      return chartText(text, x, Math.max(10, Math.min(179, y)), anchor);
    };
    let averageLabel = null;
    const averageY = hasAverage ? yAt(average) : null;
    const averageLabelY = hasAverage ? Math.max(12, Math.min(180, averageY + 10)) : null;
    if (hasAverage) {
      const averageLine = document.createElementNS(chart.namespaceURI, 'line');
      averageLine.setAttribute('x1', '20'); averageLine.setAttribute('x2', '580'); averageLine.setAttribute('y1', averageY); averageLine.setAttribute('y2', averageY);
      averageLine.setAttribute('stroke', '#8A858D'); averageLine.setAttribute('stroke-width', '0.75'); averageLine.setAttribute('stroke-dasharray', '4 4'); averageLine.setAttribute('stroke-linecap', 'round');
      chart.append(averageLine);
      averageLabel = chartText(`평균 획득가 ${money(Math.round(average))}`, 20, averageLabelY, 'start');
    }
    const points = history.map((value, index) => `${xAt(index)},${yAt(value)}`);
    if (history.length === 1) points.push(`580,${yAt(history[0])}`);
    const line = document.createElementNS(chart.namespaceURI, 'polyline'); line.setAttribute('points', points.join(' ')); line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#A782E3'); line.setAttribute('stroke-width', '1.5'); chart.append(line);
    const lowIndex = history.indexOf(low), highIndex = history.indexOf(high);
    const lowX = xAt(lowIndex), lowPointY = yAt(low);
    let lowLabelY = Math.max(12, Math.min(180, lowPointY + 11));

    if (hasAverage && lowX < 210 && Math.abs(lowLabelY - averageLabelY) < 13) {
      const aboveAverage = Math.min(lowPointY - 8, averageLabelY - 12);
      if (aboveAverage >= 12) lowLabelY = aboveAverage;
      else lowLabelY = Math.min(180, averageLabelY + 13);
    }

    if (averageLabel) chart.append(averageLabel);
    const highLabel = pointLabel(`최고 ${money(high)}`, highIndex, yAt(high) - 6);
    highLabel.setAttribute('style', 'paint-order:stroke;stroke:#FCF9FF;stroke-width:2px;stroke-linejoin:round');
    chart.append(
      highLabel,
      pointLabel(`최저 ${money(low)}`, lowIndex, lowLabelY)
    );
    const range = node('p', `최저 ${money(low)} · 최고 ${money(high)} · ${history.length}개 기록`, 'muted');
    const chartNote = node('p', `ALL은 최근 7일의 시간별 기록입니다. ${dateLabel(start)} ~ ${dateLabel(end)}`, 'muted');
    const gain = Number.isFinite(average) && average > 0 ? (card.currentPrice - average) / average * 100 : null;
    const sellRow = node('div', '', 'market-sell-row');
    const stat = (label, value, className = '') => {
      const box = node('div', '', 'market-sell-stat');
      box.append(node('small', label), node('strong', value, className)); return box;
    };
    sellRow.append(
      stat('평균 획득가', Number.isFinite(average) && average > 0 ? money(Math.round(average)) : '기록 부족'),
      stat('현재가', money(card.currentPrice))
    );
    const returnBox = node('div', '', 'market-sell-stat market-sell-return');
    returnBox.append(node('small', '수익률 · 실제 수익'));
    const returnValues = node('div', '', 'market-sell-return-values');
    const percentNode = node('strong', percent(gain), gain === 0 ? '' : directionClass(gain));
    const profitNode = node('strong', '기록 부족');
    returnValues.append(percentNode, profitNode); returnBox.append(returnValues); sellRow.append(returnBox);

    const quantityBox = node('label', '', 'market-sell-quantity');
    quantityBox.append(node('small', `수량 · 보유 ${count}장`));
    const quantityInput = document.createElement('input');
    quantityInput.type = 'text'; quantityInput.inputMode = 'numeric'; quantityInput.pattern = '[0-9]*';
    quantityInput.autocomplete = 'off'; quantityInput.value = count ? '1' : '0'; quantityInput.disabled = !count;
    quantityInput.dataset.sellQuantity = '';
    const normalizeQuantity = () => {
      const digits = quantityInput.value.replace(/\D/g, '');
      if (!digits) { quantityInput.value = ''; return 0; }
      const value = Math.min(count, Math.max(1, Number(digits) || 1));
      quantityInput.value = String(value); return value;
    };
    const updateProfit = () => {
      const quantity = normalizeQuantity();
      const profit = Number.isFinite(average) && average > 0 ? (card.currentPrice - average) * quantity : null;
      profitNode.textContent = Number.isFinite(profit) ? signedMoney(profit) : '기록 부족';
      profitNode.className = Number.isFinite(profit) && profit !== 0 ? directionClass(profit) : '';
    };
    quantityInput.addEventListener('input', updateProfit);
    quantityInput.addEventListener('blur', () => { if (count && !quantityInput.value) quantityInput.value = '1'; updateProfit(); });
    quantityBox.append(quantityInput); sellRow.append(quantityBox);

    const sellButton = node('button', '매도', 'primary market-sell-button');
    sellButton.dataset.sell = 'quantity'; sellButton.disabled = !count; sellRow.append(sellButton);
    updateProfit();
    this.ui['market-detail'].replaceChildren(heading, changes, periods, chart, range, chartNote, sellRow);
  }
  // Market 전체 목록 갱신
  renderList() {
    const grade = this.ui['market-grade'].value, type = this.ui['market-type'].value, query = this.ui['market-search'].value.trim().toLowerCase(), sort = this.ui['market-sort'].value;
    const market = this.save.market;
    const records = this.data.records.filter(p => (grade === 'all' || grade === p.grade) && (type === 'all' || p.types.includes(type)) && (!query || p.nameKo.includes(query) || p.nameEn.toLowerCase().includes(query) || String(p.id) === query));
    const value = p => sort === 'amount' ? currentTradeAmount(market, market.cards[p.id])
      : sort === 'volume' ? currentTradeVolume(market, market.cards[p.id]) : changePercent(market.cards[p.id], 1) ?? 0;
    const namedId = ['amount', 'volume'].includes(sort) && market.activeNews[0]?.target === 'card' ? market.activeNews[0].cardId : null;
    records.sort((a, b) => {
      if (namedId !== null) { if (a.id === namedId) return -1; if (b.id === namedId) return 1; }
      return sort === 'return-low' ? value(a) - value(b) : value(b) - value(a);
    });
    const visibleRecords = records.slice(0, this.listLimit);
    const pages = Math.max(1, Math.ceil(visibleRecords.length / this.pageSize)); this.page = Math.max(0, Math.min(this.page, pages - 1));
    this.ui['market-rows'].replaceChildren(...visibleRecords.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize).map(p => {
      const row = node('tr', ''), c = market.cards[p.id], change = changePercent(c);
      const name = node('td', ''), nameLine = node('div', '', 'market-name-line'), button = node('button', p.nameKo, 'market-name');
      button.dataset.card = p.id; nameLine.append(button, typeIcons(p.types, 'market-inline-types', 'market-inline-type-icon')); name.append(nameLine);
      row.append(name, node('td', GRADES[p.grade]), node('td', money(c.currentPrice)), node('td', percent(change), directionClass(change)), node('td', `${this.save.quantity[p.id] ?? 0}장`)); return row;
    }));
    this.ui['market-page'].textContent = `${this.page + 1} / ${pages} · ${visibleRecords.length}종목`;
    this.ui['market-prev'].disabled = this.page === 0; this.ui['market-next'].disabled = this.page >= pages - 1;
  }
  // 보유 포켓몬 목록 갱신
  renderOwned() {
    const records = this.data.records.filter(p => this.save.quantity[p.id] > 0);
    const price = p => this.save.market?.cards[p.id]?.currentPrice;
    const gain = p => {
      const average = this.save.averageAcquisitionPrice?.[p.id], quote = price(p);
      if (!Number.isFinite(average) || average <= 0 || !Number.isFinite(quote) || quote <= 0) return null;
      const result = (quote - average) / average * 100;
      return Number.isFinite(result) ? result : null;
    };
    const value = this.ownedSort === 'return' ? p => gain(p) ?? -Infinity : p => price(p) ?? -Infinity;
    records.sort((a, b) => value(b) - value(a));
    const pages = Math.max(1, Math.ceil(records.length / this.ownedPageSize));
    this.ownedPage = Math.max(0, Math.min(this.ownedPage, pages - 1));
    const visible = records.slice(this.ownedPage * this.ownedPageSize, (this.ownedPage + 1) * this.ownedPageSize);
    for (const button of this.ui['market-owned-sort'].children) button.setAttribute('aria-pressed', String(button.dataset.sort === this.ownedSort));
    this.ui['market-owned-empty'].hidden = records.length > 0;
    this.ui['market-owned-rows'].hidden = records.length === 0;
    this.ui['market-owned-pagination'].hidden = records.length <= this.ownedPageSize;
    this.ui['market-owned-page'].textContent = `${this.ownedPage + 1} / ${pages}`;
    this.ui['market-owned-prev'].disabled = this.ownedPage === 0;
    this.ui['market-owned-next'].disabled = this.ownedPage >= pages - 1;
    this.ui['market-owned-rows'].replaceChildren(...visible.map(p => {
      const row = node('article', '', 'market-owned-item'), info = node('div', '', 'market-owned-info');
      const button = node('button', p.nameKo, 'market-name'); button.dataset.card = p.id;
      const name = node('div', '', 'market-owned-name');
      name.append(button, typeIcons(p.types, 'market-inline-types', 'market-inline-type-icon'), node('span', '×' + this.save.quantity[p.id]));
      const average = this.save.averageAcquisitionPrice?.[p.id], quote = price(p), change = gain(p), count = this.save.quantity[p.id];
      const profit = Number.isFinite(average) && average > 0 && Number.isFinite(quote) && quote > 0 ? (quote - average) * count : null;
      const stats = node('div', '', 'market-owned-stats');
      stats.append(node('span', '평균 획득가 ' + (Number.isFinite(average) && average > 0 ? money(Math.round(average)) : '기록 부족')),
        node('span', '현재가 ' + (Number.isFinite(quote) && quote > 0 ? money(quote) : '기록 부족')),
        node('span', '수익률 ' + percent(change), change === 0 ? '' : directionClass(change)),
        node('span', Number.isFinite(profit) ? signedMoney(profit) : '기록 부족', Number.isFinite(profit) && profit !== 0 ? directionClass(profit) : ''));
      info.append(name, stats); row.append(imageOrPlaceholder(p.slotImage, node('span', '✧'), p.nameKo, true), info);
      return row;
    }));
  }
  // 최근 시장 뉴스 갱신
  renderNews() {
    const market = this.save.market;
    this.ui['market-news'].replaceChildren(...market.newsHistory.map(n => {
      const item = node('details', '', 'market-news-item'), summary = node('summary', '');
      const meta = NEWS_NATURE_META[n.nature] ?? NEWS_NATURE_META.neutral;
      const worldLabel = n.worldStory
        ? `${n.generation}세대 · ${n.regionName ?? '지역 미상'} · ${n.isFollowUp ? '후속 ' : ''}${n.storyStage}/${n.storyStageCount}`
        : '';
      const sourceLine = [newsSource(n), worldLabel, meta.label].filter(Boolean).join(' · ');
      const newsTitle = node('strong', n.title);
      const descriptionText = newsDescription(n, this.data);
      const newsKeywords = keywordValues(n, this.data, descriptionText);
      summary.append(node('small', sourceLine, meta.className), newsTitle);
      const storyLine = n.worldStory
        ? node('button', `스토리: ${n.storyName}`, 'market-story-link')
        : null;
      if (storyLine) {
        storyLine.type = 'button';
        storyLine.dataset.storyHistory = n.id;
        storyLine.setAttribute('aria-label', `${n.storyName} 과거 에피소드 보기`);
      }
      const newsCopy = node('p', '', 'market-news-copy');
      appendHighlightedText(newsCopy, descriptionText, newsKeywords);
      item.append(
        summary,
        newsCopy,
        ...(storyLine ? [storyLine] : []),
        node('p', `대상: ${targetLabel(n, this.data)} · ${newsImpactLabel(n)}`)
      );
      return item;
    }));
    if (!market.newsHistory.length) this.ui['market-news'].append(node('p', '아직 시장 뉴스가 없습니다. 시장 뉴스는 10분 Tick마다 갱신됩니다.', 'muted'));
  }
  // 최근 매도 손익 기록 갱신
  renderSales() {
    const history = Array.isArray(this.save.market?.saleHistory) ? this.save.market.saleHistory.slice(0, 5) : [];
    this.ui['market-sales'].replaceChildren(...history.flatMap(sale => {
      const p = this.data.byId.get(sale.cardId);
      if (!p) return [];
      const item = node('article', '', 'market-sale-item');
      const row = node('div', '', 'market-sale-row');
      const info = node('strong', p.nameKo, 'market-sale-name');
      const values = node('div', '', 'market-sale-values');
      const profit = Number.isFinite(sale.profit) ? sale.profit : null;
      const gain = Number.isFinite(sale.returnRate) ? sale.returnRate : null;
      values.append(
        node('strong', profit === null ? '기록 부족' : signedMoney(profit), profit === null || profit === 0 ? '' : directionClass(profit)),
        node('span', gain === null ? '기록 부족' : percent(gain), gain === null || gain === 0 ? '' : directionClass(gain))
      );
      row.append(imageOrPlaceholder(p.slotImage, node('span', '✧'), p.nameKo, true), info, values);
      item.append(row);
      return [item];
    }));
    if (!history.length) this.ui['market-sales'].append(node('p', '아직 판매 기록이 없습니다.', 'muted'));
  }
}
