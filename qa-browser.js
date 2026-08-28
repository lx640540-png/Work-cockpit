const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');

const requestedUrl = process.argv[2];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
let server;
let activePage;
let activeBrowser;
const browserErrors = [];
const screenshotDirectory = path.join(__dirname, 'artifacts', 'browser-regression');

async function testUrl() {
  if (requestedUrl) return requestedUrl;
  const indexPath = path.join(__dirname, 'index.html');
  server = http.createServer((request, response) => {
    if (request.url !== '/' && request.url !== '/index.html') {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(response);
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
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
      ],
      memos: [
        { id: 'n1', title: '输入测试', content: '<p><br></p>', project: 'p1', pinned: false, archived: false },
        { id: 'n2', title: '待批量删除一', content: '<p>临时内容一</p>', project: '', pinned: false, archived: false },
        { id: 'n3', title: '待批量删除二', content: '<p>临时内容二</p>', project: '', pinned: false, archived: false },
      ],
      decisions: [], weeks: {}, trash: [], snapshots: [], favorites: ['p1'], order: { today: ['t1', 't4'], waiting: ['t2', 't3', 't5'], projects: ['p1', 'p2', 'p3'] }, meta: {},
    }));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('booting'));
  // A regular card uses the main page's native scroll; the frozen sidebar and unrelated cards never move.
  await page.evaluate(() => { document.querySelector('#page-today').style.minHeight = '1800px'; });
  const wheelBefore = await page.evaluate(() => ({ main: mainScroll.scrollTop, side: document.querySelector('.sidebar').scrollTop, local: document.querySelector('.today-task-scroll').scrollTop, right: [...document.querySelectorAll('.today-task-scroll')].at(-1).scrollTop }));
  await page.locator('#page-today .summary').first().hover(); await page.mouse.wheel(0, 260); await page.waitForTimeout(80);
  const wheelAfter = await page.evaluate(() => ({ main: mainScroll.scrollTop, side: document.querySelector('.sidebar').scrollTop, local: document.querySelector('.today-task-scroll').scrollTop, right: [...document.querySelectorAll('.today-task-scroll')].at(-1).scrollTop }));
  assert(wheelAfter.main > wheelBefore.main && wheelAfter.side === wheelBefore.side && wheelAfter.right === wheelBefore.right, 'ordinary today card wheel did not exclusively scroll the main page');
  assert(await page.locator('html').evaluate(node => node.classList.contains('main-wheel-gesture')), 'main wheel gesture did not lock its target');
  const crossCardBefore = await page.evaluate(() => mainScroll.scrollTop);
  const crossCardBox = await page.locator('#page-today .summary').nth(3).boundingBox();
  await page.mouse.move(crossCardBox.x + crossCardBox.width / 2, crossCardBox.y + crossCardBox.height / 2);
  await page.mouse.wheel(0, 140); await page.waitForTimeout(80);
  assert(await page.evaluate(() => mainScroll.scrollTop) > crossCardBefore, 'main wheel gesture lost scrolling while the pointer crossed cards');
  await page.waitForTimeout(170);
  assert(!await page.locator('html').evaluate(node => node.classList.contains('main-wheel-gesture')), 'main wheel target lock did not release after the gesture');

  // Scrollable cards own their native wheel range and do not chain at a boundary.
  // Cards without overflow let the same native wheel gesture reach the main page.
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
  assert(routed.local > 90 && routed.main === 0 && routed.other === 0 && routed.side === 0, `native local wheel moved the wrong region: ${JSON.stringify(routed)}`);
  assert(!await page.locator('html').evaluate(node => node.classList.contains('main-wheel-gesture')), 'local card scrolling incorrectly activated the main wheel lock');

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
  await todayLocal.hover(); await page.mouse.wheel(0, 120); await page.waitForTimeout(80);
  routed = await page.evaluate(() => { const local = document.querySelector('.today-task-scroll'); return { main: mainScroll.scrollTop, local: local.scrollTop, overflow: local.scrollHeight - local.clientHeight }; });
  assert(routed.overflow <= 1 && routed.local === 0 && routed.main > 70, `non-overflowing card did not pass native wheel scrolling to the page: ${JSON.stringify(routed)}`);
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
  await page.click('[data-add-check]');
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
  await page.mouse.down();
  await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2 + 60, { steps: 4 });
  await page.mouse.up();
  const afterHeight = await page.locator('#todayExecution').evaluate(node => node.getBoundingClientRect().height);
  assert(afterHeight > beforeHeight + 40, 'today height divider did not resize the execution area');
  const storedLayout = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-layout-v1')));
  assert(storedLayout.todayHeight === Math.round(afterHeight), 'today height was not persisted as a browser UI preference');
  await page.click('[data-task="t1"] [data-property="status"]');
  await page.click('#choicePopover [data-choice="等待"]');
  await page.waitForSelector('[data-drop-scope="waiting"][data-task="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').status === '等待', 'today inline status was not saved');
  await page.click('[data-task="t1"] [data-property="status"]');
  await page.click('#choicePopover [data-choice="待处理"]');
  await page.waitForSelector('[data-drop-scope="inbox"][data-task="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').inbox, 'waiting task did not migrate to the inbox');
  await page.click('[data-task="t1"] [data-property="status"]');
  await page.click('#choicePopover [data-choice="进行中"]');
  await page.waitForSelector('[data-drop-scope="today"][data-task="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(!saved.tasks.find(task => task.id === 't1').inbox && saved.tasks.find(task => task.id === 't1').focus && saved.tasks.find(task => task.id === 't1').week, 'inbox task did not return to today and week');

  await page.waitForSelector('#page-today.active');
  const todayReminder = page.locator('#page-today.active .followup.reminder').filter({ hasText: '今日跟进' });
  const overdueReminder = page.locator('#page-today.active .followup.reminder').filter({ hasText: '跟进逾期 2 天' });
  await todayReminder.waitFor({ state: 'visible' });
  await overdueReminder.waitFor({ state: 'visible' });
  assert(await todayReminder.count() === 1, 'today follow-up reminder missing');
  assert(await overdueReminder.count() === 1, 'overdue follow-up reminder missing');
  await page.click('[data-task="t1"] [data-pin-task="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.pinToday.includes('t1'), 'single task pin was not persisted');
  await page.click('[data-unpin-all="today"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.pinToday.length === 0, 'clear all pins did not stay scoped to today card');
  const orderBeforeDrop = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).order);
  await page.locator('[data-drag-handle="today"][data-task="t1"]').dragTo(page.locator('[data-drop-scope="waiting"][data-task="t2"]'));
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').status === '等待', 'cross-card drop did not update task status');
  assert(saved.order.waiting.indexOf('t1') === saved.order.waiting.indexOf('t2') - 1, 'cross-card task did not land at the release row');
  assert(saved.order.waiting.filter(id => id !== 't1').join() === orderBeforeDrop.waiting.filter(id => id !== 't1').join(), 'cross-card drop reordered unrelated target tasks');
  assert(saved.order.today.filter(id => id !== 't1').join() === orderBeforeDrop.today.filter(id => id !== 't1').join(), 'cross-card drop reordered unrelated source tasks');
  await page.keyboard.press('Control+Z');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').status === '进行中' && saved.tasks.find(task => task.id === 't1').focus, 'cross-card undo did not restore the complete task state');
  await page.locator('#globalSearch').focus();
  await page.keyboard.type('撤销隔离');
  const beforeTextUndo = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task => task.id === 't1').status);
  await page.keyboard.press('Control+Z');
  const afterTextUndo = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task => task.id === 't1').status);
  assert(beforeTextUndo === afterTextUndo, 'text input Ctrl+Z incorrectly triggered task history');
  await page.fill('#globalSearch', '');
  await page.click('[data-page="week"]');
  await page.locator('[data-drag-handle="long"][data-task="t3"]').dragTo(page.locator('[data-drop-zone="week"]'));
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't3').week && saved.tasks.find(task => task.id === 't3').type === '任务', 'long-term to weekly transition failed');
  await page.locator('[data-drag-handle="week"][data-task="t3"]').dragTo(page.locator('[data-drop-zone="long"]'));
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(!saved.tasks.find(task => task.id === 't3').week && saved.tasks.find(task => task.id === 't3').type === '长期跟进', 'weekly to long-term transition failed');


  await page.fill('#globalSearch', '回车保存');
  await page.waitForSelector('#page-search.active [data-search-task="t1"]');
  assert(await page.locator('#searchPageInput').evaluate(node => node === document.activeElement), 'search input lost focus after opening the search page');
  const searchGeometry = await page.locator('.search-page-field').evaluate(node => { const input=node.querySelector('input').getBoundingClientRect(), field=node.getBoundingClientRect(), clear=node.querySelector('button').getBoundingClientRect(); return { fieldHeight:field.height,inputHeight:input.height,clearTop:clear.top-input.top,clearBottom:input.bottom-clear.bottom }; });
  assert(Math.abs(searchGeometry.fieldHeight-searchGeometry.inputHeight)<1 && searchGeometry.clearTop>5 && searchGeometry.clearBottom>5, 'standalone search controls are vertically misaligned');
  await page.fill('#searchPageInput', '回车保存测');
  assert(await page.locator('[data-search-task="t1"]').count() === 1, 'Chinese search did not update on the standalone page');
  await page.click('[data-close-search-page]');
  await page.waitForSelector('#page-week.active');
  assert(await page.locator('#page-search').isHidden(), 'standalone search page did not close');

  await page.click('[data-page="memos"]');
  const editor = page.locator('[data-memo-content]');
  await editor.click();
  await editor.evaluate(node => { node.innerHTML = '<p>已有文本</p>'; const range = document.createRange(); range.setStart(node.firstChild, 0); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await page.keyboard.type('1. ');
  assert(await editor.locator('ol > li').count() === 1, 'ordered-list shortcut failed before existing text');
  assert((await editor.textContent()).includes('已有文本'), 'ordered-list shortcut deleted existing text');

  await editor.evaluate(node => { node.innerHTML = '<p>上一行</p><p><br></p>'; const target = node.lastElementChild; const range = document.createRange(); range.selectNodeContents(target); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await page.keyboard.type('- ');
  assert(await editor.locator('p').first().textContent() === '上一行', 'new-line shortcut changed previous paragraph');
  assert(await editor.locator('ul > li').count() === 1, 'unordered-list shortcut failed on new line');

  await editor.evaluate(node => { node.innerHTML = '<ol><li>第一项</li><li>第二项</li><li>第三项</li></ol>'; const target = node.querySelectorAll('li')[1].firstChild; const range = document.createRange(); range.setStart(target, 1); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); node.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
  await page.click('.memo-editor-body [data-command="insertUnorderedList"]');
  assert(await editor.locator(':scope > ol').count() === 2, 'changing one item removed the surrounding ordered lists');
  assert(await editor.locator(':scope > ul').count() === 1, 'current list item was not converted to an unordered list');
  assert(await editor.locator(':scope > ol').first().textContent() === '第一项', 'previous list item changed with current item');
  assert(await editor.locator(':scope > ul').textContent() === '第二项', 'wrong list item was converted');
  assert(await editor.locator(':scope > ol').last().textContent() === '第三项', 'following list item changed with current item');

  await editor.evaluate(node => { node.innerHTML = '<p>批量第一行</p><p>批量第二行</p><p>批量第三行</p>'; const first = node.firstElementChild.firstChild, last = node.lastElementChild.firstChild; const range = document.createRange(); range.setStart(first, 0); range.setEnd(last, last.length); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); node.focus(); });
  await page.click('.memo-editor-body [data-command="insertUnorderedList"]');
  assert(await editor.locator(':scope > ul').count() === 1 && await editor.locator(':scope > ul > li').count() === 3, 'multi-line selection did not batch-convert to one bullet list');
  await editor.evaluate(node => { const items = node.querySelectorAll(':scope > ul > li'), first = items[0].firstChild, last = items[items.length - 1].firstChild; const range = document.createRange(); range.setStart(first, 0); range.setEnd(last, last.length); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); node.focus(); });
  await page.click('.memo-editor-body [data-command="insertOrderedList"]');
  assert(await editor.locator(':scope > ol').count() === 1 && await editor.locator(':scope > ol > li').count() === 3, 'multi-line list selection did not batch-change list type');
  await editor.evaluate(node => { const items = node.querySelectorAll(':scope > ol > li'), first = items[0].firstChild, last = items[items.length - 1].firstChild; const range = document.createRange(); range.setStart(first, 0); range.setEnd(last, last.length); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); node.focus(); });
  await page.click('.memo-editor-body [data-command="insertOrderedList"]');
  assert(await editor.locator(':scope > p').count() === 3 && await editor.locator(':scope > ol').count() === 0, 'batch list toggle did not restore selected lines to paragraphs');

  await editor.evaluate(node => { node.innerHTML = '<ul><li>甲</li></ul><ul><li>乙</li></ul><ul></ul>'; node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); });
  await page.waitForTimeout(500);
  assert(await editor.locator(':scope > ul').count() === 1, 'adjacent unordered lists were not merged');
  assert(await editor.locator(':scope > ul > li').count() === 2, 'list normalization lost an item or kept an empty list');

  await editor.evaluate(node => { node.innerHTML = '<ul><li>一级A</li><li>一级B</li><li>一级C</li></ul>'; const target = node.querySelectorAll('li')[1].firstChild; const range = document.createRange(); range.setStart(target, 2); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); node.focus(); });
  await page.keyboard.press('Tab');
  assert(await editor.locator(':scope > ul > li').count() === 2, 'Tab did not remove the active item from the root list');
  assert(await editor.locator(':scope > ul > li').first().locator(':scope > ul > li').textContent() === '一级B', 'Tab did not indent the active list item');
  assert(await editor.evaluate(node => getSelection().anchorNode?.parentElement?.closest('li')?.childNodes[0]?.textContent === '一级B'), 'Tab moved the caret out of the active item');
  await page.keyboard.press('Shift+Tab');
  assert(await editor.locator(':scope > ul > li').count() === 3, 'Shift+Tab did not restore the item to the root list');
  assert(await editor.locator(':scope > ul > li').nth(1).textContent() === '一级B', 'Shift+Tab restored the item at the wrong position');
  assert(await editor.evaluate(node => getSelection().anchorNode?.parentElement?.closest('li')?.childNodes[0]?.textContent === '一级B'), 'Shift+Tab moved the caret out of the active item');

  await editor.evaluate(node => { node.innerHTML = '<p><br></p>'; node.dataset.empty = 'true'; const range = document.createRange(); range.selectNodeContents(node.firstElementChild); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); node.focus(); });
  await page.click('.memo-editor-body [data-command="insertOrderedList"]');
  assert(await editor.getAttribute('data-empty') === 'false', 'empty ordered list kept the placeholder visible');
  assert(await editor.locator(':scope > ol > li').count() === 1, 'empty ordered-list toolbar action did not create a list item');
  assert(await editor.locator(':scope > ol > li > br').count() === 1, 'empty ordered-list toolbar action created duplicate placeholder lines');

  await editor.evaluate(node => { node.innerHTML = '<p>前<strong>加粗文字</strong>后</p><p>目标</p>'; const text = node.querySelector('strong').firstChild; const range = document.createRange(); range.selectNodeContents(text); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); const data = new DataTransfer(); node.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })); const target = node.lastElementChild.firstChild; const caret = document.createRange(); caret.setStart(target, target.length); caret.collapse(true); selection.removeAllRanges(); selection.addRange(caret); node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
  assert(await editor.locator('p p').count() === 0, 'single-line paste inserted a nested paragraph');
  assert((await editor.locator('p').last().textContent()).includes('目标加粗文字'), 'single-line paste lost selected text');
  await editor.evaluate(node => { node.innerHTML = '<p><u>整行文字</u></p><p>前后</p>'; const source=node.firstElementChild, selection=getSelection(), range=document.createRange(), data=new DataTransfer(); range.selectNodeContents(source); selection.removeAllRanges(); selection.addRange(range); node.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true})); const target=node.lastElementChild.firstChild, caret=document.createRange(); caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 2 && await editor.locator(':scope > p').last().textContent() === '前整行文字后', 'whole logical line paste created a paragraph');
  assert(await editor.locator(':scope > p').last().locator('u').textContent() === '整行文字', 'inline underline was not retained');
  const boundaryCopyMode = await editor.evaluate(node => { node.innerHTML='<p><strong>边界整行</strong></p><p>前后</p>';const selection=getSelection(),range=document.createRange(),data=new DataTransfer();range.setStart(node,0);range.setEnd(node,1);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));const target=node.lastElementChild.firstChild,caret=document.createRange();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('application/x-work-cockpit-rich-fragment'); });
  assert(boundaryCopyMode === 'inline', 'editor-level boundaries were misclassified as a multi-block selection');
  assert(await editor.locator(':scope > p').count() === 2 && await editor.locator(':scope > p').last().textContent() === '前边界整行后', 'editor-boundary whole-line paste created a new paragraph');
  await editor.evaluate(node => { node.innerHTML='<p><u>剪切整行</u></p><p>前后</p>';const selection=getSelection(),range=document.createRange(),data=new DataTransfer();range.setStart(node,0);range.setEnd(node,1);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new ClipboardEvent('cut',{clipboardData:data,bubbles:true,cancelable:true}));const target=node.lastElementChild.firstChild,caret=document.createRange();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 1 && await editor.locator(':scope > p').textContent() === '前剪切整行后', 'whole-line cut left an empty paragraph or pasted as a new paragraph');
  await editor.evaluate(node => { node.innerHTML='<p><strong>甲行</strong></p><p><u>乙行</u></p><p>目标</p>'; const selection=getSelection(),range=document.createRange(),data=new DataTransfer();range.setStart(node.children[0].firstChild.firstChild,0);range.setEnd(node.children[1].firstChild.firstChild,2);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));const target=node.lastElementChild.firstChild,caret=document.createRange();caret.setStart(target,2);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 4 && !(await editor.innerHTML()).includes('<p><p>'), 'multi-paragraph paste produced the wrong block count or nesting');
  assert(await editor.locator(':scope > p').nth(2).locator('strong').textContent() === '甲行' && await editor.locator(':scope > p').nth(3).locator('u').textContent() === '乙行', 'multi-paragraph paste lost inline formatting');
  await editor.evaluate(node => { node.innerHTML='<p>目标</p>';const target=node.firstElementChild.firstChild,selection=getSelection(),caret=document.createRange(),data=new DataTransfer();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);data.setData('text/html','<p><u>外部整行</u></p>');data.setData('text/plain','外部整行\n');node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 1 && await editor.locator(':scope > p > u').textContent() === '外部整行', 'external single-line paste with a trailing newline lost formatting or created a paragraph');

  await page.click('[data-toggle-memo-multi]');
  await page.click('[data-toggle-memo-select="n2"]');
  await page.waitForSelector('[data-toggle-memo-select="n2"].active');
  await page.click('[data-toggle-memo-select="n3"]');
  await page.waitForSelector('[data-toggle-memo-select="n3"].active');
  assert(await page.locator('.memo-item.selected').count() === 2, 'memo multi-select did not keep both selections');
  await page.click('[data-memo-bulk-delete]');
  await page.click('#confirmAccept');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.memos.length === 1 && saved.memos[0].id === 'n1', 'memo bulk delete removed the wrong records or left selected records active');
  assert(saved.trash.filter(item => item.type === 'memo').length === 2, 'memo bulk delete did not move both records to trash');

  await page.click('[data-page="tasks"]');
  await page.click('#page-tasks.active [data-edit-task="t1"]');
  await page.click('[data-new-decision]');
  await page.fill('#decisionTitle', '采用方案A');
  await page.fill('#decisionConclusion', '继续使用当前样机结构');
  await page.click('#decisionForm button[value="default"]');
  await page.waitForSelector('#taskDecisionList [data-edit-decision]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  const decision = saved.decisions[0];
  assert(decision.sourceTaskId === 't1' && decision.project === 'p1' && decision.milestone === 'm1', 'decision auto-relations were not saved');
  await page.click('#taskForm .modal-actions [data-close="taskDialog"]');

  await page.click('[data-page="projects"]');
  await page.waitForSelector('#page-projects.active .project-master-detail', { state: 'visible' });
  assert(await page.locator('.project-master-detail').count() === 1, 'project master-detail workspace missing');
  const projectOverflow = await page.locator('.project-list-panel,.project-detail-panel').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).overflowY));
  assert(projectOverflow.every(value => value === 'auto'), 'project panes are not independently scrollable');
  assert(await page.locator('#projectSearch').count() === 0, 'project list still contains the removed search box');
  const selectedStyle = await page.locator('[data-select-project="p1"]').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, panel: getComputedStyle(document.querySelector('.project-list-panel')).backgroundColor, shadow: getComputedStyle(node).boxShadow, border: getComputedStyle(node).borderColor }));
  assert(selectedStyle.background === selectedStyle.panel && selectedStyle.shadow === 'none', 'selected project retained a background or shadow instead of only a blue border');
  assert(await page.getByText('里程碑相关任务', { exact: true }).count() === 0, 'project main page still renders milestone-related tasks');
  const selectedBeforeDrag = await page.locator('.project-list-item.selected').getAttribute('data-select-project');
  await page.locator('[data-project-drag="p1"]').dragTo(page.locator('[data-project-drop="p3"]'), { targetPosition: { x: 80, y: 70 } });
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.projects.join(',') === 'p2,p3,p1', 'project drag did not persist the indicated after position');
  assert(await page.locator('.project-list-item.selected').getAttribute('data-select-project') === selectedBeforeDrag, 'project drag changed the selected project');
  const favoriteOrder = saved.order.projects.join(','); await page.click('[data-select-project="p2"] .favorite');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6'))); assert(saved.order.projects.join(',') === favoriteOrder, 'favorite toggling reordered projects');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !document.documentElement.classList.contains('booting')); await page.click('[data-page="projects"]');
  assert((await page.locator('[data-project-drop]').evaluateAll(nodes => nodes.map(node => node.dataset.projectDrop))).join(',') === 'p2,p3,p1', 'project order did not survive reload');

  await page.click('[data-action="new-project"]');
  assert(await page.locator('#projectTemplate').inputValue() === 'hardware', 'new project did not select the hardware template by default');
  assert(await page.locator('#projectDialog .milestone-nav').count() === 6, 'hardware project template did not generate six milestone stages');
  assert(await page.locator('#milestoneName').inputValue() === '需求冻结', 'hardware project template starts with the wrong milestone');
  await page.selectOption('#projectTemplate', 'blank');
  assert(await page.locator('#projectDialog .milestone-nav').count() === 0, 'blank project template kept generated milestones');
  await page.selectOption('#projectTemplate', 'hardware');
  assert(await page.locator('#projectDialog .milestone-nav').count() === 6, 'switching back to hardware template did not restore stages');
  await page.click('#projectDialog [data-close="projectDialog"]');
  await page.click('[data-select-project="p1"] .project-list-content');
  await page.click('[data-edit-project="p1"]');
  await page.click('[data-project-panel="decisions"]');
  assert(await page.locator('[data-edit-decision]').count() >= 1, 'project decision panel is empty');
  await page.click('#deleteProjectButton');
  await page.click('#confirmAccept');
  await page.click('#confirmAccept');
  await page.waitForFunction(() => !document.querySelector('#projectDialog').open);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(!saved.projects.some(project => project.id === 'p1'), 'deleted project still exists');
  assert(saved.tasks.find(task => task.id === 't1').project === '', 'deleted project remained linked to a task');
  assert(saved.trash.some(item => item.type === 'project' && item.data.id === 'p1'), 'deleted project was not moved to trash');
  await page.click('[data-page="data"]');
  await page.click('[data-restore-trash]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.projects.some(project => project.id === 'p1'), 'project restore failed');
  assert(saved.tasks.find(task => task.id === 't1').project === 'p1', 'project restore did not restore task relation');

  const widePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); await widePage.goto(url, { waitUntil: 'domcontentloaded' }); await widePage.waitForFunction(() => !document.documentElement.classList.contains('booting')); assert(await widePage.locator('[data-main-scroll]').count() === 1, '1920x1080 viewport lacks the unique main scroll container'); await widePage.close();
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  console.log('PASS: browser interaction regression');
  await browser.close();
  activeBrowser = null;
  await new Promise(resolve => server ? server.close(resolve) : resolve());
})().catch(async error => {
  if (activePage) {
    const diagnostics = await activePage.evaluate(() => {
      const fixture = JSON.parse(localStorage.getItem('work-cockpit-browser-fixture-v1') || 'null');
      const state = JSON.parse(localStorage.getItem('work-cockpit-v6') || 'null');
      return {
        testDate: fixture?.today || '(missing)',
        followups: (state?.tasks || []).filter(task => ['t2', 't3'].includes(task.id)).map(task => ({ id: task.id, followup: task.followup })),
        renderedText: document.querySelector('#page-today')?.innerText || '(today page missing)',
      };
    }).catch(diagnosticError => ({ diagnosticError: diagnosticError.message }));
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    const screenshotPath = path.join(screenshotDirectory, 'failure.png');
    await activePage.screenshot({ path: screenshotPath, fullPage: true }).catch(screenshotError => {
      browserErrors.push(`screenshot error: ${screenshotError.message}`);
    });
    console.error('Browser regression diagnostics:', JSON.stringify({ ...diagnostics, consoleErrors: browserErrors, screenshotPath }, null, 2));
  }
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  console.error(error.stack || error);
  process.exit(1);
});
