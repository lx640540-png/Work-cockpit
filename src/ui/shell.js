const ui={projectView:"overview",renderedPage:"",projectMobilePane:"detail",memoPane:"list",inboxExpanded:false,overviewFilter:"open",collapsedProjects:new Set(),waitingExpanded:new Set(),projectQuery:"",projectTaskQuery:"",projectMilestoneFilter:"all",projectFocusTaskId:"",projectReturnTaskId:"",memoQuery:"",memoMultiSelect:false,selectedMemos:new Set(),showArchivedProjects:false,projectOverviewFilter:"open",selectedTasks:new Set(),showAllWeekDone:false,weekPanel:"plan",taskOptionsOpen:false};
const THEME_KEY="work-cockpit-theme-v1";
function applyTheme(value,remember=true){let preference=value||"system",dark=preference==="dark"||preference==="system"&&matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=dark?"dark":"light";if(remember)localStorage.setItem(THEME_KEY,preference);let button=$("#themeButton");if(button){button.textContent=dark?"☀":"◐";button.dataset.tip=dark?"切换到浅色模式":"切换到暗夜模式"}let meta=$("meta[name=theme-color]");if(meta)meta.content=dark?"#080f1c":"#2468f2"}
function toggleTheme(){applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark")}
const sidebarNotes={today:["今天 · 执行入口","拖动任务调整顺序；智能排序只在点击时生效。"],week:["本周 · 计划与复盘","安排本周重点、行动清单，并在周末完成复盘。"],tasks:["所有事项 · 唯一数据源","筛选、分组和排序不会复制任务。"],projects:["项目 · 组合视图","项目卡片用于快速判断，事项概览用于执行。"],memos:["备忘录 · 临时信息","点击不会改变顺序；使用左侧拖动柄调整。"],data:["数据与恢复","导入、恢复和清空均保留安全回退能力。"],search:["全局搜索","统一查找事项、项目、里程碑、决策与备忘录。"]};
function renderSidebar(){
 let counts={today:todayAdvance().length,week:weekTasks().length,tasks:openTasks().length,projects:state.projects.filter(project=>!project.archived).length,memos:state.memos.filter(memo=>!memo.archived).length};
 Object.entries(counts).forEach(([key,value])=>{let element=$('[data-count="'+key+'"]');if(element)element.textContent=value});
 $$(".nav-button").forEach(button=>button.classList.toggle("active",button.dataset.page===currentPage));
 let note=sidebarNotes[currentPage];$("#sidebarNote").innerHTML="<b>"+note[0]+"</b>"+note[1];
 $("#favoriteProjects").innerHTML=state.favorites.map(id=>projectById(id)).filter(project=>project&&!project.archived).map(project=>'<button class="favorite-link" data-favorite-open="'+esc(project.id)+'"><i></i>'+esc(project.name)+'</button>').join("")||'<span class="muted" style="font-size:11px">在项目卡片点击 ☆ 收藏</span>';
 $("#undoButton").disabled=!undoStack.length;$("#redoButton").disabled=!redoStack.length;$("#backButton").hidden=navigationDepth<=0;
}
function renderApp(){
 hideUiTooltip();
 if(typeof rememberWorkspace==="function"&&ui.renderedPage===currentPage)rememberWorkspace();
 document.body.classList.toggle("memo-workspace",currentPage==="memos");
 document.body.classList.toggle("project-workspace",currentPage==="projects"&&ui.projectView==="detail");
 renderSidebar();
 $$(".page").forEach(page=>page.classList.toggle("active",page.id==="page-"+currentPage));
 if(currentPage==="today")renderToday();else if(currentPage==="week")renderWeek();else if(currentPage==="tasks")renderTasks();else if(currentPage==="projects")renderProjects();else if(currentPage==="memos")renderMemos();else if(currentPage==="data")renderData();else renderSearchPage();
 bindTransientInputs();
 enhanceHoverSelects($("#page-"+currentPage));
 resizePlanningTextareas($("#page-"+currentPage));
 initQuillEditors($("#page-"+currentPage));
 initTaskSortables($("#page-"+currentPage));
 scheduleTodayScrollability();
 if(typeof restoreWorkspacePosition==="function")restoreWorkspacePosition();
 syncWorkJournal();
 if(typeof syncVisualPreview==="function")syncVisualPreview();
 ui.renderedPage=currentPage;
}
function bindTransientInputs(){initPlanningResize();initTableSorting()}
const PLANNING_TEXTAREA_SELECTOR="[data-overview-next],[data-week-action]";
function resizePlanningTextarea(textarea){
 if(!textarea?.matches?.(PLANNING_TEXTAREA_SELECTOR))return;
 textarea.style.height="0px";
 textarea.style.height=Math.max(48,Math.ceil(textarea.scrollHeight)+2)+"px";
 textarea.style.overflowY="hidden";
}
function resizePlanningTextareas(root=document){
 if(!root)return;
 // Batch writes, then reads, then final writes: one layout pass for the list.
 let textareas=Array.from(root.querySelectorAll(PLANNING_TEXTAREA_SELECTOR));
 textareas.forEach(textarea=>{textarea.style.height="0px"});
 let heights=textareas.map(textarea=>Math.max(48,Math.ceil(textarea.scrollHeight)+2));
 textareas.forEach((textarea,index)=>{textarea.style.height=heights[index]+"px";textarea.style.overflowY="hidden"});
}
let planningResizeFrame=0;
function schedulePlanningTextareaResize(){
 if(planningResizeFrame)return;
 planningResizeFrame=requestAnimationFrame(()=>{planningResizeFrame=0;resizePlanningTextareas($("#page-"+currentPage))});
}
function showDialog(dialog){if(dialog&&!dialog.open)dialog.showModal()}
function closeDialog(id){let dialog=typeof id==="string"?$("#"+id):id;if(dialog?.open)dialog.close()}
function requestDialogClose(id){let dialog=typeof id==="string"?$("#"+id):id;if(!dialog?.open)return;if(dialog.id==="taskDialog")return closeTaskDialog();if(dialog.id==="projectDialog")return requestProjectClose();closeDialog(dialog)}
function outsideDialogPanel(event,dialog){let rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom}
let backdropDialogPress=null;
document.addEventListener("pointerdown",event=>{backdropDialogPress=event.target instanceof HTMLDialogElement&&event.target.open&&outsideDialogPanel(event,event.target)?event.target:null},true);
document.addEventListener("pointerup",event=>{let dialog=backdropDialogPress;backdropDialogPress=null;if(dialog&&event.target===dialog&&dialog.open&&outsideDialogPanel(event,dialog))requestDialogClose(dialog)},true);
let toastTimer=0;
function toast(message){let box=$("#toast");box.textContent=message;box.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove("show"),2200)}
function confirmAction(title,message,callback,label){
 $("#confirmTitle").textContent=title;$("#confirmMessage").textContent=message;$("#confirmAccept").textContent=label||"确认";confirmCallback=callback;showDialog($("#confirmDialog"));
}
function confirmTwice(title,message,callback,label){
 confirmAction(title,message,()=>confirmAction("请再次确认","此操作会立即生效，完成后无法直接撤销。",callback,label||"确认执行"),"继续");
}
function navigate(page,projectId){
 if(!["today","week","tasks","projects","memos","data","search"].includes(page))return;
 if(!journalFlush())return;
 rememberWorkspace();
 if(journalUI.open&&!journalUI.pinned){journalUI.open=false;journalUI.expanded=false;syncWorkJournal()}
 rememberProjectPosition();rememberSearchPosition();closeTaskDateMenu();
 if(projectId){selectedProjectId=projectId;ui.projectView="detail"}
 if(page!==currentPage){currentPage=page;navigationDepth+=1;history.pushState({page,appRoute:true,appNavDepth:navigationDepth},"","#"+page)}
 $("#mainScroll").scrollTo({top:0,behavior:"auto"});requestRender();
}

