function decisionProjectOptions(selected){return'<option value="">暂不关联项目</option>'+state.projects.filter(project=>!project.archived||project.id===selected).map(project=>'<option value="'+project.id+'" '+(selected===project.id?"selected":"")+'>'+esc(project.name)+(project.archived?'（已归档）':'')+'</option>').join("")}
function decisionSourceOptions(selected){return'<option value="">不关联来源任务</option>'+state.tasks.filter(task=>!task.archived).map(task=>'<option value="'+task.id+'" '+(selected===task.id?"selected":"")+'>'+esc(task.title)+'</option>').join("")}
function openDecision(id,prefill={}){
 let existing=id?decisionById(id):null,source=prefill.sourceTaskId?taskById(prefill.sourceTaskId):null;
 decisionDraft=normalizeDecision(existing?clone(existing):{id:uid("decision"),title:"",...prefill,project:source?.project||prefill.project||"",milestone:source?.milestone||prefill.milestone||"",sourceTaskId:source?.id||prefill.sourceTaskId||"",date:todayKey()});
 $("#decisionDialogTitle").textContent=existing?"编辑关键决策":"记录关键决策";$("#deleteDecisionButton").hidden=!existing;renderDecisionEditor();showDialog($("#decisionDialog"));requestAnimationFrame(()=>$("#decisionTitle")?.focus());
}
function renderDecisionEditor(){
 $("#decisionTitle").value=decisionDraft.title;$("#decisionProject").innerHTML=decisionProjectOptions(decisionDraft.project);$("#decisionMilestone").innerHTML=milestoneOptions(decisionDraft.project,decisionDraft.milestone);$("#decisionDate").value=decisionDraft.date||todayKey();$("#decisionSourceTask").innerHTML=decisionSourceOptions(decisionDraft.sourceTaskId);$("#decisionConclusionField").innerHTML='<label>最终结论</label>'+resizableRichBox("decisionConclusionHeight",toolbar()+'<div class="rich-editor" id="decisionConclusion" contenteditable="true" data-placeholder="最终采用什么方案？">'+decisionDraft.conclusion+'</div>',"decision-rich-box");$("#decisionRationaleField").innerHTML='<label>背景与依据</label>'+resizableRichBox("decisionRationaleHeight",toolbar()+'<div class="rich-editor" id="decisionRationale" contenteditable="true" data-placeholder="为什么这样决定；有哪些约束、取舍或风险？">'+decisionDraft.rationale+'</div>',"decision-rich-box");
 initQuillEditors($("#decisionForm"));
 enhanceHoverSelects($("#decisionForm"));syncHoverSelect($("#decisionProject"));syncHoverSelect($("#decisionMilestone"));syncHoverSelect($("#decisionSourceTask"));
}
function collectDecisionDraft(){decisionDraft.title=$("#decisionTitle").value.trim();decisionDraft.project=$("#decisionProject").value;decisionDraft.milestone=$("#decisionMilestone").value;decisionDraft.date=$("#decisionDate").value||todayKey();decisionDraft.sourceTaskId=$("#decisionSourceTask").value;decisionDraft.conclusion=serializeRichEditor($("#decisionConclusion"));decisionDraft.rationale=serializeRichEditor($("#decisionRationale"));decisionDraft.updatedAt=new Date().toISOString()}
function saveDecisionDraft(){collectDecisionDraft();if(!decisionDraft.title)return toast("请填写决策标题");let existing=decisionById(decisionDraft.id);commit(existing?"编辑关键决策":"记录关键决策",draft=>{let saved=clone(decisionDraft),index=draft.decisions.findIndex(item=>item.id===saved.id);if(index>=0)draft.decisions[index]=saved;else draft.decisions.unshift(saved)},{immediate:true});closeDialog("decisionDialog");if($("#taskDialog").open&&taskDraft)$("#taskDecisionList").innerHTML=taskDecisionMarkup();if($("#projectDialog").open&&projectDraft)renderProjectEditor();toast(existing?"决策已保存":"关键决策已记录")}
function deleteDecision(id){let decision=decisionById(id);if(!decision)return;confirmAction("删除关键决策？","记录会进入回收站，可在“数据与恢复”中找回。",()=>{commit("删除关键决策",draft=>{draft.trash.unshift({id:uid("trash"),type:"decision",deletedAt:new Date().toISOString(),data:clone(decision)});draft.decisions=draft.decisions.filter(item=>item.id!==id)},{immediate:true});closeDialog("decisionDialog");if($("#taskDialog").open&&taskDraft)$("#taskDecisionList").innerHTML=taskDecisionMarkup();if($("#projectDialog").open&&projectDraft)renderProjectEditor();toast("关键决策已移入回收站")},"删除")}
function deleteTask(id){
 let task=taskById(id);if(!task)return;
 confirmAction("删除事项？","事项会进入回收站，可在“数据与恢复”中找回；已形成的关键决策会保留。",()=>{commit("删除事项",draft=>{let decisionLinks=draft.decisions.filter(decision=>decision.sourceTaskId===id).map(decision=>decision.id);draft.trash.unshift({id:uid("trash"),type:"task",deletedAt:new Date().toISOString(),data:clone(task),decisionLinks});draft.tasks=draft.tasks.filter(item=>item.id!==id);draft.tasks.forEach(item=>item.relatedTaskIds=item.relatedTaskIds.filter(link=>link!==id));draft.decisions.forEach(decision=>{if(decision.sourceTaskId===id)decision.sourceTaskId=""})},{immediate:true});closeDialog("taskDialog");toast("事项已移入回收站")},"删除");
}
function quickNoteToTask(){let editor=$("[data-quick-note]"),quill=quillFor(editor),range=quill?.getSelection(true);if(!quill||!range)return toast("请先把光标放在速记内容中");let text="";if(range.length)text=quill.getText(range.index,range.length).trim();else{let line=quill.getLine(range.index)?.[0];if(line){let index=quill.getIndex(line);text=quill.getText(index,Math.max(0,line.length()-1)).trim()}}if(!text)return toast("当前没有可转换的内容");let title=text.replace(/\s*\n\s*/g," / ").trim(),id=uid("task");commit("速记转为事项",draft=>{draft.tasks.unshift(normalizeTask({id,title,status:"待处理",priority:"P1",inbox:true,focus:false,week:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));draft.order.inbox=[id,...(draft.order.inbox||[]).filter(value=>value!==id)]},{immediate:true});toast("已转为待处理事项")}
function toggleQuickNoteLine(block){let editor=block?.closest?.("[data-quick-note]"),quill=quillFor(editor),blot=typeof Quill==="function"?Quill.find(block):null;if(!quill||!blot)return;let index=quill.getIndex(blot),done=quill.getFormat(index,1).quickDone==="1";quill.formatLine(index,1,"quickDone",done?"0":"1","user")}
function openProject(id){
 let existing=id?projectById(id):null;projectDraftIsNew=!existing;projectTemplateMode=existing?"custom":"hardware";projectDraft=normalizeProject(existing?clone(existing):{id:uid("project"),name:"",milestones:hardwareMilestoneTemplate()});
 projectPanelTab="tasks";projectMilestoneIndex=Math.max(0,projectDraft.milestones.findIndex(item=>item.status==="当前阶段"));$("#projectDialogTitle").textContent=existing?"项目设置":"新增项目";$("#deleteProjectButton").hidden=!existing;$("#archiveProjectButton").hidden=!existing;$("#archiveProjectButton").textContent=existing?.archived?"恢复项目":"归档项目";renderProjectEditor();showDialog($("#projectDialog"));
}
function renderProjectEditor(){
 if(projectDraft.milestones.length)projectMilestoneIndex=Math.min(projectMilestoneIndex,projectDraft.milestones.length-1);else projectMilestoneIndex=0;
 let nav=projectDraft.milestones.map((item,index)=>'<button class="milestone-nav '+(index===projectMilestoneIndex?"active":"")+'" type="button" data-select-mile="'+index+'"><span class="milestone-index">'+(index+1)+'</span><span><b>'+esc(item.name||"未命名里程碑")+'</b><small>'+esc(item.status)+' · '+dateShort(item.due)+'</small></span><span>›</span></button>').join("");
 let item=projectDraft.milestones[projectMilestoneIndex],detail=item?'<section class="milestone-detail"><div class="milestone-detail-head"><div><div class="eyebrow">MILESTONE '+(projectMilestoneIndex+1)+'</div><h3 style="margin:0">编辑里程碑</h3></div><button class="btn danger" type="button" data-remove-current-mile>删除里程碑</button></div><div class="form-grid"><div class="field"><label>里程碑名称</label><input id="milestoneName" value="'+esc(item.name)+'"></div><div class="field"><label>目标日期</label><input id="milestoneDue" type="date" value="'+esc(item.due)+'"></div><div class="field full"><label>阶段状态</label><div class="status-choice">'+["未开始","当前阶段","阻塞","已完成"].map(value=>'<button type="button" data-mile-state="'+value+'" class="'+(item.status===value?"active":"")+'">'+value+'</button>').join("")+'</div></div><div class="field full"><label>完成标准</label><textarea id="milestoneCriteria" rows="7" placeholder="明确本阶段何时才算完成">'+esc(item.criteria)+'</textarea></div></div></section>':'<section class="milestone-detail"><div class="empty">点击“新增里程碑”开始规划项目阶段。</div></section>';
 let linkedTasks=item?state.tasks.filter(task=>!task.archived&&task.project===projectDraft.id&&task.milestone===item.id):[];
 let taskRows=linkedTasks.map(task=>'<article class="milestone-task-row"><button class="milestone-task-link" type="button" data-open-task="'+esc(task.id)+'">'+esc(task.title)+'</button><p>'+esc(task.nextAction||"尚未填写下一步动作")+'</p><div class="milestone-task-meta"><span class="pill status-'+esc(task.status)+'">'+esc(task.status)+'</span><span class="pill priority-'+esc(task.priority)+'">'+esc(task.priority)+'</span><time>'+(isDone(task)?"完成 "+dateShort(task.completed):"截止 "+dateShort(task.due))+'</time></div></article>').join("");
 let projectDecisions=state.decisions.filter(decision=>!decision.archived&&decision.project===projectDraft.id),decisionRowsHtml=decisionRows(projectDecisions,"该项目尚未记录关键决策");
 let panelTabs='<div class="panel-tabs"><button type="button" data-project-panel="tasks" class="'+(projectPanelTab==="tasks"?"active":"")+'">里程碑事项 · '+linkedTasks.length+'</button><button type="button" data-project-panel="decisions" class="'+(projectPanelTab==="decisions"?"active":"")+'">关键决策 · '+projectDecisions.length+'</button></div>';
 let canRecordDecision=!!projectById(projectDraft.id),taskPanel='<aside class="milestone-task-panel"><div class="milestone-task-head">'+panelTabs+'<div><b>'+(projectPanelTab==="tasks"?'里程碑相关事项':'项目关键决策')+'</b>'+(projectPanelTab==="decisions"?'<button class="link-btn" type="button" data-new-decision data-project="'+projectDraft.id+'" data-milestone="'+(item?.id||"")+'" '+(canRecordDecision?'':'disabled data-tip="请先保存项目"')+'>＋ 记录</button>':'<span class="pill">'+linkedTasks.length+' 项</span>')+'</div><p>'+(projectPanelTab==="tasks"?(item?'仅显示关联“'+esc(item.name)+'”的事项':'选择里程碑后显示关联事项'):'决策可关联当前里程碑和来源任务')+'</p></div><div class="milestone-task-list">'+(projectPanelTab==="tasks"?(taskRows||'<div class="empty">当前里程碑暂无关联事项。<br>可在事项编辑页选择所属里程碑。</div>'):'<div class="decision-list">'+decisionRowsHtml+'</div>')+'</div></aside>';
 let templateField=projectDraftIsNew?'<div class="field full"><label>里程碑模板</label><select id="projectTemplate"><option value="hardware" '+(projectTemplateMode==="hardware"?"selected":"")+'>智能硬件标准流程</option><option value="blank" '+(projectTemplateMode==="blank"?"selected":"")+'>空白项目</option></select><small class="muted">默认生成需求冻结、方案设计、EVT、DVT / 认证、小批量试产和量产，可继续逐项修改。</small></div>':"";
 let basic='<section class="project-basic"><div class="form-grid"><div class="field"><label>项目名称</label><input id="projectName" value="'+esc(projectDraft.name)+'" required></div><div class="field"><label>项目编号</label><input id="projectCode" value="'+esc(projectDraft.code)+'"></div><div class="field full"><label>项目说明</label><textarea id="projectDescription" rows="3">'+esc(projectDraft.description)+'</textarea></div>'+templateField+'</div></section>';
 let milestoneSidebar='<aside class="milestone-sidebar"><div class="milestone-sidebar-head"><div><b>项目里程碑</b><div class="muted" style="font-size:10px">选择阶段并集中编辑</div></div><button class="btn" type="button" data-add-mile>＋ 新增</button></div><div class="milestone-list">'+(nav||'<div class="empty">暂无里程碑。</div>')+'</div></aside>';
 $("#projectEditor").innerHTML='<div class="project-settings"><div class="project-workspace"><div class="project-left-stack">'+basic+milestoneSidebar+'</div>'+detail+taskPanel+'</div></div>';
 enhanceHoverSelects($("#projectEditor"));
}
function collectProjectDraft(){
 let name=$("#projectName"),code=$("#projectCode"),description=$("#projectDescription");if(name)projectDraft.name=name.value.trim();if(code)projectDraft.code=code.value.trim();if(description)projectDraft.description=description.value;
 let item=projectDraft.milestones[projectMilestoneIndex];if(item){let mileName=$("#milestoneName"),due=$("#milestoneDue"),criteria=$("#milestoneCriteria");if(mileName)item.name=mileName.value.trim();if(due)item.due=due.value;if(criteria)item.criteria=criteria.value}projectDraft.updatedAt=new Date().toISOString();
}
function saveProjectDraft(){
 collectProjectDraft();if(!projectDraft.name)return toast("请填写项目名称");
 let existing=projectById(projectDraft.id),saved=normalizeProject(projectDraft),validMilestones=new Set(saved.milestones.map(item=>item.id));projectDraft=clone(saved);commit(existing?"编辑项目":"新增项目",draft=>{let index=draft.projects.findIndex(item=>item.id===saved.id);if(index>=0)draft.projects[index]=clone(saved);else{draft.projects.push(clone(saved));draft.order.projects.push(saved.id)}draft.tasks.forEach(task=>{if(task.project===saved.id&&task.milestone&&!validMilestones.has(task.milestone)){task.milestone="";task.updatedAt=new Date().toISOString()}});draft.decisions.forEach(decision=>{if(decision.project===saved.id&&decision.milestone&&!validMilestones.has(decision.milestone)){decision.milestone="";decision.updatedAt=new Date().toISOString()}})},{immediate:true});selectedProjectId=saved.id;closeDialog("projectDialog");renderNow();toast("项目已保存");
}
function archiveProject(id){
 let project=projectById(id);if(!project)return;if(project.archived){commit("恢复项目",draft=>draft.projects.find(value=>value.id===id).archived=false,{immediate:true});closeDialog("projectDialog");return}confirmAction("归档项目？","项目事项仍会保留，但项目不再出现在日常项目视图。",()=>{commit("归档项目",draft=>{let item=draft.projects.find(value=>value.id===id);item.archived=true;draft.favorites=draft.favorites.filter(value=>value!==id)},{immediate:true});closeDialog("projectDialog")},"归档");
}
function deleteProject(id){
 let project=projectById(id);if(!project)return;
 confirmTwice("删除项目？","项目会进入回收站；关联任务和关键决策会保留，但会解除项目及里程碑关联。",()=>{
  commit("删除项目",draft=>{
   let links=draft.tasks.filter(task=>task.project===id).map(task=>({id:task.id,milestone:task.milestone||""})),decisionLinks=draft.decisions.filter(decision=>decision.project===id).map(decision=>({id:decision.id,milestone:decision.milestone||""}));
   draft.trash.unshift({id:uid("trash"),type:"project",deletedAt:new Date().toISOString(),data:clone(project),links,decisionLinks});
   draft.projects=draft.projects.filter(item=>item.id!==id);draft.order.projects=draft.order.projects.filter(value=>value!==id);draft.favorites=draft.favorites.filter(value=>value!==id);
   draft.tasks.forEach(task=>{if(task.project===id){task.project="";task.milestone="";task.updatedAt=new Date().toISOString()}});
   draft.decisions.forEach(decision=>{if(decision.project===id){decision.project="";decision.milestone=""}});
  },{immediate:true});
  if(selectedProjectId===id)selectedProjectId="";closeDialog("projectDialog");toast("项目已移入回收站");
 },"确认删除");
}
function createMemo(){
 let memo=normalizeMemo({id:uid("memo"),title:"新备忘录"});commit("新增备忘录",draft=>{draft.memos.unshift(memo);draft.order.memoActive.unshift(memo.id)},{immediate:true});selectedMemoId=memo.id;memoArchived=false;navigate("memos");
}
function moveMemosToTrash(ids,label="删除备忘录"){
 let selected=new Set(ids);if(!selected.size)return;
 commit(label,draft=>{draft.memos.filter(memo=>selected.has(memo.id)).forEach(memo=>draft.trash.unshift({id:uid("trash"),type:"memo",deletedAt:new Date().toISOString(),data:clone(memo)}));draft.memos=draft.memos.filter(memo=>!selected.has(memo.id));draft.order.memoActive=draft.order.memoActive.filter(id=>!selected.has(id));draft.order.memoArchived=draft.order.memoArchived.filter(id=>!selected.has(id))},{immediate:true});
 if(selected.has(selectedMemoId))selectedMemoId="";
}
function deleteMemo(id){
 let memo=memoById(id);if(!memo)return;confirmAction("删除备忘录？","备忘录会进入回收站，可稍后恢复。",()=>moveMemosToTrash([id]),"删除");
}
function memoToTask(id){let memo=memoById(id);if(!memo)return;openTask("",{title:memo.title,nextAction:"根据备忘录内容明确下一步",notes:memo.content,project:memo.project,status:"待处理",inbox:true})}
function exportData(){
 let blob=new Blob([JSON.stringify({product:"工作台",formatVersion:8,exportedAt:new Date().toISOString(),...snapshotCore()},null,2)],{type:"application/json"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="工作台-"+todayKey()+".json";link.click();URL.revokeObjectURL(link.href);toast("JSON 已导出");
}
function importFile(file){
 let reader=new FileReader();reader.onload=()=>{try{let data=JSON.parse(reader.result);if(!data||!Array.isArray(data.tasks)||!Array.isArray(data.projects))throw new Error("缺少事项或项目数据");confirmAction("导入这份 JSON？","当前数据会先创建安全快照，导入后不会直接覆盖云端。",()=>{let backup=createSnapshot("导入 JSON 前的安全快照"),next=normalizeState(data);next.snapshots=[backup,...next.snapshots].slice(0,12);replaceState(next,"导入 JSON");Cloud.importPending=true;toast("JSON 已导入本机；云端尚未覆盖")},"导入")}catch(error){toast("导入失败："+error.message)}};reader.readAsText(file);
}
function uniqueRestoreId(items,id,prefix){return items.some(item=>item.id===id)?uid(prefix):id}
function restoreTrash(id){
 let entry=state.trash.find(item=>item.id===id);if(!entry)return;
 commit("恢复回收站内容",draft=>{
  if(entry.type==="task"){let task=normalizeTask(entry.data);task.id=uniqueRestoreId(draft.tasks,task.id,"task");task.relatedTaskIds=[...new Set(task.relatedTaskIds.filter(link=>draft.tasks.some(item=>item.id===link)))];draft.tasks.push(task);draft.tasks.forEach(item=>{if(task.relatedTaskIds.includes(item.id)&&!item.relatedTaskIds.includes(task.id))item.relatedTaskIds.push(task.id)});(entry.decisionLinks||[]).forEach(decisionId=>{let decision=draft.decisions.find(item=>item.id===decisionId);if(decision&&!decision.sourceTaskId)decision.sourceTaskId=task.id})}
  else if(entry.type==="project"){let project=normalizeProject(entry.data);project.id=uniqueRestoreId(draft.projects,project.id,"project");draft.projects.push(project);draft.order.projects.push(project.id);let milestones=new Set(project.milestones.map(item=>item.id));(entry.links||[]).forEach(link=>{let task=draft.tasks.find(item=>item.id===link.id);if(task&&!task.project){task.project=project.id;task.milestone=milestones.has(link.milestone)?link.milestone:""}});(entry.decisionLinks||[]).forEach(link=>{let decision=draft.decisions.find(item=>item.id===link.id);if(decision&&!decision.project){decision.project=project.id;decision.milestone=milestones.has(link.milestone)?link.milestone:""}})}
  else if(entry.type==="memo"){let memo=normalizeMemo(entry.data);memo.id=uniqueRestoreId(draft.memos,memo.id,"memo");draft.memos.push(memo)}
  else if(entry.type==="decision"){let decision=normalizeDecision(entry.data);decision.id=uniqueRestoreId(draft.decisions,decision.id,"decision");draft.decisions.push(decision)}
  draft.trash=draft.trash.filter(item=>item.id!==id)
 },{immediate:true});toast("已恢复");
}
function restoreSnapshot(id){
 let item=state.snapshots.find(value=>value.id===id);if(!item)return;confirmAction("恢复快照？","当前数据会先再生成一份快照，然后恢复所选版本。",()=>{let current=snapshotCore();replaceState(item.state,"恢复快照");state.snapshots.unshift({id:uid("snapshot"),label:"恢复前的安全快照",createdAt:new Date().toISOString(),state:current});saveLocal(true)},"恢复");
}
