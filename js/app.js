import { SAVE_KEY, readSave, writeSave } from './storage.js';
export { SAVE_KEY, readSave } from './storage.js';
import { createMarket, validMarket, advanceMarket, advanceDebugTicks, MARKET_CONFIG, spend, acquire, sell } from './market.js';
import { MarketView, money } from './market-view.js';
import { loadData, typeImage } from './data.js';
import { Collection, createCard } from './collection.js';
import { Slot, animate } from './slot.js';

const hold = ms => new Promise(resolve => setTimeout(resolve, ms));
const MARKET_DEBUG = ['localhost', '127.0.0.1'].includes(location.hostname);

async function init() {
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries(['app', 'load-status', 'home-count', 'home-percent', 'home-progress', 'card-modal', 'modal-title', 'modal-card', 'reveal-stage', 'win-actions', 'card-close', 'continue', 'view-collection', 'reset-modal', 'sound', 'music', 'toast'].map(id => [id, byId(id)]));
  const nav = [...document.querySelectorAll('nav button')];
  const screens = [...document.querySelectorAll('.screen')];
  let busy = false, toastTimer, lastAcquired = null, revealing = false;
  const toast = message => {
    clearTimeout(toastTimer); ui.toast.textContent = message; ui.toast.hidden = false;
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 3500);
  };
  try {
    const data = await loadData();
    const save = readSave(data.ids);
    const ids = new Set(save.collectedIds);
    if (!validMarket(save.market, data.records)) save.market = createMarket(data.records);
    let marketUpdating = false;
    let marketView;
    const updateWallet = () => { byId('wallet').textContent = money(save.tc); };
    const persist = () => {
      save.collectedIds = [...ids];
      try { writeSave(save); }
      catch { toast('저장 공간을 사용할 수 없어 이번 변경을 저장하지 못했습니다.'); }
    };
    const showPage = page => {
      if (busy) return;
      for (const screen of screens) screen.hidden = screen.id !== page;
      for (const button of nav) {
        if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      if (page === 'market') { marketView?.render(); void catchUp(); }
      if (page === 'collection') collection.render();
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    const closeCard = () => { if (!revealing) ui['card-modal'].close(); };
    const collection = new Collection(data, ids, p => {
      if (!ids.has(p.id)) { toast('아직 획득하지 않은 포켓몬입니다.'); return; }
      ui['modal-title'].textContent = `${p.nameKo} · 보유 ${save.quantity[p.id] ?? 0}장`;
      ui['modal-card'].replaceChildren(createCard(p));
      ui['win-actions'].hidden = true;
      ui['card-modal'].className = 'detail';
      ui['card-modal'].showModal();
    }, save.quantity);
    const sync = () => {
      ui['home-count'].textContent = `${ids.size} / ${data.records.length}`;
      ui['home-percent'].textContent = `${(ids.size / data.records.length * 100).toFixed(1)}%`;
      ui['home-progress'].value = ids.size;
      updateWallet(); slot.refresh();
      if (!byId('collection').hidden) collection.render();
      marketView?.render();
    };
    const slot = new Slot(data, ids, {
      canSpend(cost) { return !marketUpdating && save.tc >= cost; },
      onStart(cost) {
        if (marketUpdating || !spend(save, cost)) return false;
        persist(); updateWallet(); return true;
      },
      onBusy(value) { busy = value; for (const button of nav) button.disabled = value; },
      async onWin(p, grade) {
        revealing = true; lastAcquired = p.id;
        ui['modal-title'].textContent = save.quantity[p.id] > 1 ? `DUPLICATE · 보유 ${save.quantity[p.id]}장` : grade === 'normal' ? 'NEW CARD!' : grade === 'legendary' ? 'LEGENDARY' : 'MYTHICAL DISCOVERED';
        const card = createCard(p);
        ui['modal-card'].replaceChildren(card);
        ui['win-actions'].hidden = false;
        ui['continue'].disabled = true; ui['view-collection'].disabled = true; ui['card-close'].disabled = true;
        ui['card-modal'].className = `reward ${grade} revealing`;
        // Move the existing artwork through the reveal, then return it to its card.
        const illustration = card.querySelector('.card-illustration');
        const artwork = illustration.firstElementChild;
        const information = [card.querySelector('.dex'), card.querySelector('.card-name'), card.querySelector('.type-badges'), card.querySelector('.grade-badge')];
        const bottom = card.querySelector('.card-bottom');
        const body = document.createElement('div'); body.className = 'reveal-body';
        const aura = document.createElement('div'); aura.className = 'reveal-aura';
        const wave = document.createElement('div'); wave.className = 'reveal-wave';
        const orbit = document.createElement('div'); orbit.className = 'reveal-orbit';
        orbit.textContent = '✧';
        card.classList.add('forming');
        card.style.opacity = '0';
        for (const node of [...information, bottom]) node.style.opacity = '0';
        body.style.filter = 'brightness(0)';
        body.setAttribute('aria-hidden', 'true');
        card.setAttribute('aria-hidden', 'true');
        body.style.opacity = '0'; aura.style.opacity = '0'; wave.style.opacity = '0'; orbit.style.opacity = '0';
        ui['reveal-stage'].append(aura, wave, orbit, body);
        slot.shade.style.opacity = '0'; // The modal backdrop now supplies the grade's dimming.
        ui['card-modal'].showModal();
        const target = artwork.getBoundingClientRect();
        const stage = ui['reveal-stage'].getBoundingClientRect();
        body.style.width = target.width + 'px'; body.style.height = target.height + 'px';
        body.style.left = (target.left - stage.left) + 'px'; body.style.top = (target.top - stage.top) + 'px';
        const offsetY = stage.height / 2 - (target.top - stage.top + target.height / 2);
        const full = 'translateY(' + offsetY + 'px) scale(1.3)';
        body.style.transform = full;
        body.append(artwork);
        try {
          // Only one type image exists at a time, in the data's original order.
          for (const type of p.types) {
            const image = typeImage(type);
            await image.decode();
            ui['reveal-stage'].append(image);
            await hold(550);
            await animate(image, [{ opacity: 1 }, { opacity: 0 }], 150, { duration: 150 });
            image.remove();
          }
          if (grade !== 'normal') {
            body.style.filter = 'brightness(0)';
            if (grade === 'mythical') {
              await animate(aura, [{ opacity: 0, transform: 'scale(.30)' }, { opacity: 1, transform: 'scale(1)' }], 500);
              aura.style.opacity = '1';
            }
            await animate(body, [{ opacity: 0 }, { opacity: 1 }], grade === 'legendary' ? 300 : 380);
            body.style.opacity = '1';
            if (grade === 'legendary') {
              await animate(aura, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)' }], 320);
              aura.style.opacity = '1';
              await animate(ui['reveal-stage'], [{ backgroundColor: 'transparent' },{ backgroundColor: 'transparent' }], 120);
            } else {
              await animate(orbit, [{ opacity: 0, transform: 'rotate(0deg)' }, { opacity: 1, offset: .25 }, { opacity: 0, transform: 'rotate(180deg)' }], 500);
            }
            await animate(body, [{ filter: 'brightness(0)' }, { filter: 'brightness(1)' }], grade === 'legendary' ? 360 : 700);
            body.style.filter = '';
            if (grade === 'mythical') await animate(wave, [{ opacity: .8, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.4)' }], 400);
          } else {
            await animate(body, [{ opacity: 0, transform: 'translateY(' + (offsetY + 18) + 'px) scale(.91)' }, { opacity: 1, transform: 'translateY(' + offsetY + 'px) scale(1.404)', offset: .7 }, { opacity: 1, transform: full }], 360);
            body.style.opacity = '1';
            await animate(body, [{ transform: full }, { transform: 'translateY(' + (offsetY - 10) + 'px) scale(1.3)' }, { transform: full }], 260);
            await animate(body, [{ filter: 'brightness(0)' }, { filter: 'brightness(1)' }], 220);
            body.style.filter = '';
          }
          await animate(card, grade === 'mythical'
            ? [{ opacity: 0, clipPath: 'inset(0 100% 100% 0 round 22px)' }, { opacity: 1, clipPath: 'inset(0 round 22px)' }]
            : [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }], grade === 'normal' ? 280 : grade === 'legendary' ? 300 : 480);
          card.style.opacity = '1';
          await animate(body, [{ transform: full }, { transform: 'translateY(0) scale(1)' }], grade === 'normal' ? 380 : grade === 'legendary' ? 450 : 500);
          illustration.append(artwork); body.remove(); aura.remove();
          card.classList.remove('forming');
          // Reveal metadata only after the card is complete, at the specified intervals.
          const gap = grade === 'mythical' ? 100 : 80;
          await Promise.all(information.map(async (node, index) => {
            await animate(node, [{ opacity: 0 }, { opacity: 1 }], 140, { delay: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : index * gap });
            node.style.opacity = '1';
            if (index === 2) bottom.style.opacity = '1';
          }));
          card.removeAttribute('aria-hidden');
          ui['card-modal'].classList.remove('revealing');
          await animate(ui['modal-title'], [{ opacity: 0 }, { opacity: 1 }], grade === 'normal' ? 220 : grade === 'legendary' ? 260 : 280);
        } finally {
          illustration.append(artwork);
          body.remove(); aura.remove(); wave.remove(); orbit.remove();
          ui['reveal-stage'].querySelector('.reveal-type')?.remove();
          card.removeAttribute('aria-hidden');
          card.classList.remove('forming'); card.style.opacity = '';
          for (const node of [...information, bottom]) node.style.opacity = '';
          ui['card-modal'].classList.remove('revealing');
          revealing = false;
          ui['continue'].disabled = false; ui['view-collection'].disabled = false; ui['card-close'].disabled = false;
          ui['continue'].focus();
        }
      },
      onCollect(p) { acquire(save, ids, p.id); persist(); sync(); },
    });
    marketView = new MarketView(data, save, (id, all) => {
      if (marketUpdating || busy) return;
      // Settle elapsed time first so a sale always uses the current market quote.
      if (Date.now() - save.market.lastMarketUpdate >= MARKET_CONFIG.tickMs) {
        void catchUp(); toast('시장 가격을 갱신했습니다. 현재 가격을 확인한 뒤 매도해 주세요.'); return;
      }
      const proceeds = sell(save, id, all);
      if (proceeds) { persist(); sync(); toast(money(proceeds) + '를 받았습니다.'); }
    });
    const debugPanel = byId('market-debug');
    const debugButtons = [...document.querySelectorAll('[data-debug-ticks]')];
    if (MARKET_DEBUG) debugPanel.hidden = false;
    const runDebugTicks = count => {
      if (!MARKET_DEBUG || marketUpdating || busy) return;
      marketUpdating = true; slot.refresh();
      for (const button of debugButtons) button.disabled = true;
      try {
        const ticks = advanceDebugTicks(save.market, data.records, count, Math.random, save.version >= 4);
        if (!ticks) return;
        persist(); marketView.render();
        const minutes = ticks * 10;
        toast(`${ticks} Tick (${minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`}) 진행했습니다.`);
      } finally {
        marketUpdating = false; slot.refresh();
        for (const button of debugButtons) button.disabled = false;
      }
    };
    for (const button of debugButtons) button.addEventListener('click', () => runDebugTicks(Number(button.dataset.debugTicks)));
    async function catchUp() {
      if (marketUpdating) return;
      marketUpdating = true; slot.refresh();
      const now = Date.now();
      let result, updated = false;
      try {
        do {
          result = advanceMarket(save.market, data.records, now, Math.random, 36, save.version >= 4);
          updated ||= result.ticks > 0;
          if (result.remaining) {
            byId('market-time').textContent = '시장 기록을 반영하는 중… 남은 ' + result.remaining + ' Tick';
            await hold(0);
          }
        } while (result.remaining);
        for (const [id, count] of Object.entries(save.quantity)) {
          const quote = save.market.cards[id]?.currentPrice;
          if (count > 0 && save.averageAcquisitionPrice[id] === undefined && Number.isFinite(quote) && quote > 0) {
            save.averageAcquisitionPrice[id] = quote; updated = true;
          }
        }
        if (save.version < 4) { save.version = 4; updated = true; }
        if (updated) { persist(); marketView.render(); }
      } finally { marketUpdating = false; slot.refresh(); }
    }
    for (const button of nav) button.addEventListener('click', () => showPage(button.dataset.page));
    document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); showPage('home'); });
    byId('start').addEventListener('click', () => showPage('slot'));
    ui['card-close'].addEventListener('click', closeCard);
    ui.continue.addEventListener('click', closeCard);
    ui['card-modal'].addEventListener('cancel', event => { if (revealing) event.preventDefault(); });
    ui['card-modal'].addEventListener('click', event => { if (event.target === ui['card-modal']) closeCard(); });
    ui['view-collection'].addEventListener('click', () => { closeCard(); showPage('collection'); collection.reveal(lastAcquired); });
    for (const [id, key] of [['sound', 'soundEnabled'], ['music', 'musicEnabled']]) {
      const renderSetting = () => { ui[id].textContent = save[key] ? 'ON' : 'OFF'; ui[id].setAttribute('aria-checked', String(save[key])); };
      renderSetting();
      ui[id].addEventListener('click', () => { save[key] = !save[key]; persist(); renderSetting(); });
    }
    byId('reset-open').addEventListener('click', () => { if (!busy) ui['reset-modal'].showModal(); });
    byId('reset-cancel').addEventListener('click', () => ui['reset-modal'].close());
    byId('reset-confirm').addEventListener('click', () => {
      if (busy || marketUpdating) return;
      ids.clear(); for (const id of Object.keys(save.quantity)) delete save.quantity[id];
      save.averageAcquisitionPrice = {};
      save.tc = MARKET_CONFIG.initialTC; save.market = createMarket(data.records);
      persist(); slot.resetVisuals(); sync(); ui['reset-modal'].close();
      toast('수집·TC·시장 데이터가 초기화되었습니다.');
    });
    await catchUp(); persist(); sync(); showPage('home');
    setInterval(() => { void catchUp(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void catchUp(); });
    window.addEventListener('focus', () => { void catchUp(); });
    ui['load-status'].hidden = true; ui.app.setAttribute('aria-busy', 'false');
  } catch (error) {
    ui['load-status'].textContent = `${error.message} 정적 파일을 제공하는 로컬 미리보기에서 열어주세요.`;
    ui.app.setAttribute('aria-busy', 'false');
  }
}

if (typeof document !== 'undefined') init();
