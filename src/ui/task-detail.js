function projectOptions(selected){return'<option value="">通用事项</option>'+state.projects.filter(project=>!project.archived||project.id===selected).map(project=>'<option value="'+esc(project.id)+'" '+(selected===project.id?"selected":"")+'>'+esc(project.name)+(project.archived?'（已归档）':'')+'</option>').join("")}
function milestoneOptions(projectId,selected){
 let project=projectById(projectId);return'<option value="">暂不关联里程碑</option>'+(project?.milestones||[]).map(milestone=>'<option value="'+esc(milestone.id)+'" '+(selected===milestone.id?"selected":"")+'>'+esc(milestone.name)+'</option>').join("");
}
let checklistTimeEditingId="",checklistFocusFrame=0;
function collectChecklistText(){if(!taskDraft)return;let byId=new Map(taskDraft.checklist.map(item=>[item.id,item]));$$("#draftChecklist [data-check-id]").forEach(input=>{let item=byId.get(input.dataset.checkId);if(item)item.text=input.value})}
function checklistTimeLabel(item,now=new Date()){
 if(!item.done)return "";if(!item.completedAt)return "时间未记录";
 let date=new Date(item.completedAt);if(!Number.isFinite(date.getTime()))return "时间未记录";
 let time=String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0");
 return fmt(date)===fmt(now)?"今天 "+time:(date.getFullYear()===now.getFullYear()?"":date.getFullYear()+"年")+(date.getMonth()+1)+"月"+date.getDate()+"日";
}
function checklistLocalTime(value){let date=new Date(value);return value&&Number.isFinite(date.getTime())?fmt(date)+"T"+String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0"):""}
function checklistFullTime(value){let date=new Date(value);return value&&Number.isFinite(date.getTime())?fmt(date)+" "+String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0"):"时间未记录"}
function checklistMarkup(){
 return taskDraft.checklist.map((item,index)=>{
  let editing=item.done&&checklistTimeEditingId===item.id,time=item.done?'<button class="checklist-time" type="button" data-edit-check-time="'+esc(item.id)+'" aria-label="查看或修改检查项完成时间：'+esc(item.text)+'" aria-expanded="'+editing+'" title="'+esc(checklistFullTime(item.completedAt))+'">'+esc(checklistTimeLabel(item))+'</button>':'';
  let edit=editing?'<div class="checklist-time-editor"><p>完成时间 · '+esc(checklistFullTime(item.completedAt))+'</p><label for="checklistCompletedAt">修改完成时间</label><input id="checklistCompletedAt" type="datetime-local" step="60" value="'+esc(checklistLocalTime(item.completedAt))+'"><div><button class="btn" type="button" data-cancel-check-time>取消</button><button class="btn" type="button" data-save-check-time="'+esc(item.id)+'">保存时间</button></div></div>':'';
  return '<div class="attachment-item checklist-item" data-check-drop="'+index+'"><button class="drag-handle" type="button" draggable="true" data-check-drag="'+index+'" aria-label="拖动调整检查项顺序">⠿</button><input type="checkbox" data-check-done="'+index+'" aria-label="完成检查项：'+esc(item.text)+'" '+(item.done?'checked':'')+'><input class="checklist-text" type="text" data-check-text="'+index+'" data-check-id="'+esc(item.id)+'" aria-label="检查项内容" value="'+esc(item.text)+'" placeholder="检查项">'+time+'<button class="icon-btn" type="button" data-remove-check="'+index+'" aria-label="删除检查项">×</button>'+edit+'</div>';
 }).join("")||'<div class="muted" style="font-size:11px">暂无检查项</div>';
}
function saveChecklistTime(id){
 let item=taskDraft?.checklist.find(item=>item.id===id),input=$("#checklistCompletedAt");if(!item?.done||!input)return;
 let date=new Date(input.value);if(!input.value||!Number.isFinite(date.getTime())||checklistLocalTime(date.toISOString())!==input.value){toast("请选择有效的完成时间");input.focus();return}
 if(date.getTime()>Date.now()){toast("完成时间不能晚于现在");input.focus();return}
 item.completedAt=date.toISOString();checklistTimeEditingId="";refreshChecklist();scheduleTaskAutosave();
}
function attachmentMarkup(){
 return taskDraft.attachments.map(item=>'<div class="attachment-item"><button style="border:0;background:transparent;text-align:left;min-width:0" type="button" data-preview-attachment="'+esc(item.id)+'">'+attachmentThumbnail(item)+'<b>'+esc(item.name)+'</b><small>'+Math.ceil(item.size/1024)+' KB</small></button><button class="icon-btn" type="button" data-remove-attachment="'+esc(item.id)+'">×</button></div>').join("")||'<div class="muted" style="font-size:11px">还没有附件</div>';
}
function relationMarkup(){
 let selected=Array.from(relatedDraft).map(taskById).filter(Boolean);
 return selected.map(task=>'<div class="related-item"><button type="button" style="border:0;background:transparent;text-align:left;min-width:0" data-open-related="'+esc(task.id)+'"><b>'+esc(task.title)+'</b><small>'+esc(projectName(task.project))+' · '+esc(task.status)+'</small></button><button class="icon-btn" type="button" data-remove-related="'+esc(task.id)+'">×</button></div>').join("")||'<div class="muted" style="font-size:11px">尚未关联其他任务</div>';
}
function relationResults(query){
 let text=String(query||"").trim().toLowerCase();if(!text)return"";
 return state.tasks.filter(task=>!task.archived&&task.id!==taskDraft.id&&!relatedDraft.has(task.id)&&(task.title+" "+task.nextAction+" "+projectName(task.project)).toLowerCase().includes(text)).slice(0,7).map(task=>'<button class="related-item" style="width:100%;text-align:left" type="button" data-add-related="'+esc(task.id)+'"><span><b>'+esc(task.title)+'</b><small>'+esc(projectName(task.project))+' · '+esc(task.nextAction||task.status)+'</small></span><span>＋</span></button>').join("")||'<div class="muted" style="font-size:11px">没有匹配事项</div>';
}
function decisionRows(items,empty="还没有关键决策"){
 return items.map(decision=>{let project=projectById(decision.project),milestone=project?.milestones.find(item=>item.id===decision.milestone),source=taskById(decision.sourceTaskId),meta=[milestone?.name,source?.title].filter(Boolean).join(" · ")||project?.name||"未关联项目";return'<button class="decision-item" type="button" data-edit-decision="'+esc(decision.id)+'"><span><b>'+esc(decision.title)+'</b><small>'+esc(strip(decision.conclusion)||"尚未补充结论")+'</small><small>'+esc(meta)+'</small></span><time>'+dateShort(decision.date)+'</time></button>'}).join("")||'<div class="muted" style="font-size:11px">'+esc(empty)+'</div>';
}
function taskDecisionMarkup(){return decisionRows(state.decisions.filter(decision=>!decision.archived&&decision.sourceTaskId===taskDraft.id),"该任务尚未形成关键决策")}
function taskHistoryEntries(taskId){
 return Object.entries(state.weeks).filter(([weekKey,week])=>weekKey<currentWeekKey()||!!week.closedAt||!taskById(taskId)).map(([weekKey,week])=>{let task=(week.taskSnapshots||[]).find(item=>item.id===taskId);return task?{weekKey,week,task}:null}).filter(Boolean).sort((a,b)=>b.weekKey.localeCompare(a.weekKey));
}
function historyWeekLabel(key){let start=parseDate(key);return isoWeekYear(start)+" 年第 "+isoWeekNumber(start)+" 周"}
function taskHistoryDetail(task,entry,current=false){
 let week=entry?.week,project=current?projectById(task.project):week?.projectSnapshots.find(item=>item.id===task.project)||projectById(task.project),milestone=milestoneOf(task,project),checklist=(task.checklist||[]).map(item=>'<div><span>'+(item.done?'✓':'○')+'</span><span>'+esc(item.text||'未命名检查项')+'</span>'+(item.done?'<small class="history-check-time">'+esc(checklistFullTime(item.completedAt))+'</small>':'')+'</div>').join("")||'<div class="muted">没有检查项</div>',attachments=(task.attachments||[]).map(item=>'<span class="pill">'+esc(item.name)+'</span>').join("")||'<span class="muted">没有附件记录</span>';
 return'<div class="history-banner">'+(current?'当前事项 · 可返回任务详情继续编辑':historyWeekLabel(entry.weekKey)+'结束时的只读快照；不会随当前事项变化')+'</div><h3 class="history-title">'+esc(task.title)+'</h3><div class="history-meta"><span class="pill status-'+esc(task.status)+'">'+esc(task.status)+'</span><span class="pill priority-'+esc(task.priority)+'">'+esc(task.priority)+'</span><span class="pill">'+esc(task.type)+'</span></div><div class="history-grid"><div class="history-field"><small>所属项目</small><b>'+esc(project?.name||'通用事项')+'</b></div><div class="history-field"><small>所属里程碑</small><b>'+esc(milestone?.name||'未关联里程碑')+'</b></div><div class="history-field"><small>计划日期</small><b>'+dateShort(task.planDate)+'</b></div><div class="history-field"><small>完成日期</small><b>'+dateShort(task.completed)+'</b></div></div><section class="history-section"><h3>下一步动作</h3><div>'+esc(task.nextAction||'暂无下一步')+'</div></section><section class="history-section"><h3>备注与关键结论</h3><div class="history-notes">'+(task.notes||'<span class="muted">暂无备注</span>')+'</div></section><section class="history-section"><h3>检查清单</h3><div class="history-checklist">'+checklist+'</div></section><section class="history-section"><h3>附件记录</h3><div class="history-meta">'+attachments+'</div></section>';
}
function renderTaskHistory(){
 let current=taskById(historyTaskId),entries=taskHistoryEntries(historyTaskId);if(historySelection==="current"&&!current)historySelection=entries[0]?.weekKey||"";if(historySelection!=="current"&&!entries.some(item=>item.weekKey===historySelection))historySelection=current?"current":entries[0]?.weekKey||"";
 let selected=entries.find(item=>item.weekKey===historySelection),task=historySelection==="current"?current:selected?.task,title=task?.title||current?.title||entries[0]?.task?.title||"事项周记录",versions=(current?'<button type="button" class="'+(historySelection==="current"?'active':'')+'" data-history-version="current"><b>当前事项</b><small>最新可编辑版本</small></button>':'')+entries.map(item=>'<button type="button" class="'+(historySelection===item.weekKey?'active':'')+'" data-history-version="'+item.weekKey+'"><b>'+historyWeekLabel(item.weekKey)+'</b><small>'+dateShort(item.weekKey)+'—'+dateShort(weekEnd(item.weekKey))+'</small></button>').join("");
 $("#taskHistoryTitle").textContent=title;$("#taskHistoryBody").innerHTML='<aside class="history-versions">'+(versions||'<div class="empty">没有周记录</div>')+'</aside><section class="history-detail">'+(task?taskHistoryDetail(task,selected,historySelection==="current"):'<div class="empty">没有可查看的数据。</div>')+'</section>';$("#historyCurrentButton").hidden=!current;
}
function openTaskHistory(taskId,selection="current"){historyTaskId=taskId;historySelection=selection||"current";renderTaskHistory();showDialog($("#taskHistoryDialog"))}
function openTask(id,prefill={}){
 let existing=id?taskById(id):null;
 clearTimeout(taskAutosaveTimer);taskAutosaveClosing=false;
 taskDraft=normalizeTask(existing?clone(existing):{id:uid("task"),title:"",status:"待处理",priority:"P1",type:"任务",...prefill,nextAction:""});
 relatedDraft=new Set(taskDraft.relatedTaskIds||[]);attachmentPreviewId="";checklistTimeEditingId="";taskChecklistCollapsed=false;taskChecklistHeight=0;
 $("#taskDialogTitle").textContent=existing?"编辑事项":"新增事项";$("#deleteTaskButton").hidden=!existing;
 taskAutosaveSignature=taskDraftSignature(taskDraft);renderTaskEditor();setTaskAutosaveStatus("","修改会自动保存");showDialog($("#taskDialog"));requestAnimationFrame(()=>$("#taskTitle")?.focus());
}
function renderTaskEditor(){
 let existing=!!taskById(taskDraft.id),project=projectById(taskDraft.project);
 let notesEditor=resizableRichBox("taskNotesHeight",toolbar()+'<div class="rich-editor" id="taskNotes" contenteditable="true" data-placeholder="补充背景、判断和结果……">'+taskDraft.notes+'</div>',"task-notes-editor");
 $("#taskEditor").innerHTML='<aside class="task-column"><section class="task-section"><div class="task-section-title">任务属性</div><div class="form-grid"><div class="field"><label>类型</label><select id="draftType">'+taskTypes.map(value=>'<option '+(taskDraft.type===value?"selected":"")+'>'+value+'</option>').join("")+'</select></div><div class="field"><label>状态</label><select id="draftStatus">'+statuses.map(value=>'<option '+(taskDraft.status===value?"selected":"")+'>'+value+'</option>').join("")+'</select></div><div class="field"><label>优先级</label><select id="draftPriority">'+priorities.map(value=>'<option '+(taskDraft.priority===value?"selected":"")+'>'+value+'</option>').join("")+'</select></div><div class="field"><label>计划日期 <small>准备哪天做</small></label><input id="draftPlanDate" type="date" value="'+esc(taskDraft.planDate)+'"></div><div class="field"><label>截止日期 <small>最晚何时完成</small></label><input id="draftDue" type="date" value="'+esc(taskDraft.due)+'"></div><div class="field"><label>完成日期</label><input id="draftCompleted" type="date" value="'+esc(taskDraft.completed)+'" '+(taskDraft.status==="已完成"?"":"disabled")+'></div><div class="field"><label>跟进日期 <small>等待时何时再问</small></label><input id="draftFollowup" type="date" value="'+esc(taskDraft.followup)+'"></div></div><label style="display:flex;gap:8px;margin-top:11px"><input id="draftFocus" type="checkbox" '+(taskDraft.focus?"checked":"")+'> 加入今日行动（同时加入本周）</label><label style="display:flex;gap:8px;margin-top:7px"><input id="draftWeek" type="checkbox" '+(taskDraft.week?"checked":"")+'> 加入本周行动</label></section>'+
 '<section class="task-section"><div class="task-section-title task-project-section-title"><span>项目关系</span><button class="link-btn task-project-link" type="button" data-go-task-project '+(taskDraft.project?'':'disabled')+'>进入项目 ↗</button></div><div class="field"><label>所属项目</label><select id="draftProject">'+projectOptions(taskDraft.project)+'</select></div><div class="field" style="margin-top:9px"><label>里程碑</label><select id="draftMilestone">'+milestoneOptions(taskDraft.project,taskDraft.milestone)+'</select></div></section>'+
 '<section class="task-section task-record-section"><div class="task-section-title"><span>工作记录</span><button class="link-btn" type="button" data-task-record>记工作记录 ↗</button></div></section></aside>'+
 '<section class="task-column task-content-column"><div class="field"><label>事项名称</label><input class="title-input" id="taskTitle" value="'+esc(taskDraft.title)+'" placeholder="写清楚要推动的结果"></div><div class="field"><label>下一步动作</label><textarea id="taskNext" rows="1">'+esc(taskDraft.nextAction)+'</textarea></div><section class="task-section checklist-section '+(taskChecklistCollapsed?'collapsed':'')+'" '+(taskChecklistHeight&&!taskChecklistCollapsed?'style="height:'+Math.round(taskChecklistHeight)+'px"':'')+'><div class="task-section-title"><span>检查清单</span><div class="checklist-tools"><button class="checklist-toggle" type="button" data-toggle-checklist>'+(taskChecklistCollapsed?'展开':'收起')+' · '+taskDraft.checklist.length+'</button><button class="link-btn" type="button" data-add-check>＋ 添加</button></div></div><div id="draftChecklist">'+checklistMarkup()+'</div></section><button class="checklist-resizer" id="checklistResizer" type="button" data-tip="上下拖动调整检查清单高度；双击恢复自适应" aria-label="上下拖动调整检查清单高度"></button><div class="field task-notes-field">'+obsidianLinkMarkup(taskDraft)+notesEditor+'</div></section>'+
 '<aside class="task-column attachment-column"><details class="task-support-disclosure" open><summary>附件与关联内容</summary><div class="task-support-content"><section class="task-section task-attachment-paste" data-attachment-paste><div class="task-section-title">附件与预览</div><button type="button" class="dropzone" aria-label="选择附件，也可将文件拖入任务详情">拖入图片或文件<br><span>＋ 选择文件</span></button><div id="taskUploadQueue" aria-live="polite"></div><div class="attachment-list">'+attachmentMarkup()+'</div><div class="preview '+(attachmentPreviewId?'has-preview':'')+'" id="attachmentPreview">'+(attachmentPreviewId?"正在加载预览……":"选择附件后在这里预览")+'</div><p class="muted" style="font-size:10px">鼠标停在此区域，Ctrl / ⌘ + V 粘贴图片。每个文件不超过 50MB。</p></section>'+
 '<section class="task-section"><div class="task-section-title" style="display:flex;align-items:center;justify-content:space-between"><span>关联任务 <span class="muted">双向关联</span></span><button class="link-btn" type="button" data-new-related-task>＋ 新建</button></div><input class="related-search" id="relatedSearch" placeholder="搜索任务名称或下一步……"><div id="relationResults"></div><div class="related-list" id="relatedList">'+relationMarkup()+'</div><p class="muted" style="font-size:10px">新建时会先保存当前事项，并自动建立双向关联；关系不参与状态和排序。</p></section><section class="task-section"><div class="task-section-title" style="display:flex;align-items:center;justify-content:space-between"><span>关键决策</span><button class="link-btn" type="button" data-new-decision data-task="'+taskDraft.id+'" '+(existing?"":"disabled")+'>＋ 记录</button></div><div class="decision-list" id="taskDecisionList">'+taskDecisionMarkup()+'</div><p class="muted" style="font-size:10px">记录会自动关联当前任务、项目与里程碑；不改变任务排序。</p></section><section class="task-section"><div class="task-section-title">周记录</div><button class="btn" style="width:100%" type="button" data-view-task-history="'+taskDraft.id+'" '+(existing?"":"disabled")+'>查看周记录 · '+(existing?taskHistoryEntries(taskDraft.id).length:0)+'</button><p class="muted" style="font-size:10px;margin-bottom:0">历史周为只读快照；当前事项仍是唯一可编辑数据源。</p></section></div></details></aside>';
 initQuillEditors($("#taskEditor"));
 renderTaskUploadQueue();refreshAttachmentThumbnails();
 enhanceHoverSelects($("#taskEditor"));
}
function syncOpenTaskDraftFromState(){
 if(!taskDraft||!$("#taskDialog")?.open)return;
 let current=taskById(taskDraft.id);if(!current)return finishTaskDialogClose();
 clearTimeout(taskAutosaveTimer);taskAutosaveTimer=0;taskDraft=clone(current);relatedDraft=new Set(taskDraft.relatedTaskIds||[]);taskAutosaveSignature=taskDraftSignature(taskDraft);renderTaskEditor();setTaskAutosaveStatus("saved","已与撤销记录同步");
}
function refreshChecklist(options={}){
 collectChecklistText();cancelAnimationFrame(checklistFocusFrame);
 let section=$(".checklist-section"),list=$("#draftChecklist"),toggle=$("[data-toggle-checklist]");if(!section||!list)return;section.classList.toggle("collapsed",taskChecklistCollapsed);section.style.height=taskChecklistHeight&&!taskChecklistCollapsed?Math.round(taskChecklistHeight)+"px":"";toggle.textContent=(taskChecklistCollapsed?"展开":"收起")+" · "+taskDraft.checklist.length;list.innerHTML=checklistMarkup();if(options.focusLast)checklistFocusFrame=requestAnimationFrame(()=>{let input=$("#draftChecklist .attachment-item:last-child [data-check-text]");input?.focus();input?.scrollIntoView({block:"nearest"})});
}
function collectTaskDraft(){
 collectChecklistText();
 taskDraft.title=$("#taskTitle").value.trim();taskDraft.nextAction=$("#taskNext").value.trim();taskDraft.notes=serializeRichEditor($("#taskNotes"));taskDraft.obsidianUri=$("#taskObsidianUri").value.trim();taskDraft.type=$("#draftType").value;taskDraft.status=$("#draftStatus").value;taskDraft.priority=$("#draftPriority").value;taskDraft.planDate=$("#draftPlanDate").value;taskDraft.due=$("#draftDue").value;taskDraft.completed=taskDraft.status==="已完成"?($("#draftCompleted").value||taskDraft.completed||todayKey()):"";taskDraft.followup=$("#draftFollowup").value;taskDraft.project=$("#draftProject").value;taskDraft.milestone=$("#draftMilestone").value;taskDraft.focus=$("#draftFocus").checked;taskDraft.week=$("#draftWeek").checked||taskDraft.focus;taskDraft.inbox=taskDraft.status==="待处理";taskDraft.relatedTaskIds=Array.from(relatedDraft);taskDraft.updatedAt=new Date().toISOString();
}
function taskDraftSignature(task){let value=clone(task||{});delete value.updatedAt;return JSON.stringify(value)}
function taskDraftHasContent(task){return!!(task?.title||task?.nextAction||task?.obsidianUri||task?.due||strip(task?.notes||"").trim()||task?.project||task?.milestone||task?.planDate||task?.followup||task?.focus||task?.week||(task?.checklist||[]).some(item=>item.text?.trim())||(task?.relatedTaskIds||[]).length||(task?.attachments||[]).length)}
function setTaskAutosaveStatus(kind,text){let status=$("#taskAutosaveStatus");if(!status)return;status.className="task-autosave-status "+(kind||"");status.textContent=text}
function persistTaskDraft(options={}){
 if(!taskDraft||!$("#taskDialog")?.open)return false;clearTimeout(taskAutosaveTimer);taskAutosaveTimer=0;
 let notes=$("#taskNotes");if(notes&&!quillFor(notes))richFlush(notes);collectTaskDraft();let existing=taskById(taskDraft.id);
 if(!taskDraft.title){if(options.close&&!existing&&!taskDraftHasContent(taskDraft)){finishTaskDialogClose();return true}setTaskAutosaveStatus("error","请先填写事项名称");if(options.close||options.notify)toast("请填写事项名称");return false}
 let signature=taskDraftSignature(taskDraft);if(signature!==taskAutosaveSignature){
  let saved=clone(taskDraft);recordDirectEdit("task:auto:"+saved.id,existing?"编辑事项":"新增事项");
  applyTaskDraftToState(saved);try{persistStateChanges({immediate:true})}catch(error){setTaskAutosaveStatus("error","本地保存失败，请重试或导出备份");return false}taskDraft=clone(taskById(saved.id));relatedDraft=new Set(taskDraft.relatedTaskIds||[]);taskAutosaveSignature=taskDraftSignature(taskDraft);$("#deleteTaskButton").hidden=false;$("#taskDialogTitle").textContent="编辑事项";
 }
 if(localSavePending){try{saveLocal(true)}catch{setTaskAutosaveStatus("error","本地保存失败，请重试");return false}}
 setTaskAutosaveStatus("saved","已自动保存");if(options.close){finishTaskDialogClose();if(options.notify)toast(existing?"事项已保存":"事项已创建")}return true;
}
function scheduleTaskAutosave(){
 if(!taskDraft||!$("#taskDialog")?.open||taskAutosaveClosing)return;clearTimeout(taskAutosaveTimer);setTaskAutosaveStatus("saving","等待自动保存…");taskAutosaveTimer=setTimeout(()=>persistTaskDraft(),700);
}
function finishTaskDialogClose(){
 clearTimeout(taskAutosaveTimer);taskAutosaveTimer=0;let id=taskDraft?.id||"";taskAutosaveClosing=true;let journal=$("#workJournal");if(journal&&$("#taskDialog").contains(journal))document.body.appendChild(journal);closeDialog("taskDialog");if(journalUI.open)journalLayout();if(id)directEditSessions.delete("task:auto:"+id);taskDraft=null;relatedDraft=new Set();taskAutosaveSignature="";taskAutosaveClosing=false;renderNow();
}
function closeTaskDialog(){if(taskAutosaveClosing)return;taskAutosaveClosing=true;let saved=persistTaskDraft({close:true});if(!saved)taskAutosaveClosing=false}
function syncTaskCompletedField(){let input=$("#draftCompleted"),status=$("#draftStatus")?.value;if(!input)return;input.disabled=status!=="已完成";if(status==="已完成"&&!input.value)input.value=taskDraft.completed||todayKey();if(status!=="已完成")input.value=""}
function applyRelations(taskId,nextIds){
 let next=new Set(nextIds.map(String));state.tasks.forEach(task=>{if(task.id===taskId)return;let links=new Set(task.relatedTaskIds||[]);next.has(task.id)?links.add(taskId):links.delete(taskId);task.relatedTaskIds=Array.from(links)});let task=taskById(taskId);if(task)task.relatedTaskIds=Array.from(next);
}
function saveTaskDraft(){return persistTaskDraft({close:true,notify:true})}
function goToTaskProject(){
 collectTaskDraft();
 let project=projectById(taskDraft?.project),taskId=taskDraft?.id||"";
 if(!project)return toast("请先选择所属项目");
 if(!persistTaskDraft({close:true}))return;
 selectedProjectId=project.id;ui.projectView="detail";ui.showArchivedProjects=!!project.archived;ui.projectTaskQuery="";ui.projectAttentionFilter="all";ui.projectMilestoneFilter="all";ui.projectOverviewFilter=isDone(taskById(taskId))?"done":"open";ui.projectFocusTaskId=taskId;ui.projectReturnTaskId=taskId;
 navigate("projects",project.id);
}
function createRelatedTask(){
 collectTaskDraft();if(!taskDraft.title)return toast("请先填写当前事项名称");
 let source=clone(taskDraft),now=new Date().toISOString(),related=normalizeTask({id:uid("task"),title:"新的关联事项",status:"待处理",priority:"P1",type:"任务",project:source.project,milestone:source.milestone,relatedTaskIds:[source.id],createdAt:now,updatedAt:now});source.relatedTaskIds=[...new Set([...(source.relatedTaskIds||[]),related.id])];
 commit("新建关联事项",draft=>{let index=draft.tasks.findIndex(task=>task.id===source.id);if(index>=0)draft.tasks[index]=source;else draft.tasks.unshift(source);draft.tasks.forEach(task=>{if(task.id===source.id||task.id===related.id)return;let links=new Set(task.relatedTaskIds||[]);source.relatedTaskIds.includes(task.id)?links.add(source.id):links.delete(source.id);task.relatedTaskIds=Array.from(links)});draft.tasks.unshift(related)},{immediate:true});
 closeDialog("taskDialog");renderNow();openTask(related.id);toast("已保存当前事项并创建关联事项");
}


function openTaskObsidian(){
 let value=$("#taskObsidianUri")?.value.trim()||"",url;
 try{url=validObsidianUri(value);if(!url)throw Error()}catch{return toast("请粘贴 Obsidian 中复制的笔记链接")}
 if(url.protocol!=="obsidian:"||url.hostname!=="open"||(!url.searchParams.get("file")&&!url.searchParams.get("path")))return toast("请使用 obsidian://open 格式的笔记链接");
 if(!persistTaskDraft({notify:true}))return;
 window.location.href=url.href;
}
async function uploadTaskFiles(files){
 if(!files.length||!taskDraft||!$("#taskDialog")?.open)return;
 if(!Cloud.user||!Cloud.client)return toast("附件需要登录云端后上传");
 if(!persistTaskDraft({notify:true}))return;
 return enqueueTaskUploads(taskDraft.id,files);
}
function taskFileDrag(event){return Array.from(event.dataTransfer?.types||[]).includes("Files")}
function clearTaskFileDrop(){ $("#taskDialog")?.classList.remove("file-drag-over") }
document.addEventListener("dragover",event=>{
 if(!$("#taskDialog")?.open||!taskFileDrag(event)||richImageFileDrop(event))return;
 event.preventDefault();event.stopImmediatePropagation();
 let inside=!!event.target.closest?.("#taskDialog");
 $("#taskDialog").classList.toggle("file-drag-over",inside);event.dataTransfer.dropEffect=inside?"copy":"none";
},true);
document.addEventListener("dragleave",event=>{if(!event.relatedTarget||!$("#taskDialog")?.contains(event.relatedTarget))clearTaskFileDrop()},true);
document.addEventListener("drop",event=>{
 if(!$("#taskDialog")?.open||!taskFileDrag(event)||richImageFileDrop(event))return;
 event.preventDefault();event.stopImmediatePropagation();clearTaskFileDrop();
 if(event.target.closest?.("#taskDialog"))void uploadTaskFiles(Array.from(event.dataTransfer.files||[]));
},true);
document.addEventListener("dragend",clearTaskFileDrop);

function validObsidianUri(value){try{let url=new URL(String(value).trim());return url.protocol==='obsidian:'&&url.hostname==='open'&&(url.searchParams.get('file')||url.searchParams.get('path'))?url:null}catch{return null}}
function obsidianName(value){let url=validObsidianUri(value);return url?(url.searchParams.get('file')||url.searchParams.get('path')).split(/[\\/]/).pop().replace(/\.md$/i,''):'关联 OB 笔记'}
function obsidianSummary(value){let valid=validObsidianUri(value);return (valid?'<button class="link-btn" type="button" data-open-obsidian title="'+esc(value)+'">'+esc(obsidianName(value))+' ↗</button>':'')+'<button class="link-btn" type="button" data-edit-obsidian>'+(valid?'更换':'关联 OB 笔记')+'</button>'+(value?'<button class="link-btn" type="button" data-clear-obsidian>移除</button>':'')}
function obsidianLinkMarkup(task){return '<div class="obsidian-heading"><label>备注与关键结论</label><div class="obsidian-summary" id="obsidianSummary">'+obsidianSummary(task.obsidianUri)+'</div></div><div class="obsidian-editor" id="obsidianEditor" hidden><input id="taskObsidianUri" aria-label="Obsidian 笔记链接" value="'+esc(task.obsidianUri)+'" placeholder="obsidian://open?vault=…&amp;file=…"><small>在 Obsidian 笔记菜单中复制 Obsidian 链接。多台电脑使用相同库名和相对路径；改名或移动笔记后请更换链接。仅打开笔记，不同步正文。</small><button class="btn" type="button" data-save-obsidian>保存关联</button></div>'}
function refreshObsidianLink(){let summary=$('#obsidianSummary');if(summary)summary.innerHTML=obsidianSummary($('#taskObsidianUri')?.value||'')}
