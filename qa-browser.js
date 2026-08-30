const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');

const requestedUrl = process.argv[2];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const dragAt = (page, sourceSelector, targetSelector, ratio = 0.5) => page.evaluate(({ sourceSelector, targetSelector, ratio }) => {
  const source = document.querySelector(sourceSelector), target = document.querySelector(targetSelector), data = new DataTransfer(), rect = target.getBoundingClientRect(), clientX = rect.left + rect.width / 2, clientY = rect.top + rect.height * ratio;
  source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true, cancelable: true, clientX, clientY }));
  target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true, clientX, clientY }));
  target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX, clientY }));
  source.dispatchEvent(new DragEvent('dragend', { dataTransfer: data, bubbles: true, cancelable: true, clientX, clientY }));
}, { sourceSelector, targetSelector, ratio });
let server;
let activePage;
let activeBrowser;
const browserErrors = [];
const screenshotDirectory = path.join(__dirname, 'artifacts', 'browser-regression');

async function testUrl() {
  if (requestedUrl) return requestedUrl;
  const indexPath = path.join(__dirname, 'index.html');
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const allowed = new Set(['index.html', 'vendor/quill-2.0.3/quill.js', 'vendor/quill-2.0.3/quill.core.css']);
    if (!allowed.has(relative)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const contentType = relative.endsWith('.js') ? 'text/javascript; charset=utf-8' : relative.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
    response.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(relative === 'index.html' ? indexPath : path.join(__dirname, relative)).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return `http://127.0.0.1:${port}/index.html`;
}

(async () => {
  const url = await testUrl();
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch (error) {
    if (String(error.message).includes('Executable doesn\'t exist') && process.env.ALLOW_BROWSER_SKIP === '1') {
      console.log('SKIP: Playwright browser binary is not installed');
      await new Promise(resolve => server ? server.close(resolve) : resolve());
      return;
    }
    if (String(error.message).includes('Executable doesn\'t exist')) throw new Error('Playwright Chromium is required. Run: npx playwright install chromium');
    throw error;
  }
  activeBrowser = browser;
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  activePage = page;
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); browserErrors.push(`pageerror: ${error.message}`); });
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console.error: ${message.text()}`);
  });
  await page.addInitScript(() => {
    // Match the application's local YYYY-MM-DD formatter instead of using UTC ISO dates.
    const localDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const overdue = new Date(today);
    overdue.setDate(overdue.getDate() - 2);
    localStorage.setItem('work-cockpit-local-mode-v1', '1');
    localStorage.setItem('work-cockpit-browser-fixture-v1', JSON.stringify({ today: localDateKey(today), overdue: localDateKey(overdue) }));
    if (!localStorage.getItem('work-cockpit-v6')) localStorage.setItem('work-cockpit-v6', JSON.stringify({
      version: 6,
      projects: [{ id: 'p1', name: '灯靶V0.2', code: 'TARGET', description: '', archived: false, milestones: [{ id: 'm1', name: 'EVT验证', due: '', status: '当前阶段', criteria: '' }] }, { id: 'p2', name: '项目二', archived: false, milestones: [] }, { id: 'p3', name: '项目三', archived: false, milestones: [] }],
      tasks: [
        { id: 't1', title: '确认样机测试', nextAction: '整理测试项', notes: '', project: 'p1', milestone: 'm1', type: '任务', status: '进行中', priority: 'P1', focus: false, week: false, inbox: false, archived: false, checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't2', title: '当天跟进', nextAction: '催办反馈', notes: '', project: 'p1', milestone: 'm1', type: '任务', status: '等待', priority: 'P2', focus: false, week: true, inbox: false, archived: false, followup: localDateKey(today), checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't3', title: '逾期跟进', nextAction: '确认阻塞', notes: '', project: 'p1', milestone: '', type: '长期跟进', status: '等待', priority: 'P1', focus: false, week: false, inbox: false, archived: false, followup: localDateKey(overdue), checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't4', title: '保持推进顺序', nextAction: '不要移动', notes: '', project: 'p1', milestone: '', type: '任务', status: '进行中', priority: 'P2', focus: true, week: true, inbox: false, archived: false, checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't5', title: '保持等待顺序', nextAction: '不要移动', notes: '', project: 'p1', milestone: '', type: '任务', status: '等待', priority: 'P2', focus: false, week: false, inbox: false, archived: false, checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't6', title: '收件箱事项一', nextAction: '等待整理', notes: '', project: 'p1', milestone: '', type: '任务', status: '待处理', priority: 'P2', focus: false, week: false, inbox: true, archived: false, checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't7', title: '收件箱事项二', nextAction: '等待整理', notes: '', project: 'p1', milestone: '', type: '任务', status: '待处理', priority: 'P2', focus: false, week: false, inbox: true, archived: false, checklist: [], attachments: [], relatedTaskIds: [] },
      ],
      memos: [
        { id: 'n1', title: '输入测试', content: '<p><br></p>', project: 'p1', pinned: false, archived: false },
        { id: 'n2', title: '待批量删除一', content: '<p>临时内容一</p>', project: '', pinned: false, archived: false },
        { id: 'n3', title: '待批量删除二', content: '<p>临时内容二</p>', project: '', pinned: false, archived: false },
      ],
      decisions: [], weeks: {}, trash: [], snapshots: [], favorites: ['p1'], order: { today: ['t1', 't4'], waiting: ['t2', 't3', 't5'], inbox: ['t6', 't7'], projects: ['p1', 'p2', 'p3'] }, meta: {},
    }));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('booting'));
  assert(await page.evaluate(() => typeof Sortable === 'function'), 'local SortableJS runtime did not load');
  // A wheel gesture chooses one owner on its first event and keeps it while the pointer crosses cards.
  await page.evaluate(() => { document.querySelector('#page-today').style.minHeight = '1800px'; });
  const wheelBefore = await page.evaluate(() => ({ main: mainScroll.scrollTop, side: document.querySelector('.sidebar').scrollTop, local: document.querySelector('.today-task-scroll').scrollTop, right: [...document.querySelectorAll('.today-task-scroll')].at(-1).scrollTop }));
  await page.locator('#page-today .summary').first().hover(); await page.mouse.wheel(0, 260); await page.waitForTimeout(80);
  const wheelAfter = await page.evaluate(() => ({ main: mainScroll.scrollTop, side: document.querySelector('.sidebar').scrollTop, local: document.querySelector('.today-task-scroll').scrollTop, right: [...document.querySelectorAll('.today-task-scroll')].at(-1).scrollTop }));
  assert(wheelAfter.main > wheelBefore.main && wheelAfter.side === wheelBefore.side && wheelAfter.right === wheelBefore.right, 'ordinary today card wheel did not exclusively scroll the main page');
  assert(await page.locator('.today-wheel-shield').count() === 2, 'ordinary today wheel did not isolate the local scrollers');
  const crossCardBefore = await page.evaluate(() => ({ main: mainScroll.scrollTop, locals: [...document.querySelectorAll('.today-task-scroll')].map(node => node.scrollTop) }));
  const crossCardBox = await page.locator('.today-task-scroll').first().boundingBox();
  await page.mouse.move(crossCardBox.x + crossCardBox.width / 2, crossCardBox.y + crossCardBox.height / 2);
  await page.mouse.wheel(0, 140); await page.waitForTimeout(80);
  const crossCardAfter = await page.evaluate(() => ({ main: mainScroll.scrollTop, locals: [...document.querySelectorAll('.today-task-scroll')].map(node => node.scrollTop), isolated: document.querySelectorAll('.today-wheel-shield').length === 2 }));
  assert(crossCardAfter.main > crossCardBefore.main && crossCardAfter.locals.every((value, index) => value === crossCardBefore.locals[index]) && crossCardAfter.isolated, 'native main wheel gesture changed target while the pointer crossed cards');
  await page.waitForTimeout(300);
  assert(await page.locator('.today-wheel-shield').count() === 0, 'today main wheel isolation did not release after the gesture');

  // Scrollable cards keep their wheel range across pointer movement and do not chain at a boundary.
  // Cards without overflow choose the main page at the start of the next gesture.
  await page.evaluate(() => {
    const local = document.querySelector('.today-task-scroll');
    const fixture = document.createElement('div');
    fixture.dataset.wheelFixture = 'today';
    fixture.style.height = '1400px';
    fixture.style.pointerEvents = 'none';
    local.appendChild(fixture);
    mainScroll.scrollTop = 0;
    local.scrollTop = 0;
  });
  const todayLocal = page.locator('.today-task-scroll').first();
  await todayLocal.hover(); await page.mouse.wheel(0, 120); await page.waitForTimeout(80);
  let routed = await page.evaluate(() => ({ main: mainScroll.scrollTop, local: document.querySelector('.today-task-scroll').scrollTop, other: [...document.querySelectorAll('.today-task-scroll')].at(-1).scrollTop, side: document.querySelector('.sidebar').scrollTop }));
  assert(routed.local > 90 && routed.main === 0 && routed.other === 0 && routed.side === 0, `local wheel moved the wrong region: ${JSON.stringify(routed)}`);
  assert(await page.locator('.today-wheel-shield').count() === 0, 'local wheel incorrectly activated main-page isolation');

  const downBoundary = await page.evaluate(() => {
    const local = document.querySelector('.today-task-scroll');
    const maximum = local.scrollHeight - local.clientHeight;
    local.scrollTop = maximum - 25;
    mainScroll.scrollTop = 0;
    return { maximum, before: local.scrollTop };
  });
  await todayLocal.hover(); await page.mouse.wheel(0, 100); await page.waitForTimeout(80);
  routed = await page.evaluate(() => ({ main: mainScroll.scrollTop, local: document.querySelector('.today-task-scroll').scrollTop }));
  assert(Math.abs(routed.local - downBoundary.maximum) < 2 && routed.main === 0, `local boundary incorrectly chained to the page: ${JSON.stringify({ downBoundary, routed })}`);

  await page.evaluate(() => { document.querySelector('[data-wheel-fixture="today"]')?.remove(); const local = document.querySelector('.today-task-scroll'); local.scrollTop = 0; mainScroll.scrollTop = 0; });
  await page.waitForTimeout(300);
  await todayLocal.hover(); await page.mouse.wheel(0, 120); await page.waitForTimeout(80);
  routed = await page.evaluate(() => { const local = document.querySelector('.today-task-scroll'); return { main: mainScroll.scrollTop, local: local.scrollTop, overflow: local.scrollHeight - local.clientHeight }; });
  assert(routed.overflow <= 1 && routed.local === 0 && routed.main > 70, `non-overflowing card did not choose the main page: ${JSON.stringify(routed)}`);
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDirectory, 'wheel-routing.png'), fullPage: false });
  await page.evaluate(() => { mainScroll.scrollTop = 0; document.querySelector('#page-today').style.minHeight = ''; });
  await page.waitForFunction(() => {
    const fixture = JSON.parse(localStorage.getItem('work-cockpit-browser-fixture-v1') || 'null');
    const state = JSON.parse(localStorage.getItem('work-cockpit-v6') || 'null');
    return fixture && state?.tasks?.find(task => task.id === 't2')?.followup === fixture.today;
  });

  await page.click('[data-page="tasks"]');
  await page.waitForSelector('#page-tasks.active');
  await page.evaluate(() => {
    const pageNode = document.querySelector('#page-tasks');
    const table = pageNode.querySelector('.table-card');
    pageNode.style.minHeight = '1800px';
    table.style.maxHeight = '170px';
    table.scrollTop = 0;
    mainScroll.scrollTop = 0;
  });
  const taskTableScroller = page.locator('#page-tasks .table-card');
  await taskTableScroller.hover(); await page.mouse.wheel(0, 90); await page.waitForTimeout(80);
  let taskWheel = await page.evaluate(() => ({ main: mainScroll.scrollTop, local: document.querySelector('#page-tasks .table-card').scrollTop }));
  assert(taskWheel.local > 70 && taskWheel.main === 0, `all-task local wheel did not stay in the table: ${JSON.stringify(taskWheel)}`);
  const taskBoundary = await page.evaluate(() => {
    const local = document.querySelector('#page-tasks .table-card');
    const maximum = local.scrollHeight - local.clientHeight;
    local.scrollTop = maximum - 15;
    mainScroll.scrollTop = 0;
    return maximum;
  });
  await taskTableScroller.hover(); await page.mouse.wheel(0, 80); await page.waitForTimeout(80);
  taskWheel = await page.evaluate(() => ({ main: mainScroll.scrollTop, local: document.querySelector('#page-tasks .table-card').scrollTop }));
  assert(Math.abs(taskWheel.local - taskBoundary) < 2 && taskWheel.main === 0, `all-task boundary incorrectly chained to the page: ${JSON.stringify({ taskBoundary, taskWheel })}`);
  await page.evaluate(() => { const pageNode = document.querySelector('#page-tasks'), table = pageNode.querySelector('.table-card'); pageNode.style.minHeight = ''; table.style.maxHeight = ''; table.scrollTop = 0; mainScroll.scrollTop = 0; });
  await page.click('[data-edit-task="t1"]');
  assert(await page.locator('#taskNotes[data-quill-version="2.0.3"] > .ql-editor').count() === 1, 'task notes did not initialize with Quill 2');
  await page.click('[data-add-check]');
  await page.click('[data-add-check]');
  await page.click('[data-add-check]');
  const checklistRows = page.locator('#draftChecklist [data-check-drop]');
  await checklistRows.nth(0).locator('[data-check-text]').fill('检查项一');
  await checklistRows.nth(1).locator('[data-check-text]').fill('检查项二');
  await checklistRows.nth(2).locator('[data-check-text]').fill('检查项三');
  await dragAt(page, '[data-check-drag="0"]', '[data-check-drop="2"]', 0.9);
  const checklistOrder = (await page.locator('#draftChecklist [data-check-text]').evaluateAll(nodes => nodes.map(node => node.value))).join(',');
  assert(checklistOrder === '检查项二,检查项三,检查项一', `checklist downward drag did not insert after the release row: ${checklistOrder}`);
  const checklistInput = page.locator('#draftChecklist [data-check-text]').last();
  await checklistInput.focus();
  const checklistFocus = await checklistInput.evaluate(node => ({ outline: getComputedStyle(node).outlineStyle, shadow: getComputedStyle(node).boxShadow }));
  assert(checklistFocus.outline !== 'auto' && checklistFocus.shadow !== 'none', 'checklist focus kept the browser black outline');
  await page.fill('#taskTitle', '回车保存测试');
  await page.press('#taskTitle', 'Enter');
  await page.waitForFunction(() => !document.querySelector('#taskDialog').open);
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').title === '回车保存测试', 'Enter on task title closed without saving');
  assert(await page.locator('.task-table').getByText('回车保存测试', { exact: true }).count() === 1, 'saved task did not immediately reconcile the current view');
  await page.click('[data-toggle-focus="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').focus && saved.tasks.find(task => task.id === 't1').week, 'today focus did not also enable week');
  await page.click('[data-toggle-week="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(!saved.tasks.find(task => task.id === 't1').focus && !saved.tasks.find(task => task.id === 't1').week, 'removing week did not remove today focus');
  await page.click('[data-toggle-focus="t1"]');
  await page.click('[data-page="today"]');
  await page.waitForSelector('#page-today.active #todayExecution', { state: 'visible' });
  await page.waitForSelector('#page-today.active #todayHeightResizer', { state: 'visible' });
  assert(await page.locator('.today-task-scroll').count() === 2, 'today execution cards do not own independent scroll regions');
  const overflowModes = await page.locator('.today-task-scroll').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).overflowY));
  assert(overflowModes.every(value => value === 'auto'), `today execution card scrolling is not independent: ${overflowModes.join(', ')}`);
  const dividerBackground = await page.locator('#todayHeightResizer').evaluate(node => getComputedStyle(node).backgroundImage);
  assert(dividerBackground === 'none', 'today height divider still renders a redundant full-width line');
  const divider = await page.locator('#todayHeightResizer').boundingBox();
  const beforeHeight = await page.locator('#todayExecution').evaluate(node => node.getBoundingClientRect().height);
  await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
