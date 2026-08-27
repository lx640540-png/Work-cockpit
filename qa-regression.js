const fs = require('fs');
const vm = require('vm');

const file = process.argv[2];
if (!file) throw new Error('usage: node qa-regression.js <index.html>');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
const js = scripts.at(-1) || '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = js.indexOf(marker);
  assert(start >= 0, `missing function ${name}`);
  const brace = js.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < js.length; index += 1) {
    const character = js[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return js.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const contracts = [
  [html.includes('<html lang="zh-CN" class="booting">') && html.includes("classList.remove(\"booting\")"), 'startup shield'],
  [(html.match(/function boot\s*\(/g) || []).length === 1, 'single boot entry'],
  [html.includes('function commit(') && html.includes('function requestRender('), 'unified store/render'],
  [html.indexOf('data-page="week"') < html.indexOf('data-page="tasks"'), 'week before all tasks in nav'],
  [html.includes('let taskFilter={quick:"open"') && html.includes('group:"project"'), 'default project grouping'],
  [html.includes('["archived","已归档"]') && !html.includes('data-quick-more'), 'direct archived filter'],
  [html.includes('data-smart-sort="waiting"') || html.includes('controls("waiting")'), 'waiting smart sort'],
  [html.includes('data-smart-sort="long"'), 'long-term smart sort'],
  [html.includes('grid-template-columns:20px 23px minmax(0,1fr) auto 34px'), 'task row layout contract'],
  [html.includes('grid-template-columns:minmax(280px,330px) minmax(390px,1fr) minmax(280px,320px)') && html.includes('<aside class="task-column attachment-column">') && html.includes('关联任务 <span class="muted">双向关联</span>'), 'right attachment/relations column'],
  [html.includes('memo-layout{height:calc(100dvh') && html.includes('.memo-list{grid-row:4;min-height:0;overflow:auto'), 'independent memo scrolling'],
  [html.includes('memoMultiSelect:false') && html.includes('data-toggle-memo-select') && html.includes('data-memo-bulk-delete') && html.includes('moveMemosToTrash(ids'), 'memo multi-select and bulk delete'],
  [html.includes('.project-card{position:relative;min-height:305px'), 'project card comfortable height'],
  [html.includes('.future-week .week-card:not(.top-card)') && html.includes('未来周仅 Top 3 可编辑'), 'future top-only editing'],
  [html.includes('历史周只读快照'), 'past week readonly'],
  [html.includes('confirmTwice("清除全部快照？') && html.includes('confirmTwice("永久清空回收站？') && html.includes('confirmTwice("一键清空业务数据？'), 'two-step destructive confirmation'],
  [html.includes('function richShortcutSpec(') && html.includes('function richConvertShortcut(') && html.includes('focus-marker'), 'caret-aware rich editor shortcuts'],
  [html.includes('id="themeButton"') && html.includes(':root[data-theme="dark"]'), 'dark mode'],
  [html.includes('<textarea id="taskNext"') && html.includes('normalizeRich'), 'multiline preservation'],
  [html.includes('function richApplyHistory(') && html.includes('historyUndo') && html.includes('historyRedo') && html.includes('richStates=new WeakMap()'), 'per-editor rich text undo history'],
  [html.includes('class="project-modal"') && html.includes('class="project-workspace"') && !html.includes('.project-card:before'), 'restored project workspace and clean cards'],
  [html.includes('projectOverviewFilter:"open"') && html.includes('data-project-overview="done"') && html.includes('data-project-overview="all"'), 'project overview filters'],
  [html.includes('.rich-editor b,.rich-editor strong{font-weight:700;color:var(--ink)}'), 'rich bold contrast without excessive Latin weight'],
  [html.includes('关联事项已自动保存'), 'related tasks autosave'],
  [!html.includes('本周项目推进'), 'redundant week project card absent'],
  [html.includes('.task-modal>form{height:') && html.includes('.task-modal .task-editor{min-height:0;max-height:none;overflow:hidden') && html.includes('.task-content-column{height:100%;min-height:0;display:block;overflow-y:auto'), 'task detail middle column scroll owner'],
  [html.indexOf('id="taskNext"') < html.indexOf('class="task-section checklist-section ') && html.indexOf('class="task-section checklist-section ') < html.indexOf('id="taskNotes"'), 'checklist below next action'],
  [html.includes('function sanitizeRichValue(') && html.includes('function richPaste(') && html.includes('insertFromPaste'), 'sanitized rich paste pipeline'],
  [html.includes('data-action="new-task" data-inbox="1">＋ 先记下来') && !html.includes('data-action="quick-memo">＋ 先记下来'), 'quick capture opens inbox task'],
  [html.includes('.top-delete{width:28px') && html.includes('.overview-row>div:first-child small{display:block;margin-top:6px'), 'Top 3 delete and project overview spacing'],
  [html.includes('<strong>工作台</strong>') && !html.includes('工作驾驶舱'), 'workbench brand rename'],
  [html.includes('class="task-column task-content-column"') && html.includes('id="taskNext" rows="1"'), 'compact task content and one-line next action'],
  [html.includes('#draftChecklist{display:grid') && html.includes('overflow:visible') && !html.includes('#draftChecklist{max-height:'), 'checklist has no internal scroll'],
  [html.includes('id="checklistResizer"') && html.includes('data-toggle-checklist') && html.includes('checklistResizeState'), 'checklist collapse and vertical resize'],
  [html.includes('data-check-drag="') && html.includes('kind:"check"') && html.includes('data-check-drop'), 'checklist drag reorder'],
  [html.includes('if(!block||block.tagName==="LI")return false') && !html.includes('replaceChildren(list)'), 'native list newline without destructive replacement'],
  [html.includes('function refreshChecklist(') && !html.includes('taskDraft=clone(taskById(taskId));renderTaskEditor()'), 'local panels preserve task draft and rich history'],
  [functionSource('richShortcutAtCaret').includes('richConvertShortcut') && !html.includes('document.execCommand'), 'rich editor core avoids browser execCommand guessing'],
  [functionSource('richConvertShortcut').includes('block.replaceWith(list)') && functionSource('richConvertShortcut').includes('while(block.firstChild)item.appendChild'), 'shortcut converts only the active paragraph and preserves suffix content'],
  [html.includes('function richListBoundary(') && html.includes('richUnlistItem(editor,item)') && html.includes('event.key==="Enter"') && html.includes('event.key==="Backspace"'), 'deterministic empty-list exit and line-start unlist'],
  [html.includes('richHistoryAvailable(activeRichEditor,-1)') && html.includes('richHistoryAvailable(activeRichEditor,1)') && functionSource('richHistoryAvailable').includes('richFlush(editor)'), 'toolbar undo and redo flush and follow the active rich editor'],
  [html.includes('["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","SVG","MATH","IMG"]') && html.includes('live=clean||"<p><br></p>"'), 'blocked paste nodes and stable empty paragraph'],
  [html.includes('function richSyncCurrent(') && html.includes('richSyncCurrent(editor);notifyRichInput(editor,"formatBlock")'), 'blur normalization does not consume an undo step'],
  [html.includes('function richCopyCut(') && html.includes('document.addEventListener("copy",richCopyCut)') && html.includes('document.addEventListener("cut",richCopyCut)'), 'selection-only rich copy and cut pipeline'],
  [html.includes('function richShortcutAfterInput(') && html.includes('compositionend') && html.includes('richShortcutAfterInput(editor)'), 'IME-safe rich shortcuts'],
  [html.includes('normalize("NFKC")') && html.includes('id="page-search"') && html.includes('id="searchPageInput"') && html.includes('data-close-search-page') && !html.includes('id="searchDialog"'), 'IME-safe global search uses a stable standalone page'],
  [html.includes('if(task.focus)task.week=true') && html.includes('if(!task.week)task.focus=false') && html.includes('target.id==="draftFocus"') && html.includes('target.id==="draftWeek"'), 'today and week membership invariant'],
  [html.includes('item.inbox=value==="待处理"') && html.includes('options.fromToday&&value==="进行中"') && html.includes('{fromToday:currentPage==="today"}'), 'inline status changes migrate tasks between today cards and persist inbox state'],
  [html.includes('id="saveTaskButton" type="submit"') && html.includes('event.target.closest(".rich-editor")') && html.includes('event.keyCode===229') && html.includes('event.stopPropagation();saveTaskDraft()'), 'task Enter saves outside rich text without IME or cancel-button regressions'],
  [html.includes('id="deleteProjectButton"') && html.includes('function deleteProject(') && html.includes('type:"project"') && html.includes('entry.links||[]') && html.includes('confirmTwice("删除项目？"'), 'project deletion, unlinking, trash recovery, and double confirmation'],
  [html.includes('function richRetypeListItem(') && html.includes('source.after(replacement') && html.includes('after.start=(Number(source.getAttribute("start"))||1)+index+1') && html.includes('return richRetypeListItem(editor,item,listTag)'), 'changing one list item type preserves sibling list items'],
  [html.includes('function richSelectionBlocks(') && html.includes('function richParagraphToList(') && functionSource('richToggleList').includes('blocks.length>1') && functionSource('richToggleList').includes('blocks.every'), 'multi-line selection batch list conversion'],
  [html.includes('function richNormalizeListStructure(') && html.includes('next&&next.tagName===list.tagName') && html.includes('some(child=>child.tagName==="LI")') && html.includes('richNormalizeListStructure(canonical)'), 'adjacent lists merge and empty list containers are removed'],
  [html.includes('function richListIndent(') && html.includes('event.key!=="Tab"') && html.includes('parentItem.after(item)') && html.includes('nested.appendChild(item)') && html.includes('richListIndent(event,editor)||richListBoundary'), 'Tab and Shift+Tab indent and outdent list items'],
  [functionSource('richListIndent').includes('caret=richBookmark(item)') && functionSource('richListIndent').includes('restoreRichBookmark(item,caret)'), 'list indentation preserves the caret inside the moved item'],
  [functionSource('updateRichEmpty').includes('editor.querySelector("ul,ol,.focus-marker")'), 'empty formatted lists hide placeholder text while editing'],
  [html.includes('const TASK_CARD_TRANSITIONS=Object.freeze') && html.includes('moveTask(id,fromScope,toScope') && html.includes('data-drop-zone="waiting"') && html.includes('data-drop-zone="long"'), 'central cross-card transition map'],
  [html.includes('pinToday:[]') && html.includes('function pinOrdered(') && html.includes('data-unpin-all') && functionSource('applySmartOrder').includes('pins.has'), 'view pin compatibility and smart-sort boundary'],
  [functionSource('todayWaiting').includes('task.followup&&task.followup<=today') && html.includes('跟进逾期 ') && html.includes('今日跟进'), 'due follow-up reminders'],
  [html.includes('project-master-detail') && html.includes('project-list-panel') && html.includes('project-detail-panel') && html.includes('projectSplitter'), 'project master detail and independent scrolling'],
  [!html.includes('id="projectSearch"') && html.includes('.project-list-item.selected{border-color:var(--blue);background:var(--panel);box-shadow:none}'), 'project list search removal and border-only selection'],
  [html.includes('.project-workspace>.milestone-task-panel{grid-column:2') && html.includes("+detail+taskPanel+"), 'milestone relations follow completion criteria'],
  [html.includes('.task-table th{position:sticky') && html.includes('#page-tasks>.toolbar{position:sticky'), 'all-task toolbar and headers stay frozen'],
  [html.includes('@container (max-width:620px)') && html.includes('.task-main{display:grid;grid-template-columns:'), 'next action responds to card width'],
  [html.includes('data-main-scroll') && functionSource('routePageWheel').includes('nearestVerticalScroller') && functionSource('routePageWheel').includes('canScrollInDirection(main') && !html.includes('lists[lists.length-1]'), 'today and task wheels fall back to the main page, never the rightmost card'],
  [html.includes('projects:[]') && functionSource('normalizeState').includes('next.order.projects') && functionSource('renderProjects').includes('data-project-drag'), 'project order is migrated and rendered with dedicated drag handles'],
  [!functionSource('renderProjects').includes('里程碑相关任务'), 'project page omits the duplicate milestone task module'],
  [functionSource('richCopyCut').includes('richSingleBlockRange') && functionSource('richPaste').includes('htmlBlocks>1'), 'rich clipboard distinguishes inline selections from logical multi-block selections'],
  [functionSource('moveTask').includes('id===toId') && functionSource('moveTask').includes('target.indexOf(toId)'), 'cross-card drop preserves peers and inserts at release row'],
  [html.includes('.review-field:focus-within') && html.includes('.review-field .rich-editor{background:transparent}') && html.includes('color-mix(in srgb,var(--blue)'), 'themed weekly review visuals'],

  [html.includes('decisions:[]') && html.includes('function normalizeDecision(') && html.includes('id="decisionDialog"'), 'key decision data and editor'],
  [html.includes('data-project-panel="tasks"') && html.includes('data-project-panel="decisions"') && html.includes('data-new-decision'), 'project workspace decision panel'],
  [html.includes('formatVersion:7') && html.includes('decisions:value.decisions'), 'key decisions included in export and snapshots'],
  [html.includes('id="todayExecution"') && html.includes('id="todayHeightResizer"') && html.includes('today-task-scroll') && html.includes('todayHeight'), 'today split panes and persisted adjustable height'],
  [html.includes('.today-height-resizer{position:relative;width:100%;height:20px;padding:0;border:0;background:transparent') && !html.includes('.today-height-resizer{position:relative;width:100%;height:20px;padding:0;border:0;background:linear-gradient'), 'today height handle has no redundant full-width line'],
  [html.includes('function hardwareMilestoneTemplate(') && html.includes('id="projectTemplate"') && html.includes('智能硬件标准流程') && html.includes('EVT 样机验证') && html.includes('DVT / 认证') && html.includes('小批量试产') && html.includes('["量产","量产放行已批准'), 'new project six-stage hardware milestone template'],
  [html.includes('.search-page-field{position:relative;display:block;height:48px') && html.includes('.search-page-field input{display:block}'), 'standalone search input has stable block geometry'],
  [html.includes('#draftChecklist [data-check-text]:focus') && html.includes('outline:0'), 'checklist focus uses themed focus ring instead of browser black outline'],
  [functionSource('richParagraphToList').includes('richCleanPlaceholder(entry)') && functionSource('richParagraphToList').includes('entry.appendChild(document.createElement("br"))'), 'empty toolbar list has exactly one normalized placeholder'],
  [html.includes('function renderNow(') && functionSource('saveTaskDraft').includes('renderNow()') && functionSource('saveProjectDraft').includes('renderNow()'), 'modal saves synchronously reconcile the current view'],
];
for (const [condition, label] of contracts) assert(condition, `contract failed: ${label}`);

const escSource = js.split('\n').find(line => line.startsWith('const esc='));
const normalizeRichSource = js.split('\n').find(line => line.startsWith('const normalizeRich='));
vm.runInNewContext(`${escSource}\n${normalizeRichSource}\nif(normalizeRich('第一行\\n第二行')!=='第一行<br>第二行')throw new Error('plain multiline migration failed');if(normalizeRich('<p>已有格式</p>')!=='<p>已有格式</p>')throw new Error('existing rich text changed')`);
vm.runInNewContext(`${functionSource('richShortcutSpec')}\nconst cases=[['1.',{kind:'ordered',start:1}],['12.',{kind:'ordered',start:12}],['-',{kind:'unordered',start:1}],['.',{kind:'focus',start:1}],['正文',null],[' 1.',null],['1. 正文',null]];for(const [input,expected] of cases){const actual=richShortcutSpec(input);if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('shortcut parse failed: '+input)}`);

const context = {
  console,
  Date,
  state: null,
  currentWeekKey: () => '2026-08-24',
  weekEnd: key => key === '2026-08-17' ? '2026-08-23' : '2026-08-30',
  isDone: task => task.status === '已完成' || Boolean(task.completed),
  clone: value => JSON.parse(JSON.stringify(value)),
  uid: prefix => `${prefix}-generated`,
  statuses: ['待处理', '进行中', '等待', '已完成', '暂停'],
  priorities: ['P0', 'P1', 'P2', 'P3'],
  taskTypes: ['任务', '长期跟进', '临时事项'],
  normalizeProject: raw => JSON.parse(JSON.stringify(raw)),
  normalizeTask: raw => JSON.parse(JSON.stringify(raw)),
  normalizeRich: value => String(value || ''),
  sanitizeRichValue: value => String(value || ''),
};
vm.createContext(context);
for (const name of ['emptyWeek', 'normalizeWeek', 'captureWeek', 'ensureCurrentWeek']) {
  vm.runInContext(functionSource(name), context);
}

context.state = {
  meta: { activeWeekKey: '2026-08-17' },
  projects: [{ id: 'p1', name: '项目一', milestones: [] }],
  tasks: [
    { id: 't1', title: '应顺延', week: true, archived: false, status: '进行中', type: '任务', project: 'p1', completed: '' },
    { id: 't2', title: '已完成', week: true, archived: false, status: '已完成', type: '任务', project: 'p1', completed: '2026-08-21' },
    { id: 't3', title: '已归档', week: true, archived: true, status: '进行中', type: '任务', project: '', completed: '' },
    { id: 't4', title: '长期跟进', week: true, archived: false, status: '进行中', type: '长期跟进', project: '', completed: '' },
    { id: 't5', title: '非本周', week: false, archived: false, status: '进行中', type: '任务', project: '', completed: '' },
  ],
  weeks: {
    '2026-08-17': { top: ['旧重点'], taskIds: ['t1', 't2', 't3', 't4'], carriedTaskIds: [], taskSnapshots: [], projectSnapshots: [], reviewDone: '', reviewMiss: '', reviewNext: '', carriedFromWeek: '', activatedAt: 'old', closedAt: '' },
    '2026-08-24': { top: ['未来重点'], taskIds: ['stale'], carriedTaskIds: ['stale'], taskSnapshots: [{ id: 'stale' }], projectSnapshots: [{ id: 'stale' }], reviewDone: '不应保留', reviewMiss: '不应保留', reviewNext: '不应保留', carriedFromWeek: '', activatedAt: '', closedAt: '' },
  },
};
vm.runInContext('ensureCurrentWeek()', context);
let week = context.state.weeks['2026-08-24'];
assert(Boolean(context.state.weeks['2026-08-17'].closedAt), 'previous week not formally closed');
assert(JSON.stringify(week.top) === JSON.stringify(['未来重点']), 'future Top 3 not preserved');
assert(JSON.stringify(week.taskIds) === JSON.stringify(['t1']), 'carry membership incorrect');
assert(JSON.stringify(week.carriedTaskIds) === JSON.stringify(['t1']), 'carry origin markers incorrect');
assert(week.carriedFromWeek === '2026-08-17', 'carry source week missing');
assert(week.reviewDone === '' && week.reviewMiss === '' && week.reviewNext === '', 'future inactive review leaked into current week');
assert(week.taskSnapshots.length === 0 && week.projectSnapshots.length === 0, 'future inactive snapshot leaked');
assert(context.state.meta.activeWeekKey === '2026-08-24', 'active week identity not updated');

context.state.tasks.push({ id: 't6', title: '本周新建', week: true, archived: false, status: '进行中', type: '任务', project: '', completed: '' });
vm.runInContext('ensureCurrentWeek()', context);
week = context.state.weeks['2026-08-24'];
assert(JSON.stringify(week.taskIds) === JSON.stringify(['t1', 't6']), 'same-week active task membership not refreshed');
assert(JSON.stringify(week.carriedTaskIds) === JSON.stringify(['t1']), 'same-week new task incorrectly marked as carry');

console.log(`PASS: ${contracts.length} static contracts + multiline migration + week lifecycle behavior`);
