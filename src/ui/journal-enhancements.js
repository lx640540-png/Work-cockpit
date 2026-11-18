// Journal interactions are production features, independent of appearance/showcase flags.
let journalShortcutReturn=null,journalShortcutHeld=false,journalShortcutAt=0,journalImeTarget=null;
function journalMountAboveModal(){
 const panel=$('#workJournal');if(!panel)return;if(!journalUI.open){syncTaskJournalLayout();return}
 const modal=[...document.querySelectorAll('dialog[open]')].filter(node=>!panel.contains(node)&&!node.matches('.journal-copy-dialog')).at(-1);
 const host=expandedRichBox&&(!modal||modal.contains(expandedRichBox))?expandedRichBox:modal||document.body;
 if(panel.parentElement!==host){const active=panel.contains(document.activeElement)?document.activeElement:null;host.append(panel);active?.focus({preventScroll:true})}journalLayout();
}
function toggleJournalShortcut(){
 initWorkJournal();const panel=$('#workJournal');
 if(journalUI.open){
  // Failed writes keep the draft and expose the reason rather than silently ignoring a key.
  if(!journalFlush()){toast('工作记录保存失败，请重试保存；草稿仍保留');return}
  const active=document.activeElement;if(panel.contains(active))active.blur();journalCloseCalendar();journalUI.open=false;journalRemember();syncWorkJournal();document.body.append(panel);
  if(journalShortcutReturn?.isConnected)journalShortcutReturn.focus({preventScroll:true});journalShortcutReturn=null;
 }else{journalShortcutReturn=document.activeElement;journalUI.open=true;syncWorkJournal();journalMountAboveModal()}
}
window.addEventListener('keydown',event=>{
 if(event.code==='Backquote'){
  event.preventDefault();event.stopImmediatePropagation();journalShortcutAt=performance.now();
  if(event.repeat||journalShortcutHeld)return;journalShortcutHeld=true;
  if(event.isComposing){journalImeTarget=event.target;return}toggleJournalShortcut();return;
 }
 if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.isComposing&&['Digit1','Digit2','Digit3'].includes(event.code)){
  const editor=event.target.closest?.('.rich-editor');if(!editor||!quillFor(editor)?.isEnabled())return;
  event.preventDefault();event.stopImmediatePropagation();applyRichCommand({Digit1:'heading2',Digit2:'heading3',Digit3:'paragraph'}[event.code],editor);
 }
},true);
window.addEventListener('keyup',event=>{if(event.code==='Backquote'){event.preventDefault();event.stopImmediatePropagation();journalShortcutHeld=false}},true);
window.addEventListener('beforeinput',event=>{if(performance.now()-journalShortcutAt<200&&['`','~','·'].includes(event.data)&&['insertText','insertCompositionText'].includes(event.inputType)){event.preventDefault();event.stopImmediatePropagation()}},true);
document.addEventListener('compositionend',event=>{if(event.target===journalImeTarget){journalImeTarget=null;queueMicrotask(toggleJournalShortcut)}},true);
window.addEventListener('blur',()=>{journalShortcutHeld=false;journalImeTarget=null});
new MutationObserver(()=>{if(journalUI.open)journalMountAboveModal();else syncTaskJournalLayout()}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
document.addEventListener('focusin',event=>{const editor=event.target.closest?.('#workJournal [data-journal-review]');if(editor)journalUI.lastReview=editor.dataset.journalReview});

function journalTaskStatusLabel(status){return status==='待处理'?'未开始':status}
function recordTaskCandidates(tasks,query='',includeWaiting=false){
 const statuses=['进行中','待处理','未开始','暂停','已暂停'];if(includeWaiting)statuses.push('等待');
 return tasks.filter(task=>!task.archived&&statuses.includes(task.status)&&(!query||taskSearchMatch(task,query).score>0))
  .sort((a,b)=>Number(!!b.focus)-Number(!!a.focus)||Number(!!b.week)-Number(!!a.week)||statuses.indexOf(a.status)-statuses.indexOf(b.status)||String(a.title).localeCompare(String(b.title),'zh-CN'));
}
function taskChecklistRemaining(task){return(task.checklist||[]).filter(item=>!item.done&&String(item.text||'').trim()).length}
function taskChecklistBadge(task){const count=taskChecklistRemaining(task);return count?'<span class="task-checklist-remaining" aria-label="任务清单还有'+count+'项未完成" title="任务清单 · '+count+' 项未完成">☷ '+count+'</span>':''}
function taskRecordSectionMarkup(){
 return '<div class="task-journal-history">'+taskJournalHistoryMarkup(taskDraft.id)+'</div><button type="button" class="task-journal-drag" draggable="true" data-journal-task-drag="'+esc(taskDraft.id)+'" aria-label="拖到工作记录；点击关联今天" title="拖到指定日期；点击或按 Enter 关联今天"><span aria-hidden="true">⠿</span><span>拖到工作记录<small>拖至日期 · 点击记录今天</small></span><span aria-hidden="true">↗</span></button>';
}
function taskJournalHistoryMarkup(id){
 const entries=[];for(const [key,week] of Object.entries(state.meta.workJournal?.weeks||{}))for(const [date,day] of Object.entries(week.days||{}))if(day.taskIds?.includes(id))entries.push({key,date,day});
 entries.sort((a,b)=>b.date.localeCompare(a.date));
 return '<details class="task-record-timeline"><summary>关联工作记录 <span>'+entries.length+'</span></summary>'+(entries.length?entries.map(({date,day})=>{
 const excerpts=(day.taskExcerpts||[]).filter(item=>item.taskIds?.includes(id));const text=excerpts.length?excerpts.map(item=>item.text).join('；'):strip(day.content);
 return '<button type="button" data-open-journal-date="'+date+'"><time>'+esc(date)+'</time><span>'+esc(text||'已关联，尚无正文')+'</span>'+(excerpts.length?'':'<small>当天记录</small>')+'</button>';
 }).join(''):'<p class="muted">尚未关联记录</p>')+'</details>';
}
function refreshJournalLinks(date){
 const day=journalWeek(journalUI.week).days[date],node=$('#workJournal [data-record-links="'+date+'"]');if(day&&node)node.outerHTML=journalTaskLinksMarkup(date,day);
 const history=$('#taskDialog .task-journal-history');if(history&&taskDraft)history.innerHTML=taskJournalHistoryMarkup(taskDraft.id);journalUI.signature=journalSignature();
}
function linkTaskToJournal(id,date){
 const task=taskById(id);if(!task||!journalDateValid(date)||fmt(mondayOf(parseDate(date)))!==journalUI.week||!journalFlush())return false;
 const week=journalWeek(journalUI.week),existing=week.days[date];
 if(existing?.taskIds?.includes(id)){refreshJournalLinks(date);return true}
 try{commit('关联事项到工作记录',()=>{
  const day=week.days[date]||(week.days[date]={content:'',updatedAt:''});day.taskIds=[...new Set([...(day.taskIds||[]),id])];day.updatedAt=new Date().toISOString();week.deleted=week.deleted.filter(value=>value!==date);
 },{immediate:true});}catch{journalUI.dirty=true;journalUI.error=true;journalStatus();toast('关联保存失败，请重试；草稿仍保留');return false}
 if(!existing)journalRenderDays();else refreshJournalLinks(date);
 toast('已关联到 '+date+'；可撤回');return true;
}

// Native detail/all-list drags and Sortable fallback drags use the same journal drop target.
let journalTaskDrag=null,journalTaskHoverTimer=0,journalDragScrollFrame=0;
function journalTaskDragBegin(id,row=null){
 if(!taskById(id))return false;journalTaskDrag={id,row,opened:false,cancelled:false,point:null};return true;
}
function journalDragReveal(){
 if(!journalTaskDrag||journalUI.open)return;if(!journalFlush())return;
 journalUI.week=currentWeekKey();journalUI.signature='';journalUI.open=true;journalUI.expanded=false;journalTaskDrag.opened=true;taskJournalPane='journal';syncWorkJournal();journalMountAboveModal();journalScrollToToday();
}
function journalDragPoint(event){
 if(!journalTaskDrag)return null;
 const point=document.elementsFromPoint(event.clientX,event.clientY).find(node=>!node.closest('.sortable-fallback,.sortable-drag'))||event.target;
 const day=point?.closest?.('#workJournal .journal-day'),handle=point?.closest?.('#journalHandle');
 if(!journalUI.open&&(handle||event.clientX>=innerWidth-40)){
  if(!journalTaskHoverTimer)journalTaskHoverTimer=setTimeout(()=>{journalTaskHoverTimer=0;journalDragReveal()},450);
 }else{clearTimeout(journalTaskHoverTimer);journalTaskHoverTimer=0}
 document.querySelectorAll('.journal-day.journal-drop-target').forEach(node=>{if(node!==day)node.classList.remove('journal-drop-target')});
 if(day)day.classList.add('journal-drop-target');journalTaskDrag.point={x:event.clientX,y:event.clientY};
 if(!journalDragScrollFrame)journalDragScrollFrame=requestAnimationFrame(journalDragAutoScroll);
 return day;
}
function journalDragAutoScroll(){
 journalDragScrollFrame=0;const point=journalTaskDrag?.point,body=$('#workJournal .journal-body');if(!point||!body||!journalUI.open)return;
 const rect=body.getBoundingClientRect();if(point.x<rect.left||point.x>rect.right||point.y<rect.top||point.y>rect.bottom)return;
 const edge=48,distance=point.y<rect.top+edge?point.y-rect.top-edge:point.y>rect.bottom-edge?point.y-rect.bottom+edge:0;
 if(distance){body.scrollTop+=Math.sign(distance)*Math.min(18,Math.abs(distance)/3);journalDragScrollFrame=requestAnimationFrame(journalDragAutoScroll)}
}
function journalTaskDrop(event){
 if(!journalTaskDrag)return false;const drag=journalTaskDrag,day=journalDragPoint(event),panel=event.target.closest?.('#workJournal');
 if(!day&&!panel)return false;
 event.preventDefault();if(!activeSortableTask)event.stopImmediatePropagation();if(drag.row)drag.row._journalDropHandled=true;
 if(day&&!drag.cancelled){const date=day.dataset.journalSection;linkTaskToJournal(drag.id,date)}
 journalTaskDragEnd(!!day);return true;
}
function journalTaskDragEnd(success=false){
 const drag=journalTaskDrag;clearTimeout(journalTaskHoverTimer);journalTaskHoverTimer=0;cancelAnimationFrame(journalDragScrollFrame);journalDragScrollFrame=0;
 document.querySelectorAll('.journal-drop-target').forEach(node=>node.classList.remove('journal-drop-target'));journalTaskDrag=null;
 if(drag?.opened&&!success){journalUI.open=false;syncWorkJournal();$('#workJournal')&&document.body.append($('#workJournal'))}
}
document.addEventListener('dragstart',event=>{
 const button=event.target.closest?.('[data-journal-task-drag]'),all=event.target.closest?.('[data-drag-handle="all"]');if(!button&&!all)return;
 const id=button?.dataset.journalTaskDrag||all.dataset.task;
 if(button&&(!persistTaskDraft()||!taskById(id))){event.preventDefault();return}
 if(!journalTaskDragBegin(id)){event.preventDefault();return}
 event.dataTransfer.effectAllowed='copyMove';event.dataTransfer.setData('application/x-cockpit-task',id);event.dataTransfer.setData('text/plain',id);
 if(button){event.stopImmediatePropagation();journalDragReveal()}
},true);
document.addEventListener('dragover',event=>{if(!journalTaskDrag)return;const day=journalDragPoint(event);if(day||event.target.closest?.('#workJournal,#journalHandle')){event.preventDefault();event.stopImmediatePropagation();if(event.dataTransfer)event.dataTransfer.dropEffect='link'}},true);
document.addEventListener('drop',journalTaskDrop,true);
document.addEventListener('pointermove',event=>{if(journalTaskDrag)journalDragPoint(event)},true);
document.addEventListener('pointerup',event=>{if(activeSortableTask&&journalTaskDrag)journalTaskDrop(event)},true);
document.addEventListener('mouseup',event=>{if(activeSortableTask&&journalTaskDrag)journalTaskDrop(event)},true);
document.addEventListener('dragend',()=>journalTaskDragEnd());
window.addEventListener('blur',()=>journalTaskDragEnd());
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&journalTaskDrag){if(journalTaskDrag.row)journalTaskDrag.row._journalDropHandled=true;journalTaskDragEnd();event.preventDefault();event.stopImmediatePropagation();requestRender()}},true);

