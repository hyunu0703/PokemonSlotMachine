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
    const ready = async () => { await page.waitForFunction(() => document.querySelector('#app').getAttribute('aria-busy') === 'false' && document.querySelector('#load-status').hidden); await page.evaluate(async () => { window.decodeStoredSave = (await import('./js/storage.js')).decodeSave; }); };
    const read = () => page.evaluate(k => JSON.parse(window.decodeStoredSave(localStorage.getItem(k))), key);
    const nav = name => page.locator(`nav button[data-page="${name}"]`).click();
    await page.goto('http://127.0.0.1:4174'); await ready();
    assert.equal((await read()).tc, 500000);
    await nav('market'); assert.equal(await page.locator('#market-rows tr').count(), 25);
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'market-desktop.png'), fullPage: true });
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
    await page.locator('#market-sort').selectOption('volume'); assert.match(await page.locator('#market-page').innerText(), /1 \/ 41/);
    for (const period of ['6H', '24H', 'ALL', '1H']) await page.locator(`[data-period="${period}"]`).click();
    console.log('PASS rarity/search/sort/pagination and chart periods');
    await page.evaluate(k => {
      const s = JSON.parse(window.decodeStoredSave(localStorage.getItem(k))); s.tc = 0; s.market.lastMarketUpdate = Date.now() - 37 * 60000; localStorage.setItem(k, JSON.stringify(s));
    }, key);
    const old = await read(); await page.reload(); await ready();
    const caught = await read(); assert.equal(caught.market.lastMarketUpdate, old.market.lastMarketUpdate + 30 * 60000); assert.equal(caught.market.cards[1].priceHistory.count, 3);
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
    await page.evaluate(k => { const s = JSON.parse(window.decodeStoredSave(localStorage.getItem(k))); s.market.lastMarketUpdate -= 2 * 86400000; localStorage.setItem(k, JSON.stringify(s)); }, key);
    await page.reload(); await ready(); await nav('market');
    assert.equal((await read()).market.cards[1].priceHistory.count, 144);
    await page.locator('[data-period="ALL"]').click();
    assert.ok((await read()).market.cards[1].hourlyHistory.count >= 48);
    assert.match(await page.locator('#market-detail').innerText(), /최근 7일/);
    const historySave = await read(); await page.reload(); await ready(); assert.deepEqual(await read(), historySave); await nav('market');
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'market-history.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'market-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log('PASS two-day catchup, bounded history and responsive mobile layout');
    await page.evaluate(k => {
      const s = JSON.parse(window.decodeStoredSave(localStorage.getItem(k))); s.version = 2;
      for (const c of Object.values(s.market.cards)) {
        c.priceHistory = [c.currentPrice-1, c.currentPrice];
        delete c.hourlyHistory; delete c.highestPrice; delete c.lowestPrice; delete c.averagePrice; delete c.sampleCount;
      }
      localStorage.setItem(k, JSON.stringify(s));
    }, key);
    const legacy = await read(); await page.reload(); await ready();
    const v3 = await read(); assert.equal(v3.version,4); assert.equal(v3.tc,legacy.tc);
    assert.deepEqual(v3.quantity,legacy.quantity); assert.equal(v3.market.cards[1].currentPrice,legacy.market.cards[1].currentPrice);
    assert.equal(v3.market.cards[1].priceHistory.count,1);
    console.log('PASS V2 market migration, hourly chart and ring-buffer reload');
    await page.evaluate(k => {
      const s = JSON.parse(window.decodeStoredSave(localStorage.getItem(k))); s.collectedIds = [1, 2, 3]; s.quantity = {1: 2, 2: 1, 3: 0};
      s.market.cards[1].currentPrice = 200; s.market.cards[2].currentPrice = 300;
      s.averageAcquisitionPrice = {1: 100, 2: 250, 3: 10}; localStorage.setItem(k, JSON.stringify(s));
    }, key);
    await page.reload(); await ready(); await nav('market');
    assert.equal(await page.locator('#market-assets .market-stat').count(), 3);
    assert.equal(await page.locator('#market-owned-rows article').count(), 2);
    assert.equal(await page.locator('#market-owned-rows button').first().getAttribute('data-card'), '2');
    await page.locator('#market-owned-sort [data-sort=return]').click();
    assert.equal(await page.locator('#market-owned-rows button').first().getAttribute('data-card'), '1');
    assert.match(await page.locator('#market-owned-rows article').first().innerText(), /\+100.00%/);
    await page.locator('#market-owned-rows [data-card="1"]').click();
    await page.locator('[data-sell="one"]').click(); assert.equal((await read()).averageAcquisitionPrice[1],100);
    await page.locator('[data-sell="all"]').click(); assert.equal(await page.locator('#market-owned-rows article').count(),1);
    assert.equal((await read()).averageAcquisitionPrice[1],undefined);
    await page.locator('#market-owned-rows [data-card="2"]').click(); await page.locator('[data-sell="all"]').click();
    assert.equal(await page.locator('#market-owned-empty').isVisible(),true);
    await page.evaluate(k => {
      const s = JSON.parse(window.decodeStoredSave(localStorage.getItem(k))); s.quantity[1]=2; s.market.lastMarketUpdate -= 37 * 60000; delete s.averageAcquisitionPrice;
      localStorage.setItem(k, JSON.stringify(s));
    }, key);
    await page.reload(); await ready(); const corrected=await read();
    assert.equal(corrected.averageAcquisitionPrice[1],corrected.market.cards[1].currentPrice);
    await page.reload(); await ready(); assert.deepEqual((await read()).averageAcquisitionPrice,corrected.averageAcquisitionPrice);
    await nav('market'); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    console.log('PASS owned price/return sorting, partial/full sale, empty state, legacy average repair and persistence');
    await page.evaluate(k => {
      const s=JSON.parse(window.decodeStoredSave(localStorage.getItem(k))); s.collectedIds=[1,2,3,4];s.quantity={1:1,2:1,3:1,4:1};
      s.averageAcquisitionPrice={1:1000,2:'1000',3:1000,4:1000};
      for(const [id,quote] of [[1,950],[2,1200],[3,1030],[4,1000]])s.market.cards[id].currentPrice=quote;
      localStorage.setItem(k,JSON.stringify(s));
    },key);
    await page.reload();await ready();await nav('market');
    const order=()=>page.locator('#market-owned-rows [data-card]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.card)));
    await page.locator('#market-owned-sort [data-sort=return]').click();assert.deepEqual(await order(),[2,3,4,1]);
    assert.equal((await read()).averageAcquisitionPrice[2],1000);
    assert.equal(await page.locator('#market-owned-sort [aria-pressed=true]').count(),1);
    const averageBefore=(await read()).averageAcquisitionPrice;
    const timeBefore=(await read()).market.lastMarketUpdate;
    await page.evaluate(t=>{Date.now=()=>t+600000;window.dispatchEvent(new Event('focus'));},timeBefore);
    await page.waitForFunction(({k,t})=>JSON.parse(window.decodeStoredSave(localStorage.getItem(k))).market.lastMarketUpdate===t+600000,{k:key,t:timeBefore});
    const ticked=await read();assert.deepEqual(ticked.averageAcquisitionPrice,averageBefore);
    assert.equal(await page.locator('#market-owned-sort [data-sort=return]').getAttribute('aria-pressed'),'true');
    const expected=[1,2,3,4].sort((a,b)=>(ticked.market.cards[b].currentPrice-1000)-(ticked.market.cards[a].currentPrice-1000));
    assert.deepEqual(await order(),expected);
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      const layout=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};return {owned:box('.market-owned'),news:box('.market-news'),detail:box('#market-detail'),list:box('.market-list'),overflow:document.documentElement.scrollWidth>innerWidth};});
      assert.equal(layout.overflow,false);
      if(width>767){assert.equal(layout.owned.top,layout.news.top);assert.ok(layout.owned.right<=layout.news.left);}else assert.ok(layout.news.top>=layout.owned.bottom);
      assert.ok(layout.detail.top>=Math.max(layout.owned.bottom,layout.news.bottom));assert.ok(layout.list.top>=layout.detail.bottom);
      await page.screenshot({path:path.join(require('node:os').tmpdir(),'market-owned-'+width+'.png'),fullPage:true});
    }
    // Exercise display guards without changing the application save or registering events.
    await page.evaluate(async()=>{
      const {MarketView}=await import('./js/market-view.js'); const {loadData}=await import('./js/data.js');
      window.ownedTest={data:await loadData(),save:{quantity:{1:1,2:1,3:1,4:1},averageAcquisitionPrice:{1:1000,2:1000,3:1000,4:1033.333333},market:{cards:{1:{currentPrice:1100},2:{currentPrice:900},3:{currentPrice:1000},4:{currentPrice:1100}}}},ownedSort:'return',ui:Object.fromEntries(['market-owned-sort','market-owned-rows','market-owned-empty'].map(id=>[id,document.getElementById(id)]))};
      MarketView.prototype.renderOwned.call(window.ownedTest);
    });
    const rows=page.locator('#market-owned-rows article');
    assert.match(await rows.nth(0).innerText(),/\+10.00%/);assert.equal(await rows.nth(0).locator('.market-up').count(),1);
    assert.match(await rows.nth(1).innerText(),/1,033 TC/);assert.match(await rows.nth(2).innerText(),/0.00%/);
    assert.equal(await rows.nth(2).locator('.market-up,.market-down,.muted').count(),0);
    assert.match(await rows.nth(3).innerText(),/-10.00%/);assert.equal(await rows.nth(3).locator('.market-down').count(),1);
    await page.evaluate(async()=>{const {MarketView}=await import('./js/market-view.js');const t=window.ownedTest;t.data.records=[t.data.records[1],t.data.records[0]];t.save.quantity={1:1,2:1};t.save.market.cards[1].currentPrice=t.save.market.cards[2].currentPrice=1000;t.ownedSort='price';MarketView.prototype.renderOwned.call(t);});
    assert.deepEqual(await order(),[2,1]);
    for(const invalid of [0,-1,null,'1200','abc',Infinity,NaN,undefined]) {
      await page.evaluate(async value=>{const {MarketView}=await import('./js/market-view.js');const t=window.ownedTest;t.save.averageAcquisitionPrice[1]=value;delete t.save.market.cards[2];MarketView.prototype.renderOwned.call(t);},invalid);
      assert.doesNotMatch(await page.locator('#market-owned-rows').innerText(),/NaN|Infinity/);
    }
    console.log('PASS offline correction, numeric strings, live tick sort retention, colors, rounding, stable ties, invalid values and PC/mobile layout');
    await page.reload();await ready();await nav('market');
    assert.deepEqual(await page.locator('#market-sort option').allTextContents(),['거래대금','거래량 높은순','수익률 높은순','수익률 낮은순']);
    assert.equal(await page.locator('#market-sort').inputValue(),'amount');
    const tradeOrder=()=>page.locator('#market-rows [data-card]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.card)));
    await page.evaluate(async()=>{
      const {MarketView}=await import('./js/market-view.js');const {loadData}=await import('./js/data.js');const data=await loadData();
      const cards={};for(const [id,amount,volume,quote] of [[1,1000000,5000,110],[2,5000000,12000,95],[3,3000000,8000,130],[4,0,0,100]])cards[id]={currentPrice:quote,priceHistory:{values:[100],head:1,count:1},trade24h:{amountTotal:amount,volumeTotal:volume}};
      window.tradeTest={data:{records:data.records.slice(0,4)},save:{market:{cards},quantity:{}},page:0,pageSize:25,ui:Object.fromEntries(['market-grade','market-search','market-sort','market-rows','market-page','market-prev','market-next'].map(id=>[id,document.getElementById(id)]))};
      window.tradeRender=()=>MarketView.prototype.renderList.call(window.tradeTest);
    });
    for(const [sort,expected] of [['amount',[2,3,1,4]],['volume',[2,3,1,4]],['return-high',[3,1,4,2]],['return-low',[2,4,1,3]]]){
      await page.evaluate(sort=>{document.querySelector('#market-sort').value=sort;window.tradeRender();},sort);assert.deepEqual(await tradeOrder(),expected);
    }
    await page.evaluate(()=>{window.tradeTest.data.records.reverse();for(const c of Object.values(window.tradeTest.save.market.cards))c.trade24h.amountTotal=0;document.querySelector('#market-sort').value='amount';window.tradeRender();});assert.deepEqual(await tradeOrder(),[4,3,2,1]);
    await page.reload();await ready();await nav('market');await page.locator('#market-sort').selectOption('return-low');
    const beforeTick=await read();await page.evaluate(t=>{Date.now=()=>t+600000;window.dispatchEvent(new Event('focus'));},beforeTick.market.lastMarketUpdate);
    await page.waitForFunction(({k,t})=>JSON.parse(window.decodeStoredSave(localStorage.getItem(k))).market.lastMarketUpdate===t+600000,{k:key,t:beforeTick.market.lastMarketUpdate});
    assert.equal(await page.locator('#market-sort').inputValue(),'return-low');
    const afterTick=await read();const expectedOrder=await page.evaluate(async market=>{const {marketReturn}=await import('./js/market.js');return Object.values(market.cards).sort((a,b)=>marketReturn(a)-marketReturn(b)).slice(0,25).map(c=>c.cardId);},afterTick.market);assert.deepEqual(await tradeOrder(),expectedOrder);
    assert.equal(await page.locator('.market-list th').count(),5);assert.equal(await page.locator('.market-list th').nth(3).innerText(),'10분 등락률');
    await page.evaluate(k=>{const s=JSON.parse(window.decodeStoredSave(localStorage.getItem(k)));s.version=3;s.market.lastMarketUpdate-=300*600000;delete s.market.trade24h;for(const c of Object.values(s.market.cards))delete c.trade24h;localStorage.setItem(k,JSON.stringify(s));},key);
    await page.reload();await ready();const migratedTrades=await read();assert.equal(migratedTrades.version,4);assert.deepEqual(migratedTrades.market.trade24h,{head:0,count:0});
    assert.ok(Object.values(migratedTrades.market.cards).every(c=>c.trade24h.volumes.length===0&&c.trade24h.volumeTotal===0&&c.trade24h.amountTotal===0));
    await page.evaluate(k=>{const s=JSON.parse(window.decodeStoredSave(localStorage.getItem(k)));s.market.lastMarketUpdate-=300*600000;localStorage.setItem(k,JSON.stringify(s));},key);
    await page.reload();await ready();const traded=await read();assert.equal(traded.market.trade24h.count,144);
    assert.ok(Object.values(traded.market.cards).every(c=>c.trade24h.volumes.length===144&&!('amounts' in c.trade24h)&&!('head' in c.trade24h)));
    console.log('PASS all four trading sorts, stable ties, live tick selection, unchanged table, migration skips past trades and subsequent catchup records trades');
    assert.equal(await page.evaluate(k=>localStorage.getItem(k).startsWith('PSZ1:'),key),true);
    const intact=await read();
    await page.evaluate(({k,s})=>localStorage.setItem(k,JSON.stringify(s)),{k:key,s:intact});
    await page.reload();await ready();assert.deepEqual(await read(),intact);
    assert.equal(await page.evaluate(k=>localStorage.getItem(k).startsWith('PSZ1:'),key),true);
    await page.evaluate(async()=>{
      const {createMarket}=await import('./js/market.js');const records=(await (await fetch('data/pokemon-data.json')).json());let seed=7654;
      const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),start=1700000000000,market=createMarket(records,start,random);
      window.capacityTest={records,random,start,save:{version:4,collectedIds:records.map(p=>p.id),quantity:Object.fromEntries(records.map(p=>[p.id,100])),averageAcquisitionPrice:Object.fromEntries(records.map(p=>[p.id,market.cards[p.id].currentPrice])),tc:500000,soundEnabled:true,musicEnabled:true,market}};
    });
    for(const days of [7,30,365]) {
      const capacity=await page.evaluate(async days=>{
        const {advanceMarket}=await import('./js/market.js'),{writeSave,decodeSave,SAVE_KEY}=await import('./js/storage.js');const t=window.capacityTest;
        advanceMarket(t.save.market,t.records,t.start+days*86400000,t.random,days*144);const json=JSON.stringify(t.save);writeSave(t.save);
        const raw=localStorage.getItem(SAVE_KEY);let total=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);total+=2*(k.length+localStorage.getItem(k).length);}
        return{before:2*(SAVE_KEY.length+json.length),after:total,equal:decodeSave(raw)===json};
      },days);
      assert.equal(capacity.equal,true);assert.ok(capacity.after<4*1024*1024);
      console.log('PASS real localStorage '+days+' days: '+(capacity.before/1048576).toFixed(3)+' / '+(capacity.after/1048576).toFixed(3)+' MiB');
    }
    const damaged=await page.evaluate(k=>{const raw=localStorage.getItem(k).slice(0,-1);localStorage.setItem(k,raw);return raw;},key);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#load-status').textContent.includes('원본 저장은 보존'));
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),damaged);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#load-status').textContent.includes('원본 저장은 보존'));
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),damaged);
    console.log('PASS synchronous compressed persistence, legacy V4 rewrite, corrupt save remains untouched across reloads');
    assert.deepEqual(errors, []); console.log('PASS no browser console errors');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
