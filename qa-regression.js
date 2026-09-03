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
  [html.includes('vendor/quill-2.0.3/quill.js') && html.includes('vendor/quill-2.0.3/quill.core.css') && html.includes('function initQuillEditors(') && html.includes('dataset.quillVersion'), 'locally vendored Quill 2 editor runtime'],
  [html.includes('id="themeButton"') && html.includes(':root[data-theme="dark"]'), 'dark mode'],
  [html.includes('<textarea id="taskNext"') && html.includes('normalizeRich'), 'multiline preservation'],
  [html.includes('history:{delay:500,maxStack:60,userOnly:true}') && functionSource('richApplyHistory').includes('quill.history.undo()') && functionSource('richApplyHistory').includes('quill.history.redo()'), 'Quill per-editor undo history'],
  [html.includes('class="project-modal"') && html.includes('class="project-workspace"') && !html.includes('.project-card:before'), 'restored project workspace and clean cards'],
  [html.includes('projectOverviewFilter:"open"') && html.includes('data-project-overview="done"') && html.includes('data-project-overview="all"'), 'project overview filters'],
  [html.includes('.rich-editor :is(b,strong),.rich-editor>.ql-editor :is(b,strong){color:var(--ink);font-weight:600}') && html.includes('font-size:15px;font-weight:400;line-height:1.65'), 'rich text uses readable weight, size, and line spacing'],
  [html.includes('关联事项已自动保存'), 'related tasks autosave'],
  [!html.includes('本周项目推进'), 'redundant week project card absent'],
  [html.includes('.task-modal>form{height:') && html.includes('.task-modal .task-editor{min-height:0;max-height:none;overflow:hidden') && html.includes('.task-content-column{height:100%;min-height:0;display:block;overflow-y:auto'), 'task detail middle column scroll owner'],
  [html.indexOf('id="taskNext"') < html.indexOf('class="task-section checklist-section ') && html.indexOf('class="task-section checklist-section ') < html.indexOf('id="taskNotes"'), 'checklist below next action'],
  [html.includes('function sanitizeRichValue(') && functionSource('serializeRichEditor').includes('quill.getSemanticHTML()') && html.includes('formats:["bold","underline","list","indent","focus","quickDone","divider"]'), 'sanitized Quill serialization pipeline'],
  [html.includes('data-action="new-task" data-inbox="1" data-tip="快速记入收件箱；快捷键 N">＋ 快速记录') && !html.includes('<button class="btn primary" data-action="new-task">＋ 新增事项</button></div></header>') && html.includes('event.key.toLowerCase()==="n"') && !html.includes('data-action="quick-memo">＋ 先记下来'), 'single global quick capture opens inbox task'],
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
  [!html.includes('document.addEventListener("paste",richPaste)') && !html.includes('document.addEventListener("copy",richCopyCut)') && !html.includes('document.addEventListener("cut",richCopyCut)') && html.includes('new Quill(editor') && html.includes('class WorkClipboard extends Clipboard') && html.includes('WORK_QUILL_CLIPBOARD_TYPE'), 'Quill exclusively owns clipboard events and preserves whole-line boundaries'],
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
  [functionSource('updateRichEmpty').includes('editor.querySelector("ul,ol,.focus-marker,.rich-divider")'), 'empty formatted lists and dividers hide placeholder text while editing'],
  [html.includes('const TASK_CARD_TRANSITIONS=Object.freeze') && html.includes('moveTask(id,fromScope,toScope') && html.includes('data-drop-zone="waiting"') && html.includes('data-drop-zone="long"'), 'central cross-card transition map'],
  [!html.includes('function taskDropLocation(') && functionSource('sortableTaskIntent').includes('snapshot?.positions') && functionSource('sortableTaskIntent').includes('originalEvent?.clientY') && functionSource('sortableTaskIntent').includes('position=clientY<='), 'card task drops use one stable Sortable pointer-intent path instead of a native fallback'],
  [html.includes('function richRangeEndsAtBlockStart(') && html.includes('function richClipboardLineNodes(') && functionSource('richInsertBlocks').includes('richClipboardLineNodes(box,text)'), 'real selection boundaries and clipboard line counts are reconciled'],
  [html.includes('pinToday:[]') && functionSource('pinOrdered').includes('rows.filter(task=>pins.has(task.id)).concat') && html.includes('data-unpin-all') && functionSource('applySmartOrder').includes('pins.has'), 'pinned rows stay first without invoking smart sort'],
  [functionSource('todayWaiting').includes('task.status==="等待"') && !functionSource('todayWaiting').includes('task.followup') && html.includes('跟进逾期 ') && html.includes('今日跟进'), 'waiting card membership is status-exclusive while follow-up reminders remain visible'],
  [html.includes('project-master-detail') && html.includes('project-list-panel') && html.includes('project-detail-panel') && html.includes('projectSplitter'), 'project master detail and independent scrolling'],
  [!html.includes('id="projectSearch"') && html.includes('.project-list-item.selected{border-color:var(--blue);background:var(--panel);box-shadow:none}') && html.includes('.project-list-item.pinned-project:not(.selected){border-color:var(--line)}') && html.includes('.project-list-item.pinned-project.selected{border-color:var(--blue)}'), 'project selection stays blue while unselected pinned rows keep the neutral border'],
  [html.includes('.project-workspace>.milestone-task-panel{grid-column:2') && html.includes("+detail+taskPanel+"), 'milestone relations follow completion criteria'],
  [html.includes('.task-table th{position:sticky') && html.includes('#page-tasks>.toolbar{position:sticky'), 'all-task toolbar and headers stay frozen'],
  [html.includes('@container (max-width:620px)') && html.includes('.task-main{display:grid;grid-template-columns:'), 'next action responds to card width'],
  [!html.includes('stabilizeTodayWheel') && !html.includes('todayWheelOwner') && !html.includes('document.addEventListener("wheel"') && html.includes('TODAY_LOCAL_SCROLL_SELECTOR=".today-task-scroll,.quick-note-editor>.ql-editor"') && functionSource('syncTodayScrollability').includes('scrollHeight>node.clientHeight+1') && functionSource('syncTodayScrollability').includes('can-local-scroll') && html.includes('.today-task-scroll.can-local-scroll{overscroll-behavior:contain}') && html.includes('.quick-note-editor>.ql-editor.can-local-scroll{overscroll-behavior:contain}') && html.includes('.table-card{max-height:calc(100dvh - 330px);overflow:auto;overscroll-behavior:contain') && html.includes('.project-list-panel,.project-detail-panel{min-height:0;overflow:auto;overscroll-behavior:contain'), 'Today uses native wheel scrolling and only contains overscroll when a local region actually overflows'],
  [html.includes('projects:[]') && functionSource('normalizeState').includes('next.order.projects') && functionSource('renderProjects').includes('data-project-drag'), 'project order is migrated and rendered with dedicated drag handles'],
  [!functionSource('renderProjects').includes('里程碑相关任务'), 'project page omits the duplicate milestone task module'],
  [functionSource('initQuillEditors').includes('modules:{toolbar:false,history:') && functionSource('initQuillEditors').includes('keyboard:{bindings:') && functionSource('quillRichShortcut').includes('formatLine') && functionSource('quillRichShortcut').includes('{focus:true}'), 'Quill history and shortcut modules preserve existing editor behavior'],
  [functionSource('moveTask').includes('id===toId') && functionSource('moveTask').includes('target.indexOf(toId)'), 'cross-card drop preserves peers and inserts at release row'],
  [html.includes('.review-field:focus-within') && html.includes('.review-field .rich-editor{background:transparent}') && html.includes('color-mix(in srgb,var(--blue)'), 'themed weekly review visuals'],

  [html.includes('decisions:[]') && html.includes('function normalizeDecision(') && html.includes('id="decisionDialog"'), 'key decision data and editor'],
  [html.includes('data-project-panel="tasks"') && html.includes('data-project-panel="decisions"') && html.includes('data-new-decision'), 'project workspace decision panel'],
  [html.includes('formatVersion:8') && html.includes('decisions:value.decisions') && html.includes('quickNote:value.quickNote'), 'key decisions and persistent quick note included in export and snapshots'],
  [html.includes('id="todayExecution"') && html.includes('id="todayHeightResizer"') && html.includes('today-task-scroll') && html.includes('todayHeight'), 'today split panes and persisted adjustable height'],
  [html.includes('.today-height-resizer{position:relative;width:100%;height:20px;padding:0;border:0;background:transparent') && !html.includes('.today-height-resizer{position:relative;width:100%;height:20px;padding:0;border:0;background:linear-gradient'), 'today height handle has no redundant full-width line'],
  [html.includes('function hardwareMilestoneTemplate(') && html.includes('id="projectTemplate"') && html.includes('智能硬件标准流程') && html.includes('EVT 样机验证') && html.includes('DVT / 认证') && html.includes('小批量试产') && html.includes('["量产","量产放行已批准'), 'new project six-stage hardware milestone template'],
  [html.includes('.search-page-field{position:relative;display:block;height:48px') && html.includes('.search-page-field input{display:block}'), 'standalone search input has stable block geometry'],
  [html.includes('#draftChecklist [data-check-text]:focus') && html.includes('outline:0'), 'checklist focus uses themed focus ring instead of browser black outline'],
  [functionSource('richParagraphToList').includes('richCleanPlaceholder(entry)') && functionSource('richParagraphToList').includes('entry.appendChild(document.createElement("br"))'), 'empty toolbar list has exactly one normalized placeholder'],
  [html.includes('function renderNow(') && functionSource('saveTaskDraft').includes('renderNow()') && functionSource('saveProjectDraft').includes('renderNow()'), 'modal saves synchronously reconcile the current view'],
  [functionSource('sanitizeRichValue').includes('font-weight') && functionSource('sanitizeRichValue').includes('text-decoration') && functionSource('sanitizeRichValue').includes('querySelector(":scope > p,:scope > div,:scope > ul,:scope > ol")'), 'external styled rich text keeps supported formatting without nested blocks'],
  [functionSource('richClearFormat').includes('marker.dataset.richClear') && functionSource('richClearFormat').includes('owner.cloneNode(false)') && functionSource('richClearFormat').includes('owner.replaceWith'), 'clear format splits enclosing inline wrappers around the exact selection'],
  [functionSource('richCopyCut').includes('listParent') && functionSource('richCopyCut').includes('document.createElement(listParent.tagName)'), 'multi-item list clipboard preserves its list container'],
  [html.includes('function reorderId(') && html.includes('function reorderIndex(') && functionSource('moveOrder').includes('position') && functionSource('moveTask').includes('position'), 'all draggable collections support explicit before and after placement'],
  [html.includes('data-vendor="sortablejs-1.15.6"') && html.includes('Sortable 1.15.6 - MIT') && functionSource('initTaskSortables').includes('new Sortable') && functionSource('initTaskSortables').includes('row._taskDropIntent') && !functionSource('initTaskSortables').includes('targetAfter=taskDomIds(toCard)'), 'task cards use embedded fixed-version SortableJS and persist pointer intent instead of mutated DOM order'],
  [functionSource('initTaskSortables').includes('onMove(event,originalEvent)') && functionSource('initTaskSortables').includes('sortableTaskIntent(row,targetCard,originalEvent)') && functionSource('initTaskSortables').includes('targetBefore.filter(value=>value!==id)') && functionSource('taskCardSnapshot').includes('positions=Array.from') && html.includes('document.addEventListener("dragover",trackSortableTaskPointer,true)'), 'task release derives insertion from a capture-phase pointer and stable drag-start geometry'],
  [functionSource('reconcileVisibleOrder').includes('beforeIds') && functionSource('reconcileVisibleOrder').includes('afterIds') && functionSource('initTaskSortables').includes('reconcileVisibleOrder'), 'visible DOM order is reconciled without deleting hidden card tasks'],
  [html.includes('segment(pinned,"pinned")+divider+segment(normal,"normal"') && html.includes('<div class="pinned-divider" aria-hidden="true">') && html.includes('let groupedOptions={...options,allowPin:false}') && !html.includes('segment(group.items.filter'), 'normal cards use only a divider while project grouping hides pin controls and pin lanes'],
  [functionSource('initTaskSortables').includes('transition.apply(task)') && functionSource('initTaskSortables').includes('task.followup=""') && functionSource('initTaskSortables').includes('row.dataset.wasPinned') && functionSource('initTaskSortables').includes('wasPinned?targetPins.add(id):targetPins.delete(id)') && functionSource('taskCardSnapshot').includes('all.filter(id=>isPinned(id,scope))') && html.includes("[data-drag-handle='all']") && !html.includes('typeof Sortable!=="function"||!event.isTrusted'), 'Sortable exclusively owns card tasks while the all-items table keeps its separate row reorder path'],
  [functionSource('normalizeTask').includes('inbox=status==="待处理"') && functionSource('normalizeTask').includes('status!=="等待"') && functionSource('normalizeState').includes('members={') && functionSource('normalizeState').includes("waiting:task=>open(task)&&task.status==='等待'") && functionSource('ordered').includes('return[...items].sort') && !functionSource('ordered').includes('.push('), 'task cards are mutually exclusive and rendering no longer mutates persisted order'],
  [functionSource('moveTask').includes('wasPinned=(draft.order[sourcePinKey]||[]).includes(id)') && functionSource('moveTask').includes('if(wasPinned)targetPins.add(id)') && !functionSource('moveTask').includes('targetSegment'), 'native drag fallback preserves pin membership across cards too'],
  [html.includes('id="todayCapture"') && html.includes('id="captureResizer"') && html.includes('id="quickNoteHeightResizer"') && html.includes('quickNoteHeight') && functionSource('quickNoteToTask').includes('getSelection(true)') && functionSource('quickNoteToTask').includes('draft.order.inbox=[id,') && functionSource('toggleQuickNoteLine').includes('quickDone') && functionSource('saveUiLayout').includes('LAYOUT_KEY'), 'persistent quick note supports completion, task conversion, autosave, and adjustable width and height'],
  [functionSource('registerQuillFormats').includes('ClassAttributor("quickDone"') && functionSource('initQuillEditors').includes('normalizeQuickNoteLines(quill)') && html.includes('data-command="bold"') && html.includes('data-command="insertUnorderedList"') && html.includes('data-command="insertOrderedList"'), 'quick note Quill editor supports a checkbox on every line plus bold and lists'],
  [functionSource('renderProjects').includes('state.favorites.includes(b.id)') && functionSource('renderProjects').includes('pinned-project') && functionSource('renderProjects').includes('置顶并收藏项目') && html.includes('.project-splitter):before') && html.includes('width:6px;height:84px'), 'project favorites pin rows and all vertical splitters share the Today grip'],
  [html.includes(':is(.today-height-resizer,.checklist-resizer,.quick-note-height-resizer):before') && html.includes('width:84px;height:6px') && html.includes('quickNoteHeight=Math.round(height)') && html.includes('uiLayout.quickNoteHeight=190'), 'all horizontal resize handles share one visual and Quick Note height persists and resets'],
  [functionSource('initQuillEditors').includes('compositionstart') && functionSource('initQuillEditors').includes('ime-composing') && html.includes('.rich-editor.ime-composing>.ql-editor.ql-blank:before{content:none}') && html.includes('.rich-editor.ql-container>.ql-editor.ql-blank:before{left:12px;right:12px'), 'Quill placeholders align to editor padding and hide throughout Chinese IME composition'],
  [functionSource('initQuillEditors').includes('"indent"') && functionSource('initQuillEditors').includes('key:9') && html.includes('data-command="outdent"') && html.includes('data-command="indent"'), 'Quill list indent supports toolbar and Tab bindings'],
  [html.includes('function captureDragScroll(') && html.includes('function restoreDragScroll(') && functionSource('dragAutoScroll').includes('owner.scrollTop') && functionSource('cleanupDrag').includes('drag-before'), 'dragging preserves scroll positions, auto-scrolls edges, and clears visual state'],
  [functionSource('markDropPosition').includes('getBoundingClientRect') && html.includes('.task-row.drag-before') && html.includes('.task-row.drag-after') && html.includes('.memo-item.drag-before'), 'drag release position has visible before and after feedback'],
  [html.includes('function isoWeekYear(') && functionSource('weekInputValue').includes('isoWeekYear(date)') && functionSource('weekKeyFromInput').includes('mondayOf(jan4)'), 'ISO week-year survives calendar-year boundaries'],
  [functionSource('normalizeProject').includes('currentSeen') && functionSource('normalizeState').includes('project?.milestones.some') && functionSource('saveProjectDraft').includes('validMilestones') && functionSource('saveProjectDraft').includes('draft.decisions.forEach'), 'single current milestone and dangling milestone cleanup'],
  [functionSource('normalizeTask').includes('completed=status==="已完成"') && functionSource('generateRepeat').includes('week:false') && functionSource('generateRepeat').includes('inbox:true'), 'task completion and repeat membership normalization'],
  [functionSource('renderTasks').includes('visibleIds') && functionSource('renderTasks').includes('ui.selectedTasks=new Set') && html.includes('ui.selectedTasks.clear();commit("批量修改状态"') && html.includes('ui.selectedTasks.clear();commit("批量修改优先级"'), 'bulk actions cannot retain hidden selections'],
  [functionSource('projectOptions').includes('project.id===selected') && functionSource('decisionProjectOptions').includes('project.id===selected') && functionSource('renderMemos').includes('project.id===memo?.project'), 'archived project links remain editable without being erased'],
  [functionSource('deleteProject').includes('decisionLinks') && functionSource('restoreTrash').includes('entry.decisionLinks') && html.includes('async removeAttachment(taskId,item){\n  if(!item)return;commit("移除附件"') && html.includes('云端文件暂时保留') && !html.includes('remove([item.path])'), 'project decisions and attachment undo remain recoverable'],
  [html.includes('function uniqueRestoreId(') && functionSource('restoreTrash').includes('uniqueRestoreId(draft.tasks') && functionSource('restoreTrash').includes('uniqueRestoreId(draft.projects') && functionSource('deleteTask').includes('decisionLinks'), 'trash restore avoids ID collisions and reconnects task decisions'],
  [html.includes('let accountChanged=!!(link?.userId&&String(link.userId)!==String(this.user.id))') && html.includes('this.pendingRemote=row||{state:emptyState()') && html.includes('this.rowExists=!this.pendingRemote.missing') && html.includes('async logout(){if(this.client&&this.channel){await this.client.removeChannel') && html.includes('this.setStatus("syncing","离线待同步")') && html.includes('window.addEventListener("online"'), 'cloud account isolation, channel cleanup, and online retry'],
  [html.includes('function searchRank(') && functionSource('globalResults').includes('project?.code') && functionSource('globalResults').includes('project.code') && functionSource('filteredTasks').includes('project?.code'), 'project code and relevance-aware search'],
  [html.includes('data-summary-target=') && html.includes('data-toggle-week-done') && functionSource('renderWeek').includes('doneItems.slice(0,5)') && functionSource('renderWeek').includes('b.completed.localeCompare(a.completed)'), 'clickable Today summaries and progressive weekly completion list'],
  [functionSource('renderWeek').includes('state.weeks[selectedWeekKey]||emptyWeek()') && !functionSource('renderWeek').includes('state.weeks[selectedWeekKey]=emptyWeek()') && !html.includes('target.dataset.weekShift)*7));ui.showAllWeekDone=false;state.weeks[selectedWeekKey]'), 'week browsing is read-only until the user edits a week'],
  [functionSource('renderWeek').includes('data-week-panel="plan"') && functionSource('renderWeek').includes('data-week-panel="review"') && functionSource('renderWeek').includes('panel==="review"?reviewMarkup:planMarkup') && html.includes('weekPanel:"plan"'), 'weekly planning and review use focused modes'],
  [functionSource('renderProjects').includes('projectTaskQuery') && functionSource('renderProjects').includes('id="projectTaskSearch"') && functionSource('renderProjects').includes('data-open-project-tasks') && html.includes('target.id==="projectTaskSearch"'), 'project detail has local task search and full-view handoff'],
  [functionSource('renderTasks').includes('data-toggle-task-options') && functionSource('renderTasks').includes('data-hover-task-options') && functionSource('renderTasks').includes('task-advanced-panel') && html.includes('taskOptionsOpen:false') && html.includes('target.dataset.toggleTaskOptions'), 'all-items secondary filters support click and hover disclosure'],
  [functionSource('renderProjects').includes('projectMilestoneFilter') && functionSource('renderProjects').includes('data-project-milestone-filter') && functionSource('renderProjects').includes('project.milestones.map((item,index)') && functionSource('renderProjects').includes('task.milestone===ui.projectMilestoneFilter') && html.includes('projectMilestoneFilter:"all"'), 'project task overview lists every milestone as an independent filter without copying tasks'],
  [functionSource('handleClick').includes('scope==="done"') && functionSource('handleClick').includes('selectedWeekKey=currentWeekKey()') && functionSource('handleClick').includes('ui.weekPanel="review"'), 'Today completion summary opens the current weekly review'],
  [html.includes('let focusToggle=scope==="week"&&!readonly') && html.includes('data-toggle-focus="\'+task.id+\'"') && html.includes('.task-row.has-focus-toggle'), 'weekly action rows expose the shared Today focus toggle'],
  [html.includes('id="taskHistoryDialog"') && functionSource('taskHistoryEntries').includes('week.taskSnapshots') && functionSource('taskHistoryDetail').includes('只读快照') && functionSource('historicalRow').includes('historyWeek') && html.includes('.readonly .history-row-actions button{pointer-events:auto}'), 'past weeks expose clickable immutable task snapshots and current-task handoff'],
  [html.includes('const hoverDetailTimers=new WeakMap()') && html.includes('function isMouseHover') && html.includes('function openHoverDetail') && html.includes('activeHoverDetail') && html.includes('data-hover-task-options-panel'), 'mouse hover opens task filters and switches directly between dropdowns without changing touch behavior'],
  [functionSource('handleClick').includes('taskFilter={quick,query:"",project:[target.dataset.openProjectTasks],type:[],status:[]') && functionSource('filteredTasks').includes('taskFilter.quick==="all"&&task.archived'), 'project full-view handoff clears stale filters without including archived tasks'],
  [functionSource('enhanceHoverSelects').includes('select:not([data-hover-select-ready])') && functionSource('renderTaskEditor').includes('enhanceHoverSelects($("#taskEditor")') && functionSource('openHoverSelect').includes('closeHoverSelect(activeHoverSelect)'), 'every native select, including task detail fields, uses the shared hover dropdown'],
  [functionSource('renderWeek').includes('id="weekPlanSplitter"') && functionSource('renderWeek').includes('id="weekReviewSplitter"') && html.includes('weekPlanLeft') && html.includes('weekReviewLeft'), 'weekly plan and review both persist adjustable split widths'],
  [functionSource('renderMemos').includes('class="memo-pin') && !functionSource('renderMemos').includes('memo.pinned?"📌') && !functionSource('renderMemos').includes('取消置顶":"置顶"'), 'memo pinning is a card-title icon instead of an editor text button'],
  [functionSource('registerQuillFormats').includes('class WorkDivider extends BlockEmbed') && functionSource('richShortcutSpec').includes('?"divider"') && html.includes('data-command="divider"') && functionSource('editRichDivider').includes('contentEditable="true"'), 'rich text dividers support toolbar and -- shortcut insertion, selection, deletion, and label editing'],
  [html.includes('.week-review-layout .task-name{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}') && html.includes(`title="'+esc(task.title)+'"`), 'weekly completed task names stay single-line with live ellipsis and a full-title hover'],
  [functionSource('renderTaskEditor').includes('id="draftCompleted"') && !functionSource('renderTaskEditor').includes('id="draftDue"') && functionSource('collectTaskDraft').includes('taskDraft.completed=taskDraft.status==="已完成"') && functionSource('normalizeTask').includes('due:String(raw?.due||"")'), 'task detail shows completion date while preserving legacy due data'],
  [functionSource('createRelatedTask').includes('collectTaskDraft()') && functionSource('createRelatedTask').includes('relatedTaskIds:[source.id]') && functionSource('createRelatedTask').includes('openTask(related.id)') && html.includes('data-new-related-task'), 'related-task creation autosaves the source and opens the bidirectionally linked task without another dialog'],
  [html.includes('.quick-note-editor>.ql-editor.ql-blank:before{left:42px;right:12px}'), 'Quick Note placeholder clears the per-line completion control'],
  [functionSource('insertQuillDivider').includes('insertEmbed') && !functionSource('insertQuillDivider').includes('insertText') && functionSource('protectQuillDividerBoundary').includes('quillDividerAt') && html.includes('min-height:36px;margin:3px 0;padding:8px 0'), 'divider insertion avoids extra blank lines and protects a larger selectable boundary'],
  [html.includes('data-toggle-task-notes') && functionSource('toggleTaskNotes').includes('serializeRichEditor(editor)') && html.includes('.task-notes-field.collapsed .editor-box{display:none}') && html.includes('text-overflow:ellipsis;white-space:nowrap'), 'task notes collapse safely to a single-line live ellipsis preview'],
  [functionSource('normalizeDecision').includes('sanitizeRichValue(normalizeRich') && functionSource('renderDecisionEditor').includes('decision-rich-box') && functionSource('collectDecisionDraft').includes('serializeRichEditor($("#decisionConclusion"))') && functionSource('collectDecisionDraft').includes('serializeRichEditor($("#decisionRationale"))'), 'key decision conclusion and rationale use the shared rich-text pipeline'],
  [html.includes('.table-status-cell{display:flex;align-items:center') && html.includes('.task-table th,.task-table td{vertical-align:middle}') && functionSource('tableRow').includes('class="table-status-cell"'), 'all-items status and neighboring controls share aligned table geometry'],
];
for (const [condition, label] of contracts) assert(condition, `contract failed: ${label}`);

