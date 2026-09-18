import { MARKET_CONFIG, migrateMarket, migrateNewsSystem } from './market.js';

// Keep the original key so existing collections migrate in place.
export const SAVE_KEY = 'pokemonSlotSaveV1';
const compressedPrefix = 'PSZ1:';
const dictionaryLimit = 32768;
function checksum(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

// LZW over UTF-8 bytes; one 15-bit code per UTF-16 storage character.
export function encodeSave(json) {
  const bytes = new TextEncoder().encode(json), dictionary = new Map(), output = [];
  let next = 256, phrase = '';
  for (const byte of bytes) {
    const char = String.fromCharCode(byte), combined = phrase + char;
    if (!phrase || dictionary.has(combined)) { phrase = combined; continue; }
    output.push(String.fromCharCode(32 + (phrase.length === 1 ? phrase.charCodeAt(0) : dictionary.get(phrase))));
    if (next < dictionaryLimit) dictionary.set(combined, next++);
    phrase = char;
  }
  if (phrase) output.push(String.fromCharCode(32 + (phrase.length === 1 ? phrase.charCodeAt(0) : dictionary.get(phrase))));
  return compressedPrefix + bytes.length + ':' + checksum(json) + ':' + output.join('');
}

export function decodeSave(raw) {
  if (!raw?.startsWith(compressedPrefix)) return raw;
  const header = /^PSZ1:(0|[1-9]\d*):([0-9a-f]{1,8}):/.exec(raw);
  if (!header) throw new Error('Invalid save header');
  const length = Number(header[1]);
  if (!Number.isSafeInteger(length) || length > 64 * 1024 * 1024) throw new Error('Invalid save length');
  const bytes = new Uint8Array(length), dictionary = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i));
  let previous = '', offset = 0;
  for (let i = header[0].length; i < raw.length; i++) {
    const code = raw.charCodeAt(i) - 32;
    const entry = dictionary[code] ?? (previous && code === dictionary.length && code < dictionaryLimit ? previous + previous[0] : null);
    if (!entry || offset + entry.length > length) throw new Error('Invalid save code');
    for (let j = 0; j < entry.length; j++) bytes[offset++] = entry.charCodeAt(j);
    if (previous && dictionary.length < dictionaryLimit) dictionary.push(previous + entry[0]);
    previous = entry;
  }
  if (offset !== length) throw new Error('Truncated save');
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (checksum(json) !== header[2]) throw new Error('Save checksum mismatch');
  return json;
}

export function writeSave(save, storage = globalThis.localStorage) {
  storage.setItem(SAVE_KEY, encodeSave(JSON.stringify(save)));
}

export function readSave(validIds, storage) {
  const defaults = { version: 4, collectedIds: [], quantity: {}, averageAcquisitionPrice: {}, tc: MARKET_CONFIG.initialTC, soundEnabled: true, musicEnabled: true, market: null };
  let raw;
  try {
    storage ??= globalThis.localStorage;
    raw = storage.getItem(SAVE_KEY);
    if (raw === null) return defaults;
    const parsed = JSON.parse(decodeSave(raw));
    if (!parsed || ![1, 2, 3, 4].includes(parsed.version)) throw new Error('Invalid save version');
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
    return { ...defaults, version: parsed.version < 4 ? 3 : 4, collectedIds, quantity, averageAcquisitionPrice,
      tc: parsed.version >= 2 && Number.isSafeInteger(parsed.tc) && parsed.tc >= 0 ? parsed.tc : defaults.tc,
      market: parsed.version >= 2 ? migrateNewsSystem(parsed.version < 4 ? migrateMarket(parsed.market) : parsed.market) : null,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : true };
  } catch {
    if (raw !== undefined && raw !== null) throw new Error('저장 데이터를 읽을 수 없습니다. 원본 저장은 보존되며 덮어쓰지 않습니다.');
    return defaults;
  }
}
