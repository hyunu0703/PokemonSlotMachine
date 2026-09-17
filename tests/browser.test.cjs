// Use a separate origin and fresh browser context; never touches the player's save.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const runtimeRequire = process.env.PLAYWRIGHT_MODULE ? createRequire(path.resolve(process.env.PLAYWRIGHT_MODULE, 'package.json')) : require;
const { chromium } = runtimeRequire('playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', (mime[path.extname(file)] ?? 'application/octet-stream')); fs.createReadStream(file).pipe(res);
});
const key = 'pokemonSlotSaveV1';
(async () => {
  await new Promise(resolve => server.listen(4174, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    const ready = () => page.waitForFunction(() => document.querySelector('#app').getAttribute('aria-busy') === 'false' && document.querySelector('#load-status').hidden);
    const read = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    const nav = name => page.locator(`nav button[data-page="${name}"]`).click();
    await page.goto('http://127.0.0.1:4174'); await ready();
    assert.equal((await read()).tc, 500000);
    await nav('market'); assert.equal(await page.locator('#market-rows tr').count(), 25);
    await page.screenshot({ path: 'tests/market-desktop.png', fullPage: true });
    console.log('PASS initial page, navigation, market summary, 25-row pagination and screenshot');
    await nav('slot');
    await page.evaluate(() => { Math.random = () => 0; });
    for (let i = 1; i <= 2; i++) {
      await page.locator('#spin').click();
      await page.waitForFunction(() => !document.querySelector('#continue').disabled && document.querySelector('#card-modal').open);
      assert.equal((await read()).quantity[1], i); assert.equal((await read()).tc, 500000 - 1000 * i);
      await page.locator('#continue').click();
      await page.waitForFunction(() => !document.querySelector('nav button').disabled);
    }
    console.log('PASS normal paid spin, reveal/close, duplicate quantity persisted');
    await page.evaluate(() => { Math.random = () => .999; });
    await page.locator('#spin').click();
    await page.waitForFunction(() => !document.querySelector('nav button').disabled);
    assert.equal((await read()).tc, 497000); assert.equal((await read()).quantity[1], 2);
    console.log('PASS failed spin charges TC without awarding a card');
    await nav('collection'); assert.equal(await page.locator('[data-id="1"] .quantity-badge').innerText(), '보유 2장');
    await nav('market');
    const before = await read(), quote = before.market.cards[1].currentPrice;
    await page.locator('[data-sell="one"]').click(); assert.equal((await read()).quantity[1], 1);
    await page.locator('[data-sell="all"]').click();
    const after = await read(); assert.equal(after.quantity[1], 0); assert.equal(after.tc, before.tc + 2 * quote); assert.ok(after.collectedIds.includes(1));
    assert.equal(await page.locator('[data-sell="all"]').isDisabled(), true);
    await page.reload(); await ready(); assert.deepEqual(await read(), after);
    await nav('collection'); assert.equal(await page.locator('[data-id="1"] .quantity-badge').innerText(), '보유 0장');
    await page.locator('[data-id="1"]').click(); assert.match(await page.locator('#modal-title').innerText(), /보유 0장/); await page.locator('#card-close').click();
    console.log('PASS single/all sell, exact TC, retained collection and refresh persistence');
    await nav('market'); await page.locator('#market-grade').selectOption('mythical');
    assert.equal(await page.locator('#market-rows tr').count(), 23);
    await page.locator('#market-search').fill('뮤'); assert.ok(await page.locator('#market-rows tr').count() >= 1);
    await page.locator('#market-search').fill('없는이름'); assert.equal(await page.locator('#market-rows tr').count(), 0);
    await page.locator('#market-search').fill(''); await page.locator('#market-grade').selectOption('all');
    await page.locator('#market-next').click(); assert.match(await page.locator('#market-page').innerText(), /2 \/ 41/);
    await page.locator('#market-sort').selectOption('quantity'); assert.match(await page.locator('#market-page').innerText(), /1 \/ 41/);
    for (const period of ['6H', '24H', 'ALL', '1H']) await page.locator(`[data-period="${period}"]`).click();
    console.log('PASS rarity/search/sort/pagination and chart periods');
    await page.evaluate(k => {
      const s = JSON.parse(localStorage.getItem(k)); s.tc = 0; s.market.lastMarketUpdate = Date.now() - 37 * 60000; localStorage.setItem(k, JSON.stringify(s));
    }, key);
    const old = await read(); await page.reload(); await ready();
    const caught = await read(); assert.equal(caught.market.lastMarketUpdate, old.market.lastMarketUpdate + 30 * 60000); assert.equal(caught.market.cards[1].priceHistory.length, 4);
    await nav('slot'); assert.equal(await page.locator('#spin').isDisabled(), true);
    for (const grade of ['legendary', 'mythical']) { await page.locator(`#slot-tabs [data-grade="${grade}"]`).click(); assert.equal(await page.locator('#spin').isDisabled(), true); }
    console.log('PASS 37-minute offline catchup and insufficient TC in all slots');
    await page.evaluate(k => { localStorage.setItem(k, JSON.stringify({ version: 1, collectedIds: [1, 150, 151], soundEnabled: false })); }, key);
    await page.reload(); await ready();
    const migrated = await read(); assert.equal(migrated.quantity[150], 1); assert.equal(migrated.tc, 500000); assert.equal(migrated.soundEnabled, false);
    await nav('slot'); await page.locator('#slot-tabs [data-grade="legendary"]').click();
    await page.evaluate(() => { Math.random = () => .999; });
    await page.locator('#spin').click(); await page.waitForFunction(() => !document.querySelector('nav button').disabled); assert.equal((await read()).tc, 475000);
    await page.locator('#slot-tabs [data-grade="mythical"]').click();
    await page.locator('#spin').click(); await page.waitForFunction(() => !document.querySelector('nav button').disabled); assert.equal((await read()).tc, 325000);
    console.log('PASS legacy migration and legendary/mythical exact costs');
    // Accelerate the local simulation for chart/news and storage-size verification.
    await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.market.lastMarketUpdate -= 2 * 86400000; localStorage.setItem(k, JSON.stringify(s)); }, key);
    await page.reload(); await ready(); await nav('market');
    assert.equal((await read()).market.cards[1].priceHistory.length, 145);
    await page.screenshot({ path: 'tests/market-history.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'tests/market-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log('PASS two-day catchup, bounded history and responsive mobile layout');
    assert.deepEqual(errors, []); console.log('PASS no browser console errors');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
