import { GRADES, TYPES, imageOrPlaceholder } from './data.js';
import { assets, changePercent, priceHistory, marketReturn, MARKET_CONFIG } from './market.js';

export const money = n => n.toLocaleString('ko-KR') + ' TC';
const percent = n => n === null ? '기록 부족' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const directionClass = n => n > 0 ? 'market-up' : n < 0 ? 'market-down' : 'muted';
const targetLabel = (n, data) => n.target === 'card' ? data.byId.get(n.cardId)?.nameKo : n.target === 'type' ? `${TYPES[n.type]?.[0] ?? n.type}타입` : `${GRADES[n.target] ?? n.target} 포켓몬`;
const dateLabel = t => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const node = (tag, text, className = '') => {
  const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
};

export class MarketView {
  constructor(data, save, onSell) {
    this.data = data; this.save = save; this.selected = data.records[0].id;
    this.page = 0; this.pageSize = 25; this.period = '1H'; this.ownedSort = 'price';
    this.ui = Object.fromEntries(['market', 'market-assets', 'market-detail', 'market-news', 'market-rows', 'market-grade', 'market-search', 'market-sort', 'market-page', 'market-prev', 'market-next', 'market-time', 'market-owned-sort', 'market-owned-rows', 'market-owned-empty'].map(id => [id, document.getElementById(id)]));
    for (const id of ['market-grade', 'market-search', 'market-sort']) this.ui[id].addEventListener(id === 'market-search' ? 'input' : 'change', () => { this.page = 0; this.renderList(); });
    this.ui['market-prev'].addEventListener('click', () => { this.page--; this.renderList(); });
    this.ui['market-next'].addEventListener('click', () => { this.page++; this.renderList(); });
    this.ui['market-owned-sort'].addEventListener('click', event => {
      const button = event.target.closest('[data-sort]');
      if (button) { this.ownedSort = button.dataset.sort; this.renderOwned(); }
    });
    for (const id of ['market-rows', 'market-owned-rows']) this.ui[id].addEventListener('click', event => {
      const button = event.target.closest('[data-card]');
      if (button) { this.selected = Number(button.dataset.card); this.renderDetail(); }
    });
    this.ui['market-detail'].addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.dataset.period) { this.period = button.dataset.period; this.renderDetail(); }
      if (button?.dataset.sell) onSell(this.selected, button.dataset.sell === 'all');
    });
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
      }
      box.append(node('span', label, 'muted'), amount); return box;
    }));
    this.ui['market-time'].textContent = `최근 갱신 ${dateLabel(market.lastMarketUpdate)} · 다음 ${dateLabel(market.lastMarketUpdate + MARKET_CONFIG.tickMs)} · 10분마다 갱신`;

    this.renderDetail(); this.renderList(); this.renderNews(); this.renderOwned();
  }
  renderDetail() {
    const p = this.data.byId.get(this.selected), card = this.save.market.cards[p.id], count = this.save.quantity[p.id] ?? 0;
    const heading = node('div', '', 'market-card-heading');
    const fallback = node('span', '✧');
    heading.append(imageOrPlaceholder(p.cardImage, fallback, p.nameKo));
    const info = node('div', ''); info.append(node('span', `${GRADES[p.grade]} · No.${p.id}`, 'eyebrow'), node('h2', p.nameKo), node('strong', money(card.currentPrice), 'market-price'));
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
    const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chart.setAttribute('viewBox', '0 0 600 190'); chart.setAttribute('role', 'img'); chart.setAttribute('aria-label', `${p.nameKo} ${this.period} 가격 차트. 최저 ${Math.min(...history)} TC, 최고 ${Math.max(...history)} TC`); chart.classList.add('market-chart');
    const low = Math.min(...history), high = Math.max(...history), spread = high - low || high * .05;
    const points = history.map((value, index) => `${20 + index / Math.max(1, history.length - 1) * 560},${165 - (value - low) / spread * 140}`);
    if (history.length === 1) points.push(`580,165`);
    const line = document.createElementNS(chart.namespaceURI, 'polyline'); line.setAttribute('points', points.join(' ')); line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#A782E3'); line.setAttribute('stroke-width', '3'); chart.append(line);
    const range = node('p', `최저 ${money(low)} · 최고 ${money(high)} · ${history.length}개 기록`, 'muted');
    const chartNote = node('p', `ALL은 최근 7일의 시간별 기록입니다. ${dateLabel(start)} ~ ${dateLabel(end)}`, 'muted');
    const holding = node('p', `현재 보유 ${count}장 · 평가액 ${money(count * card.currentPrice)}`, 'market-holding');
    const sales = node('div', '', 'modal-actions');
    for (const [kind, label] of [['one', '1장 매도'], ['all', '전체 매도']]) {
      const button = node('button', label, kind === 'one' ? 'primary' : 'secondary'); button.dataset.sell = kind; button.disabled = !count; sales.append(button);
    }
    this.ui['market-detail'].replaceChildren(heading, changes, periods, chart, range, chartNote, holding, sales);
  }
  renderList() {
    const grade = this.ui['market-grade'].value, query = this.ui['market-search'].value.trim().toLowerCase(), sort = this.ui['market-sort'].value;
    const market = this.save.market;
    const records = this.data.records.filter(p => (grade === 'all' || grade === p.grade) && (!query || p.nameKo.includes(query) || p.nameEn.toLowerCase().includes(query) || String(p.id) === query));
    const value = p => sort === 'amount' ? market.cards[p.id].trade24h.amountTotal
      : sort === 'volume' ? market.cards[p.id].trade24h.volumeTotal : marketReturn(market.cards[p.id]);
    records.sort((a, b) => sort === 'return-low' ? value(a) - value(b) : value(b) - value(a));
    const pages = Math.max(1, Math.ceil(records.length / this.pageSize)); this.page = Math.max(0, Math.min(this.page, pages - 1));
    this.ui['market-rows'].replaceChildren(...records.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize).map(p => {
      const row = node('tr', ''), c = market.cards[p.id], change = changePercent(c);
      const name = node('td', ''), button = node('button', p.nameKo, 'market-name'); button.dataset.card = p.id; name.append(button);
      row.append(name, node('td', GRADES[p.grade]), node('td', money(c.currentPrice)), node('td', percent(change), directionClass(change)), node('td', `${this.save.quantity[p.id] ?? 0}장`)); return row;
    }));
    this.ui['market-page'].textContent = `${this.page + 1} / ${pages} · ${records.length}종목`;
    this.ui['market-prev'].disabled = this.page === 0; this.ui['market-next'].disabled = this.page >= pages - 1;
  }
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
    for (const button of this.ui['market-owned-sort'].children) button.setAttribute('aria-pressed', String(button.dataset.sort === this.ownedSort));
    this.ui['market-owned-empty'].hidden = records.length > 0;
    this.ui['market-owned-rows'].hidden = records.length === 0;
    this.ui['market-owned-rows'].replaceChildren(...records.map(p => {
      const row = node('article', '', 'market-owned-item'), info = node('div', '', 'market-owned-info');
      const button = node('button', p.nameKo, 'market-name'); button.dataset.card = p.id;
      const name = node('div', '', 'market-owned-name'); name.append(button, node('span', '×' + this.save.quantity[p.id]));
      const average = this.save.averageAcquisitionPrice?.[p.id], quote = price(p), change = gain(p);
      const stats = node('div', '', 'market-owned-stats');
      stats.append(node('span', '평균 획득가 ' + (Number.isFinite(average) && average > 0 ? money(Math.round(average)) : '기록 부족')),
        node('span', '현재가 ' + (Number.isFinite(quote) && quote > 0 ? money(quote) : '기록 부족')),
        node('span', '수익률 ' + percent(change), change === 0 ? '' : directionClass(change)));
      info.append(name, stats); row.append(imageOrPlaceholder(p.slotImage, node('span', '✧'), p.nameKo, true), info);
      return row;
    }));
  }
  renderNews() {
    const market = this.save.market;
    this.ui['market-news'].replaceChildren(...market.newsHistory.map(n => {
      const item = node('details', '', 'market-news-item'), summary = node('summary', '');
      summary.append(node('small', `${dateLabel(n.time)} · 시장 뉴스`, 'market-up'), node('strong', n.title));
      const impact = `주요 변동폭 ±${Math.round(n.impact * 100)}%`;
      item.append(summary, node('p', `대상: ${targetLabel(n, this.data)} · ${impact} · 10분 Tick에 즉시 반영`)); return item;
    }));
    if (!market.newsHistory.length) this.ui['market-news'].append(node('p', '아직 시장 뉴스가 없습니다. 시장 뉴스는 10분 Tick마다 갱신됩니다.', 'muted'));
  }
}
