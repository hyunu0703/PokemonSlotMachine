import { loadData } from './data.js';
import { Collection, createCard } from './collection.js';
import { Slot, animate } from './slot.js';

export const SAVE_KEY = 'pokemonSlotSaveV1';
export function readSave(validIds, storage) {
  const defaults = { version: 1, collectedIds: [], soundEnabled: true, musicEnabled: true };
  try {
    storage ??= globalThis.localStorage;
    const parsed = JSON.parse(storage.getItem(SAVE_KEY));
    if (!parsed || parsed.version !== 1) return defaults;
    return {
      version: 1,
      collectedIds: [...new Set((Array.isArray(parsed.collectedIds) ? parsed.collectedIds : []).filter(id => Number.isInteger(id) && validIds.has(id)))],
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : true,
    };
  } catch { return defaults; }
}

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
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    const closeCard = () => { if (!revealing) ui['card-modal'].close(); };
    const collection = new Collection(data, ids, p => {
      if (!ids.has(p.id)) { toast('아직 획득하지 않은 포켓몬입니다.'); return; }
      ui['modal-title'].textContent = p.nameKo;
      ui['modal-card'].replaceChildren(createCard(p));
      ui['win-actions'].hidden = true;
      ui['card-modal'].className = 'detail';
      ui['card-modal'].showModal();
    });
    const sync = () => {
      ui['home-count'].textContent = `${ids.size} / ${data.records.length}`;
      ui['home-percent'].textContent = `${(ids.size / data.records.length * 100).toFixed(1)}%`;
      ui['home-progress'].value = ids.size;
      slot.refresh(); collection.render();
    };
    const slot = new Slot(data, ids, {
      onBusy(value) { busy = value; for (const button of nav) button.disabled = value; },
      async onWin(p, grade) {
        revealing = true; lastAcquired = p.id;
        ui['modal-title'].textContent = grade === 'normal' ? 'NEW CARD!' : grade === 'legendary' ? 'LEGENDARY' : 'MYTHICAL DISCOVERED';
        const card = createCard(p);
        ui['modal-card'].replaceChildren(card);
        ui['win-actions'].hidden = false;
        ui['continue'].disabled = true; ui['view-collection'].disabled = true; ui['card-close'].disabled = true;
        ui['card-modal'].className = `reward ${grade} revealing`;
        ui['modal-card'].style.filter = grade === 'mythical' ? 'brightness(0)' : '';
        ui['card-modal'].showModal();
        if (grade === 'mythical') {
          await animate(ui['modal-card'], [{ filter: 'brightness(0)', opacity: 0 }, { filter: 'brightness(0)', opacity: 1 }], 300);
          ui['reveal-stage'].classList.add('ring-glow');
          await animate(ui['reveal-stage'], [{ opacity: 0.5 }, { opacity: 1 }], 300);
        }
        ui['modal-card'].style.filter = '';
        ui['modal-card'].classList.add('flipping');
        await animate(ui['modal-card'], [{ transform: 'translateY(24px) rotateY(180deg)', opacity: 0 }, { transform: 'translateY(0) rotateY(180deg)', opacity: 1 }], 320);
        await animate(ui['modal-card'], [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0)' }], grade === 'mythical' ? 760 : 520, { easing: 'ease-in-out' });
        ui['modal-card'].classList.remove('flipping');
        ui['card-modal'].classList.remove('revealing');
        ui['reveal-stage'].classList.remove('ring-glow');
      },
      onCollect(p) {
        if (!ids.has(p.id)) { ids.add(p.id); persist(); sync(); }
        revealing = false;
        ui['continue'].disabled = false; ui['view-collection'].disabled = false; ui['card-close'].disabled = false;
        ui['continue'].focus();
      },
    });
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
      if (busy) return;
      ids.clear(); persist(); slot.resetVisuals(); sync(); ui['reset-modal'].close();
      toast('수집 데이터가 초기화되었습니다.');
    });
    persist(); sync(); showPage('home');
    ui['load-status'].hidden = true; ui.app.setAttribute('aria-busy', 'false');
  } catch (error) {
    ui['load-status'].textContent = `${error.message} 정적 파일을 제공하는 로컬 미리보기에서 열어주세요.`;
    ui.app.setAttribute('aria-busy', 'false');
  }
}

if (typeof document !== 'undefined') init();
