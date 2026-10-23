let projectInitialSignature="",projectSettingsTab="basic";
function projectSignature(){let {updatedAt,...value}=projectDraft;return JSON.stringify(value)}
function requestProjectClose(){collectProjectDraft();if(projectSignature()===projectInitialSignature)return closeDialog("projectDialog");confirmAction("放弃未保存的项目修改？","如需保留，请取消并点击保存项目。",()=>closeDialog("projectDialog"),"放弃修改")}
function removeCurrentMilestone(){
 collectProjectDraft();let item=projectDraft.milestones[projectMilestoneIndex];if(!item)return;
 let count=state.tasks.filter(t=>t.project===projectDraft.id&&t.milestone===item.id).length+state.decisions.filter(d=>d.project===projectDraft.id&&d.milestone===item.id).length;
 confirmAction("删除里程碑？","关联 "+count+" 项任务或决策；保存项目后会解除这些关联，记录本身保留。",()=>{projectDraft.milestones.splice(projectMilestoneIndex,1);projectMilestoneIndex=Math.max(0,projectMilestoneIndex-1);renderProjectEditor()},"删除里程碑");
}
function openProject(id,options={}){
 let existing=id?projectById(id):null;projectDraftIsNew=!existing;projectTemplateMode=existing?"custom":"hardware";
 projectDraft=normalizeProject(existing?clone(existing):{id:uid("project"),name:"",milestones:hardwareMilestoneTemplate()});if(!existing)projectDraft.name="";
 projectInitialSignature=projectSignature();projectPanelTab="tasks";projectSettingsTab=["basic","milestones","records"].includes(options.tab)?options.tab:"basic";
 let requested=projectDraft.milestones.findIndex(item=>item.id===options.milestoneId),current=projectDraft.milestones.findIndex(item=>item.status==="当前阶段");
 projectMilestoneIndex=Math.max(0,requested>=0?requested:current);
 $("#projectDialogTitle").textContent=existing?"项目设置":"新增项目";
 $("#deleteProjectButton").hidden=!existing;$("#archiveProjectButton").hidden=!existing;$("#projectMaintenance").hidden=!existing;
 $("#archiveProjectButton").textContent=existing?.archived?"恢复项目":"归档项目";
 renderProjectEditor();showDialog($("#projectDialog"));$("#projectMaintenance").open=false;
}
function projectSettingsTabs(){
 let tabs=[["basic","基本信息"],["milestones","里程碑"],["records","关联记录"]];
 return '<nav class="project-settings-tabs" role="tablist" aria-label="项目设置分区">'+tabs.map(([key,label])=>'<button type="button" id="projectSettingsTab-'+key+'" role="tab" data-project-settings-tab="'+key+'" aria-selected="'+(projectSettingsTab===key)+'" aria-controls="projectSettingsPanel-'+key+'" tabindex="'+(projectSettingsTab===key?0:-1)+'">'+label+'</button>').join('')+'</nav>';
}
function projectBasicMarkup(){
 let template=projectDraftIsNew?'<div class="field full"><label for="projectTemplate">里程碑模板</label><select id="projectTemplate"><option value="hardware" '+(projectTemplateMode==="hardware"?"selected":"")+'>智能硬件标准流程</option><option value="blank" '+(projectTemplateMode==="blank"?"selected":"")+'>空白项目</option></select><small class="field-hint">默认生成需求冻结、方案设计、EVT、DVT / 认证、小批量试产和量产，可逐项修改。</small></div>':'';
 return '<section class="project-basic"><div class="project-settings-section-head"><h3>基本信息</h3><p>说明项目是什么，以及希望交付的结果。</p></div><div class="form-grid"><div class="field"><label for="projectName">项目名称</label><input id="projectName" name="projectTitle" autocomplete="off" value="'+esc(projectDraft.name)+'" placeholder="例如：激光靶系统" required></div><div class="field"><label for="projectCode">项目编号 <small>可选</small></label><input id="projectCode" name="projectCode" autocomplete="off" value="'+esc(projectDraft.code)+'" placeholder="例如：95-1"></div><div class="field full"><label for="projectDescription">项目说明 <small>可选</small></label><textarea id="projectDescription" rows="5" placeholder="项目目标、范围和必要背景">'+esc(projectDraft.description)+'</textarea></div>'+template+'</div></section>';
}
function projectMilestonesMarkup(){
 let nav=projectDraft.milestones.map((item,index)=>'<button class="milestone-nav '+(index===projectMilestoneIndex?"active":"")+'" type="button" data-select-mile="'+index+'" aria-pressed="'+(index===projectMilestoneIndex)+'"><span class="milestone-index">'+(index+1)+'</span><span><b>'+esc(item.name||"未命名里程碑")+'</b><small>'+esc(item.status)+' · '+dateShort(item.due)+'</small></span><span aria-hidden="true">›</span></button>').join("");
 let item=projectDraft.milestones[projectMilestoneIndex],linked=item?state.tasks.filter(task=>!task.archived&&task.project===projectDraft.id&&task.milestone===item.id).length:0;
 let detail=item?'<section class="milestone-detail"><div class="milestone-detail-head"><div><p class="eyebrow">阶段 '+(projectMilestoneIndex+1)+' / '+projectDraft.milestones.length+'</p><h3>阶段内容与验收</h3></div><button class="link-btn milestone-remove" type="button" data-remove-current-mile>删除阶段</button></div><div class="form-grid"><div class="field"><label for="milestoneName">里程碑名称</label><input id="milestoneName" name="milestoneTitle" autocomplete="off" value="'+esc(item.name)+'"></div><div class="field"><label for="milestoneDue">目标日期 <small>可选</small></label><input id="milestoneDue" type="date" value="'+esc(item.due)+'"></div><div class="field full"><label id="milestoneStatusLabel">阶段状态</label><div class="status-choice" role="group" aria-labelledby="milestoneStatusLabel">'+["未开始","当前阶段","阻塞","已完成"].map(value=>'<button type="button" data-mile-state="'+value+'" aria-pressed="'+(item.status===value)+'" class="'+(item.status===value?"active":"")+'">'+value+'</button>').join("")+'</div><p class="field-hint">设为“当前阶段”后，会显示在项目详情顶部；同一项目只保留一个当前阶段。</p></div><div class="field full"><label for="milestoneCriteria">验收条件</label><textarea id="milestoneCriteria" rows="5" placeholder="明确本阶段何时才算完成">'+esc(item.criteria)+'</textarea></div></div><div class="milestone-linked-summary"><span>关联事项 '+linked+' 项</span><button type="button" class="link-btn" data-project-settings-tab="records">查看关联记录 →</button></div></section>':'<section class="milestone-detail"><div class="empty"><p>还没有里程碑</p><button type="button" class="btn" data-add-mile>＋ 新增里程碑</button></div></section>';
 let sidebar='<aside class="milestone-sidebar"><div class="milestone-sidebar-head"><b>项目里程碑</b><button class="btn" type="button" data-add-mile>＋ 新增</button></div><div class="milestone-list">'+(nav||'<p class="muted">按实际阶段添加即可。</p>')+'</div></aside>';
 return '<div class="project-workspace">'+sidebar+detail+'</div>';
}
function projectRecordsMarkup(){
 let item=projectDraft.milestones[projectMilestoneIndex],linkedTasks=state.tasks.filter(task=>!task.archived&&task.project===projectDraft.id&&(item?task.milestone===item.id:!task.milestone));
 let taskRows=linkedTasks.map(task=>'<article class="milestone-task-row"><button class="milestone-task-link" type="button" data-open-task="'+esc(task.id)+'">'+esc(task.title)+'</button><p>'+esc(task.nextAction||"尚未填写下一步动作")+'</p><div class="milestone-task-meta"><span class="pill status-'+esc(task.status)+'">'+esc(task.status)+'</span><span class="pill priority-'+esc(task.priority)+'">'+esc(task.priority)+'</span><time>'+(isDone(task)?"完成 "+dateShort(task.completed):task.due?"截止 "+dateShort(task.due):"未设截止日期")+'</time></div></article>').join("");
 let projectDecisions=state.decisions.filter(decision=>!decision.archived&&decision.project===projectDraft.id),decisionRowsHtml=decisionRows(projectDecisions,"该项目尚未记录关键决策");
 let panelTabs='<div class="panel-tabs" role="group" aria-label="关联记录类型"><button type="button" data-project-panel="tasks" aria-pressed="'+(projectPanelTab==="tasks")+'" class="'+(projectPanelTab==="tasks"?"active":"")+'">里程碑事项 · '+linkedTasks.length+'</button><button type="button" data-project-panel="decisions" aria-pressed="'+(projectPanelTab==="decisions")+'" class="'+(projectPanelTab==="decisions"?"active":"")+'">项目决策 · '+projectDecisions.length+'</button></div>';
 let savedProject=projectById(projectDraft.id),canRecordDecision=!!savedProject&&(!item||savedProject.milestones.some(milestone=>milestone.id===item.id)),recordAction=projectPanelTab==="decisions"?'<button class="btn" type="button" data-new-decision data-project="'+esc(projectDraft.id)+'" data-milestone="'+esc(item?.id||"")+'" '+(canRecordDecision?'':'disabled title="请先保存项目和当前里程碑"')+'>＋ 记录决策</button>':'<button class="link-btn" type="button" data-project-settings-tab="milestones">切换里程碑 →</button>';
 return '<aside class="milestone-task-panel"><div class="milestone-task-head">'+panelTabs+'<div><h3>'+(projectPanelTab==="tasks"?(item?esc(item.name):"未关联里程碑的事项"):"项目全部关键决策")+'</h3>'+recordAction+'</div><p>'+(projectPanelTab==="tasks"?(item?"仅展示所选里程碑的未归档事项；点击名称打开详情。":"展示本项目尚未关联里程碑的事项；点击名称打开详情。"):"决策可关联里程碑和来源任务，不改变任务状态。")+'</p></div><div class="milestone-task-list">'+(projectPanelTab==="tasks"?(taskRows||'<div class="empty">当前没有关联事项，可在事项详情中选择里程碑。</div>'):'<div class="decision-list">'+decisionRowsHtml+'</div>')+'</div></aside>';
}
function renderProjectEditor(){
 closeHoverSelect();
 let editor=$("#projectEditor"),scroll=editor.scrollTop,navScroll=$(".milestone-list",editor)?.scrollTop||0,focused=document.activeElement?.id;
 projectMilestoneIndex=projectDraft.milestones.length?Math.min(projectMilestoneIndex,projectDraft.milestones.length-1):0;
 let panel=(key,markup)=>'<section id="projectSettingsPanel-'+key+'" role="tabpanel" aria-labelledby="projectSettingsTab-'+key+'" '+(projectSettingsTab===key?'':'hidden')+'>'+markup+'</section>';
 editor.innerHTML='<div class="project-settings">'+projectSettingsTabs()+panel('basic',projectBasicMarkup())+panel('milestones',projectMilestonesMarkup())+panel('records',projectRecordsMarkup())+'</div>';
 enhanceHoverSelects(editor);editor.scrollTop=scroll;let navList=$(".milestone-list",editor);if(navList)navList.scrollTop=navScroll;if(focused)document.getElementById(focused)?.focus({preventScroll:true});syncProjectDirtyStatus();
}
function changeProjectSettingsTab(key){
 if(!["basic","milestones","records"].includes(key))return;
 collectProjectDraft();projectSettingsTab=key;renderProjectEditor();$("#projectEditor").scrollTop=0;
}
function changeProjectTemplate(value){
 collectProjectDraft();let previous=projectTemplateMode;if(value===previous)return;
 let apply=()=>{projectTemplateMode=value;projectDraft.milestones=value==="hardware"?hardwareMilestoneTemplate():[];projectMilestoneIndex=0;renderProjectEditor()};
 if(projectDraft.milestones.length){$("#projectTemplate").value=previous;syncHoverSelect($("#projectTemplate"));confirmAction("替换里程碑模板？","当前草稿中的阶段名称、日期和验收条件将被替换。",apply,"替换模板")}else apply();
}
function collectProjectDraft(){
 if(!projectDraft)return;
 let name=$("#projectName"),code=$("#projectCode"),description=$("#projectDescription");
 if(name)projectDraft.name=name.value.trim();if(code)projectDraft.code=code.value.trim();if(description)projectDraft.description=description.value;
 let item=projectDraft.milestones[projectMilestoneIndex];if(item){let mileName=$("#milestoneName"),due=$("#milestoneDue"),criteria=$("#milestoneCriteria");if(mileName)item.name=mileName.value.trim();if(due)item.due=due.value;if(criteria)item.criteria=criteria.value}projectDraft.updatedAt=new Date().toISOString();
}
function syncProjectDirtyStatus(){
 let label=$("#projectSaveStatus");if(label)label.textContent=projectSignature()!==projectInitialSignature?"有未保存修改":"修改后点击保存项目";
}
function saveProjectDraft(){
 collectProjectDraft();
 if(!projectDraft.name){projectSettingsTab="basic";renderProjectEditor();$("#projectName").focus();toast("请填写项目名称");return false}
 let unnamed=projectDraft.milestones.findIndex(item=>!item.name.trim());if(unnamed>=0){projectSettingsTab="milestones";projectMilestoneIndex=unnamed;renderProjectEditor();$("#milestoneName").focus();toast("请填写里程碑名称");return false}
 let existing=projectById(projectDraft.id),saved=normalizeProject(projectDraft),validMilestones=new Set(saved.milestones.map(item=>item.id));
 projectDraft=clone(saved);commit(existing?"编辑项目":"新增项目",draft=>{let index=draft.projects.findIndex(item=>item.id===saved.id);if(index>=0)draft.projects[index]=clone(saved);else{draft.projects.push(clone(saved));draft.order.projects.push(saved.id)}draft.tasks.forEach(task=>{if(task.project===saved.id&&task.milestone&&!validMilestones.has(task.milestone)){task.milestone="";task.updatedAt=new Date().toISOString()}});draft.decisions.forEach(decision=>{if(decision.project===saved.id&&decision.milestone&&!validMilestones.has(decision.milestone)){decision.milestone="";decision.updatedAt=new Date().toISOString()}})},{immediate:true});
 selectedProjectId=saved.id;closeDialog("projectDialog");renderNow();toast("项目已保存");return true;
}
document.addEventListener("input",event=>{if(event.target.closest?.("#projectEditor")&&projectDraft){collectProjectDraft();syncProjectDirtyStatus()}});
$("#projectEditor").addEventListener("keydown",event=>{
 let tab=event.target.closest('[role="tab"][data-project-settings-tab]');if(!tab)return;
 let keys=["basic","milestones","records"],index=keys.indexOf(tab.dataset.projectSettingsTab),next=event.key==="ArrowRight"?(index+1)%3:event.key==="ArrowLeft"?(index+2)%3:event.key==="Home"?0:event.key==="End"?2:-1;
 if(next<0)return;event.preventDefault();event.stopPropagation();changeProjectSettingsTab(keys[next]);$("#projectSettingsTab-"+keys[next]).focus({preventScroll:true});
});
for(let id of ["taskDialog","decisionDialog"])$("#"+id).addEventListener("close",()=>{if($("#projectDialog").open&&projectDraft){collectProjectDraft();renderProjectEditor()}});
