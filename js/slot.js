import { GRADES, imageOrPlaceholder, preloadImages } from './data.js';

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

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export async function animate(node, keyframes, duration, options = {}) {
  const animation = node.animate(keyframes, { duration: reduced() ? 1 : duration, fill: 'forwards', ...options });
  try { await animation.finished; } finally { animation.cancel(); }
}
const hold = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// Integral of velocity: linear acceleration (350ms), cruise, linear deceleration (500ms).
function travel(t, end) {
  if (t <= 350) return t * t / 700;
  if (t <= end - 500) return 175 + t - 350;
  const decel = Math.min(500, t - (end - 500));
  return 175 + end - 850 + decel - decel * decel / 1000;
}

export class Slot {
  constructor(data, ids, { onBusy, onWin, onCollect, onStart, canSpend }) {
    this.data = data; this.ids = ids; this.onBusy = onBusy; this.onWin = onWin; this.onCollect = onCollect;
    this.onStart = onStart; this.canSpend = canSpend;
    this.grade = 'normal'; this.multiplier = 1; this.isSpinning = false;
    this.pools = { normal: [], legendary: [], mythical: [] };
    for (const p of data.records) this.pools[p.grade].push(p);
    this.machine = document.getElementById('machine');
    this.reels = [...document.querySelectorAll('.reel')];
    this.tracks = [...document.querySelectorAll('.reel-track')];
    this.tabs = [...document.querySelectorAll('#slot-tabs button')];
    this.spinButton = document.getElementById('spin');
    this.multiplierButtons = [...document.querySelectorAll('#slot-multipliers button')];
    this.title = document.getElementById('slot-title');
    this.rate = document.getElementById('win-rate');
    this.costLabel = document.getElementById('slot-cost');
    this.remainingLabel = document.getElementById('remaining');
    this.status = document.getElementById('slot-status');
    this.candidatesUI = document.getElementById('candidates');
    this.candidateCount = document.getElementById('candidate-count');
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
    for (const button of this.multiplierButtons) button.addEventListener('click', () => {
      if (this.isSpinning) return;
      this.multiplier = Number(button.dataset.multiplier); this.refresh();
    });
    for (const tab of this.tabs) tab.addEventListener('click', () => {
      if (this.isSpinning) return;
      this.grade = tab.dataset.grade; this.resetVisuals(); this.refresh();
    });
    this.resetVisuals(); this.refresh();
  }
  remaining() { return this.pools[this.grade]; }
  resetVisuals() {
    for (const track of this.tracks) {
      const placeholder = document.createElement('div');
      placeholder.className = 'idle-symbol'; placeholder.textContent = '✧';
      track.style.transform = ''; track.replaceChildren(placeholder);
    }
    this.candidatesUI.replaceChildren();
    this.candidateCount.textContent = '0마리';
    this.status.textContent = '새로운 카드를 만나보세요.';
  }
  refresh() {
    const count = this.remaining().length;
    const cost = SLOT_CONFIG[this.grade].cost * this.multiplier;
    this.machine.className = `machine ${this.grade}`;
    this.title.textContent = `${GRADES[this.grade]} 슬롯`;
    this.rate.textContent = `${SLOT_CONFIG[this.grade].winRate * 100}%`;
    this.remainingLabel.textContent = `${count} / ${this.data.counts[this.grade]}`;
    this.spinButton.disabled = this.isSpinning || count === 0 || !this.canSpend(cost);
    this.costLabel.textContent = cost.toLocaleString('ko-KR') + ' TC';
    this.spinButton.firstChild.textContent = count ? 'SPIN ' : 'COMPLETE ';
    if (!count) this.status.textContent = 'COMPLETE · 모든 카드를 수집했습니다.';
    for (const button of this.multiplierButtons) {
      button.disabled = this.isSpinning || count === 0;
      button.setAttribute('aria-pressed', String(Number(button.dataset.multiplier) === this.multiplier));
    }
    for (const tab of this.tabs) {
      tab.disabled = this.isSpinning;
      tab.setAttribute('aria-pressed', String(tab.dataset.grade === this.grade));
    }
  }
  async spin() {
    if (this.isSpinning) return;
    const remaining = this.remaining();
    if (!remaining.length) { this.refresh(); return; }
    const config = SLOT_CONFIG[this.grade], multiplier = this.multiplier, cost = config.cost * multiplier;
    if (!this.onStart(cost)) { this.status.textContent = 'TC가 부족하거나 시장을 갱신 중입니다.'; this.refresh(); return; }
    const candidates = selectCandidates(remaining, config.candidateLimit);
    this.candidatesUI.replaceChildren(...candidates.map(slotSymbol));
    this.candidateCount.textContent = `${candidates.length}마리`;
    const won = Math.random() < config.winRate;
    const result = createResult(candidates, won);
    const isNew = won && !this.ids.has(result[0].id);
    // Persist the outcome together with the charged spin before any asynchronous animation.
    if (won) this.onCollect(result[0], multiplier);
    this.isSpinning = true; this.onBusy(true); this.refresh();
    this.status.textContent = '새로운 만남을 기다리는 중…';
    try {
      await preloadImages([...candidates.map(p => p.slotImage), ...(won ? [result[0].cardImage] : [])]);
      await this.spinAnimation(candidates, result);
      if (won) {
        await this.celebrate();
        await this.onWin(result[0], this.grade, multiplier, isNew);
        this.status.textContent = multiplier === 1 ? `${result[0].nameKo} 카드를 획득했습니다!` : `${result[0].nameKo} 카드 ${multiplier}장을 획득했습니다!`;
      } else {
        this.status.textContent = '아쉬워요! 다시 한번 돌려볼까요?';
        await hold(400);
      }
    } finally {
      this.effects.className = ''; this.machine.classList.remove('winner');
      this.isSpinning = false; this.onBusy(false); this.refresh();
    }
  }
  spinAnimation(candidates, result) {
    const stops = stopTimes(this.grade, result);
    const heights = this.reels.map(reel => reel.clientHeight);
    const turns = [0, 0, 0];
    const stopped = [false, false, false];
    const totalSteps = stops.map(end => Math.ceil(travel(end, end) / 70));
    const symbolAt = (reel, step) => candidates[((step % candidates.length) + candidates.length + reel) % candidates.length];
    const populate = (index, step) => {
      this.tracks[index].replaceChildren(...[-1, 0, 1].map(delta => slotSymbol(
        step - delta >= totalSteps[index] ? result[index] : symbolAt(index, step - delta))));
    };
    this.reels.forEach((reel, i) => { reel.classList.add('moving'); populate(i, 0); });
    let start;
    return new Promise(resolve => {
      const frame = now => {
        start ??= now;
        const elapsed = now - start;
        for (let i = 0; i < 3; i++) {
          const end = stops[i]; const height = heights[i]; const track = this.tracks[i];
          if (elapsed < end) {
            const distance = totalSteps[i] * height * travel(elapsed, end) / travel(end, end);
            const step = Math.floor(distance / height);
            if (step !== turns[i]) { populate(i, step); turns[i] = step; }
            track.style.transform = `translateY(${distance % height - height}px)`;
            this.reels[i].classList.toggle('blur', !reduced() && elapsed > 150 && elapsed < end - 500);
          } else {
            if (!stopped[i]) {
              stopped[i] = true;
              this.reels[i].classList.remove('moving', 'blur');
              track.replaceChildren(slotSymbol(result[i]));
              this.reels[i].setAttribute('aria-label', result[i] ? '포켓몬 초상화' : '빈 슬롯');
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
