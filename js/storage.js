import { MARKET_CONFIG, migrateMarket } from './market.js';

// Keep the original key so existing collections migrate in place.
export const SAVE_KEY = 'pokemonSlotSaveV1';
export function readSave(validIds, storage) {
  const defaults = { version: 3, collectedIds: [], quantity: {}, averageAcquisitionPrice: {}, tc: MARKET_CONFIG.initialTC, soundEnabled: true, musicEnabled: true, market: null };
  try {
    storage ??= globalThis.localStorage;
    const parsed = JSON.parse(storage.getItem(SAVE_KEY));
    if (!parsed || ![1, 2, 3].includes(parsed.version)) return defaults;
    const collectedIds = [...new Set((Array.isArray(parsed.collectedIds) ? parsed.collectedIds : []).filter(id => Number.isInteger(id) && validIds.has(id)))];
    const quantity = {}, averageAcquisitionPrice = {};
    for (const id of collectedIds) {
      const n = parsed.quantity?.[id];
      quantity[id] = parsed.version === 1 ? 1 : Number.isSafeInteger(n) && n >= 0 ? n : 0;
    }
    if (Array.isArray(parsed.market?.newsHistory)) {
      parsed.market.newsHistory = parsed.market.newsHistory.sort((a, b) => b?.time - a?.time).slice(0, MARKET_CONFIG.newsLimit);
    }
    for (const [id, count] of Object.entries(quantity)) {
      const value = parsed.averageAcquisitionPrice?.[id];
      const average = typeof value === 'string' && value.trim() ? Number(value) : value;
      if (count > 0 && Number.isFinite(average) && average > 0) averageAcquisitionPrice[id] = average;
    }
    return { ...defaults, collectedIds, quantity, averageAcquisitionPrice,
      tc: parsed.version >= 2 && Number.isSafeInteger(parsed.tc) && parsed.tc >= 0 ? parsed.tc : defaults.tc,
      market: parsed.version >= 2 ? (parsed.version === 2 ? migrateMarket(parsed.market) : parsed.market) : null,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : true };
  } catch { return defaults; }
}
