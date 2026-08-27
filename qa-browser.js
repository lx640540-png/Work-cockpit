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
    if (String(error.message).includes('Executable doesn\'t exist')) {
      console.log('SKIP: Playwright browser binary is not installed');
      await new Promise(resolve => server ? server.close(resolve) : resolve());
      return;
    }
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
    localStorage.setItem('work-cockpit-v6', JSON.stringify({
      version: 6,
      projects: [
        { id: 'p1', name: '灯靶V0.2', code: 'TARGET', description: '', archived: false, milestones: [{ id: 'm1', name: 'EVT验证', due: '', status: '当前阶段', criteria: '' }] },
        { id: 'p2', name: '控制器V1', code: 'CTRL', description: '', archived: false, milestones: [{ id: 'm2', name: '设计验证', due: '', status: '当前阶段', criteria: '' }] },
      ],
      tasks: [
        { id: 't1', title: '确认样机测试', nextAction: '整理测试项', notes: '', project: 'p1', milestone: 'm1', type: '任务', status: '进行中', priority: 'P1', focus: false, week: false, inbox: false, archived: false, checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't2', title: '当天跟进', nextAction: '催办反馈', notes: '', project: 'p1', milestone: 'm1', type: '任务', status: '等待', priority: 'P2', focus: false, week: true, inbox: false, archived: false, followup: localDateKey(today), checklist: [], attachments: [], relatedTaskIds: [] },
        { id: 't3', title: '逾期跟进', nextAction: '确认阻塞', notes: '', project: 'p1', milestone: '', type: '长期跟进', status: '等待', priority: 'P1', focus: false, week: false, inbox: false, archived: false, followup: localDateKey(overdue), checklist: [], attachments: [], relatedTaskIds: [] },
        ...Array.from({ length: 18 }, (_, index) => ({ id: `extra-${index}`, title: `滚动回归任务 ${index + 1}`, nextAction: '验证冻结操作栏与列标题', notes: '', project: 'p2', milestone: 'm2', type: '任务', status: '进行中', priority: 'P2', focus: false, week: false, inbox: false, archived: false, checklist: [], attachments: [], relatedTaskIds: [] })),
      ],
      memos: [
        { id: 'n1', title: '输入测试', content: '<p><br></p>', project: 'p1', pinned: false, archived: false },
        { id: 'n2', title: '待批量删除一', content: '<p>临时内容一</p>', project: '', pinned: false, archived: false },
        { id: 'n3', title: '待批量删除二', content: '<p>临时内容二</p>', project: '', pinned: false, archived: false },
      ],
      decisions: [], weeks: {}, trash: [], snapshots: [], favorites: ['p1'], order: {}, meta: {},
    }));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('booting'));
  await page.waitForFunction(() => {
    const fixture = JSON.parse(localStorage.getItem('work-cockpit-browser-fixture-v1') || 'null');
    const state = JSON.parse(localStorage.getItem('work-cockpit-v6') || 'null');
    return fixture && state?.tasks?.find(task => task.id === 't2')?.followup === fixture.today;
  });

  await page.click('[data-page="tasks"]');
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
  const wheelResult = await page.evaluate(() => {
    const left=document.querySelector('[data-scroll-region="today"]'),right=document.querySelector('[data-scroll-region="waiting"]'),filler=height=>{const node=document.createElement('div');node.dataset.wheelFixture='';node.style.height=height+'px';node.style.flex='none';return node};
    left.style.height='100px';right.style.height='100px';left.appendChild(filler(500));right.appendChild(filler(500));left.scrollTop=0;right.scrollTop=0;
    document.querySelector('#todayGrid').dispatchEvent(new WheelEvent('wheel',{deltaY:80,bubbles:true,cancelable:true}));const blankFallback=right.scrollTop;
    right.scrollTop=0;left.scrollTop=20;left.dispatchEvent(new WheelEvent('wheel',{deltaY:80,bubbles:true,cancelable:true}));const whileLeftCanScroll=right.scrollTop;
    left.scrollTop=left.scrollHeight;left.dispatchEvent(new WheelEvent('wheel',{deltaY:80,bubbles:true,cancelable:true}));const atLeftBoundary=right.scrollTop;
    document.querySelectorAll('[data-wheel-fixture]').forEach(node=>node.remove());left.style.height='';right.style.height='';left.scrollTop=0;right.scrollTop=0;return{blankFallback,whileLeftCanScroll,atLeftBoundary};
  });
  assert(wheelResult.blankFallback > 0 && wheelResult.whileLeftCanScroll === 0 && wheelResult.atLeftBoundary > 0, `today wheel fallback routed incorrectly: ${JSON.stringify(wheelResult)}`);
  await page.evaluate(() => { document.querySelector('#todayExecution').style.gridTemplateColumns = '900px 8px 360px'; });
  const wideTaskLayout = await page.locator('[data-drop-scope="today"][data-task="t1"]').evaluate(row => ({ title: row.querySelector('.task-name').getBoundingClientRect().top, next: row.querySelector('.task-next').getBoundingClientRect().top, metaRight: row.querySelector('.task-meta').getBoundingClientRect().right, rowRight: row.getBoundingClientRect().right }));
  assert(Math.abs(wideTaskLayout.title - wideTaskLayout.next) < 8 && wideTaskLayout.metaRight <= wideTaskLayout.rowRight, 'wide task row did not keep title and next action aligned with right-side controls');
  await page.evaluate(() => { document.querySelector('#todayExecution').style.gridTemplateColumns = '650px 8px 360px'; });
  const narrowTaskLayout = await page.locator('[data-drop-scope="today"][data-task="t1"]').evaluate(row => ({ title: row.querySelector('.task-name').getBoundingClientRect().top, next: row.querySelector('.task-next').getBoundingClientRect().top }));
  assert(narrowTaskLayout.next > narrowTaskLayout.title + 8, 'narrow task row did not move next action below the title');
  await page.evaluate(() => { document.querySelector('#todayExecution').style.gridTemplateColumns = ''; });
  await page.hover('#page-today.active [data-task="t1"]');
  await page.click('#page-today.active [data-task="t1"] [data-pin-task="t1"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.pinToday.includes('t1'), 'single task pin was not persisted');
  await page.click('[data-unpin-all="today"]');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.order.pinToday.length === 0, 'clear all pins did not stay scoped to today card');
  await page.locator('[data-drag-handle="today"][data-task="t1"]').dragTo(page.locator('[data-drop-zone="waiting"]'));
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('work-cockpit-v6')));
  assert(saved.tasks.find(task => task.id === 't1').status === '等待', 'cross-card drop did not update task status');
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


  await page.waitForSelector('#page-week.active');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task => task.id === 't1')?.title === '回车保存测试');
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

  await page.click('[data-page="tasks"]');
  await page.waitForSelector('#page-tasks.active .tasks-sticky-tools');
  await page.locator('#mainScroll').evaluate(node => { node.scrollTop = node.scrollHeight / 2; });
  const stickyAt1600 = await page.evaluate(() => { const tools=document.querySelector('.tasks-sticky-tools').getBoundingClientRect(), head=document.querySelector('.task-table thead th').getBoundingClientRect(), scroll=document.querySelector('#mainScroll').getBoundingClientRect(); return { toolsTop:tools.top, toolsBottom:tools.bottom, headTop:head.top, scrollTop:scroll.top }; });
  assert(Math.abs(stickyAt1600.toolsTop - stickyAt1600.scrollTop) < 2 && stickyAt1600.headTop >= stickyAt1600.toolsBottom - 2, `task actions and column headers overlap or leave the scroll viewport at 1600x1000: ${JSON.stringify(stickyAt1600)}`);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const stickyAt1920 = await page.evaluate(() => { const tools=document.querySelector('.tasks-sticky-tools').getBoundingClientRect(), head=document.querySelector('.task-table thead th').getBoundingClientRect(), scroll=document.querySelector('#mainScroll').getBoundingClientRect(); return { toolsTop:tools.top, toolsBottom:tools.bottom, headTop:head.top, scrollTop:scroll.top }; });
  assert(Math.abs(stickyAt1920.toolsTop - stickyAt1920.scrollTop) < 2 && stickyAt1920.headTop >= stickyAt1920.toolsBottom - 2, 'task sticky layers overlap at 1920x1080');
  await page.setViewportSize({ width: 1600, height: 1000 });

  await page.click('[data-page="memos"]');
  const editor = page.locator('[data-memo-content]');
  await editor.click();
  await editor.evaluate(node => { node.innerHTML = '<p>已有文本</p>'; const range = document.createRange(); range.setStart(node.firstChild, 0); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await page.keyboard.type('1. ');
  assert(await editor.locator('ol > li').count() === 1, 'ordered-list shortcut failed before existing text');
  assert((await editor.textContent()).includes('已有文本'), 'ordered-list shortcut deleted existing text');

  await editor.evaluate(node => { node.innerHTML = '<p><br></p>'; const range=document.createRange(); range.selectNodeContents(node.firstElementChild); range.collapse(true); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); node.focus(); });
  await page.keyboard.type('1. ');
  await page.keyboard.type('第一项中文ABC123，。');
  assert(await editor.locator(':scope > ol > li').first().textContent() === '第一项中文ABC123，。', 'ordinary Chinese, English, number, or punctuation input deleted ordered-list content');
  await page.keyboard.press('Enter');
  await page.keyboard.type('第二项中文');
  assert(await editor.locator(':scope > ol > li').count() === 2 && await editor.locator(':scope > ol > li').nth(1).textContent() === '第二项中文', 'Enter did not create a writable next ordered-list item');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  assert(await editor.locator(':scope > p').count() === 1 && (await editor.locator(':scope > ol > li').first().textContent()).includes('第一项中文'), 'Backspace on an empty list item did not exit the list safely');
  await editor.evaluate(node => { node.innerHTML='<p><br></p>'; const range=document.createRange();range.selectNodeContents(node.firstElementChild);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);node.focus();node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'1'})); });
  await page.keyboard.type('1. ');
  await editor.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'1. '})));
  assert(await editor.locator(':scope > ol').count() === 0 && (await editor.textContent()).includes('1.'), 'IME composition incorrectly triggered a list shortcut');
  await editor.evaluate(node => { node.innerHTML='<p>撤销起点</p>'; const text=node.firstElementChild.firstChild;setRichTestCaret(text,text.length);function setRichTestCaret(owner,offset){const range=document.createRange(),selection=getSelection();range.setStart(owner,offset);range.collapse(true);selection.removeAllRanges();selection.addRange(range)}node.focus(); });
  await page.keyboard.type('A');
  await page.waitForTimeout(500);
  await page.keyboard.type('B');
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+Z');
  assert((await editor.textContent()).endsWith('A'), 'Ctrl+Z did not restore the previous rich-text step');
  await page.keyboard.press('Control+Y');
  assert((await editor.textContent()).endsWith('AB'), 'Ctrl+Y did not redo the rich-text step');

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
  assert(await page.locator('#projectSearch,.project-search').count() === 0, 'removed project search still exists in the page');
  const projectScrollBefore = await page.locator('.project-list-panel').evaluate(node => node.scrollTop);
  await page.locator('[data-select-project="p2"]').first().click();
  assert(await page.locator('.project-list-item.selected [data-select-project="p2"]').count() >= 1, 'project selection did not update only the detail workspace');
  assert(await page.locator('.project-list-panel').evaluate(node => node.scrollTop) === projectScrollBefore, 'project selection changed list scroll position');
  await page.locator('[data-select-project="p1"]').first().click();
  const selectedBeforeFavorite = await page.locator('.project-list-item.selected [data-select-project]').first().getAttribute('data-select-project');
  await page.click('[data-favorite-project="p2"]');
  const selectedAfterFavorite = await page.locator('.project-list-item.selected [data-select-project]').first().getAttribute('data-select-project');
  assert(selectedBeforeFavorite === selectedAfterFavorite, 'favorite button also selected its project');
  const favoriteGeometry = await page.locator('[data-favorite-project="p2"]').evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, svg: node.querySelector('svg').getBoundingClientRect().width }));
  assert(Math.abs(favoriteGeometry.width - 28) < 0.6 && Math.abs(favoriteGeometry.height - 28) < 0.6 && favoriteGeometry.svg >= 16, `favorite SVG size or alignment is unstable: ${JSON.stringify(favoriteGeometry)}`);
  const selectedStyle = await page.locator('.project-list-item.selected').evaluate(node => ({ border: getComputedStyle(node).borderLeftWidth, background: getComputedStyle(node).backgroundColor, shadow: getComputedStyle(node).boxShadow }));
  assert(selectedStyle.border === '2px' && selectedStyle.shadow === 'none', 'selected project still uses a wide accent strip or heavy inset shadow');
  assert(await page.locator('.project-related-summary details').count() === 2, 'milestone task and decision summaries are not adjacent to the current milestone');

  await page.click('[data-action="new-project"]');
  assert(await page.locator('#projectTemplate').inputValue() === 'hardware', 'new project did not select the hardware template by default');
  assert(await page.locator('#projectDialog .milestone-nav').count() === 6, 'hardware project template did not generate six milestone stages');
  assert(await page.locator('#milestoneName').inputValue() === '需求冻结', 'hardware project template starts with the wrong milestone');
  await page.selectOption('#projectTemplate', 'blank');
  assert(await page.locator('#projectDialog .milestone-nav').count() === 0, 'blank project template kept generated milestones');
  await page.selectOption('#projectTemplate', 'hardware');
  assert(await page.locator('#projectDialog .milestone-nav').count() === 6, 'switching back to hardware template did not restore stages');
  await page.click('#projectDialog [data-close="projectDialog"]');
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
