let state=loadLocalState();
let currentPage=(location.hash||"#today").slice(1);
if(!["today","week","tasks","projects","memos","data","search"].includes(currentPage))currentPage="today";
let navigationDepth=Number(history.state?.appNavDepth||0);
if(!history.state?.appRoute)history.replaceState({page:currentPage,appRoute:true,appNavDepth:navigationDepth},"","#"+currentPage);
let selectedWeekKey=currentWeekKey(),selectedProjectId="",selectedMemoId="",memoArchived=false,projectMilestoneIndex=0,globalSearchQuery="",searchReturnPage="today";
let taskFilter={quick:"open",query:"",project:[],type:[],status:[],group:"project",sort:"manual"};
let taskDraft=null,taskAutosaveTimer=0,taskAutosaveSignature="",taskAutosaveClosing=false,projectDraft=null,projectDraftIsNew=false,projectTemplateMode="hardware",decisionDraft=null,relatedDraft=new Set(),attachmentPreviewId="",taskChecklistCollapsed=false,taskChecklistHeight=0,checklistResizeState=null,projectPanelTab="tasks",historyTaskId="",historySelection="current";
let undoStack=[],redoStack=[],saveTimer=null,renderFrame=0,confirmCallback=null,dragState=null,directEditSessions=new Set(),activeRichEditor=null,richStates=new WeakMap(),quillEditors=new WeakMap(),quillRegistered=false;

// Serialization reads synchronously; undo and in-flight uploads require detached copies.
function stateCore(value=state){return{version:8,tasks:value.tasks,projects:value.projects,memos:value.memos,decisions:value.decisions,weeks:value.weeks,trash:value.trash,snapshots:value.snapshots,favorites:value.favorites,quickNote:value.quickNote,order:value.order,meta:value.meta}}
function serializeState(value=state){return JSON.stringify(stateCore(value))}
function snapshotCore(value=state){return JSON.parse(serializeState(value))}
let localSavePending=false,localSaveError="";
function retryLocalSave(){try{saveLocal(true);if(typeof journalFlush==="function")journalFlush()}catch{}}
function showLocalSaveStatus(){let banner=$("#localSaveBanner");if(!banner){banner=document.createElement("div");banner.id="localSaveBanner";banner.setAttribute("role","status");document.body.appendChild(banner)}banner.hidden=!localSaveError;banner.textContent=localSaveError?"本地保存失败，请保留页面并重试或导出备份。":"";if(localSaveError){let retry=document.createElement("button");retry.type="button";retry.textContent="重试保存";retry.onclick=retryLocalSave;banner.appendChild(retry)}let sync=$("#syncButton"),notice=$("#localSaveNotice");if(sync&&!notice){notice=document.createElement("button");notice.id="localSaveNotice";notice.type="button";notice.className="sync-badge error";notice.title="本地保存失败；点击重试。云端状态独立显示。";notice.onclick=retryLocalSave;sync.before(notice)}if(notice){notice.hidden=!localSaveError;notice.textContent="本地保存失败"}let memo=$(".memo-status");if(memo)memo.textContent=localSaveError?"本地保存失败":localSavePending?"待保存…":"本地已保存"}
function saveLocal(immediate=false){
 clearTimeout(saveTimer);localSavePending=true;
 let write=()=>{try{state.meta.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,serializeState());localSavePending=false;localSaveError=""}catch(error){localSaveError=error.message||"本地存储不可用";throw error}finally{window.CloudSync?.schedule();showLocalSaveStatus()}};
 if(immediate)write();else{showLocalSaveStatus();saveTimer=setTimeout(()=>{try{write()}catch{}},160)}
}
function flushPendingEdits(){let saved=true;try{if(taskDraft&&$("#taskDialog")?.open)saved=persistTaskDraft();if(typeof journalFlush==="function"&&!journalFlush())saved=false;if(localSavePending)saveLocal(true)}catch{saved=false}if(typeof rememberWorkspace==="function")rememberWorkspace();return saved}
window.addEventListener("pagehide",flushPendingEdits);
window.addEventListener("beforeunload",event=>{if(!flushPendingEdits()&&localSavePending){event.preventDefault();event.returnValue=""}});
document.addEventListener("visibilitychange",()=>{if(document.hidden)flushPendingEdits()});
function requestRender(){if(renderFrame)return;renderFrame=requestAnimationFrame(()=>{renderFrame=0;renderApp()})}
function renderNow(){if(renderFrame){cancelAnimationFrame(renderFrame);renderFrame=0}renderApp()}
function recordDirectEdit(key,label){
 if(directEditSessions.has(key))return;directEditSessions.add(key);undoStack.push({label,state:snapshotCore()});if(undoStack.length>24)undoStack.shift();redoStack=[];let undoButton=$("#undoButton"),redoButton=$("#redoButton");if(undoButton)undoButton.disabled=false;if(redoButton)redoButton.disabled=true;
}
function commit(label,mutator,options={}){
 directEditSessions.clear();
 if(options.history!==false){undoStack.push({label,state:snapshotCore()});if(undoStack.length>24)undoStack.shift();redoStack=[]}
 mutator(state);persistStateChanges(options);
}
// Common post-edit pipeline for task commands and detail autosave.
function persistStateChanges(options={}){
 state=normalizeState(state);activateScheduledTasks(state);captureCurrentWeek();saveLocal(!!options.immediate);requestRender();
}
function replaceState(next,label){
 undoStack.push({label:label||"替换数据",state:snapshotCore()});if(undoStack.length>24)undoStack.shift();redoStack=[];state=normalizeState(next);ensureCurrentWeek();activateScheduledTasks();captureCurrentWeek();saveLocal(true);requestRender();
}
function syncOpenTaskAfterHistory(){if(typeof syncOpenTaskDraftFromState==="function")syncOpenTaskDraftFromState()}
function undo(){directEditSessions.clear();let entry=undoStack.pop();if(!entry)return;redoStack.push({label:entry.label,state:snapshotCore()});state=normalizeState(entry.state);activateScheduledTasks();saveLocal(true);syncOpenTaskAfterHistory();requestRender();toast("已撤回："+entry.label)}
function redo(){directEditSessions.clear();let entry=redoStack.pop();if(!entry)return;undoStack.push({label:entry.label,state:snapshotCore()});state=normalizeState(entry.state);activateScheduledTasks();saveLocal(true);syncOpenTaskAfterHistory();requestRender();toast("已恢复："+entry.label)}
function createSnapshot(label){
 let item={id:uid("snapshot"),label:label||"安全快照",createdAt:new Date().toISOString(),state:snapshotCore()};
 item.state.snapshots=[];state.snapshots.unshift(item);state.snapshots=state.snapshots.slice(0,12);return item;
}