const escSource = js.split('\n').find(line => line.startsWith('const esc='));
const normalizeRichSource = js.split('\n').find(line => line.startsWith('const normalizeRich='));
vm.runInNewContext(`${escSource}\n${normalizeRichSource}\nif(normalizeRich('第一行\\n第二行')!=='第一行<br>第二行')throw new Error('plain multiline migration failed');if(normalizeRich('<p>已有格式</p>')!=='<p>已有格式</p>')throw new Error('existing rich text changed')`);
vm.runInNewContext(`${functionSource('reconcileVisibleOrder')}\nconst actual=reconcileVisibleOrder(['hidden-a','a','hidden-b','b'],['a','b'],['moved','a','b']);if(actual.filter(id=>['moved','a','b'].includes(id)).join(',')!=='moved,a,b')throw new Error('visible DOM order was not preserved');if(!actual.includes('hidden-a')||!actual.includes('hidden-b'))throw new Error('hidden scope tasks were deleted')`);
vm.runInNewContext(`let state={order:{today:['normal','pin-b','pin-a'],pinToday:['pin-b','pin-a']}};const pinKey=scope=>'pin'+scope.charAt(0).toUpperCase()+scope.slice(1);${functionSource('ordered')}\n${functionSource('pinOrdered')}\nconst rows=pinOrdered([{id:'normal'},{id:'pin-b'},{id:'pin-a'}],'today');if(rows.map(row=>row.id).join(',')!=='pin-b,pin-a,normal')throw new Error('pins were not rendered first in their manual order')`);
vm.runInNewContext(`${functionSource('richShortcutSpec')}\nconst cases=[['1.',{kind:'ordered',start:1}],['12.',{kind:'ordered',start:12}],['-',{kind:'unordered',start:1}],['.',{kind:'focus',start:1}],['正文',null],[' 1.',null],['1. 正文',null]];for(const [input,expected] of cases){const actual=richShortcutSpec(input);if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('shortcut parse failed: '+input)}`);
vm.runInNewContext(`const pad=value=>String(value).padStart(2,'0');const parseDate=key=>{const [year,month,day]=key.split('-').map(Number);return new Date(year,month-1,day)};const mondayOf=date=>{const copy=new Date(date),day=copy.getDay()||7;copy.setDate(copy.getDate()-day+1);return copy};const addDays=(date,days)=>{const copy=new Date(date);copy.setDate(copy.getDate()+days);return copy};const fmt=date=>[date.getFullYear(),pad(date.getMonth()+1),pad(date.getDate())].join('-');${functionSource('isoWeekNumber')}\n${functionSource('isoWeekYear')}\n${functionSource('weekInputValue')}\n${functionSource('weekKeyFromInput')}\nif(weekInputValue('2025-12-29')!=='2026-W01')throw new Error('ISO week-year boundary failed');if(weekKeyFromInput('2026-W01')!=='2025-12-29')throw new Error('ISO week input reverse mapping failed')`);
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
