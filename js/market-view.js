import { GRADES, TYPES, imageOrPlaceholder, typeImage } from './data.js';
import { assets, changePercent, currentTradeAmount, currentTradeVolume, priceHistory, MARKET_CONFIG } from './market.js';

export const money = n => n.toLocaleString('ko-KR') + ' TC';
const percent = n => n === null ? '기록 부족' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const signedMoney = n => `${n > 0 ? '+' : ''}${Math.round(n).toLocaleString('ko-KR')} TC`;
const directionClass = n => n > 0 ? 'market-up' : n < 0 ? 'market-down' : 'muted';
const targetLabel = (n, data) => n.target === 'card' ? data.byId.get(n.cardId)?.nameKo : n.target === 'type' ? `${TYPES[n.type]?.[0] ?? n.type}타입` : `${GRADES[n.target] ?? n.target} 포켓몬`;

// 뉴스 내용에 맞는 포켓몬 세계관 출처를 고정적으로 선택한다.
// 뉴스 id를 이용하므로 화면을 다시 그려도 같은 뉴스의 출처가 바뀌지 않는다.
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
  if (n.transition === 'rarity') return stableSource(NEWS_SOURCES.official, n.id);
  if (n.target === 'card') return stableSource(NEWS_SOURCES.media, n.id);
  if (n.transition === 'counter') return stableSource([...NEWS_SOURCES.media, ...NEWS_SOURCES.official], n.id);
  return stableSource(NEWS_SOURCES.research, n.id);
};

const newsDescription = (n, data) => {
  const type = n.type ? `${TYPES[n.type]?.[0] ?? n.type}타입` : '';
  const opposed = n.opposedType ? `${TYPES[n.opposedType]?.[0] ?? n.opposedType}타입` : '';
  const pokemon = n.target === 'card' ? (data.byId.get(n.cardId)?.nameKo ?? '해당 포켓몬') : '';

  if (n.transition === 'rarity') {
    const grade = `${GRADES[n.target] ?? n.target} 포켓몬`;
    return `최근 ${grade} 카드에 투자자들의 관심이 집중되고 있습니다. 관련 카드의 거래량과 매수세가 함께 증가하고 있습니다. 일부 카드에서는 높은 가격에도 거래가 이어지고 있으며, 당분간 가격 변동성이 커질 가능성이 있습니다.`;
  }
  if (n.target === 'card') {
    if (n.transition === 'counter') {
      return `${opposed}의 강세에 대응하려는 움직임이 나타나면서 ${pokemon}에 대한 수요가 증가하고 있습니다. 관련 카드를 찾는 투자자가 늘어나며 거래량도 함께 증가하고 있습니다. 시장에서는 새로운 대응 종목으로 주목받는 모습입니다.`;
    }
    if (n.transition === 'continue') {
      return `${pokemon}에 대한 높은 관심이 계속되고 있습니다. 매수세가 유지되며 거래 활동도 활발하게 이어지고 있습니다. 가격 상승 이후에도 거래량이 크게 감소하지 않아 강세 흐름이 유지되고 있습니다.`;
    }
    return `${pokemon}에 새로운 매수세가 유입되고 있습니다. 거래량 증가와 함께 시장의 관심도 빠르게 높아지고 있습니다. 최근 거래가 연이어 체결되면서 단기간에 가격 변동폭이 확대되는 모습입니다.`;
  }
  if (n.transition === 'counter') {
    return `${opposed} 중심이던 시장에서 변화가 나타나고 있습니다. 이를 견제하는 ${type} 카드에 새로운 수요가 유입되고 있습니다. 일부 투자자들이 기존 강세 종목에서 자금을 이동시키면서 시장의 중심도 점차 변하고 있습니다.`;
  }
  if (n.transition === 'continue') {
    return `${type} 카드의 강세 흐름이 계속되고 있습니다. 기존 매수세가 유지되면서 관련 카드의 거래대금도 높은 수준을 보이고 있습니다. 단기 상승 이후에도 수요가 줄지 않아 시장의 관심이 지속되는 모습입니다.`;
  }
  return `새롭게 ${type} 카드에 매수세가 유입되고 있습니다. 시장에서 관련 카드의 거래 활동도 빠르게 증가하고 있습니다. 여러 종목에서 동시에 가격 상승 움직임이 나타나면서 ${type} 카드 전반으로 관심이 확산되고 있습니다.`;
};

const dateLabel = t => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const node = (tag, text, className = '') => {
  const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
};
const typeIcons = (types, containerClass = 'market-type-icons', iconClass = 'market-type-icon') => {
  const icons = node('span', '', containerClass);
  for (const type of types) {
    const image = typeImage(type, iconClass);
    if (image) icons.append(image);
  }
  return icons;
};

export class MarketView {
  constructor(data, save, onSell) {
    this.data = data; this.save = save; this.selected = data.records[0].id;
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

    // 왼쪽 영역에서 최저가와 평균 획득가 라벨이 가까우면 세로 간격을 자동 확보한다.
    if (hasAverage && lowX < 210 && Math.abs(lowLabelY - averageLabelY) < 13) {
      const aboveAverage = Math.min(lowPointY - 8, averageLabelY - 12);
      if (aboveAverage >= 12) lowLabelY = aboveAverage;
      else lowLabelY = Math.min(180, averageLabelY + 13);
    }

    // 텍스트는 가격선보다 나중에 그려 보라색 선이 글자를 가리지 않게 한다.
    if (averageLabel) chart.append(averageLabel);
    const highLabel = pointLabel(`최고 ${money(high)}`, highIndex, yAt(high) - 6);
    // 최고 TC도 평균 획득가/최저 TC와 동일한 흰색 테두리 두께를 명시적으로 적용한다.
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
      summary.append(node('small', newsSource(n), 'market-up'), node('strong', n.title));
      const impact = `주요 변동폭 ±${Math.round(n.impact * 100)}%`;
      item.append(
        summary,
        node('p', newsDescription(n, this.data)),
        node('p', `대상: ${targetLabel(n, this.data)} · ${impact}`)
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
