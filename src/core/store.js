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
function saveLocal(immediate=false){
 clearTimeout(saveTimer);
 let write=()=>{state.meta.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,serializeState());window.CloudSync?.schedule()};
 if(immediate)write();else saveTimer=setTimeout(write,160);
}
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