let memoColumnWidth=300,memoColumnObserver=null;
try{memoColumnWidth=Math.max(220,Math.min(520,Number(localStorage.getItem('work-cockpit-memo-column-v1'))||300))}catch{}
function initMemoColumnSplitter(){
 const layout=$('#page-memos .memo-layout'),handle=layout?.querySelector('.memo-column-splitter');if(!handle||handle.dataset.bound)return;handle.dataset.bound='1';
 const limit=()=>Math.max(220,Math.min(520,layout.clientWidth-390));
 const update=value=>{memoColumnWidth=value;sync()};
 const sync=()=>{const compact=layout.clientWidth<740;handle.hidden=compact;handle.setAttribute('aria-disabled',String(compact));layout.classList.toggle('memo-columns-compact',compact);layout.style.setProperty('--memo-list-width',Math.min(limit(),memoColumnWidth)+'px');handle.setAttribute('aria-valuemin','220');handle.setAttribute('aria-valuemax',String(limit()));handle.setAttribute('aria-valuenow',String(Math.round(Math.min(limit(),memoColumnWidth))))};
 bindUiSplitter(handle,{read:()=>memoColumnWidth,write:update,min:220,max:limit,step:16,reset:300,position:event=>event.clientX-layout.getBoundingClientRect().left,commit:()=>{try{localStorage.setItem('work-cockpit-memo-column-v1',String(memoColumnWidth))}catch{}}});
 memoColumnObserver?.disconnect();memoColumnObserver=new ResizeObserver(sync);memoColumnObserver.observe(layout);sync();
}


