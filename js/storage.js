import { MARKET_CONFIG } from './market.js';

// Keep the original key so existing collections migrate in place.
export const SAVE_KEY = 'pokemonSlotSaveV1';
export function readSave(validIds, storage) {
  const defaults = { version: 2, collectedIds: [], quantity: {}, tc: MARKET_CONFIG.initialTC, soundEnabled: true, musicEnabled: true, market: null };
  try {
    storage ??= globalThis.localStorage;
    const parsed = JSON.parse(storage.getItem(SAVE_KEY));
    if (!parsed || ![1, 2].includes(parsed.version)) return defaults;
    const collectedIds = [...new Set((Array.isArray(parsed.collectedIds) ? parsed.collectedIds : []).filter(id => Number.isInteger(id) && validIds.has(id)))];
    const quantity = {};
    for (const id of collectedIds) {
      const n = parsed.quantity?.[id];
      quantity[id] = parsed.version === 1 ? 1 : Number.isSafeInteger(n) && n >= 0 ? n : 0;
    }
    return { ...defaults, collectedIds, quantity,
      tc: parsed.version === 2 && Number.isSafeInteger(parsed.tc) && parsed.tc >= 0 ? parsed.tc : defaults.tc,
      market: parsed.version === 2 ? parsed.market : null,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : true };
  } catch { return defaults; }
}
