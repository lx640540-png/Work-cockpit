// Frequent task actions, record links and weekly curation share the same UI primitives.
let workflowDialogContext=null,workflowReturnFocus=null,workflowSearchTimer=0;
function positionUiPopover(pop,trigger){
 if(!pop||!trigger?.isConnected)return;
 const rect=trigger.getBoundingClientRect(),width=pop.offsetWidth,height=pop.offsetHeight;
 pop.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
 const below=rect.bottom+6,above=rect.top-height-6;
 pop.style.top=Math.max(8,Math.min(below+height<=innerHeight-8?below:above,innerHeight-height-8))+'px';
}
function quickCaptureMarkup(){return '<form class="quick-capture" data-quick-capture autocomplete="off"><label class="visually-hidden" for="quickCaptureTitle">记录一件待整理的事</label><input id="quickCaptureTitle" name="captureTitle" placeholder="先记下一件事，回车保存…" autocomplete="off" required maxlength="500"><button type="submit" aria-label="存入临时收件箱">＋</button></form>'}
function openJournalForWeek(key,expanded=true){
 if(!journalFlush())return false;
 journalUI.open=true;journalUI.expanded=expanded;journalUI.week=key;journalUI.reviewOpen=true;journalUI.signature='';syncWorkJournal();journalMountAboveModal();return true;
}
let journalPendingTask=null;
function openTaskRecord(id){
 if(taskDraft?.id===id&&$('#taskDialog')?.open&&!persistTaskDraft())return;
 const task=taskById(id);if(!task)return;
 if(!journalFlush())return;
 taskJournalPane='journal';
 if(!openJournalForWeek(currentWeekKey(),false))return;
 const date=todayKey(),week=journalWeek(journalUI.week);
 journalPendingTask={id,date,week:journalUI.week};
 if(!week.days[date]){week.days[date]={content:'',updatedAt:''};week.deleted=week.deleted.filter(value=>value!==date);journalRenderDays()}
 journalUI.active=date;journalUI.activeReview='';journalShowTaskContext();journalScrollToDate(date);quillFor(journalActiveEditor())?.focus();
}
function journalShowTaskContext(){
 const heading=$('#workJournal .journal-top');if(!heading)return;
 let banner=heading.querySelector('.journal-task-context');if(!banner){banner=document.createElement('div');banner.className='journal-task-context';heading.appendChild(banner)}
 const context=journalPendingTask,task=context&&context.week===journalUI.week?taskById(context.id):null;
 const linked=task&&(journalWeek(context.week).days[context.date]?.taskIds||[]).includes(context.id);
 banner.hidden=!task;banner.textContent=task?'关联事项：'+task.title+(linked?'':' · 写入后关联'):'';
}
function journalAttachPendingTask(date,day){
 const context=journalPendingTask;if(!context||context.date!==date||context.week!==journalUI.week||!BackupFormat.meaningful(day.content))return;
 day.taskIds=[...new Set([...(day.taskIds||[]),context.id])];journalPendingTask=null;journalShowTaskContext();
 const links=$('#workJournal [data-record-links="'+date+'"]');if(links)links.outerHTML=journalTaskLinksMarkup(date,day);
}
function journalTaskLinksMarkup(date,day){
 const chips=(day.taskIds||[]).map(id=>{const task=taskById(id);return '<span class="journal-task-chip"><button type="button" data-open-task="'+esc(id)+'" '+(!task?'disabled':'')+'>'+esc(task?.title||'事项已删除')+'</button><button type="button" data-unlink-record-task="'+esc(id)+'" data-record-date="'+date+'" aria-label="解除关联'+esc(task?.title||'事项')+'">×</button></span>'}).join('');
 return '<div class="journal-task-links" data-record-links="'+date+'">'+chips+'<button type="button" class="link-btn" data-link-record-date="'+date+'">＋ 关联事项</button><button type="button" class="link-btn" data-curate-record-date="'+date+'" '+(weekMode(journalUI.week)!=='current'?'disabled':'')+'>整理到周复盘</button></div>';
}
function workflowDialog(title,description,body,action){
 let dialog=$('#workflowDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='workflowDialog';dialog.className='workflow-dialog';document.body.appendChild(dialog);dialog.addEventListener('close',()=>{workflowDialogContext=null;if(workflowReturnFocus?.isConnected)workflowReturnFocus.focus({preventScroll:true})});dialog.addEventListener('cancel',()=>dialog.close())}
 workflowReturnFocus=document.activeElement;
 dialog.innerHTML='<form method="dialog"><header><div><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p></div><button type="submit" class="btn" aria-label="关闭">×</button></header></form><div class="workflow-dialog-body">'+body+'</div><footer><button type="button" class="btn" data-close="workflowDialog">取消</button><button type="button" class="btn primary" data-workflow-confirm>'+esc(action)+'</button></footer>';
 dialog.showModal();dialog.querySelector('input,select,button')?.focus({preventScroll:true});return dialog;
}
function openRecordTaskPicker(date){
 if(!journalFlush())return;
 const day=journalWeek(journalUI.week).days[date];if(!day)return;
 workflowDialog('关联现有事项',journalDateLabel(date)+' · 只建立链接，不复制任务','<label class="workflow-search">查找事项<input type="search" data-record-task-search autocomplete="off" placeholder="输入任务或项目名称"></label><div class="workflow-task-choices"></div>','保存关联');
 workflowDialogContext={kind:'links',week:journalUI.week,date,selected:new Set(day.taskIds||[])};renderRecordTaskChoices('');$('#workflowDialog [data-record-task-search]')?.focus();
}
function renderRecordTaskChoices(query){
 const context=workflowDialogContext;if(context?.kind!=='links')return;
 const items=state.tasks.filter(task=>!task.archived&&(!query||taskSearchMatch(task,query).score>0));
 $('#workflowDialog .workflow-task-choices').innerHTML=items.length?items.map(task=>'<label class="workflow-record-choice"><input type="checkbox" data-record-task-choice="'+esc(task.id)+'" '+(context.selected.has(task.id)?'checked':'')+'><span><b>'+esc(task.title)+'</b><small>'+esc(projectName(task.project))+' · '+esc(task.status)+'</small></span></label>').join(''):'<div class="empty">没有匹配的事项。</div>';
}
function recordCurationBlocks(key,date=''){
 const week=journalWeek(key),result=[];
 for(const day of Object.keys(week.days).sort()){
  if(date&&date!==day)continue;
  const box=document.createElement('div');box.innerHTML=sanitizeRichValue(week.days[day].content);
  for(const node of box.childNodes){const html=node.nodeType===3?'<p>'+esc(node.textContent)+'</p>':node.outerHTML;if(strip(html))result.push({date:day,html,text:strip(html)})}
 }
 return result;
}
function openRecordCuration(key,date=''){
 if(weekMode(key)!=='current')return toast('历史周复盘只读；可以打开工作记录查看原文');
 if(!journalFlush())return;
 const blocks=recordCurationBlocks(key,date);
 const taskOptions=state.tasks.filter(task=>!task.archived).map(task=>'<option value="'+esc(task.id)+'">'+esc(task.title)+'</option>').join('');
 workflowDialog('选取记录带入复盘','勾选需要的段落，保留原文。带入后可继续编辑。','<label class="workflow-curation-target">带入到<select id="curationTarget"><option value="achievements">实际成果</option><option value="issues">未完成 / 原因</option><option value="next">下周继续关注</option><option value="task">某个事项的本周实际结果</option></select></label><label id="curationTaskField" class="workflow-curation-target workflow-curation-task" hidden>事项<select id="curationTask"><option value="">请选择已有事项</option>'+taskOptions+'</select></label><p class="workflow-record-target-hint">带入事项时保留日期和文字，原记录不变；仅进入本周复盘对照，不自动加入行动清单。</p><div class="workflow-curation-choices">'+(blocks.map((block,index)=>'<label class="workflow-record-choice"><input type="checkbox" data-curation-choice="'+index+'"><span><small>'+journalDateLabel(block.date)+'</small><span>'+esc(block.text)+'</span></span></label>').join('')||'<div class="empty">本周还没有正文记录，先打开工作记录随手记下实际变化。</div>')+'</div>','带入所选段落');
 workflowDialogContext={kind:'curation',week:key,blocks};
}
function confirmWorkflowDialog(){
 const context=workflowDialogContext;if(!context)return;if(context.kind==='planning')return confirmPlanningReview();
 if(context.kind==='links'){
  if(!journalFlush())return;
  commit('修改工作记录关联事项',()=>{const day=journalWeek(context.week).days[context.date];if(day)day.taskIds=[...context.selected]},{immediate:true});
  $('#workflowDialog').close();journalUI.signature='';syncWorkJournal();toast('关联已保存');return;
 }
 if(context.kind==='curation'){
  const field=$('#curationTarget').value,selected=$$('#workflowDialog [data-curation-choice]:checked').map(node=>context.blocks[Number(node.dataset.curationChoice)]);
  if(!selected.length)return toast('先选择要带入的段落');
  if(field==='task'){
   const id=$('#curationTask').value;if(!id)return toast('请选择要带入的事项');let added=0;
   commit('将记录带入事项本周结果',draft=>{added=appendJournalTaskResult(draft,context.week,id,selected)},{immediate:true});
   $('#workflowDialog').close();toast(added?'已带入事项的本周实际结果；原记录保留':'所选内容已在该事项本周结果中');return;
  }
  let current=weeklySummaryHTML(context.week,field),added=0;
  const groups=new Map();for(const block of selected){if(!groups.has(block.date))groups.set(block.date,[]);groups.get(block.date).push(block.html)}
  for(const [date,blocks] of groups){const html='<h3>'+esc(journalDateLabel(date))+'</h3>'+blocks.join('');if(summaryPlain(current).includes(summaryPlain(html)))continue;current+=html;added++}
  if(!added)return toast('所选内容已在这份总结中');
  commit('从每日记录整理周复盘',draft=>setWeeklySummary(context.week,field,current,draft),{immediate:true});
  syncWeeklySummaryEditors(context.week,field);$('#workflowDialog').close();journalUI.signature=journalSignature();toast('已带入所选内容，可继续编辑总结');
 }
}
function syncWeeklySummaryEditors(key,field,source=null){
 const html=weeklySummaryHTML(key,field),name=WEEKLY_SUMMARY_FIELDS[field];
 const nodes=[...(key===selectedWeekKey?$$('[data-week-review="'+name+'"]'):[]),...(key===journalUI.week?$$('#workJournal [data-journal-review="'+field+'"]'):[])];
 for(const node of nodes){if(node===source)continue;const quill=quillFor(node);if(quill){quill.setContents(quill.clipboard.convert({html:html||'<p><br></p>'}),'silent');quill.history.clear();updateRichEmpty(node)}else if(node.matches('textarea'))node.value=summaryPlain(html);else node.innerHTML=html}
 if(key===journalUI.week)journalUI.signature=journalSignature();
}
function weeklyRecordActions(key,mode){
 const days=Object.values(state.meta.workJournal?.weeks?.[key]?.days||{}).filter(day=>strip(day.content)).length;
 return '<div class="weekly-record-actions"><span>一份周总结 · 与工作记录的周五整理共用</span><div><button type="button" class="btn" data-review-planning="next" '+(mode!=='current'?'disabled':'')+'>确认下周安排</button><button type="button" class="btn" data-open-week-journal="'+key+'">旁看本周记录'+(days?' · '+days+' 天':'')+'</button><button type="button" class="btn" data-curate-week="'+key+'" '+(mode!=='current'?'disabled':'')+'>选取记录带入</button></div></div>';
}
function projectBriefMarkup(project,tasks){
 const data=projectBriefData(project,tasks),stage=data.current||data.blocked;
 const stageAction='data-edit-project-stage="'+esc(project.id)+'"'+(stage?' data-stage-id="'+esc(stage.id)+'"':'');
 const criteria=stage?.criteria?.trim()||'';
 const stageMarkup=stage?'<div class="project-stage-heading"><span class="eyebrow">'+(data.current?'当前阶段':'阻塞阶段')+'</span><button type="button" '+stageAction+'>'+esc(stage.name)+'</button>'+(stage.status==='阻塞'?'<span class="project-stage-status">阻塞</span>':'')+(stage.due?'<time datetime="'+esc(stage.due)+'">目标 '+dateShort(stage.due)+'</time>':'')+'</div>'+(criteria?'<details class="project-criteria"><summary><b>验收条件</b><span>'+esc(criteria)+'</span><small aria-hidden="true"></small></summary><p>'+esc(criteria)+'</p></details>':'<button class="link-btn project-criteria-empty" type="button" '+stageAction+'>设置验收条件</button>'):'<div class="project-stage-unset">'+(data.stagesDone?'<span class="muted">全部阶段已完成</span> ':'')+'<button class="btn" type="button" '+stageAction+'>'+(data.stagesDone?'查看项目阶段':'设置当前阶段')+'</button></div>';
 const blockers=data.blockedStages.filter(item=>item!==stage).map(item=>'<button type="button" class="project-stage-blocker" data-edit-project-stage="'+esc(project.id)+'" data-stage-id="'+esc(item.id)+'">阻塞 · '+esc(item.name)+'</button>').join('');
 const metrics=[['waiting','等待',data.waiting.length],['overdue','截止逾期',data.overdue.length],['missing-next','缺少下一步',data.missingNext.length]].filter(row=>row[2]>0).map(([key,label,count])=>'<button type="button" data-project-brief-filter="'+key+'" aria-label="查看'+label+'事项，'+count+'项" '+(!count?'disabled':'')+'>'+label+' <strong>'+count+'</strong></button>').join('');
 return '<section class="project-brief" aria-label="项目阶段与事项提醒"><div class="project-stage">'+stageMarkup+blockers+'</div>'+projectOverviewMarkup(project)+'<div class="project-brief-metrics" aria-label="点击提醒筛选下方事项">'+metrics+'</div></section>';
}
function projectRecentMarkup(project,tasks){
 const recent=projectBriefData(project,tasks).recent;
 if(!recent.length)return '';
 return '<details class="project-recent"><summary>最近完成 <span>'+(recent.length>3?'最近 3 项 · 共 '+recent.length+' 项':recent.length+' 项')+'</span></summary><div>'+recent.slice(0,3).map(task=>taskRow(task,{scope:'all',projectContext:true,draggable:false,compactDates:true})).join('')+'<button type="button" class="link-btn" data-project-brief-filter="done">查看全部已完成</button></div></details>';
}
let projectContextObserver=null;
function initProjectContextLayout(){
 projectContextObserver?.disconnect();projectContextObserver=null;
 const pane=$('.project-detail-scroll'),details=pane?.querySelector('[data-project-context]');if(!details)return;
 const sync=()=>{const saved=ui.projectBriefExpanded.get(details.dataset.projectContext);details.open=saved===undefined?pane.clientWidth>=560&&pane.clientHeight>=440:saved};
 sync();projectContextObserver=new ResizeObserver(sync);projectContextObserver.observe(pane);
}
document.addEventListener('click',event=>{const summary=event.target.closest?.('.project-brief-context>summary'),details=summary?.parentElement;if(details)ui.projectBriefExpanded.set(details.dataset.projectContext,!details.open)});
function filterProjectFromBrief(value){
 ui.projectAttentionFilter=['waiting','overdue','missing-next','attention','actionable'].includes(value)?value:'all';
 ui.projectOverviewFilter=value==='done'?'done':'open';ui.projectMilestoneFilter='all';ui.projectTaskQuery='';
 requestRender();requestAnimationFrame(()=>{const head=$('.project-task-head'),pane=$('.project-detail-scroll');if(head&&pane)pane.scrollTop+=head.getBoundingClientRect().top-pane.getBoundingClientRect().top});
}
function scheduleWorkspaceSearch(input){
 if(input.dataset.composing==='1')return;
 const id=input.id,value=input.value,start=input.selectionStart,end=input.selectionEnd;
 if(id==='taskSearch')taskFilter.query=value;else if(id==='projectTaskSearch')ui.projectTaskQuery=value;else if(id==='memoSearch')ui.memoQuery=value;else return;
 clearTimeout(workflowSearchTimer);workflowSearchTimer=setTimeout(()=>{if(!input.isConnected||input.dataset.composing==='1')return;const restoreFocus=document.activeElement===input;renderNow();const next=$('#'+id);if(next&&restoreFocus){next.focus({preventScroll:true});next.setSelectionRange(start,end)}},140);
}
document.addEventListener('compositionstart',event=>{if(event.target.matches?.('#taskSearch,#projectTaskSearch,#memoSearch')){clearTimeout(workflowSearchTimer);event.target.dataset.composing='1'}});
document.addEventListener('compositionend',event=>{if(event.target.matches?.('#taskSearch,#projectTaskSearch,#memoSearch')){event.target.dataset.composing='0';scheduleWorkspaceSearch(event.target)}});
document.addEventListener('input',event=>{if(event.target.matches?.('[data-record-task-search]')&&!event.isComposing)renderRecordTaskChoices(event.target.value)});
document.addEventListener('compositionend',event=>{if(event.target.matches?.('[data-record-task-search]'))renderRecordTaskChoices(event.target.value)});
document.addEventListener('change',event=>{const id=event.target.dataset.recordTaskChoice;if(id&&workflowDialogContext?.kind==='links'){event.target.checked?workflowDialogContext.selected.add(id):workflowDialogContext.selected.delete(id)}});
document.addEventListener('submit',event=>{
 const form=event.target;
 if(form.matches('[data-quick-capture]')){event.preventDefault();const input=form.elements.captureTitle,title=input.value.trim();if(!title)return;commit('快速记录到收件箱',draft=>{const task=normalizeTask({id:uid('task'),title,status:'待处理',priority:'P2'});draft.tasks.unshift(task);draft.order.inbox.unshift(task.id)},{immediate:true});toast('已存入临时收件箱');requestAnimationFrame(()=>$('#quickCaptureTitle')?.focus({preventScroll:true}));}
});
function handleWorkflowClick(target){
 if(target.dataset.projectBriefFilter){filterProjectFromBrief(target.dataset.projectBriefFilter);return true}
 if(target.dataset.editProjectStage){openProject(target.dataset.editProjectStage,{tab:'milestones',milestoneId:target.dataset.stageId});return true}
 if(target.dataset.openTask&&target.closest('.journal-task-chip')){if(!journalFlush())return true;if(!journalUI.pinned){journalUI.open=false;syncWorkJournal()}}
 if(target.hasAttribute('data-workflow-confirm')){confirmWorkflowDialog();return true}
 if(target.dataset.linkRecordDate){openRecordTaskPicker(target.dataset.linkRecordDate);return true}
 if(target.dataset.curateRecordDate){openRecordCuration(journalUI.week,target.dataset.curateRecordDate);return true}
 if(target.dataset.curateWeek){openRecordCuration(target.dataset.curateWeek);return true}
 if(target.dataset.openWeekJournal){openJournalForWeek(target.dataset.openWeekJournal);return true}
 if(target.dataset.unlinkRecordTask){const id=target.dataset.unlinkRecordTask,date=target.dataset.recordDate;if(!journalFlush())return true;commit('解除工作记录关联',()=>{const day=journalWeek(journalUI.week).days[date];if(day)day.taskIds=(day.taskIds||[]).filter(value=>value!==id)},{immediate:true});return true}
 return false;
}