let journalSelectedPassage=null;
function journalSelectionActions(date){return '<div class="journal-selection-actions"><span>选中文字后：</span><button type="button" class="link-btn" data-journal-passage="'+date+'">关联段落 / 转为任务</button></div>'}
// Quill remembers its selection when a toolbar/button receives focus. Capture before the click.
document.addEventListener('pointerdown',event=>{if(event.target.closest?.('[data-journal-passage]')){captureJournalPassage(event.target.closest('[data-journal-passage]').dataset.journalPassage)}},true);
function captureJournalPassage(date){
 const editor=$('#workJournal [data-journal-date="'+date+'"]'),q=quillFor(editor),range=q?.getSelection()||q?.selection?.savedRange;
 journalSelectedPassage=range?.length?{week:journalUI.week,date,text:q.getText(range.index,range.length).trim()}:null;return journalSelectedPassage;
}
function openJournalPassage(date){
 if(!journalSelectedPassage||journalSelectedPassage.date!==date||journalSelectedPassage.week!==journalUI.week)captureJournalPassage(date);
 const passage=journalSelectedPassage;if(!passage?.text)return toast('请先选中当天记录中的文字');if(!journalFlush())return;
 const ids=journalWeek(journalUI.week).days[date]?.taskIds||[];
 workflowDialog('整理选中记录',date+' · 保留原文和来源','<blockquote class="journal-passage-preview">'+esc(passage.text)+'</blockquote><label>操作<select id="journalPassageAction"><option value="link">关联到事项</option><option value="checklist">加入任务清单</option><option value="task">新建事项</option></select></label><label id="journalPassageTaskField">事项<select id="journalPassageTask">'+recordTaskCandidates(state.tasks,'',true).map(task=>'<option value="'+esc(task.id)+'" '+(ids.includes(task.id)?'selected':'')+'>'+esc(task.title)+'</option>').join('')+'</select></label>','确认');
 workflowDialogContext={kind:'passage',passage};
}
function confirmJournalPassage(){
 const context=workflowDialogContext;if(context?.kind!=='passage')return;
 const passage=context.passage,action=$('#journalPassageAction').value;let id=$('#journalPassageTask').value;
 if(action!=='task'&&!id)return toast('请选择事项');if(!journalFlush())return;
 if(taskDraft&&$('#taskDialog')?.open&&!persistTaskDraft())return;
 const day=state.meta.workJournal.weeks[passage.week]?.days[passage.date];if(!day)return toast('来源记录已移除，请重新选择');
 const duplicate=(day.taskExcerpts||[]).some(item=>item.text===passage.text&&item.action===action&&(action==='task'||item.targetId===id));if(duplicate)return toast('这段记录已执行过该操作');
 try{commit('整理工作记录段落',draft=>{
  const live=draft.meta.workJournal.weeks[passage.week].days[passage.date];
  if(action==='task'){const task=normalizeTask({id:uid('task'),title:passage.text.split('\n')[0].slice(0,500),status:'待处理',priority:'P2',notes:'<p>'+esc(passage.text).replace(/\n/g,'<br>')+'</p><p>来源：工作记录 '+passage.date+'</p>'});draft.tasks.unshift(task);draft.order.inbox.unshift(task.id);id=task.id}
  if(action==='checklist'){const task=draft.tasks.find(task=>task.id===id);if(!task||task.archived||isDone(task))throw Error('事项状态已变化');task.checklist.push(normalizeChecklistItem({text:passage.text}));task.updatedAt=new Date().toISOString()}
  live.taskIds=[...new Set([...(live.taskIds||[]),id])];live.taskExcerpts||=[];live.taskExcerpts.push({id:uid('excerpt'),text:passage.text,taskIds:[id],createdAt:new Date().toISOString(),action,targetId:id});
 },{immediate:true});}catch{toast('保存失败，请重试；原始记录保留');return}
 if(taskDraft&&$('#taskDialog')?.open)syncOpenTaskDraftFromState();$('#workflowDialog').close();refreshJournalLinks(passage.date);journalSelectedPassage=null;toast('已整理；原始记录保留，可撤回');
}
function handleJournalEnhancementClick(target){
 if(target.hasAttribute('data-journal-task-drag')){openTaskRecord(target.dataset.journalTaskDrag);return true}
 if(target.dataset.openJournalDate){const date=target.dataset.openJournalDate;if(openJournalForWeek(fmt(mondayOf(parseDate(date))),false)){journalUI.active=date;journalScrollToDate(date)}return true}
 if(target.dataset.journalPassage){openJournalPassage(target.dataset.journalPassage);return true}
 if(target.hasAttribute('data-workflow-confirm')&&workflowDialogContext?.kind==='passage'){confirmJournalPassage();return true}
 return false;
}
document.addEventListener('change',event=>{if(event.target.id==='journalPassageAction')$('#journalPassageTaskField').hidden=event.target.value==='task'});
