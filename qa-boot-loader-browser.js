const { chromium } = require('playwright');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let browser, server, origin;
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
before(async () => {
 server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!['index.html', 'vendor/quill-2.0.3/quill.js', 'vendor/quill-2.0.3/quill.core.css'].includes(name)) return res.writeHead(404).end();
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
  fs.createReadStream(path.join(__dirname, name)).pipe(res);
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 origin = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function fixture(t, options = {}) {
 const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: options.colorScheme || 'light', reducedMotion: options.reducedMotion || 'no-preference' });
 let release;
 const gate = new Promise(resolve => { release = resolve; });
 t.after(async () => { release(); await context.close(); });
 await context.route('**/*', async route => {
  const url = route.request().url();
  if (url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2')) {
   await gate;
   try { await route.fulfill({ contentType: 'text/javascript', body: 'window.supabase = undefined;' }); } catch {}
  } else if (url === origin + '/' && options.transform) {
   await route.fulfill({ contentType: 'text/html; charset=utf-8', body: options.transform(html) });
  } else if (url.startsWith(origin)) await route.continue();
  else await route.abort();
 });
 const page = await context.newPage();
 await page.addInitScript(theme => {
  localStorage.setItem('work-cockpit-local-mode-v1', '1');
  localStorage.setItem('work-cockpit-theme-v1', theme);
  localStorage.setItem('loader-data-sentinel', '本机内容保持不变');
 }, options.theme || 'light');
 if (options.clock) await page.clock.install();
 await page.goto(origin, { waitUntil: 'commit' });
 await page.locator('#app-loader').waitFor({ state: 'visible' });
 return { page, release };
}
async function settled(page) {
 await page.waitForFunction(() => !document.documentElement.classList.contains('booting'));
 await page.locator('#app-loader').waitFor({ state: 'detached' });
}
async function captureStartup(page, filename) {
 // The intentionally blocked parser prevents document.fonts.ready from settling.
 // Capture the already-painted startup state without waiting for page completion.
 const session = await page.context().newCDPSession(page);
 try {
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, Buffer.from(data, 'base64'));
 } finally { await session.detach(); }
}
test('loader appears before a blocked external library, honors explicit light, and leaves after boot only', async t => {
 const { page, release } = await fixture(t, { theme: 'light', colorScheme: 'dark' });
 assert.equal(await page.locator('.wb-loader__tile').count(), 9);
 assert.equal(await page.locator('#app-loader').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(245, 249, 255)');
 assert.equal(await page.locator('.wb-loader__arc').evaluate(el => getComputedStyle(el).animationName), 'wb-loader-spin');
 assert.equal(await page.locator('.app').evaluate(el => getComputedStyle(el).visibility), 'hidden');
 assert.equal(await page.evaluate(() => getComputedStyle(document.body, '::before').content), 'none');
 await captureStartup(page, 'artifacts/browser-regression/loader-light.png');
 release(); await settled(page);
 await page.click('[data-page="week"]');
 assert.equal(await page.locator('#app-loader').count(), 0);
 assert.equal(await page.locator('.app').isVisible(), true);
 await page.evaluate(() => { WorkbenchLoader.finish(); WorkbenchLoader.finish(); });
});
test('explicit dark theme and reduced motion are honored before application startup', async t => {
 const { page, release } = await fixture(t, { theme: 'dark', colorScheme: 'light', reducedMotion: 'reduce' });
 assert.equal(await page.locator('#app-loader').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(11, 18, 32)');
 const animations = await page.locator('#app-loader [class]').evaluateAll(nodes => nodes.map(el => getComputedStyle(el).animationName));
 assert(animations.every(name => name === 'none'));
 await captureStartup(page, 'artifacts/browser-regression/loader-dark-reduced-motion.png');
 release(); await settled(page);
});
test('a stalled dependency stops animation and offers retry without exposing unverified account data', async t => {
 const { page, release } = await fixture(t, { clock: true });
 await page.clock.fastForward(15001);
 await page.locator('#app-loader-retry').waitFor({ state: 'visible' });
 assert.match(await page.locator('#app-loader-hint').innerText(), /启动耗时较长/);
 assert.equal(await page.locator('.wb-loader__arc').evaluate(el => getComputedStyle(el).animationName), 'none');
 assert.equal(await page.locator('.app').evaluate(el => getComputedStyle(el).visibility), 'hidden');
 assert.equal(await page.evaluate(() => localStorage.getItem('loader-data-sentinel')), '本机内容保持不变');
 await captureStartup(page, 'artifacts/browser-regression/loader-timeout.png');
 // An eventual successful startup still dismisses the recovery screen.
 release(); await page.clock.resume(); await settled(page);
});
test('an exception before boot has a visible recovery action, and retry reloads the page', async t => {
 const { page, release } = await fixture(t, { transform: source => source.replace('boot().catch(error=>', 'throw new Error("controlled early startup failure");boot().catch(error=>') });
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 release();
 await page.locator('#app-loader-retry').waitFor({ state: 'visible' });
 assert.match(await page.locator('#app-loader-hint').innerText(), /启动未能完成/);
 assert.equal(await page.locator('.app').evaluate(el => getComputedStyle(el).visibility), 'hidden');
 await Promise.all([page.waitForEvent('framenavigated'), page.click('#app-loader-retry')]);
 await page.locator('#app-loader-retry').waitFor({ state: 'visible' });
 assert(errors.length >= 2);
});
test('a handled boot rejection removes the overlay and retains the existing error message', async t => {
 const { page, release } = await fixture(t, { transform: source => source.replace('boot().catch(error=>', 'refreshScheduledTasks=function(){throw new Error("controlled boot failure")};boot().catch(error=>') });
 release(); await settled(page);
 assert.match(await page.locator('#toast').innerText(), /启动时发生错误，本机数据未删除/);
 assert.equal(await page.evaluate(() => localStorage.getItem('loader-data-sentinel')), '本机内容保持不变');
});
test('the loader is removed even when CSS emits no transitionend', async t => {
 const { page, release } = await fixture(t, { transform: source => source.replace('</head>', '<style>.wb-loader{transition:none!important}</style></head>') });
 release(); await settled(page);
 assert.equal(await page.locator('#app-loader').count(), 0);
});
