import { GRADES, imageOrPlaceholder, preloadImages } from './data.js';
import { createCard } from './collection.js';

export const SLOT_CONFIG = Object.freeze({
  normal: Object.freeze({ cost: 1000, total: 931, candidateLimit: 10, winRate: 0.50, stops: [1900, 2100, 2300] }),
  legendary: Object.freeze({ cost: 25000, total: 71, candidateLimit: 7, winRate: 0.20, stops: [2100, 2350, 2600] }),
  mythical: Object.freeze({ cost: 150000, total: 23, candidateLimit: 4, winRate: 0.10, stops: [2250, 2525, 2800] }),
});

export function selectCandidates(remaining, limit, random = Math.random) {
  const pool = remaining.slice();
  const size = Math.min(limit, pool.length);
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

export function createResult(candidates, won, random = Math.random) {
  const size = candidates.length;
  if (!size) throw new Error('후보가 없습니다.');
  const pick = () => Math.floor(random() * size);
  if (won) { const p = candidates[pick()]; return [p, p, p]; }
  if (size === 1) {
    const result = [candidates[0], candidates[0], candidates[0]];
    result[Math.floor(random() * 3)] = null; // MISS is never a species or a saved ID.
    return result;
  }
  const indexes = [pick(), pick(), pick()];
  if (indexes[0] === indexes[1] && indexes[1] === indexes[2]) {
    indexes[2] = (indexes[0] + 1 + Math.floor(random() * (size - 1))) % size;
  }
  return indexes.map(i => candidates[i]);
}

export function stopTimes(grade, result) {
  const times = [...SLOT_CONFIG[grade].stops];
  if (result[0]?.id === result[1]?.id) times[2] += 350;
  return times;
}

export function slotSymbol(p) {
  const symbol = document.createElement('div');
  symbol.className = 'slot-symbol';
  const placeholder = document.createElement('span');
  placeholder.setAttribute('aria-hidden', 'true');
  symbol.append(imageOrPlaceholder(p?.slotImage, placeholder, ''));
  symbol.setAttribute('aria-label', p ? '포켓몬 초상화' : '빈 슬롯');
  return symbol;
}

const idleSymbol = () => {
  const placeholder = document.createElement('div');
  placeholder.className = 'idle-symbol'; placeholder.textContent = '✧';
  return placeholder;
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export async function animate(node, keyframes, duration, options = {}) {
  const animation = node.animate(keyframes, { duration: reduced() ? 1 : duration, fill: 'forwards', ...options });
  try { await animation.finished; } finally { animation.cancel(); }
}
const hold = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const BATCH_TIME_SCALE = 0.20; // 다회 뽑기는 기존 슬롯 연출의 약 5배속으로 재생한다.

// Integral of velocity: linear acceleration (350ms), cruise, linear deceleration (500ms).
function travel(t, end) {
  if (t <= 350) return t * t / 700;
  if (t <= end - 500) return 175 + t - 350;
  const decel = Math.min(500, t - (end - 500));
  return 175 + end - 850 + decel - decel * decel / 1000;
}

export class Slot {
  constructor(data, ids, { onBusy, onWin, onCollect, onStart, onBatchStart, onBatchSummary, canSpend }) {
    this.data = data; this.ids = ids; this.onBusy = onBusy; this.onWin = onWin; this.onCollect = onCollect;
    this.onStart = onStart; this.onBatchStart = onBatchStart; this.onBatchSummary = onBatchSummary; this.canSpend = canSpend;
    this.grade = 'normal'; this.drawCount = 1; this.isSpinning = false;
    this.pools = { normal: [], legendary: [], mythical: [] };
    for (const p of data.records) this.pools[p.grade].push(p);
    this.machine = document.getElementById('machine');
    this.reels = [...document.querySelectorAll('#machine .reel')];
    this.tracks = [...document.querySelectorAll('#machine .reel-track')];
    this.tabs = [...document.querySelectorAll('#slot-tabs button')];
    this.spinButton = document.getElementById('spin');
    this.countButtons = [...document.querySelectorAll('#slot-counts button')];
    this.title = document.getElementById('slot-title');
    this.rate = document.getElementById('win-rate');
    this.costCaption = document.getElementById('slot-cost-caption');
    this.costLabel = document.getElementById('slot-cost');
    this.remainingLabel = document.getElementById('remaining');
    this.status = document.getElementById('slot-status');
    this.candidatesPanel = document.querySelector('.candidates-panel');
    this.candidatesUI = document.getElementById('candidates');
    this.candidateCount = document.getElementById('candidate-count');
    this.batchStage = document.getElementById('multi-slot-stage');
    this.batchProgress = document.getElementById('multi-slot-progress');
    this.batchGrid = document.getElementById('multi-slot-grid');
    this.batchResultButton = document.getElementById('multi-slot-result');
    this.batchSkipRequested = false;
    this.effects = document.getElementById('win-effects');
    this.shade = this.effects.querySelector('.effect-shade');
    this.particles = this.effects.querySelector('.effect-particles');
    this.flash = this.effects.querySelector('.effect-flash');
    this.app = document.getElementById('app');
    for (let i = 0; i < 14; i++) {
      const star = document.createElement('i'); star.textContent = i % 2 ? '✦' : '·';
      const angle = i / 14 * Math.PI * 2;
      star.style.setProperty('--x', `${Math.cos(angle) * 220}px`);
      star.style.setProperty('--y', `${Math.sin(angle) * 220}px`);
      this.particles.append(star);
    }
    this.stars = [...this.particles.children];
    this.spinButton.addEventListener('click', () => this.spin());
    this.batchResultButton.addEventListener('click', () => this.requestBatchResult());
    for (const button of this.countButtons) button.addEventListener('click', () => {
      if (this.isSpinning) return;
      this.drawCount = Number(button.dataset.count); this.refresh();
    });
    for (const tab of this.tabs) tab.addEventListener('click', () => {
      if (this.isSpinning) return;
      this.grade = tab.dataset.grade; this.resetVisuals(); this.refresh();
    });
    this.resetVisuals(); this.refresh();
  }
  remaining() { return this.pools[this.grade]; }
  requestBatchResult() {
    if (!this.isSpinning || this.batchStage.hidden) return;
    this.batchSkipRequested = true;
    this.batchResultButton.disabled = true;
    this.batchResultButton.textContent = '결과 준비 중…';
    this.batchProgress.textContent = '남은 연출을 건너뛰고 결과를 준비하고 있습니다.';
  }
  resetVisuals() {
    this.resetBatchStage();
    this.candidatesUI.replaceChildren();
    this.candidateCount.textContent = '0마리';
    this.status.textContent = '새로운 카드를 만나보세요.';
  }
  resetBatchStage() {
    for (const track of this.tracks) {
      track.style.transform = ''; track.replaceChildren(idleSymbol());
    }
    this.machine.hidden = false;
    this.candidatesPanel.hidden = false;
    this.batchStage.hidden = true;
    this.batchGrid.replaceChildren();
    this.batchProgress.textContent = '';
    this.batchSkipRequested = false;
    this.batchResultButton.disabled = false;
    this.batchResultButton.textContent = '결과 보기';
  }
  refresh() {
    const count = this.remaining().length;
    const unitCost = SLOT_CONFIG[this.grade].cost;
    const cost = unitCost * this.drawCount;
    this.machine.className = `machine ${this.grade}`;
    this.title.textContent = `${GRADES[this.grade]} 슬롯`;
    this.rate.textContent = `${SLOT_CONFIG[this.grade].winRate * 100}%`;
    this.remainingLabel.textContent = `${count} / ${this.data.counts[this.grade]}`;
    this.spinButton.disabled = this.isSpinning || count === 0 || !this.canSpend(cost);
    this.costCaption.textContent = this.drawCount === 1 ? '1회 비용' : `${this.drawCount}회 총 비용`;
    this.costLabel.textContent = cost.toLocaleString('ko-KR') + ' TC';
    this.spinButton.firstChild.textContent = count ? 'SPIN ' : 'COMPLETE ';
    if (!count) this.status.textContent = 'COMPLETE · 모든 카드를 수집했습니다.';
    for (const button of this.countButtons) {
      button.disabled = this.isSpinning || count === 0;
      button.setAttribute('aria-pressed', String(Number(button.dataset.count) === this.drawCount));
    }
    for (const tab of this.tabs) {
      tab.disabled = this.isSpinning;
      tab.setAttribute('aria-pressed', String(tab.dataset.grade === this.grade));
    }
  }
  async spin() {
    if (this.isSpinning) return;
    if (this.drawCount === 1) await this.spinSingle();
    else await this.spinBatch();
  }
  async spinSingle() {
    const remaining = this.remaining();
    if (!remaining.length) { this.refresh(); return; }
    const config = SLOT_CONFIG[this.grade], cost = config.cost;
    if (!this.onStart(cost)) { this.status.textContent = 'TC가 부족하거나 시장을 갱신 중입니다.'; this.refresh(); return; }
    const candidates = selectCandidates(remaining, config.candidateLimit);
    this.candidatesUI.replaceChildren(...candidates.map(slotSymbol));
    this.candidateCount.textContent = `${candidates.length}마리`;
    const won = Math.random() < config.winRate;
    const result = createResult(candidates, won);
    const isNew = won && !this.ids.has(result[0].id);
    // Persist the outcome together with the charged spin before any asynchronous animation.
    if (won) this.onCollect(result[0], 1);
    this.isSpinning = true; this.onBusy(true); this.refresh();
    this.status.textContent = '새로운 만남을 기다리는 중…';
    try {
      await preloadImages([...candidates.map(p => p.slotImage), ...(won ? [result[0].cardImage] : [])]);
      await this.spinAnimation(candidates, result, this.reels, this.tracks);
      if (won) {
        await this.celebrate();
        await this.onWin(result[0], this.grade, 1, isNew);
        this.status.textContent = `${result[0].nameKo} 카드를 획득했습니다!`;
      } else {
        this.status.textContent = '아쉬워요! 다시 한번 돌려볼까요?';
        await hold(400);
      }
    } finally {
      this.effects.className = ''; this.machine.classList.remove('winner');
      this.isSpinning = false; this.onBusy(false); this.refresh();
    }
  }
  createBatchOutcome(drawCount, remaining, config) {
    const attempts = [];
    for (let i = 0; i < drawCount; i++) {
      const candidates = selectCandidates(remaining, config.candidateLimit);
      const won = Math.random() < config.winRate;
      const result = createResult(candidates, won);
      attempts.push({ won, candidates, result, pokemon: won ? result[0] : null });
    }
    return attempts;
  }
  createBatchMachine(index) {
    const machine = document.createElement('article');
    machine.className = `batch-machine ${this.grade} waiting`;
    machine.setAttribute('aria-label', `${index + 1}번째 당첨 슬롯 · 대기 중`);
    const header = document.createElement('div'); header.className = 'batch-machine-head';
    const number = document.createElement('span'); number.textContent = `#${index + 1}`;
    const state = document.createElement('strong'); state.textContent = '대기';
    header.append(number, state);
    const reelsWrap = document.createElement('div'); reelsWrap.className = 'batch-reels';
    const reels = [], tracks = [];
    for (let i = 0; i < 3; i++) {
      const reel = document.createElement('div'); reel.className = 'batch-reel';
      const track = document.createElement('div'); track.className = 'batch-reel-track';
      track.append(idleSymbol()); reel.append(track); reelsWrap.append(reel);
      reels.push(reel); tracks.push(track);
    }
    const cardStage = document.createElement('div'); cardStage.className = 'batch-card-stage'; cardStage.hidden = true;
    reelsWrap.append(cardStage);
    const winner = document.createElement('p'); winner.className = 'batch-winner'; winner.textContent = '✧';
    machine.append(header, reelsWrap, winner);
    return { machine, reelsWrap, reels, tracks, cardStage, state, winner };
  }
  prepareBatchStage(winCount, drawCount) {
    this.machine.hidden = true;
    this.candidatesPanel.hidden = true;
    this.batchStage.hidden = false;
    this.batchSkipRequested = false;
    this.batchResultButton.disabled = false;
    this.batchResultButton.textContent = '결과 보기';
    this.batchGrid.replaceChildren();
    this.batchProgress.textContent = `${drawCount}회 계산 완료 · 당첨 ${winCount}회 · 공개 준비 중`;
    if (!winCount) {
      const empty = document.createElement('p'); empty.className = 'batch-empty';
      empty.textContent = '이번에는 당첨된 슬롯이 없습니다.';
      this.batchGrid.append(empty);
      return [];
    }
    const machines = Array.from({ length: winCount }, (_, index) => this.createBatchMachine(index));
    this.batchGrid.append(...machines.map(item => item.machine));
    return machines;
  }
  async spinBatch() {
    const remaining = this.remaining();
    if (!remaining.length) { this.refresh(); return; }
    const config = SLOT_CONFIG[this.grade], drawCount = this.drawCount, cost = config.cost * drawCount;
    if (!this.canSpend(cost)) { this.status.textContent = 'TC가 부족하거나 시장을 갱신 중입니다.'; this.refresh(); return; }

    // All RNG outcomes are fixed before the first winning slot begins to animate.
    const attempts = this.createBatchOutcome(drawCount, remaining, config);
    const wins = attempts.filter(attempt => attempt.won);
    const rewards = wins.map(win => win.pokemon);

    this.isSpinning = true; this.onBusy(true); this.refresh();
    if (!this.onBatchStart(cost, rewards)) {
      this.isSpinning = false; this.onBusy(false);
      this.status.textContent = 'TC가 부족하거나 시장을 갱신 중입니다.'; this.refresh(); return;
    }

    const machines = this.prepareBatchStage(wins.length, drawCount);
    this.status.textContent = `${drawCount}회 결과 계산 완료 · 당첨 ${wins.length}회`;
    try {
      if (!wins.length) {
        await hold(reduced() ? 1 : 700);
      } else {
        for (let i = 0; i < wins.length; i++) {
          if (this.batchSkipRequested) break;
          const win = wins[i], ui = machines[i];
          this.batchProgress.textContent = `당첨 ${wins.length}회 · ${i + 1} / ${wins.length}번째 슬롯 공개 중 · 약 5배속`;
          ui.machine.classList.remove('waiting'); ui.machine.classList.add('active');
          ui.state.textContent = 'SPIN';
          ui.machine.setAttribute('aria-label', `${i + 1}번째 당첨 슬롯 · 회전 중`);
          await preloadImages([...win.candidates.map(p => p.slotImage), win.pokemon.cardImage]);
          if (this.batchSkipRequested) break;
          await this.spinAnimation(win.candidates, win.result, ui.reels, ui.tracks, BATCH_TIME_SCALE, () => this.batchSkipRequested);
          if (this.batchSkipRequested) break;
          await this.celebrateBatch(ui, BATCH_TIME_SCALE);
          if (this.batchSkipRequested) break;
          ui.state.textContent = 'CARD';
          this.batchProgress.textContent = `당첨 ${wins.length}회 · ${i + 1} / ${wins.length}번째 카드 공개 중 · 약 5배속`;
          await this.revealBatchCard(ui, win.pokemon, BATCH_TIME_SCALE);
          if (this.batchSkipRequested) break;
          ui.machine.classList.remove('active'); ui.machine.classList.add('complete');
          ui.state.textContent = '당첨'; ui.winner.textContent = win.pokemon.nameKo;
          ui.machine.setAttribute('aria-label', `${i + 1}번째 당첨 슬롯 · ${win.pokemon.nameKo} 카드 공개 완료`);
          await hold(reduced() ? 1 : 180 * BATCH_TIME_SCALE);
        }
      }
      this.batchProgress.textContent = `${drawCount}회 완료 · 당첨 ${wins.length}회 · 실패 ${drawCount - wins.length}회`;
      this.batchResultButton.disabled = true;
      this.status.textContent = `${drawCount}회 SPIN 완료 · ${wins.length}장 획득`;
      await this.onBatchSummary(rewards, drawCount, this.grade);
    } finally {
      this.effects.className = '';
      this.resetBatchStage();
      this.isSpinning = false; this.onBusy(false); this.refresh();
    }
  }
  spinAnimation(candidates, result, reels = this.reels, tracks = this.tracks, timeScale = 1, shouldSkip = () => false) {
    const stops = stopTimes(this.grade, result);
    const heights = reels.map(reel => reel.clientHeight);
    const turns = [0, 0, 0];
    const stopped = [false, false, false];
    const totalSteps = stops.map(end => Math.ceil(travel(end, end) / 70));
    const symbolAt = (reel, step) => candidates[((step % candidates.length) + candidates.length + reel) % candidates.length];
    const populate = (index, step) => {
      tracks[index].replaceChildren(...[-1, 0, 1].map(delta => slotSymbol(
        step - delta >= totalSteps[index] ? result[index] : symbolAt(index, step - delta))));
    };
    reels.forEach((reel, i) => { reel.classList.add('moving'); populate(i, 0); });
    let start;
    return new Promise(resolve => {
      const finish = () => {
        for (let i = 0; i < 3; i++) {
          reels[i].classList.remove('moving', 'blur');
          tracks[i].replaceChildren(slotSymbol(result[i]));
          tracks[i].style.transform = 'translateY(0)';
          reels[i].setAttribute('aria-label', result[i] ? '포켓몬 초상화' : '빈 슬롯');
        }
      };
      const frame = now => {
        start ??= now;
        if (shouldSkip()) { finish(); resolve(); return; }
        const elapsed = (now - start) / Math.max(.01, timeScale);
        for (let i = 0; i < 3; i++) {
          const end = stops[i]; const height = heights[i]; const track = tracks[i];
          if (elapsed < end) {
            const distance = totalSteps[i] * height * travel(elapsed, end) / travel(end, end);
            const step = Math.floor(distance / height);
            if (step !== turns[i]) { populate(i, step); turns[i] = step; }
            track.style.transform = `translateY(${distance % height - height}px)`;
            reels[i].classList.toggle('blur', !reduced() && elapsed > 150 && elapsed < end - 500);
          } else {
            if (!stopped[i]) {
              stopped[i] = true;
              reels[i].classList.remove('moving', 'blur');
              track.replaceChildren(slotSymbol(result[i]));
              reels[i].setAttribute('aria-label', result[i] ? '포켓몬 초상화' : '빈 슬롯');
            }
            const bounceT = Math.min(1, (elapsed - end) / (reduced() ? 1 : 220));
            const bounce = bounceT < 0.35 ? 8 * bounceT / 0.35 : bounceT < 0.7 ? 8 - 13 * (bounceT - 0.35) / 0.35 : -5 + 5 * (bounceT - 0.7) / 0.3;
            track.style.transform = `translateY(${bounce}px)`;
          }
        }
        if (elapsed >= stops[2] + (reduced() ? 1 : 220)) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
  async celebrateBatch(ui, timeScale = 1) {
    if (this.batchSkipRequested) return;
    await Promise.all(ui.reels.map(reel => animate(reel,
      [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], 260 * timeScale)));
    if (this.batchSkipRequested) return;
    await animate(ui.machine,
      [{ boxShadow: '0 8px 20px rgba(90,60,80,.10)' }, { boxShadow: '0 0 28px rgba(167,130,227,.42)' }, { boxShadow: '0 8px 20px rgba(90,60,80,.10)' }], 420 * timeScale);
  }
  async revealBatchCard(ui, pokemon, timeScale = 1) {
    if (this.batchSkipRequested) return;
    const shell = document.createElement('div');
    shell.className = 'collection-card batch-reveal-card';
    const card = createCard(pokemon);
    shell.append(card);
    ui.cardStage.replaceChildren(shell);
    ui.cardStage.hidden = false;

    const duration = reduced() ? 1 : 520 * timeScale;
    await Promise.all([
      ...ui.reels.map(reel => animate(reel,
        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.92)' }], duration * .45)),
      animate(shell, this.grade === 'mythical'
        ? [{ opacity: 0, clipPath: 'inset(0 100% 100% 0 round 10px)', transform: 'scale(.88)' }, { opacity: 1, clipPath: 'inset(0 round 10px)', transform: 'scale(1)' }]
        : [{ opacity: 0, transform: 'translateY(5px) scale(.84)', filter: 'brightness(.35)' }, { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'brightness(1)' }], duration),
    ]);
    if (this.batchSkipRequested) return;

    for (const reel of ui.reels) {
      reel.style.visibility = 'hidden';
      reel.style.opacity = ''; reel.style.transform = '';
    }
    shell.style.opacity = '1'; shell.style.transform = ''; shell.style.filter = ''; shell.style.clipPath = '';
    await animate(ui.cardStage,
      [{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }, { transform: 'scale(1)' }], reduced() ? 1 : 260 * timeScale);
  }
  async particlesAnimation(inward) {
    await Promise.all(this.stars.map(star => {
      const x = star.style.getPropertyValue('--x'), y = star.style.getPropertyValue('--y');
      const edge = { transform: `translate(${x}, ${y}) scale(.4)`, opacity: 0 };
      const center = { transform: 'translate(0, 0) scale(1)', opacity: 1 };
      return animate(star, inward ? [edge, { ...edge, opacity: 1, offset: 0.1 }, center] : [center, edge], 500);
    }));
  }
  async celebrate() {
    await hold(reduced() ? 1 : 180);
    this.shade.style.opacity = '0';
    this.effects.className = `active ${this.grade}`;
    if (this.grade === 'normal') {
      await Promise.all(this.reels.map(reel => animate(reel, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }], 160)));
      await Promise.all(this.reels.map(reel => animate(reel, [{ boxShadow: '0 0 0 transparent' }, { boxShadow: '0 0 22px #73CFE8, 0 0 12px #8DE0C1' }], 300)));
      await this.particlesAnimation(false);
      this.shade.style.opacity = '0.20';
    } else {
      await hold(reduced() ? 1 : this.grade === 'legendary' ? 180 : 200);
      const opacity = this.grade === 'legendary' ? .45 : .38;
      await animate(this.shade, [{ opacity: 0 }, { opacity }], this.grade === 'legendary' ? 300 : 400);
      this.shade.style.opacity = String(opacity);
      if (this.grade === 'legendary') {
        this.machine.classList.add('winner');
        await animate(this.app, [{ transform: 'translateX(0)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], 240);
      }
      await this.particlesAnimation(true);
      // Legendary flash happens behind the revealed silhouette in the card modal.
    }
  }
}
