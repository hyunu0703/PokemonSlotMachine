import { SAVE_KEY, readSave } from './storage.js';
export { SAVE_KEY, readSave } from './storage.js';
import { createMarket, validMarket, advanceMarket, MARKET_CONFIG, spend, acquire, sell } from './market.js';
import { MarketView, money } from './market-view.js';
import { loadData, TYPES } from './data.js';
import { Collection, createCard } from './collection.js';
import { Slot, animate } from './slot.js';

// Inline type pictograms reuse the existing type palette; no asset requests or library.
const TYPE_SHAPES = {
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
};
function typeImage(type) {
  const [label, color] = TYPES[type];
  const image = new Image();
  image.className = 'reveal-type'; image.alt = label;
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 80 80">' +
    '<circle cx="40" cy="40" r="39" fill="' + color + '"/>' +
    '<g transform="translate(8 8)" fill="white" color="' + color + '">' + TYPE_SHAPES[type] + '</g></svg>');
  return image;
}
const hold = ms => new Promise(resolve => setTimeout(resolve, ms));

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
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
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
    async function catchUp() {
      if (marketUpdating) return;
      marketUpdating = true; slot.refresh();
      const now = Date.now();
      let result, updated = false;
      try {
        do {
          result = advanceMarket(save.market, data.records, now);
          updated ||= result.ticks > 0;
          if (result.remaining) {
            byId('market-time').textContent = '시장 기록을 반영하는 중… 남은 ' + result.remaining + ' Tick';
            await hold(0);
          }
        } while (result.remaining);
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
