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
  if (target.dataset.dropScope) target.dataset.dropPosition = ratio < 0.5 ? 'before' : 'after';
  target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX, clientY }));
  source.dispatchEvent(new DragEvent('dragend', { dataTransfer: data, bubbles: true, cancelable: true, clientX, clientY }));
}, { sourceSelector, targetSelector, ratio });
const sortableDragAt = async (page, sourceSelector, targetSelector, ratio = 0.5) => {
  const source = page.locator(sourceSelector), target = page.locator(targetSelector);
  const scrollStable = async locator => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { await locator.scrollIntoViewIfNeeded(); return; }
      catch (error) { if (!String(error).includes('not attached') || attempt === 2) throw error; await page.waitForTimeout(60); }
    }
  };
  await scrollStable(source); await scrollStable(target);
  const from = await source.boundingBox(), to = await target.boundingBox();
  assert(from && to, `missing real drag geometry: ${sourceSelector} -> ${targetSelector}`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2 + 6, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * ratio, { steps: 18 });
  await page.waitForTimeout(80);
  const release = await target.boundingBox();
  assert(release, `missing release geometry after Sortable auto-scroll: ${targetSelector}`);
  await page.mouse.move(release.x + release.width / 2, release.y + release.height * ratio, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(180);
};
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
        { id: 't8', title: '推进同伴任务', nextAction: '保持来源顺序', notes: '', project: 'p1', milestone: '', type: '任务', status: '进行中', priority: 'P2', focus: true, week: true, inbox: false, archived: false, checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't9', title: '旧数据重复归属', nextAction: '规范为等待', notes: '', project: 'p1', milestone: '', type: '任务', status: '等待', priority: 'P2', focus: true, week: true, inbox: true, archived: false, checklist: [], attachments: [], relatedTaskIds: [] },
      ],
      memos: [
        { id: 'n1', title: '输入测试', content: '<p><br></p>', project: 'p1', pinned: false, archived: false },
        { id: 'n2', title: '待批量删除一', content: '<p>临时内容一</p>', project: '', pinned: false, archived: false },
        { id: 'n3', title: '待批量删除二', content: '<p>临时内容二</p>', project: '', pinned: false, archived: false },
      ],
      decisions: [], weeks: {}, trash: [], snapshots: [], favorites: ['p1'], order: { today: ['t1', 't4', 't8', 't9'], waiting: ['t2', 't3', 't5', 't9'], inbox: ['t6', 't7', 't9'], pinToday: ['t9'], pinInbox: ['t9'], projects: ['p1', 'p2', 'p3'] }, meta: {},
    }));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('booting'));
  assert(await page.evaluate(() => typeof Sortable === 'function'), 'local SortableJS runtime did not load');
  const exclusiveFixture = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('work-cockpit-v6'));
    const locations = ['today', 'waiting', 'inbox'].filter(scope => document.querySelector(`[data-drop-zone="${scope}"] [data-task="t9"]`));
    const task = state.tasks.find(item => item.id === 't9');
    return { locations, task, order: state.order };
  });
  assert(exclusiveFixture.locations.join(',') === 'waiting', `legacy duplicate task remained in multiple today cards: ${exclusiveFixture.locations.join(',')}`);
  assert(!exclusiveFixture.task.focus && !exclusiveFixture.task.inbox, 'legacy waiting task kept incompatible focus/inbox flags');
  assert(!exclusiveFixture.order.today.includes('t9') && !exclusiveFixture.order.inbox.includes('t9') && !exclusiveFixture.order.pinToday.includes('t9') && !exclusiveFixture.order.pinInbox.includes('t9'), 'legacy duplicate order and pin pollution was not pruned');
  // Today relies on native wheel scrolling. A non-overflowing local area chains to the page,
  // while a genuinely scrollable card contains the wheel at its own boundary.
  await page.evaluate(() => { document.querySelector('#page-today').style.minHeight = '1800px'; });
  const wheelBefore = await page.evaluate(() => ({ main: mainScroll.scrollTop, side: document.querySelector('.sidebar').scrollTop, local: document.querySelector('.today-task-scroll').scrollTop, right: [...document.querySelectorAll('.today-task-scroll')].at(-1).scrollTop }));
  await page.locator('#page-today .summary').first().hover(); await page.mouse.wheel(0, 260); await page.waitForTimeout(80);
  const wheelAfter = await page.evaluate(() => ({ main: mainScroll.scrollTop, side: document.querySelector('.sidebar').scrollTop, local: document.querySelector('.today-task-scroll').scrollTop, right: [...document.querySelectorAll('.today-task-scroll')].at(-1).scrollTop }));
  assert(wheelAfter.main > wheelBefore.main && wheelAfter.side === wheelBefore.side && wheelAfter.right === wheelBefore.right, 'ordinary today wheel did not use the main page native scroller');
  assert(await page.evaluate(() => typeof todayWheelOwner === 'undefined' && typeof stabilizeTodayWheel === 'undefined'), 'legacy JavaScript wheel owner is still installed');

  await page.evaluate(() => {
    const local = document.querySelector('.today-task-scroll');
    const fixture = document.createElement('div');
    fixture.dataset.wheelFixture = 'today';
    fixture.style.height = '1400px';
    fixture.style.pointerEvents = 'none';
    local.appendChild(fixture);
    mainScroll.scrollTop = 0;
    local.scrollTop = 0;
    syncTodayScrollability();
  });
  const todayLocal = page.locator('.today-task-scroll').first();
  assert(await todayLocal.evaluate(node => node.classList.contains('can-local-scroll')), 'overflowing card did not enable native overscroll containment');
  await todayLocal.hover(); await page.mouse.wheel(0, 120); await page.waitForTimeout(80);
  let routed = await page.evaluate(() => ({ main: mainScroll.scrollTop, local: document.querySelector('.today-task-scroll').scrollTop, other: [...document.querySelectorAll('.today-task-scroll')].at(-1).scrollTop, side: document.querySelector('.sidebar').scrollTop }));
  assert(routed.local > 90 && routed.main === 0 && routed.other === 0 && routed.side === 0, `local wheel moved the wrong region: ${JSON.stringify(routed)}`);

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

  await page.evaluate(() => { document.querySelector('[data-wheel-fixture="today"]')?.remove(); const local = document.querySelector('.today-task-scroll'); local.scrollTop = 0; mainScroll.scrollTop = 0; syncTodayScrollability(); });
  assert(await todayLocal.evaluate(node => !node.classList.contains('can-local-scroll')), 'non-overflowing card kept overscroll containment');
  await todayLocal.hover(); await page.mouse.wheel(0, 120); await page.waitForTimeout(80);
  routed = await page.evaluate(() => { const local = document.querySelector('.today-task-scroll'); return { main: mainScroll.scrollTop, local: local.scrollTop, overflow: local.scrollHeight - local.clientHeight }; });
  assert(routed.overflow <= 1 && routed.local === 0 && routed.main > 70, `non-overflowing card did not naturally chain to the main page: ${JSON.stringify(routed)}`);
  const mainAfterLocal = routed.main;
  await page.locator('#page-today .summary').first().hover(); await page.mouse.wheel(0, 90); await page.waitForTimeout(30);
  routed = await page.evaluate(() => ({ main: mainScroll.scrollTop, local: document.querySelector('.today-task-scroll').scrollTop }));
  assert(routed.main > mainAfterLocal && routed.local === 0, `rapid pointer movement was still locked to the old wheel target: ${JSON.stringify(routed)}`);
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDirectory, 'wheel-routing.png'), fullPage: false });
  await page.evaluate(() => { mainScroll.scrollTop = 0; document.querySelector('#page-today').style.minHeight = ''; });
  await page.waitForFunction(() => {
    const fixture = JSON.parse(localStorage.getItem('work-cockpit-browser-fixture-v1') || 'null');
    const state = JSON.parse(localStorage.getItem('work-cockpit-v6') || 'null');
    return fixture && state?.tasks?.find(task => task.id === 't2')?.followup === fixture.today;
  });
  await page.click('#page-today [data-summary-target="week"]');
  await page.waitForSelector('#page-week.active');
  assert(await page.locator('#page-week .week-grid').count() === 1, 'Today weekly summary did not open the weekly workflow');
  await page.evaluate(() => { window.__weeklyFeatureState = { state: clone(state), undo: clone(undoStack), redo: clone(redoStack), layout: clone(uiLayout) }; });
  const weekOrderBeforeFocus = await page.locator('[data-drop-zone="week"] .task-row[data-task]').evaluateAll(nodes => nodes.map(node => node.dataset.task).join(','));
  assert(await page.locator('[data-drop-zone="week"] [data-task="t4"] [data-toggle-focus="t4"].active').count() === 1, 'weekly action row did not show the active Today focus state');
  await page.click('[data-drop-zone="week"] [data-task="t4"] [data-toggle-focus="t4"]');
  let focusState = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task => task.id === 't4'));
  assert(!focusState.focus && focusState.week, 'removing a weekly task from Today also removed it from the week');
  await page.click('[data-drop-zone="week"] [data-task="t4"] [data-toggle-focus="t4"]');
  focusState = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task => task.id === 't4'));
  const weekOrderAfterFocus = await page.locator('[data-drop-zone="week"] .task-row[data-task]').evaluateAll(nodes => nodes.map(node => node.dataset.task).join(','));
  assert(focusState.focus && focusState.week && weekOrderAfterFocus === weekOrderBeforeFocus, 'adding a weekly task to Today changed its weekly membership or manual order');
  await page.click('[data-page="today"]');
  await page.waitForSelector('#page-today.active [data-drop-zone="today"] [data-task="t4"]');
  await page.evaluate(() => { const task=taskById('t4');task.status='已完成';task.completed=todayKey();task.focus=false;task.week=true;saveLocal(true);requestRender(); });
  await page.waitForFunction(() => document.querySelector('#page-today [data-summary-target="done"]')?.textContent.includes('1'));
  await page.click('#page-today [data-summary-target="done"]');
  await page.waitForSelector('#page-week.active [data-week-panel="review"].active');
  assert(await page.locator('#page-week .week-review-layout').count() === 1, 'Today completion summary did not open the current weekly review');
  const completedTitle = page.locator('#page-week .week-review-layout .task-name').first();
  assert(await completedTitle.count() === 1 && !!await completedTitle.getAttribute('title'), 'weekly completed title is missing its full-title hover text');
  const ellipsisState = await completedTitle.evaluate(node => { node.style.width='72px'; node.textContent='用于验证实时省略号的超长完成事项名称'; const style=getComputedStyle(node); return { whiteSpace:style.whiteSpace, overflow:style.overflow, textOverflow:style.textOverflow, clipped:node.scrollWidth>node.clientWidth }; });
  assert(ellipsisState.whiteSpace === 'nowrap' && ellipsisState.overflow === 'hidden' && ellipsisState.textOverflow === 'ellipsis' && ellipsisState.clipped, `weekly completed title did not use a live single-line ellipsis: ${JSON.stringify(ellipsisState)}`);
  let splitterState = await page.locator('#weekReviewSplitter').evaluate(node => ({ cursor:getComputedStyle(node).cursor, opacity:getComputedStyle(node,'::before').opacity }));
  assert(splitterState.cursor === 'col-resize' && splitterState.opacity === '0', `weekly review splitter was not a hidden drag surface: ${JSON.stringify(splitterState)}`);
  let splitBefore = await page.evaluate(() => uiLayout.weekReviewLeft);
  let splitBox = await page.locator('#weekReviewSplitter').boundingBox();
  await page.mouse.move(splitBox.x + splitBox.width / 2, splitBox.y + splitBox.height / 2); await page.mouse.down(); await page.mouse.move(splitBox.x + splitBox.width / 2 + 70, splitBox.y + splitBox.height / 2, { steps: 5 }); await page.mouse.up();
  let splitAfter = await page.evaluate(() => ({ value:uiLayout.weekReviewLeft, saved:JSON.parse(localStorage.getItem('work-cockpit-layout-v1')).weekReviewLeft }));
  assert(Math.abs(splitAfter.value-splitBefore)>.02 && splitAfter.saved===splitAfter.value, `weekly review split resize did not persist: ${JSON.stringify({splitBefore,splitAfter})}`);
  await page.click('[data-week-panel="plan"]');
  await page.waitForSelector('#weekPlanSplitter');
  splitBefore = await page.evaluate(() => uiLayout.weekPlanLeft);
  splitBox = await page.locator('#weekPlanSplitter').boundingBox();
  await page.mouse.move(splitBox.x + splitBox.width / 2, splitBox.y + splitBox.height / 2); await page.mouse.down(); await page.mouse.move(splitBox.x + splitBox.width / 2 - 65, splitBox.y + splitBox.height / 2, { steps: 5 }); await page.mouse.up();
  splitAfter = await page.evaluate(() => ({ value:uiLayout.weekPlanLeft, saved:JSON.parse(localStorage.getItem('work-cockpit-layout-v1')).weekPlanLeft }));
  assert(Math.abs(splitAfter.value-splitBefore)>.02 && splitAfter.saved===splitAfter.value, `weekly plan split resize did not persist: ${JSON.stringify({splitBefore,splitAfter})}`);
  const pastWeekKey = await page.evaluate(() => {
    const key = fmt(addDays(parseDate(currentWeekKey()), -7));
    const live = taskById('t8');
    const project = projectById(live.project);
    state.weeks[key] = { ...emptyWeek(), taskIds: ['t8'], taskSnapshots: [{ ...clone(live), title: '历史推进标题', nextAction: '历史下一步', week: true, focus: false }], projectSnapshots: [clone(project)], closedAt: new Date().toISOString() };
    live.title = '当前推进标题'; live.nextAction = '当前下一步'; live.updatedAt = new Date().toISOString();
    selectedWeekKey = key; ui.weekPanel = 'plan'; saveLocal(true); requestRender();
    return key;
  });
  await page.waitForSelector('#page-week.active .history-row [data-view-task-history="t8"]');
  assert((await page.locator('#page-week [data-task="t8"] .task-name').textContent()).includes('历史推进标题'), 'past week row drifted to the current task title');
  await page.click('#page-week [data-view-task-history="t8"]');
  await page.waitForSelector('#taskHistoryDialog[open]');
  assert((await page.locator('#taskHistoryDialog .history-title').textContent()).includes('历史推进标题'), 'historical detail did not use the closed weekly snapshot');
  const historyLayout = await page.locator('#taskHistoryDialog').evaluate(dialog => { const shell=dialog.querySelector('.history-shell'), versions=dialog.querySelector('.history-versions'), detail=dialog.querySelector('.history-detail');return { display:getComputedStyle(dialog).display, shellOverflow:getComputedStyle(shell).overflowY, versionsOverflow:getComputedStyle(versions).overflowY, detailOverflow:getComputedStyle(detail).overflowY, divider:getComputedStyle(versions).borderRightWidth, fits:dialog.getBoundingClientRect().height<=innerHeight-10 }; });
  assert(historyLayout.display === 'grid' && historyLayout.shellOverflow === 'auto' && historyLayout.versionsOverflow === 'visible' && historyLayout.detailOverflow === 'visible' && historyLayout.divider === '0px' && historyLayout.fits, `task history has nested scrollbars or stray divider lines: ${JSON.stringify(historyLayout)}`);
  await page.click('#taskHistoryDialog [data-history-version="current"]');
  assert((await page.locator('#taskHistoryDialog .history-title').textContent()).includes('当前推进标题'), 'task history could not switch from the past snapshot to the current task');
  await page.click('#taskHistoryDialog [data-history-version="' + pastWeekKey + '"]');
  assert((await page.locator('#taskHistoryDialog .history-title').textContent()).includes('历史推进标题'), 'current task changes overwrote the past weekly snapshot');
  await page.mouse.click(2, 2);
  await page.waitForFunction(() => !document.querySelector('#taskHistoryDialog')?.open);
  await page.evaluate(() => { const saved = window.__weeklyFeatureState; state = normalizeState(clone(saved.state)); undoStack = clone(saved.undo); redoStack = clone(saved.redo); uiLayout=clone(saved.layout);saveUiLayout();delete window.__weeklyFeatureState; selectedWeekKey = currentWeekKey(); ui.weekPanel = 'plan'; saveLocal(true); requestRender(); });

  await page.click('[data-page="tasks"]');
  await page.waitForSelector('#page-tasks.active');
  assert(await page.locator('#page-tasks .task-advanced-panel').isHidden(), 'secondary task filters are expanded by default');
  await page.locator('[data-hover-task-options]').hover();
  await page.waitForSelector('#page-tasks .task-advanced-panel:not([hidden])');
  await page.locator('[data-filter-detail="project"] summary').hover();
  await page.waitForFunction(() => document.querySelector('[data-filter-detail="project"]')?.open === true);
  await page.locator('[data-filter-detail="type"] summary').hover();
  await page.waitForFunction(() => document.querySelector('[data-filter-detail="type"]')?.open === true && document.querySelector('[data-filter-detail="project"]')?.open === false);
  await page.locator('#page-tasks .task-table').hover(); await page.waitForTimeout(140);
  assert(await page.locator('#page-tasks .task-advanced-panel').isHidden(), 'hover-opened task filters did not close after the pointer left');
  await page.click('[data-toggle-task-options]');
  await page.waitForSelector('#page-tasks .task-advanced-panel:not([hidden])');
  assert(await page.locator('#page-tasks .task-advanced-panel').isVisible(), 'task filter and grouping options did not expand');
  await page.check('[data-bulk-select="t1"]');
  await page.click('[data-quick="waiting"]');
  await page.waitForSelector('[data-bulk-select="t1"]', { state: 'detached' });
  assert(await page.locator('#page-tasks .bulk-bar').count() === 0, 'filter change retained a hidden task in bulk selection');
  await page.click('[data-quick="open"]');
  await page.waitForSelector('[data-bulk-select="t1"]');
  assert(!await page.locator('[data-bulk-select="t1"]').isChecked(), 'hidden bulk selection returned after restoring the filter');
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
  await page.mouse.down();
  await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2 + 60, { steps: 4 });
  await page.mouse.up();
  const afterHeight = await page.locator('#todayExecution').evaluate(node => node.getBoundingClientRect().height);
  assert(afterHeight > beforeHeight + 40, 'today height divider did not resize the execution area');
  const storedLayout = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-layout-v1')));
  assert(storedLayout.todayHeight === Math.round(afterHeight), 'today height was not persisted as a browser UI preference');
  const quickEditor = page.locator('[data-quick-note] .ql-editor');
  assert(await quickEditor.count() === 1, 'persistent quick note card did not initialize with Quill');
  const quickPlaceholder = await page.locator('.quick-note-body').evaluate(body => {
    const node = body.querySelector('[data-quick-note]');
    const editor = node.querySelector('.ql-editor');
    const line = editor.querySelector('p,li');
    const prompt = body.querySelector('.quick-note-placeholder');
    const lineRect = line.getBoundingClientRect(), promptRect = prompt.getBoundingClientRect(), check = getComputedStyle(line, '::after');
    const checkRight = lineRect.left + parseFloat(check.left) + parseFloat(check.width) + parseFloat(check.borderLeftWidth) + parseFloat(check.borderRightWidth);
    const initial = getComputedStyle(prompt).display;
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'n' }));
    const during = getComputedStyle(prompt).display;
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));
    return { gap: promptRect.left - checkRight, initial, during, after: getComputedStyle(prompt).display, composingAfter: node.classList.contains('ime-composing') };
  });
  assert(quickPlaceholder.initial !== 'none' && quickPlaceholder.gap >= 6, `quick note placeholder overlaps the completion control: ${JSON.stringify(quickPlaceholder)}`);
  assert(quickPlaceholder.during === 'none' && quickPlaceholder.after !== 'none' && !quickPlaceholder.composingAfter, 'quick note placeholder visibility did not follow Chinese IME composition');
  await quickEditor.click();
  await quickEditor.pressSequentially('第一行');
  await quickEditor.press('Enter');
  await quickEditor.pressSequentially('第二行');
  await page.waitForTimeout(220);
  let quickSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).quickNote);
  assert(quickSaved.delta.ops.some(op => String(op.insert || '').includes('第一行')) && quickSaved.delta.ops.some(op => String(op.insert || '').includes('第二行')), 'quick note did not auto-save multiline content');
  assert(await page.locator('[data-quick-note] .ql-editor :is(p,li)[class*="ql-quick-done-"]').count() === 2, 'quick note did not attach a completion box to every line');
  const firstQuickLine = page.locator('[data-quick-note] .ql-editor p').first();
  const firstQuickBox = await firstQuickLine.boundingBox();
  await page.mouse.click(firstQuickBox.x + 9, firstQuickBox.y + Math.min(10, firstQuickBox.height / 2));
  await page.waitForTimeout(80);
  assert(await firstQuickLine.evaluate(node => node.classList.contains('ql-quick-done-1')), 'quick note line completion box did not toggle');
  await page.evaluate(() => document.querySelector('[data-quick-note]').__quill.setSelection(0, 3, 'silent'));
  await page.click('.quick-note-body [data-command="bold"]');
  await page.waitForTimeout(220);
  quickSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).quickNote);
  assert(quickSaved.delta.ops.some(op => op.attributes?.bold), 'quick note bold formatting was not persisted after autosave');
  await page.evaluate(() => { const quill = document.querySelector('[data-quick-note]').__quill; const index = quill.getText().indexOf('第二行'); quill.setSelection(index, 0, 'silent'); });
  await page.click('.quick-note-body [data-command="insertUnorderedList"]');
  await page.waitForTimeout(220);
  quickSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).quickNote);
  assert(quickSaved.delta.ops.some(op => op.attributes?.list === 'bullet'), 'quick note bullet list formatting was not persisted');
  await page.click('[data-quick-note-to-task]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  const converted = saved.tasks.find(task => task.title === '第二行');
  assert(converted?.status === '待处理' && converted.inbox && saved.order.inbox[0] === converted.id, 'current quick-note line did not convert directly into the first inbox task');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const captureDivider = await page.locator('#captureResizer').boundingBox();
  assert(captureDivider, 'quick note/inbox splitter did not return after the conversion render');
  const quickWidthBefore = await page.locator('.quick-note-card').evaluate(node => node.getBoundingClientRect().width);
  await page.mouse.move(captureDivider.x + captureDivider.width / 2, captureDivider.y + captureDivider.height / 2);
  await page.mouse.down();
  await page.mouse.move(captureDivider.x + captureDivider.width / 2 + 90, captureDivider.y + captureDivider.height / 2, { steps: 4 });
  await page.mouse.up();
  const quickWidthAfter = await page.locator('.quick-note-card').evaluate(node => node.getBoundingClientRect().width);
  const captureLayout = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-layout-v1')));
  assert(quickWidthAfter > quickWidthBefore + 55 && captureLayout.quickNoteLeft > 0.5, 'quick note/inbox splitter did not resize and persist the left card');
  const quickHeightDivider = await page.locator('#quickNoteHeightResizer').boundingBox();
  const quickHeightBefore = await quickEditor.evaluate(node => node.getBoundingClientRect().height);
  await page.mouse.move(quickHeightDivider.x + quickHeightDivider.width / 2, quickHeightDivider.y + quickHeightDivider.height / 2);
  await page.mouse.down();
  await page.mouse.move(quickHeightDivider.x + quickHeightDivider.width / 2, quickHeightDivider.y + quickHeightDivider.height / 2 + 70, { steps: 4 });
  await page.mouse.up();
  const quickHeightAfter = await quickEditor.evaluate(node => node.getBoundingClientRect().height);
  const heightLayout = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-layout-v1')));
  assert(quickHeightAfter > quickHeightBefore + 50 && heightLayout.quickNoteHeight === Math.round(quickHeightAfter), 'quick note height drag did not resize and persist the editor');
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
  await page.waitForSelector('[data-drop-zone="today"] .pinned-task-segment [data-task="t1"][data-pinned="1"]');
  const pinDividerVisual = await page.locator('[data-drop-zone="today"] .pinned-task-segment.has-pins').evaluate(node => ({ border: getComputedStyle(node).borderTopWidth, background: getComputedStyle(node).backgroundColor, label: getComputedStyle(node, '::before').display }));
  assert(await page.locator('[data-drop-zone="today"] .pinned-divider').count() === 1 && pinDividerVisual.border !== '0px' && pinDividerVisual.background !== 'rgba(0, 0, 0, 0)' && pinDividerVisual.label === 'none', `pinned tasks did not show the light-blue grouping frame: ${JSON.stringify(pinDividerVisual)}`);
  await page.click('[data-unpin-all="today"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.pinToday.length === 0, 'clear all pins did not stay scoped to today card');
  await page.waitForSelector('[data-drop-scope="today"][data-task="t1"][data-pinned="0"]');
  assert(await page.locator('[data-drop-zone="today"] .pinned-task-segment.has-pins,[data-drop-zone="today"] .pinned-divider').count() === 0, 'pin grouping remained visible after the last pinned task was cleared');
  const firstTodayBeforeCardDrop = await page.locator('[data-drop-scope="today"][data-task]').first().getAttribute('data-task');
  await sortableDragAt(page, '[data-drag-handle="waiting"][data-task="t2"]', '[data-drop-zone="today"] .card-head', 0.5);
  await page.waitForSelector('[data-drop-scope="today"][data-task="t2"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.today.indexOf('t2') === saved.order.today.indexOf(firstTodayBeforeCardDrop) - 1, 'card-header drop appended the incoming task instead of inserting before the first visible row');
  await page.keyboard.press('Control+Z');
  await page.waitForSelector('[data-drop-scope="waiting"][data-task="t2"]');
  await page.click('[data-drop-scope="today"][data-task="t1"] [data-pin-task="t1"]');
  await page.waitForSelector('[data-drop-scope="today"][data-task="t1"][data-pinned="1"]');
  await page.click('[data-drop-scope="waiting"][data-task="t2"] [data-pin-task="t2"]');
  await page.waitForSelector('[data-drop-scope="waiting"][data-task="t2"][data-pinned="1"]');
  const orderBeforeDrop = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).order);
  await sortableDragAt(page, '[data-drag-handle="today"][data-task="t1"]', '[data-drop-scope="waiting"][data-task="t2"]', .25);
  await page.waitForSelector('[data-drop-scope="waiting"][data-task="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').status === '等待', 'cross-card drop did not update task status');
  assert(saved.order.waiting.indexOf('t1') === saved.order.waiting.indexOf('t2') - 1, 'cross-card task did not land at the release row');
  assert(saved.order.pinWaiting.includes('t1') && saved.order.pinWaiting.includes('t2') && !saved.order.pinToday.includes('t1'), 'cross-card drag did not transfer the existing pin without changing unrelated pins');
  const waitingPinnedDom = await page.locator('[data-drop-zone="waiting"] .task-row[data-pinned="1"]').evaluateAll(rows => rows.map(row => row.dataset.task));
  assert(waitingPinnedDom.join(',') === 't1,t2', `pinned DOM order changed after cross-card drag: ${waitingPinnedDom.join(',')}`);
  assert(saved.order.waiting.filter(id => id !== 't1').join() === orderBeforeDrop.waiting.filter(id => id !== 't1').join(), 'cross-card drop reordered unrelated target tasks');
  assert(saved.order.today.filter(id => id !== 't1').join() === orderBeforeDrop.today.filter(id => id !== 't1').join(), 'cross-card drop reordered unrelated source tasks');
  const todayPeersAfterDrop = await page.locator('[data-drop-zone="today"] .task-row[data-task]').evaluateAll(rows => rows.map(row => row.dataset.task).filter(id => id !== 't1'));
  const todayPeersBeforeDrop = orderBeforeDrop.today.filter(id => id !== 't1');
  assert(todayPeersAfterDrop.join() === todayPeersBeforeDrop.join(), `moving a task out of today changed the remaining visible order: ${todayPeersAfterDrop.join()}`);
  await page.keyboard.press('Control+Z');
  await page.waitForSelector('[data-drop-scope="today"][data-task="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').status === '进行中' && saved.tasks.find(task => task.id === 't1').focus, 'cross-card undo did not restore the complete task state');
  assert(saved.order.pinToday.includes('t1') && saved.order.pinWaiting.includes('t2'), 'cross-card undo did not restore source and target pins');

  await sortableDragAt(page, '[data-drag-handle="today"][data-task="t1"]', '[data-drop-scope="waiting"][data-task="t5"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.pinWaiting.includes('t1') && !saved.order.pinToday.includes('t1'), 'cross-card drag lost the task pin when released beside a normal row');
  await page.waitForSelector('[data-drop-zone="waiting"] [data-task="t1"][data-pinned="1"]');
  assert(await page.locator('[data-drop-zone="waiting"] [data-task="t1"][data-pinned="1"]').count() === 1, 'cross-card pinned task did not remain above the divider');
  await page.keyboard.press('Control+Z');
  await page.waitForSelector('[data-drop-scope="today"][data-task="t1"]');

  await page.click('[data-toggle-group="today"]');
  await page.waitForSelector('[data-drop-zone="today"] .task-group');
  assert(await page.locator('[data-drop-zone="today"] .pin-task,[data-drop-zone="today"] [data-unpin-all="today"],[data-drop-zone="today"] .pinned-task-segment.has-pins,[data-drop-zone="today"] .pinned-divider').count() === 0, 'project grouping still exposes pin actions or a pin lane');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.pinToday.includes('t1'), 'entering project grouping erased stored pin membership');
  await page.click('[data-toggle-group="today"]');
  await page.waitForSelector('[data-drop-zone="today"] .pinned-divider');

  const assertCrossCardBefore = async (sourceScope, taskId, targetScope, targetId) => {
    await sortableDragAt(page, `[data-drag-handle="${sourceScope}"][data-task="${taskId}"]`, `[data-drop-scope="${targetScope}"][data-task="${targetId}"]`, .25);
    const result = await page.evaluate(({ targetScope, taskId, targetId }) => {
      const state = JSON.parse(localStorage.getItem('work-cockpit-v6'));
      const dom = [...document.querySelectorAll(`[data-drop-zone="${targetScope}"] .task-row[data-task]`)].map(row => row.dataset.task);
      return { order: state.order[targetScope], pins: state.order[`pin${targetScope[0].toUpperCase()}${targetScope.slice(1)}`] || [], dom, taskId, targetId };
    }, { targetScope, taskId, targetId });
    assert(result.order.indexOf(taskId) < result.order.indexOf(targetId), `${sourceScope} -> ${targetScope} saved the moved task after the release row: ${JSON.stringify(result)}`);
    assert(result.dom.indexOf(taskId) < result.dom.indexOf(targetId), `${sourceScope} -> ${targetScope} rendered the moved task at the bottom`);
    assert(!result.pins.includes(taskId), `${sourceScope} -> ${targetScope} implicitly pinned an unpinned task`);
    await page.keyboard.press('Control+Z');
    await page.waitForSelector(`[data-drop-scope="${sourceScope}"][data-task="${taskId}"]`);
  };
  await assertCrossCardBefore('today', 't4', 'waiting', 't5');
  await assertCrossCardBefore('waiting', 't5', 'today', 't4');
  await assertCrossCardBefore('today', 't4', 'inbox', 't6');
  await assertCrossCardBefore('inbox', 't6', 'today', 't4');
  await assertCrossCardBefore('waiting', 't5', 'inbox', 't6');
  await assertCrossCardBefore('inbox', 't6', 'waiting', 't5');
  await page.click('[data-drop-scope="today"][data-task="t1"] [data-pin-task="t1"]');
  await page.waitForSelector('[data-drop-scope="today"][data-task="t1"][data-pinned="0"]');
  await sortableDragAt(page, '[data-drag-handle="today"][data-task="t4"]', '[data-drop-scope="today"][data-task="t8"]', 0.9);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.today.indexOf('t4') === saved.order.today.indexOf('t8') + 1, 'same-card downward drag did not insert after the release row');
  await page.evaluate(() => { const style=document.createElement('style');style.id='drag-scroll-fixture';style.textContent='.today-task-scroll{max-height:96px!important}';document.head.appendChild(style);const local=document.querySelector('.today-task-scroll');local.scrollTop=40;const scroll=captureDragScroll();moveOrder('today','t4','t8','before');restoreDragScroll(scroll); });
  await page.waitForTimeout(50);
  assert(await page.locator('.today-task-scroll').first().evaluate(node => node.scrollTop > 0), 'same-card drag reset the local list to the top');
  await page.evaluate(() => document.querySelector('#drag-scroll-fixture')?.remove());
  await sortableDragAt(page, '[data-drag-handle="today"][data-task="t8"]', '[data-drop-scope="today"][data-task="t4"]', 0.1);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.today.indexOf('t8') === saved.order.today.indexOf('t4') - 1, 'same-card upward drag did not insert before the release row');
  await page.locator('#globalSearch').focus();
  await page.keyboard.type('撤销隔离');
  const beforeTextUndo = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task => task.id === 't1').status);
  await page.keyboard.press('Control+Z');
  const afterTextUndo = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task => task.id === 't1').status);
  assert(beforeTextUndo === afterTextUndo, 'text input Ctrl+Z incorrectly triggered task history');
  await page.fill('#globalSearch', '');
  await page.click('[data-page="week"]');
  assert(await page.locator('[data-week-panel="plan"].active').count() === 1 && await page.locator('#page-week .top-card').count() === 1, 'weekly planning mode is not the default');
  await page.click('[data-week-panel="review"]');
  await page.waitForSelector('#page-week .week-review-layout');
  assert(await page.locator('#page-week .review-card').count() === 1 && await page.locator('#page-week .top-card').count() === 0, 'weekly review mode did not isolate completion and review content');
  await page.click('[data-week-panel="plan"]');
  await page.waitForSelector('#page-week .top-card');
  await page.click('[data-add-top]'); await page.click('[data-add-top]'); await page.click('[data-add-top]');
  await page.locator('[data-top-index="0"]').fill('重点一'); await page.locator('[data-top-index="1"]').fill('重点二'); await page.locator('[data-top-index="2"]').fill('重点三');
  await dragAt(page, '[data-top-drag="0"]', '[data-top-drop="2"]', 0.9);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.weeks[Object.keys(saved.weeks).sort().at(-1)].top.join(',') === '重点二,重点三,重点一', 'Top 3 downward drag did not insert after the release row');
  await sortableDragAt(page, '[data-drag-handle="long"][data-task="t3"]', '[data-drop-zone="week"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't3').week && saved.tasks.find(task => task.id === 't3').type === '任务', 'long-term to weekly transition failed');
  await sortableDragAt(page, '[data-drag-handle="week"][data-task="t3"]', '[data-drop-zone="long"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(!saved.tasks.find(task => task.id === 't3').week && saved.tasks.find(task => task.id === 't3').type === '长期跟进', 'weekly to long-term transition failed');
  await page.fill('#globalSearch', 'TARGET');
  await page.waitForSelector('#page-search.active [data-search-project="p1"]');
  assert(await page.locator('#page-search.active [data-search-task="t1"]').count() === 1, 'project code search did not find a related task');
  await page.fill('#searchPageInput', '回车保存');
  await page.waitForSelector('#page-search.active');
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
  if (false) {
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
  const realBoundaryCopyMode = await editor.evaluate(node => { node.innerHTML='<p><strong>真实整行</strong></p><p><u>下一行</u></p><p>前后</p>';const selection=getSelection(),range=document.createRange(),data=new DataTransfer(),first=node.children[0].firstChild.firstChild,next=node.children[1].firstChild.firstChild;range.setStart(first,0);range.setEnd(next,0);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));const target=node.lastElementChild.firstChild,caret=document.createRange();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('application/x-work-cockpit-rich-fragment'); });
  assert(realBoundaryCopyMode === 'inline', 'text-node boundary at the next paragraph start was misclassified as multi-block');
  assert(await editor.locator(':scope > p').count() === 3 && await editor.locator(':scope > p').last().textContent() === '前真实整行后', 'real whole-line selection pasted an extra paragraph');
  await editor.evaluate(node => { node.innerHTML='<p><u>剪切整行</u></p><p>前后</p>';const selection=getSelection(),range=document.createRange(),data=new DataTransfer();range.setStart(node,0);range.setEnd(node,1);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new ClipboardEvent('cut',{clipboardData:data,bubbles:true,cancelable:true}));const target=node.lastElementChild.firstChild,caret=document.createRange();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 1 && await editor.locator(':scope > p').textContent() === '前剪切整行后', 'whole-line cut left an empty paragraph or pasted as a new paragraph');
  await editor.evaluate(node => { node.innerHTML='<p><strong>甲行</strong></p><p><u>乙行</u></p><p>目标</p>'; const selection=getSelection(),range=document.createRange(),data=new DataTransfer();range.setStart(node.children[0].firstChild.firstChild,0);range.setEnd(node.children[1].firstChild.firstChild,2);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));const target=node.lastElementChild.firstChild,caret=document.createRange();caret.setStart(target,2);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 4 && !(await editor.innerHTML()).includes('<p><p>'), 'multi-paragraph paste produced the wrong block count or nesting');
  assert(await editor.locator(':scope > p').nth(2).locator('strong').textContent() === '甲行' && await editor.locator(':scope > p').nth(3).locator('u').textContent() === '乙行', 'multi-paragraph paste lost inline formatting');
  const listClipboard = await editor.evaluate(node => { node.innerHTML='<ul><li><strong>列表甲</strong></li><li><u>列表乙</u></li></ul><p>目标</p>';const items=node.querySelectorAll('li'),selection=getSelection(),range=document.createRange(),data=new DataTransfer();range.setStart(items[0].firstChild.firstChild,0);range.setEnd(items[1].firstChild.firstChild,3);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));const target=node.lastElementChild.firstChild,caret=document.createRange();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));return{html:data.getData('text/html'),result:node.innerHTML}; });
  assert(await editor.locator(':scope > ul').count() === 2 && await editor.locator(':scope > ul').last().locator(':scope > li').count() === 2, `multi-item list clipboard lost list structure: ${JSON.stringify(listClipboard)}`);
  assert(await editor.locator(':scope > ul').last().locator('strong').textContent() === '列表甲' && await editor.locator(':scope > ul').last().locator('u').textContent() === '列表乙', 'multi-item list clipboard lost inline formatting');
  await editor.evaluate(node => { node.innerHTML='<p>目标</p>';const target=node.firstElementChild.firstChild,selection=getSelection(),caret=document.createRange(),data=new DataTransfer();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);data.setData('text/html','<p><u>外部整行</u></p>');data.setData('text/plain','外部整行\n');node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 1 && await editor.locator(':scope > p > u').textContent() === '外部整行', 'external single-line paste with a trailing newline lost formatting or created a paragraph');
  await editor.evaluate(node => { node.innerHTML='<p>目标</p>';const target=node.firstElementChild.firstChild,selection=getSelection(),caret=document.createRange(),data=new DataTransfer();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);data.setData('text/html','<div><p><span style="font-weight:700">网页加粗</span></p><p><span style="text-decoration:underline">网页下划线</span></p></div>');data.setData('text/plain','网页加粗\n网页下划线');node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator('strong').textContent() === '网页加粗' && await editor.locator('u').textContent() === '网页下划线', 'external styled spans lost bold or underline formatting');
  assert(await editor.locator('p p').count() === 0, 'external wrapper HTML produced nested paragraphs');
  await editor.evaluate(node => { node.innerHTML='<p>目标</p>';const target=node.firstElementChild.firstChild,selection=getSelection(),caret=document.createRange(),data=new DataTransfer();caret.setStart(target,1);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);data.setData('text/html','<p><strong>第一行</strong><u>第二行</u></p>');data.setData('text/plain','第一行\n第二行');node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 2, 'two plain-text lines represented by one HTML block collapsed into one paragraph');
  assert(await editor.locator(':scope > p').first().locator('strong').textContent() === '第一行' && await editor.locator(':scope > p').last().locator('u').textContent() === '第二行', 'reconciled two-line paste lost inline formatting');
  await editor.evaluate(node => { node.innerHTML='<p><strong>甲行</strong></p><p><u>乙行</u></p><p>保留行</p>';const selection=getSelection(),range=document.createRange(),data=new DataTransfer();range.setStart(node.children[0].firstChild.firstChild,0);range.setEnd(node.children[1].firstChild.firstChild,2);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new ClipboardEvent('cut',{clipboardData:data,bubbles:true,cancelable:true})); });
  assert(await editor.locator(':scope > p').count() === 1 && await editor.locator(':scope > p').textContent() === '保留行', 'multi-paragraph cut left empty or partial source blocks');
  await editor.evaluate(node => { node.innerHTML='<p><strong>清除加粗</strong>和<u>下划线</u></p>';const text=node.querySelector('strong').firstChild,selection=getSelection(),range=document.createRange();range.selectNodeContents(text);selection.removeAllRanges();selection.addRange(range);node.focus(); });
  await page.click('.memo-editor-body [data-command="removeFormat"]');
  assert(await editor.locator('strong').count() === 0 && (await editor.textContent()).includes('清除加粗'), 'clear-format did not unwrap a selection inside one inline format');
  }

  const quillEditor = page.locator('[data-memo-content]');
  const quillRoot = quillEditor.locator('.ql-editor');
  assert(await quillEditor.getAttribute('data-quill-version') === '2.0.3', 'memo editor did not initialize Quill 2.0.3');
  assert(await quillRoot.count() === 1, 'Quill created an invalid editor root');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setText('\n','silent');quill.setSelection(0,0,'silent');quill.focus(); });
  await page.click('.memo-editor-body [data-command="divider"]');
  let richDividerLocator = quillRoot.locator('.rich-divider').first();
  assert(await richDividerLocator.count() === 1, 'rich-text divider toolbar button did not insert a divider');
  let dividerStyle = await richDividerLocator.evaluate(node => ({ opacity:getComputedStyle(node).opacity, align:getComputedStyle(node.querySelector('.rich-divider-label')).textAlign }));
  assert(dividerStyle.opacity === '0.7' && dividerStyle.align === 'center', `rich-text divider did not use the required 70% centered style: ${JSON.stringify(dividerStyle)}`);
  await richDividerLocator.dblclick();
  const dividerLabel = quillRoot.locator('.rich-divider-label[contenteditable="true"]');
  await dividerLabel.fill('阶段总结');
  await dividerLabel.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-memo-content] .rich-divider')?.dataset.label === '阶段总结');
  assert((await quillEditor.evaluate(node => serializeRichEditor(node))).includes('阶段总结'), 'edited divider label was not preserved by rich-text serialization');
  richDividerLocator = quillRoot.locator('.rich-divider').first();
  await richDividerLocator.click();
  assert(await richDividerLocator.evaluate(node => node.classList.contains('selected')), 'single-click did not select the whole rich-text divider');
  await page.keyboard.press('Delete');
  assert(await quillRoot.locator('.rich-divider').count() === 0, 'Delete did not remove the selected rich-text divider');
  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setText('\n','silent');quill.setSelection(0,0,'silent');quill.focus(); });
  await page.keyboard.type('-- ');
  assert(await quillRoot.locator('.rich-divider').count() === 1, 'typing -- plus space did not create a rich-text divider');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setText('已有文本\n','silent');quill.setSelection(0,0,'silent');quill.focus(); });
  await page.keyboard.type('1. ');
  let quillState = await quillEditor.evaluate(node => ({ text:node.__quill.getText(), format:node.__quill.getFormat(0,1) }));
  assert(quillState.text.includes('已有文本') && quillState.format.list === 'ordered', 'Quill ordered-list shortcut lost the existing suffix');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setText('上一行\n\n','silent');quill.setSelection(4,0,'silent');quill.focus(); });
  await page.keyboard.type('- ');
  quillState = await quillEditor.evaluate(node => ({ text:node.__quill.getText(), first:node.__quill.getText(0,3), format:node.__quill.getFormat(4,1) }));
  assert(quillState.first === '上一行' && quillState.format.list === 'bullet', 'Quill bullet shortcut changed the preceding line');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setText('\n','silent');quill.setSelection(0,0,'silent');quill.focus(); });
  await page.keyboard.type('. ');
  quillState = await quillEditor.evaluate(node => ({ text:node.__quill.getText(), format:node.__quill.getFormat(0,2), html:node.__quill.getSemanticHTML() }));
  assert(quillState.text.startsWith('重点 ') && quillState.format.focus && quillState.html.includes('focus-marker'), 'Quill focus-marker shortcut was not preserved');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setContents({ops:[{insert:'甲行',attributes:{bold:true}},{insert:'\n'},{insert:'乙行',attributes:{underline:true}},{insert:'\n'},{insert:'目标'},{insert:'\n'}]},'silent');quill.history.clear();quill.setSelection(0,5,'silent');quill.focus(); });
  await page.keyboard.press('Control+C');
  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setSelection(8,0,'silent');quill.focus(); });
  await page.keyboard.press('Control+V');
  quillState = await quillEditor.evaluate(node => ({ text:node.__quill.getText(), bold:node.__quill.getFormat(8,2).bold, underline:node.__quill.getFormat(11,2).underline }));
  assert(quillState.text.endsWith('目标甲行\n乙行\n') && !quillState.text.includes('\n\n'), `two-line copy/paste collapsed lines or added a blank paragraph: ${JSON.stringify(quillState)}`);
  assert(quillState.bold && quillState.underline, 'two-line copy/paste lost inline formatting');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setContents({ops:[{insert:'剪甲',attributes:{bold:true}},{insert:'\n'},{insert:'剪乙',attributes:{underline:true}},{insert:'\n'},{insert:'保留'},{insert:'\n'}]},'silent');quill.history.clear();quill.setSelection(0,6,'silent');quill.focus(); });
  await page.keyboard.press('Control+X');
  quillState = await quillEditor.evaluate(node => ({ text:node.__quill.getText(), lines:node.__quill.getText().split('\n') }));
  assert(quillState.text === '保留\n', `two-line cut left a partial or blank source paragraph: ${JSON.stringify(quillState)}`);
  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setSelection(0,0,'silent');quill.focus(); });
  await page.keyboard.press('Control+V');
  quillState = await quillEditor.evaluate(node => ({ text:node.__quill.getText(), bold:node.__quill.getFormat(0,2).bold, underline:node.__quill.getFormat(3,2).underline }));
  assert(quillState.text === '剪甲\n剪乙\n保留\n' && !quillState.text.includes('\n\n'), `two-line cut/paste changed line count: ${JSON.stringify(quillState)}`);
  assert(quillState.bold && quillState.underline, 'two-line cut/paste lost formatting');

  await quillEditor.evaluate(async node => { const quill=node.__quill;quill.setText('目标\n','silent');quill.setSelection(2,0,'silent');quill.focus();await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob(['<p><span style="font-weight:700">网页加粗</span></p><p><span style="text-decoration:underline">网页下划线</span></p>'],{type:'text/html'}),'text/plain':new Blob(['网页加粗\n网页下划线'],{type:'text/plain'})})]); });
  await page.keyboard.press('Control+V');
  quillState = await quillEditor.evaluate(node => ({ text:node.__quill.getText(), bold:node.__quill.getFormat(2,4).bold, underline:node.__quill.getFormat(7,5).underline, html:node.__quill.getSemanticHTML() }));
  assert(quillState.text === '目标网页加粗\n网页下划线\n' && !quillState.text.includes('\n\n'), `external two-line paste changed paragraph count: ${JSON.stringify(quillState)}`);
  assert(quillState.bold && quillState.underline && !quillState.html.includes('<p><p>'), 'external rich paste lost supported formatting or created nested paragraphs');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setText('第一行\n第二行\n第三行\n','silent');quill.setSelection(0,11,'silent');quill.focus(); });
  await page.click('.memo-editor-body [data-command="insertUnorderedList"]');
  quillState = await quillEditor.evaluate(node => [0,4,8].map(index => node.__quill.getFormat(index,1).list));
  assert(quillState.every(value => value === 'bullet'), 'Quill toolbar did not batch-format selected lines');
  await page.click('.memo-editor-body [data-command="insertOrderedList"]');
  quillState = await quillEditor.evaluate(node => [0,4,8].map(index => node.__quill.getFormat(index,1).list));
  assert(quillState.every(value => value === 'ordered'), 'Quill toolbar did not batch-change list type');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setContents({ops:[{insert:'清除加粗',attributes:{bold:true}},{insert:'和'},{insert:'下划线',attributes:{underline:true}},{insert:'\n'}]},'silent');quill.setSelection(0,4,'silent');quill.focus(); });
  await page.click('.memo-editor-body [data-command="removeFormat"]');
  quillState = await quillEditor.evaluate(node => ({ text:node.__quill.getText(), format:node.__quill.getFormat(0,4) }));
  assert(quillState.text.startsWith('清除加粗') && !quillState.format.bold, 'Quill clear-format changed text or retained bold');

  await quillEditor.evaluate(node => { const quill=node.__quill;quill.setText('撤销','silent');quill.history.clear();quill.setSelection(2,0,'silent');quill.focus(); });
  await page.keyboard.type('测试');
  await page.keyboard.press('Control+Z');
  assert(await quillEditor.evaluate(node => node.__quill.getText()) === '撤销\n', 'Quill undo did not restore editor-local content');
  await page.keyboard.press('Control+Shift+Z');
  assert(await quillEditor.evaluate(node => node.__quill.getText()) === '撤销测试\n', 'Quill redo did not restore editor-local content');
  await page.waitForTimeout(350);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.memos.find(memo => memo.id === 'n1').content.includes('撤销测试'), 'Quill user edits did not autosave through the existing memo lifecycle');

  assert(await page.locator('.memo-editor-head [data-toggle-pin]').count() === 0, 'memo editor still exposes the old text pin action');
  const pinBefore = await page.evaluate(() => memoById('n1').pinned);
  await page.click('[data-select-memo="n1"] [data-toggle-pin="n1"]');
  await page.waitForFunction(expected => { const memo=memoById('n1'),icon=document.querySelector('[data-toggle-pin="n1"]');return memo?.pinned===expected&&!!icon?.classList.contains('active')===expected; }, !pinBefore);
  let pinAfter = await page.evaluate(() => memoById('n1').pinned);
  assert(pinAfter !== pinBefore, 'memo card pin icon did not toggle its state');
  await page.click('[data-select-memo="n1"] [data-toggle-pin="n1"]');
  await page.waitForFunction(expected => { const memo=memoById('n1'),icon=document.querySelector('[data-toggle-pin="n1"]');return memo?.pinned===expected&&!!icon?.classList.contains('active')===expected; }, pinBefore);
  pinAfter = await page.evaluate(() => memoById('n1').pinned);
  assert(pinAfter === pinBefore, 'memo card pin test did not restore the original state');

  const memoOrderBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).order.memoActive.slice());
  await dragAt(page, '[data-memo-drag="n1"]', '[data-select-memo="n3"]', 0.9);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.memoActive.indexOf('n1') === saved.order.memoActive.indexOf('n3') + 1, `memo downward drag did not insert after the release card: ${memoOrderBefore.join(',')} -> ${saved.order.memoActive.join(',')}`);

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
  const tableAlignment = await page.locator('#page-tasks tr[data-task="t1"]').evaluate(row => {
    const status = row.querySelector('[data-property="status"]').getBoundingClientRect();
    const priority = row.querySelector('[data-property="priority"]').getBoundingClientRect();
    const pin = row.querySelector('[data-pin-task]').getBoundingClientRect();
    return { verticalAlign:getComputedStyle(row.cells[8]).verticalAlign, statusCenter:status.y+status.height/2, priorityCenter:priority.y+priority.height/2, pinCenter:pin.y+pin.height/2 };
  });
  assert(tableAlignment.verticalAlign === 'middle' && Math.abs(tableAlignment.statusCenter-tableAlignment.priorityCenter) < 1 && Math.abs(tableAlignment.statusCenter-tableAlignment.pinCenter) < 1, `all-items status controls are not vertically aligned: ${JSON.stringify(tableAlignment)}`);
  await page.evaluate(() => { window.__taskDetailFixture = { state:clone(state), undo:clone(undoStack), redo:clone(redoStack) }; });
  await page.click('#page-tasks.active [data-edit-task="t1"]');
  await page.waitForSelector('#taskDialog[open] #taskEditor .hover-select');
  const detailSelectState = await page.locator('#taskEditor').evaluate(node => ({ selects:node.querySelectorAll('select').length, enhanced:node.querySelectorAll('.hover-select').length }));
  assert(detailSelectState.selects > 0 && detailSelectState.selects === detailSelectState.enhanced, `task-detail dropdowns were not all hover-enabled: ${JSON.stringify(detailSelectState)}`);
  assert(await page.locator('#draftDue').count() === 0 && await page.locator('#draftCompleted').isDisabled(), 'task detail did not replace deadline with a status-aware completion date');
  await page.locator('#draftStatus + .hover-select-trigger').hover();
  await page.waitForFunction(() => document.querySelector('#draftStatus')?.closest('.hover-select')?.classList.contains('open'));
  await page.locator('#draftStatus').locator('xpath=..').locator('[data-hover-select-option]').filter({ hasText:'已完成' }).click();
  const completedDraft = await page.locator('#draftCompleted').evaluate(node => ({ disabled:node.disabled, value:node.value }));
  assert(!completedDraft.disabled && completedDraft.value === await page.evaluate(() => todayKey()), `completion date did not enable and default to today: ${JSON.stringify(completedDraft)}`);
  await page.locator('#draftStatus + .hover-select-trigger').hover();
  await page.waitForFunction(() => document.querySelector('#draftStatus')?.closest('.hover-select')?.classList.contains('open'));
  await page.locator('#draftStatus').locator('xpath=..').locator('[data-hover-select-option]').filter({ hasText:'进行中' }).click();
  assert(await page.locator('#draftCompleted').isDisabled() && await page.locator('#draftCompleted').inputValue() === '', 'reopening a task status did not clear and disable completion date');
  await page.locator('#draftPriority + .hover-select-trigger').hover();
  await page.waitForFunction(() => !document.querySelector('#draftStatus')?.closest('.hover-select')?.classList.contains('open') && document.querySelector('#draftPriority')?.closest('.hover-select')?.classList.contains('open'));
  await page.locator('#draftPriority').locator('xpath=..').locator('[data-hover-select-option]').filter({ hasText:'P2' }).click();
  assert(await page.locator('#draftPriority').inputValue() === 'P2', 'task-detail hover dropdown did not update the native field value');
  assert(await page.locator('[data-toggle-task-notes]').count() === 0 && await page.locator('#taskNotes .ql-editor').isVisible(), 'task notes did not stay expanded in the restored editor layout');
  const taskContentGap = await page.locator('.task-content-column').evaluate(node => { const checklist=node.querySelector('.checklist-section').getBoundingClientRect(), notes=node.querySelector('.task-notes-field').getBoundingClientRect(); return notes.top-checklist.bottom; });
  assert(taskContentGap >= 6 && taskContentGap <= 16, `checklist and task-note spacing is not compact: ${taskContentGap}`);
  const notesHost = page.locator('#taskNotes');
  const notesResizeHandle = page.locator('.task-notes-editor [data-rich-height-resizer="taskNotesHeight"]');
  const notesResizeBox = await notesResizeHandle.boundingBox();
  const notesHeightBefore = await notesHost.evaluate(node => node.getBoundingClientRect().height);
  await page.mouse.move(notesResizeBox.x + notesResizeBox.width / 2, notesResizeBox.y + notesResizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(notesResizeBox.x + notesResizeBox.width / 2, notesResizeBox.y + notesResizeBox.height / 2 + 64, { steps: 4 });
  await page.mouse.up();
  const notesHeightAfter = await notesHost.evaluate(node => node.getBoundingClientRect().height);
  let richLayout = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-layout-v1')));
  assert(notesHeightAfter > notesHeightBefore + 45 && richLayout.taskNotesHeight === Math.round(notesHeightAfter), 'task-note bottom edge did not resize and persist its height');
  await notesResizeHandle.dblclick();
  assert(Math.abs(await notesHost.evaluate(node => node.getBoundingClientRect().height) - 220) < 1, 'double-click did not restore the task-note editor height');
  await notesHost.evaluate(node => { const quill=node.__quill;quill.setContents({ops:[{insert:'第一项'},{insert:'\n',attributes:{list:'ordered'}},{insert:'第二项'},{insert:'\n',attributes:{list:'ordered'}}]},'silent');quill.setSelection(1,0,'user');quill.focus(); });
  await page.keyboard.press('Tab');
  let listIndent = await notesHost.evaluate(node => ({ first:node.__quill.getFormat(0,1).indent||0, buttonDisabled:node.closest('.editor-box').querySelector('[data-command="indent"]').disabled }));
  assert(listIndent.first === 0 && listIndent.buttonDisabled, `first ordered-list item created an orphan indent: ${JSON.stringify(listIndent)}`);
  await notesHost.evaluate(node => { const quill=node.__quill,index=quill.getText().indexOf('第二项');quill.setSelection(index+1,0,'user');quill.focus(); });
  await page.keyboard.press('Tab');
  listIndent = await notesHost.evaluate(node => { const quill=node.__quill,index=quill.getText().indexOf('第二项');return quill.getFormat(index,1).indent||0; });
  assert(listIndent === 1, `ordered-list item with a valid parent did not indent: ${listIndent}`);
  await page.keyboard.press('Shift+Tab');
  assert(await notesHost.evaluate(node => { const quill=node.__quill,index=quill.getText().indexOf('第二项');return !(quill.getFormat(index,1).indent||0); }), 'ordered-list outdent did not return to the root level');
  await notesHost.evaluate(node => { const quill=node.__quill;quill.setText('--','silent');quill.setSelection(2,0,'silent');quill.focus(); });
  await page.keyboard.press('Space');
  let dividerState = await notesHost.evaluate(node => ({ text:node.__quill.getText(), dividers:node.querySelectorAll('.rich-divider').length, height:node.querySelector('.rich-divider')?.getBoundingClientRect().height }));
  assert(dividerState.dividers === 1 && dividerState.text === '\n' && dividerState.height >= 36, `divider insertion created blank lines or an undersized hit target: ${JSON.stringify(dividerState)}`);
  await notesHost.evaluate(node => { const quill=node.__quill;quill.setSelection(quill.getLength()-1,0,'silent');quill.focus(); });
  await page.keyboard.press('Backspace');
  assert(await notesHost.locator('.rich-divider').count() === 1, 'backspace on the adjacent empty line deleted the divider');
  await notesHost.evaluate(node => { node.__quill.setContents({ops:[{insert:'需要保留的富文本备注',attributes:{bold:true}},{insert:'\n'}]},'silent'); });
  await page.click('[data-new-related-task]');
  await page.waitForFunction(() => document.querySelector('#taskDialog')?.open && taskDraft?.title === '新的关联事项');
  const relatedCreation = await page.evaluate(() => { const child=taskDraft,parent=taskById('t1'),savedChild=taskById(child.id);return { childId:child.id, parentLinks:parent.relatedTaskIds, childLinks:savedChild.relatedTaskIds, parentNotes:parent.notes, project:savedChild.project, milestone:savedChild.milestone }; });
  assert(relatedCreation.parentLinks.includes(relatedCreation.childId) && relatedCreation.childLinks.includes('t1') && relatedCreation.parentNotes.includes('需要保留的富文本备注') && relatedCreation.project === 'p1' && relatedCreation.milestone === 'm1', `related-task creation did not atomically save and link both tasks: ${JSON.stringify(relatedCreation)}`);
  await page.evaluate(() => { state=normalizeState(clone(window.__taskDetailFixture.state));undoStack=clone(window.__taskDetailFixture.undo);redoStack=clone(window.__taskDetailFixture.redo);delete window.__taskDetailFixture;saveLocal(true);requestRender(); });
  await page.click('#taskForm .modal-actions [data-close="taskDialog"]');
  await page.waitForSelector('#page-tasks.active [data-edit-task="t1"]');
  await page.click('#page-tasks.active [data-edit-task="t1"]');
  await page.click('[data-new-decision]');
  assert(await page.locator('#decisionDialog[open] .decision-rich-box .ql-container').count() === 2, 'key decision fields did not initialize as rich-text editors');
  assert(await page.locator('#decisionDialog[open] [data-rich-height-resizer]').count() === 2, 'key decision rich editors do not expose the shared bottom-edge resize area');
  const decisionResizeHandle = page.locator('[data-rich-height-resizer="decisionConclusionHeight"]');
  const decisionResizeBox = await decisionResizeHandle.boundingBox();
  const decisionHeightBefore = await page.locator('#decisionConclusion').evaluate(node => node.getBoundingClientRect().height);
  await page.mouse.move(decisionResizeBox.x + decisionResizeBox.width / 2, decisionResizeBox.y + decisionResizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(decisionResizeBox.x + decisionResizeBox.width / 2, decisionResizeBox.y + decisionResizeBox.height / 2 + 44, { steps: 3 });
  await page.mouse.up();
  const decisionHeightAfter = await page.locator('#decisionConclusion').evaluate(node => node.getBoundingClientRect().height);
  richLayout = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-layout-v1')));
  assert(decisionHeightAfter > decisionHeightBefore + 30 && richLayout.decisionConclusionHeight === Math.round(decisionHeightAfter), 'key decision editor height did not resize and persist');
  await decisionResizeHandle.dblclick();
  assert(Math.abs(await page.locator('#decisionConclusion').evaluate(node => node.getBoundingClientRect().height) - 160) < 1, 'double-click did not restore the key decision editor height');
  await page.fill('#decisionTitle', '采用方案A');
  await page.locator('#decisionConclusion').evaluate(node => node.__quill.setContents({ops:[{insert:'继续使用',attributes:{bold:true}},{insert:'当前样机结构\n'}]},'user'));
  await page.locator('#decisionRationale').evaluate(node => node.__quill.setContents({ops:[{insert:'兼顾成本与验证进度\n'}]},'user'));
  await page.click('#decisionForm button[value="default"]');
  await page.waitForSelector('#taskDecisionList [data-edit-decision]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  const decision = saved.decisions[0];
  assert(decision.sourceTaskId === 't1' && decision.project === 'p1' && decision.milestone === 'm1', 'decision auto-relations were not saved');
  assert(decision.conclusion.includes('<strong>继续使用</strong>') && decision.rationale.includes('兼顾成本与验证进度'), 'key decision rich-text formatting was not serialized');
  await page.click('#taskForm .modal-actions [data-close="taskDialog"]');

  await page.evaluate(() => { const project = projectById('p1'); window.__projectMilestoneFixture = clone(project.milestones); project.milestones.push({ id: 'm2', name: 'DVT 验证', due: '', status: '未开始', criteria: '' }, { id: 'm3', name: '小批试产', due: '', status: '未开始', criteria: '' }); saveLocal(true); });
  await page.click('[data-page="projects"]');
  await page.waitForSelector('#page-projects.active .project-master-detail', { state: 'visible' });
  assert(await page.locator('.project-master-detail').count() === 1, 'project master-detail workspace missing');
  const projectOverflow = await page.locator('.project-list-panel,.project-detail-panel').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).overflowY));
  assert(projectOverflow.every(value => value === 'auto'), 'project panes are not independently scrollable');
  assert(await page.locator('#projectSearch').count() === 0, 'project list still contains the removed search box');
  await page.fill('#projectTaskSearch', '保持推进顺序');
  await page.waitForFunction(() => document.querySelectorAll('#page-projects .overview-row').length === 1);
  assert((await page.locator('#page-projects .overview-row b').first().textContent()).includes('保持推进顺序'), 'project-local task search returned the wrong item');
  await page.fill('#projectTaskSearch', '');
  await page.waitForFunction(() => document.querySelectorAll('#page-projects .overview-row').length > 1);
  await page.locator('.project-milestone-filter summary').hover();
  await page.waitForFunction(() => document.querySelector('.project-milestone-filter')?.open === true);
  const milestoneChoices = await page.locator('.project-milestone-filter .milestone-filter-choice').evaluateAll(nodes => nodes.map(node => node.textContent.replace(/\s+/g, ' ').trim()));
  assert(milestoneChoices.length === 3 && milestoneChoices.some(text => text.includes('DVT 验证')) && milestoneChoices.some(text => text.includes('小批试产')), `project milestone filter did not list every milestone separately: ${milestoneChoices.join(' | ')}`);
  await page.click('[data-project-milestone-filter="m1"]');
  await page.waitForFunction(() => document.querySelectorAll('#page-projects .overview-row').length === 2);
  assert(await page.locator('#page-projects .overview-row').count() === 2, 'project milestone filter did not isolate milestone tasks');
  await page.locator('.project-milestone-filter summary').hover();
  await page.click('[data-project-milestone-filter="all"]');
  await page.waitForFunction(() => document.querySelectorAll('#page-projects .overview-row').length > 2);
  await page.evaluate(() => { projectById('p1').milestones = clone(window.__projectMilestoneFixture); delete window.__projectMilestoneFixture; saveLocal(true); requestRender(); });
  await page.waitForFunction(() => document.querySelectorAll('.project-milestone-filter .milestone-filter-choice').length === 1);
  const selectedStyle = await page.locator('[data-select-project="p1"]').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, panel: getComputedStyle(document.querySelector('.project-list-panel')).backgroundColor, shadow: getComputedStyle(node).boxShadow, border: getComputedStyle(node).borderColor }));
  assert(selectedStyle.background === selectedStyle.panel && selectedStyle.shadow === 'none', 'selected project retained a background or shadow instead of only a blue border');
  assert(await page.getByText('里程碑相关任务', { exact: true }).count() === 0, 'project main page still renders milestone-related tasks');
  const selectedBeforeDrag = await page.locator('.project-list-item.selected').getAttribute('data-select-project');
  await page.locator('[data-project-drag="p1"]').dragTo(page.locator('[data-project-drop="p3"]'), { targetPosition: { x: 80, y: 70 } });
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.projects.join(',') === 'p2,p3,p1', 'project drag did not persist the indicated after position');
  assert(await page.locator('.project-list-item.selected').getAttribute('data-select-project') === selectedBeforeDrag, 'project drag changed the selected project');
  const favoriteOrder = saved.order.projects.join(','); await page.click('[data-select-project="p2"] .favorite');
  await page.waitForSelector('[data-select-project="p2"] .favorite.active');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6'))); assert(saved.order.projects.join(',') === favoriteOrder, 'pin toggling rewrote the manual project order');
  assert((await page.locator('[data-project-drop]').evaluateAll(nodes => nodes.map(node => node.dataset.projectDrop))).join(',') === 'p2,p1,p3', 'newly pinned project did not move into the top section');
  assert(await page.locator('[data-select-project="p2"] .favorite.active').count() === 1, 'project pin button did not show its active state');
  await page.click('[data-select-project="p2"] .project-list-content');
  await page.waitForSelector('[data-select-project="p2"].selected');
  const pinnedSelection = await page.evaluate(() => {
    const selected = document.querySelector('[data-select-project="p2"]');
    const otherPinned = document.querySelector('[data-select-project="p1"]');
    return { selectedClass: selected.classList.contains('selected'), otherSelected: otherPinned.classList.contains('selected'), selectedBorder: getComputedStyle(selected).borderColor, otherBorder: getComputedStyle(otherPinned).borderColor };
  });
  assert(pinnedSelection.selectedClass && !pinnedSelection.otherSelected && pinnedSelection.selectedBorder !== pinnedSelection.otherBorder, `selected and unselected pinned projects remain visually indistinguishable: ${JSON.stringify(pinnedSelection)}`);
  const projectRail = await page.locator('#projectSplitter').evaluate(node => ({ hit: node.getBoundingClientRect().width, visible: getComputedStyle(node, '::before').width, length: getComputedStyle(node, '::before').height }));
  assert(projectRail.hit === 8 && projectRail.visible === '6px' && projectRail.length === '84px', `project splitter does not share the Today grip with a usable hit target: ${JSON.stringify(projectRail)}`);
  await page.click('[data-select-project="p1"] .project-list-content');
  await page.evaluate(() => { taskFilter = { ...taskFilter, query: '残留筛选', type: ['问题与Bug'], status: ['暂停'] }; });
  await page.click('[data-open-project-tasks="p1"]');
  await page.waitForSelector('#page-tasks.active');
  const projectHandoffFilter = await page.evaluate(() => taskFilter);
  assert(projectHandoffFilter.query === '' && projectHandoffFilter.type.length === 0 && projectHandoffFilter.status.length === 0 && projectHandoffFilter.project.join(',') === 'p1', `project full-view handoff retained stale filters: ${JSON.stringify(projectHandoffFilter)}`);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !document.documentElement.classList.contains('booting')); await page.click('[data-page="projects"]');
  await page.waitForFunction(() => document.querySelector('#page-projects.active')?.querySelectorAll('[data-project-drop]').length === 3);
  const projectOrderAfterReload = await page.locator('#page-projects.active [data-project-drop]').evaluateAll(nodes => nodes.map(node => node.dataset.projectDrop));
  assert(projectOrderAfterReload.join(',') === 'p2,p1,p3', `project pin order did not survive reload: ${projectOrderAfterReload.join(',')}`);

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
  assert(saved.decisions.find(item => item.id === decision.id).project === 'p1', 'project restore did not restore decision relation');

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
