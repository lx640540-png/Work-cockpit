function saveRelationsNow(label){
 let existing=taskById(taskDraft.id);if(!existing)return;
 let next=Array.from(relatedDraft);
 commit(label,draft=>{let own=draft.tasks.find(task=>task.id===taskDraft.id);if(!own)return;let set=new Set(next);draft.tasks.forEach(task=>{if(task.id===own.id)return;let links=new Set(task.relatedTaskIds||[]);set.has(task.id)?links.add(own.id):links.delete(own.id);task.relatedTaskIds=Array.from(links)});own.relatedTaskIds=next;own.updatedAt=new Date().toISOString()},{immediate:true});taskDraft.relatedTaskIds=next;toast("关联事项已自动保存");
}
function handleClick(event){
 let target=event.target.closest("[data-retry-thumb],[data-image-view],button,[data-page],[data-select-project],[data-select-memo],[data-command]");if(!target)return;
 if(target.dataset.projectPane){ui.projectMobilePane=target.dataset.projectPane;return syncProjectMobilePane()}
 if(target.dataset.memoPane){ui.memoPane=target.dataset.memoPane;return syncMemoPane()}
 if(target.hasAttribute('data-toggle-inbox')){ui.inboxExpanded=!ui.inboxExpanded;return requestRender()}
 if(target.hasAttribute('data-edit-obsidian')){let box=$('#obsidianEditor');box.hidden=!box.hidden;if(!box.hidden)$('#taskObsidianUri').focus();return}
 if(target.hasAttribute('data-clear-obsidian')){$('#taskObsidianUri').value='';persistTaskDraft();refreshObsidianLink();return}
 if(target.hasAttribute('data-save-obsidian')){if(!validObsidianUri($('#taskObsidianUri').value))return toast('请粘贴 obsidian://open 格式的笔记链接');persistTaskDraft();refreshObsidianLink();$('#obsidianEditor').hidden=true;return}
 if(target.dataset.retryUpload)return retryTaskUpload(target.dataset.retryUpload);
 if(target.dataset.discardUpload)return discardTaskUpload(target.dataset.discardUpload);
 if(target.dataset.reselectUpload)return reselectTaskUpload(target.dataset.reselectUpload);
 if(target.dataset.retryThumb){event.preventDefault();return refreshAttachmentThumbnails()}
 if(target.dataset.imageView)return openAttachmentImage(target.dataset.imageView);
 if(target.dataset.addProgress!==undefined)return addTaskProgress();
 if(target.dataset.editProgress)return beginEditTaskProgress(target.dataset.editProgress);
 if(target.dataset.cancelProgressEdit!==undefined)return refreshTaskProgressList();
 if(target.dataset.saveProgress)return saveTaskProgressEdit(target.dataset.saveProgress);
 if(target.dataset.deleteProgress)return deleteTaskProgress(target.dataset.deleteProgress);
 if(target.dataset.quickDate)return openTaskDateMenu(target,target.dataset.quickDate);
 if(target.dataset.setTaskDate!==undefined)return applyQuickTaskDate(target.dataset.setTaskDate);
 if(target.dataset.applyTaskDate!==undefined)return applyQuickTaskDate($("#quickTaskDate").value);
 if(target.dataset.openAllWaiting!==undefined){taskFilter={...taskFilter,quick:"waiting",query:"",project:[],type:[],status:[]};return navigate("tasks")}
 if(target.dataset.handleTask)return updateTask(target.dataset.handleTask,"本次已处理",task=>task.handledOn=todayKey());
 if(target.dataset.undoHandled)return updateTask(target.dataset.undoHandled,"撤销本次处理",task=>task.handledOn="");
 if(target.dataset.page)return navigate(target.dataset.page);
 if(target.dataset.projectView){rememberProjectPosition();ui.projectView=target.dataset.projectView;return requestRender()}
 if(target.dataset.projectDetail)return navigate("projects",target.dataset.projectDetail);
 if(target.dataset.overviewFilter){ui.overviewFilter=target.dataset.overviewFilter;return requestRender()}
 if(target.dataset.collapseProject!==undefined){let id=target.dataset.collapseProject;ui.collapsedProjects.has(id)?ui.collapsedProjects.delete(id):ui.collapsedProjects.add(id);return requestRender()}
 if(target.dataset.expandProjects!==undefined){ui.collapsedProjects.clear();return requestRender()}
 if(target.dataset.collapseProjects!==undefined){ui.collapsedProjects=new Set(state.projects.map(project=>project.id).concat(''));return requestRender()}
 if(target.dataset.quickNoteToTask!==undefined)return quickNoteToTask();
 if(target.dataset.goTaskProject!==undefined)return goToTaskProject();
 if(target.dataset.returnTask)return openTask(target.dataset.returnTask);
 if(target.dataset.clearProjectTaskFilters!==undefined){ui.projectTaskQuery="";ui.projectMilestoneFilter="all";ui.projectOverviewFilter="all";return requestRender()}
 if(target.dataset.close)return requestDialogClose(target.dataset.close);
 if(target.id==="backButton"&&navigationDepth>0)return history.back();
 if(target.id==="undoButton"){if(richHistoryAvailable(activeRichEditor,-1))return richApplyHistory(activeRichEditor,-1);return undo()}
 if(target.id==="redoButton"){if(richHistoryAvailable(activeRichEditor,1))return richApplyHistory(activeRichEditor,1);return redo()}
 if(target.id==="themeButton")return toggleTheme();
 if(target.id==="syncButton"){Cloud.renderStatus();return showDialog($("#syncDialog"))}
 if(target.id==="accountEmail"){Cloud.renderStatus();return showDialog($("#syncDialog"))}
 if(target.dataset.action==="new-task")return openTask("",target.dataset.inbox?{inbox:true,status:"待处理"}:{});
 if(target.dataset.action==="new-project-task")return openTask("",{project:target.dataset.project,status:"待处理"});
 if(target.dataset.action==="new-project")return openProject();
 if(target.dataset.toggleArchivedProjects!==undefined){ui.showArchivedProjects=!ui.showArchivedProjects;selectedProjectId="";return requestRender()}
 if(target.dataset.action==="new-memo")return createMemo();
 if(target.dataset.action==="quick-memo")return openTask("",{inbox:true,status:"待处理"});
 if(target.dataset.openTask)return openTask(target.dataset.openTask);
 if(target.dataset.editTask)return openTask(target.dataset.editTask);
 if(target.dataset.toggleTask)return toggleTask(target.dataset.toggleTask);
 if(target.dataset.pinTask)return updateTask(target.dataset.pinTask,"切换事项置顶",(task,draft)=>{let key=pinKey(target.dataset.pinScope),list=draft.order[key]||(draft.order[key]=[]);draft.order[key]=list.includes(task.id)?list.filter(id=>id!==task.id):list.concat(task.id)});
 if(target.dataset.unpinAll)return commit("取消当前卡片全部置顶",draft=>draft.order[pinKey(target.dataset.unpinAll)]=[],{immediate:true});
 if(target.dataset.toggleFocus)return commit("切换今日行动",draft=>{let task=draft.tasks.find(item=>item.id===target.dataset.toggleFocus);setTaskFocus(task,!task.focus,draft)},{immediate:true});
 if(target.dataset.toggleWeek)return commit("切换本周行动",draft=>{let task=draft.tasks.find(item=>item.id===target.dataset.toggleWeek);task.week=!task.week;if(!task.week)setTaskFocus(task,false,draft)},{immediate:true});
 if(target.dataset.property)return openChoice(target,target.dataset.property,target.dataset.task);
 if(target.dataset.smartSort){
  let scope=target.dataset.smartSort,items=scope==="today"?todayAdvance():scope==="waiting"?todayWaiting():scope==="week"?weekTasks():scope==="long"?longTasks():filteredTasks();return applySmartOrder(items,scope);
 }
 if(target.dataset.summaryTarget){let scope=target.dataset.summaryTarget;if(scope==="week")return navigate("week");if(scope==="done"){selectedWeekKey=currentWeekKey();ui.weekPanel="review";ui.showAllWeekDone=false;return navigate("week")}let card=$('.drop-card[data-drop-zone="'+scope+'"]');card?.scrollIntoView({behavior:"smooth",block:"center"});card?.focus?.({preventScroll:true});return}
 if(target.dataset.toggleGroup){let scope=target.dataset.toggleGroup;return commit("切换项目分组",draft=>draft.order[scope+"Group"]=!draft.order[scope+"Group"],{history:false})}
 if(target.dataset.quick){taskFilter.quick=target.dataset.quick;return requestRender()}
 if(target.dataset.toggleTaskOptions!==undefined){ui.taskOptionsOpen=!ui.taskOptionsOpen;return requestRender()}
 if(target.dataset.taskGroup){taskFilter.group=target.dataset.taskGroup;return requestRender()}
 if(target.dataset.resetFilter!==undefined){taskFilter={quick:"open",query:"",project:[],type:[],status:[],group:"project",sort:"manual"};ui.taskOptionsOpen=false;return requestRender()}
 if(target.dataset.bulkClear!==undefined){ui.selectedTasks.clear();return requestRender()}
 if(target.dataset.bulkArchive!==undefined){let ids=new Set(ui.selectedTasks);ui.selectedTasks.clear();return commit("批量归档事项",draft=>draft.tasks.forEach(task=>{if(ids.has(task.id))task.archived=true}),{immediate:true})}
 if(target.dataset.bulkDelete!==undefined){let ids=new Set(ui.selectedTasks);return confirmAction("删除选中的 "+ids.size+" 项事项？","这些事项会进入回收站；已形成的关键决策会保留。",()=>{commit("批量删除事项",draft=>{draft.tasks.filter(task=>ids.has(task.id)).forEach(task=>draft.trash.unshift({id:uid("trash"),type:"task",deletedAt:new Date().toISOString(),data:clone(task),decisionLinks:draft.decisions.filter(decision=>decision.sourceTaskId===task.id).map(decision=>decision.id)}));draft.tasks=draft.tasks.filter(task=>!ids.has(task.id));draft.tasks.forEach(task=>task.relatedTaskIds=task.relatedTaskIds.filter(id=>!ids.has(id)));draft.decisions.forEach(decision=>{if(ids.has(decision.sourceTaskId))decision.sourceTaskId=""})},{immediate:true});ui.selectedTasks.clear()},"删除")}
 if(target.dataset.selectProject){rememberProjectPosition();ui.projectMobilePane='detail';let pane=target.closest('.project-list-panel'),scrollTop=pane?.scrollTop||0;selectedProjectId=target.dataset.selectProject;ui.projectTaskQuery="";ui.projectMilestoneFilter="all";ui.projectFocusTaskId="";ui.projectReturnTaskId="";requestRender();return requestAnimationFrame(()=>{let next=$('.project-list-panel');if(next)next.scrollTop=scrollTop})}
 if(target.dataset.projectOverview){ui.projectOverviewFilter=target.dataset.projectOverview;return requestRender()}
 if(target.dataset.projectMilestoneFilter){ui.projectMilestoneFilter=target.dataset.projectMilestoneFilter;return requestRender()}
 let favoriteButton=event.target.closest?.("[data-favorite-project]");if(favoriteButton){let id=favoriteButton.dataset.favoriteProject;event.stopPropagation();return commit("切换项目收藏",draft=>draft.favorites=draft.favorites.includes(id)?draft.favorites.filter(value=>value!==id):draft.favorites.concat(id),{immediate:true})}
 if(target.dataset.favoriteOpen){selectedProjectId=target.dataset.favoriteOpen;return navigate("projects",selectedProjectId)}
 if(target.dataset.editProject)return openProject(target.dataset.editProject);
 if(target.dataset.openProjectTasks){let quick=ui.projectOverviewFilter==="done"?"done":ui.projectOverviewFilter==="all"?"all":"open";taskFilter={quick,query:"",project:[target.dataset.openProjectTasks],type:[],status:[],group:"none",sort:"manual"};ui.taskOptionsOpen=false;return navigate("tasks")}
 if(target.dataset.viewTaskHistory)return openTaskHistory(target.dataset.viewTaskHistory,target.dataset.historyWeek||"current");
 if(target.dataset.viewCurrentTask){closeDialog("taskHistoryDialog");return openTask(target.dataset.viewCurrentTask)}
 if(target.dataset.historyVersion){historySelection=target.dataset.historyVersion;return renderTaskHistory()}
 if(target.id==="historyCurrentButton"&&historyTaskId){closeDialog("taskHistoryDialog");return openTask(historyTaskId)}
 if(target.dataset.addTop!==undefined)return commit("新增周重点",draft=>{let week=draft.weeks[selectedWeekKey]||(draft.weeks[selectedWeekKey]=emptyWeek());if(week.top.length<3)week.top.push("新的本周重点")},{immediate:true});
 if(target.dataset.deleteTop!==undefined)return commit("删除周重点",draft=>{let week=draft.weeks[selectedWeekKey],index=Number(target.dataset.deleteTop);week.top.splice(index,1);week.topResults.splice(index,1)},{immediate:true});
 if(target.dataset.weekPanel){if(target.disabled)return;ui.weekPanel=target.dataset.weekPanel;return requestRender()}
 if(target.dataset.toggleWeekDone!==undefined){ui.showAllWeekDone=!ui.showAllWeekDone;return requestRender()}
 if(target.dataset.weekShift){selectedWeekKey=fmt(addDays(parseDate(selectedWeekKey),Number(target.dataset.weekShift)*7));ui.showAllWeekDone=false;return requestRender()}
 if(target.dataset.weekCurrent!==undefined){selectedWeekKey=currentWeekKey();ui.showAllWeekDone=false;return requestRender()}
 if(target.dataset.toggleMemoMulti!==undefined){ui.memoMultiSelect=!ui.memoMultiSelect;ui.selectedMemos.clear();return requestRender()}
 if(target.dataset.toggleMemoSelect){let id=target.dataset.toggleMemoSelect;ui.selectedMemos.has(id)?ui.selectedMemos.delete(id):ui.selectedMemos.add(id);return requestRender()}
 if(target.dataset.memoBulkDelete!==undefined){let ids=Array.from(ui.selectedMemos);if(!ids.length)return;return confirmAction("删除选中的 "+ids.length+" 条备忘录？","这些备忘录会进入回收站，可在“数据与恢复”页面恢复。",()=>{moveMemosToTrash(ids,"批量删除备忘录");ui.selectedMemos.clear();ui.memoMultiSelect=false;toast("已将 "+ids.length+" 条备忘录移入回收站")},"删除所选")}
 if(target.dataset.selectMemo){ui.memoPane="editor";selectedMemoId=target.dataset.selectMemo;return requestRender()}
 if(target.dataset.togglePin){let id=target.dataset.togglePin;return commit("切换备忘录置顶",draft=>{let memo=draft.memos.find(item=>item.id===id);memo.pinned=!memo.pinned;memo.updatedAt=new Date().toISOString()},{immediate:true})}
 if(target.dataset.toggleMemoArchive){let id=target.dataset.toggleMemoArchive;return commit("归档备忘录",draft=>{let memo=draft.memos.find(item=>item.id===id);memo.archived=!memo.archived;memo.updatedAt=new Date().toISOString()},{immediate:true})}
 if(target.dataset.deleteMemo)return deleteMemo(target.dataset.deleteMemo);
 if(target.dataset.memoToTask)return memoToTask(target.dataset.memoToTask);
 if(target.dataset.memoTab){memoArchived=target.dataset.memoTab==="archived";selectedMemoId="";ui.selectedMemos.clear();return requestRender()}
 if(target.dataset.toggleChecklist!==undefined){taskChecklistCollapsed=!taskChecklistCollapsed;if(!taskChecklistCollapsed)taskChecklistHeight=0;return refreshChecklist()}
 if(target.dataset.addCheck!==undefined){taskChecklistCollapsed=false;taskChecklistHeight=0;taskDraft.checklist.push({id:uid("check"),text:"",done:false});refreshChecklist({focusLast:true});return scheduleTaskAutosave()}
 if(target.dataset.removeCheck!==undefined){taskChecklistHeight=0;taskDraft.checklist.splice(Number(target.dataset.removeCheck),1);refreshChecklist();return scheduleTaskAutosave()}
 if(target.dataset.addRelated){relatedDraft.add(target.dataset.addRelated);saveRelationsNow("新增关联事项");$("#relatedSearch").value="";$("#relationResults").innerHTML="";$("#relatedList").innerHTML=relationMarkup();return}
 if(target.dataset.removeRelated){relatedDraft.delete(target.dataset.removeRelated);saveRelationsNow("移除关联事项");$("#relatedList").innerHTML=relationMarkup();return}
 if(target.dataset.newRelatedTask!==undefined)return createRelatedTask();
 if(target.dataset.openRelated){let id=target.dataset.openRelated;if(!persistTaskDraft({close:true}))return;return openTask(id)}
 if(target.dataset.previewAttachment){attachmentPreviewId=target.dataset.previewAttachment;let preview=$("#attachmentPreview");if(preview){preview.classList.add("has-preview");preview.textContent="正在加载预览……"}return Cloud.previewAttachment(taskDraft.attachments.find(item=>item.id===attachmentPreviewId),preview)}
 if(target.dataset.removeAttachment){let item=taskDraft.attachments.find(value=>value.id===target.dataset.removeAttachment);return Cloud.removeAttachment(taskDraft.id,item)}
 if(target.hasAttribute("data-open-obsidian"))return openTaskObsidian();
 if(target.closest(".dropzone"))return $("#attachmentInput").click();
 if(target.dataset.selectMile!==undefined){collectProjectDraft();projectMilestoneIndex=Number(target.dataset.selectMile);return renderProjectEditor()}
 if(target.dataset.projectPanel){collectProjectDraft();projectPanelTab=target.dataset.projectPanel;return renderProjectEditor()}
 if(target.dataset.addMile!==undefined){collectProjectDraft();projectDraft.milestones.push(normalizeMilestone({name:"新里程碑"},projectDraft.milestones.length));projectMilestoneIndex=projectDraft.milestones.length-1;return renderProjectEditor()}
 if(target.dataset.removeCurrentMile!==undefined)return removeCurrentMilestone();
 if(target.dataset.mileState){collectProjectDraft();let item=projectDraft.milestones[projectMilestoneIndex];if(item){if(target.dataset.mileState==="当前阶段")projectDraft.milestones.forEach(milestone=>{if(milestone!==item&&milestone.status==="当前阶段")milestone.status="未开始"});item.status=target.dataset.mileState;renderProjectEditor()}return}
 if(target.dataset.newDecision!==undefined)return openDecision("",{sourceTaskId:target.dataset.task||"",project:target.dataset.project||"",milestone:target.dataset.milestone||""});
 if(target.dataset.editDecision)return openDecision(target.dataset.editDecision);
 if(target.dataset.command){event.preventDefault();applyRichCommand(target.dataset.command,target);return}
 if(target.dataset.export!==undefined)return exportData();
 if(target.dataset.import!==undefined)return $("#importInput").click();
 if(target.dataset.restoreTrash)return restoreTrash(target.dataset.restoreTrash);
 if(target.dataset.restoreSnapshot)return restoreSnapshot(target.dataset.restoreSnapshot);
 if(target.dataset.clearSnapshots!==undefined)return confirmTwice("清除全部快照？","所有恢复快照都会被永久删除。",()=>commit("清空快照",draft=>draft.snapshots=[],{immediate:true,history:false}),"确认清除");
 if(target.dataset.clearTrash!==undefined)return confirmTwice("永久清空回收站？","回收站中的全部内容都会被永久删除。",()=>commit("清空回收站",draft=>draft.trash=[],{immediate:true,history:false}),"确认清空");
 if(target.dataset.clearBusiness!==undefined)return confirmTwice("一键清空业务数据？","系统会先生成安全快照，再清空事项、项目、速记、备忘录、关键决策和周计划。",()=>{createSnapshot("一键清空前的完整快照");commit("一键清空业务数据",draft=>{draft.tasks=[];draft.projects=[];draft.memos=[];draft.decisions=[];draft.quickNote=emptyQuickNote();draft.weeks={[currentWeekKey()]:emptyWeek()};draft.trash=[];draft.favorites=[];draft.order=emptyOrder()},{immediate:true})},"确认清空数据");
 if(target.dataset.closeSearchPage!==undefined)return closeGlobalSearch();
 if(target.dataset.searchCategory)return changeSearchCategory(target.dataset.searchCategory);
 if(target.dataset.searchMore)return loadMoreSearch(target.dataset.searchMore);
 if(target.dataset.searchProjectGroup!==undefined)return toggleSearchProjectGrouping();
 if(target.dataset.searchTask||target.dataset.searchProject||target.dataset.searchMemo||target.dataset.searchDecision)rememberSearchPosition();
 if(target.dataset.clearSearch!==undefined){resetSearchView();globalSearchQuery="";syncSearchInputs("");let input=$("#searchPageInput");if(input){input.focus({preventScroll:true});input.setSelectionRange(0,0)}let results=$("#searchPageResults");if(results)results.innerHTML=globalResults("");restoreSearchPosition();return}
 if(target.dataset.searchTask)return openTask(target.dataset.searchTask);
 if(target.dataset.searchProject){ui.showArchivedProjects=!!projectById(target.dataset.searchProject)?.archived;return navigate("projects",target.dataset.searchProject)}
 if(target.dataset.searchMemo){selectedMemoId=target.dataset.searchMemo;memoArchived=!!memoById(selectedMemoId)?.archived;return navigate("memos")}
 if(target.dataset.searchDecision)return openDecision(target.dataset.searchDecision);
}
document.addEventListener("click",event=>{
 if(!event.target.closest("#choicePopover,[data-property]"))closeChoice();
 if(!event.target.closest(".hover-select"))closeHoverSelect();
 let divider=event.target.closest?.(".rich-divider");if(divider&&!event.target.isContentEditable)selectRichDivider(divider);else if(!divider)$$(".rich-divider.selected").forEach(item=>item.classList.remove("selected"));
 handleClick(event);
});
document.addEventListener("dblclick",event=>{let divider=event.target.closest?.(".rich-divider");if(divider){event.preventDefault();event.stopPropagation();editRichDivider(divider)}});
document.addEventListener("paste",event=>{let label=event.target.closest?.('.rich-divider-label[contenteditable="true"]');if(!label)return;event.preventDefault();event.stopImmediatePropagation();pasteIntoRichDividerLabel(label,event.clipboardData?.getData("text/plain")||"")},true);
document.addEventListener("copy",event=>{let label=event.target.closest?.('.rich-divider-label[contenteditable="true"]'),range=label&&dividerLabelRange(label);if(!label||!range||range.collapsed)return;event.preventDefault();event.stopImmediatePropagation();event.clipboardData?.setData("text/plain",range.toString())},true);
document.addEventListener("cut",event=>{let label=event.target.closest?.('.rich-divider-label[contenteditable="true"]'),range=label&&dividerLabelRange(label);if(!label||!range||range.collapsed)return;event.preventDefault();event.stopImmediatePropagation();event.clipboardData?.setData("text/plain",range.toString());range.deleteContents()},true);
const hoverDetailTimers=new WeakMap();let activeHoverDetail=null,taskOptionsHoverTimer=0;
function isMouseHover(event){return event.pointerType==="mouse"||!event.pointerType&&matchMedia("(any-hover:hover) and (any-pointer:fine)").matches}
function closeHoverDetail(details){if(!details)return;clearTimeout(hoverDetailTimers.get(details));details.open=false;if(activeHoverDetail===details)activeHoverDetail=null}
function openHoverDetail(details){if(!details)return;clearTimeout(hoverDetailTimers.get(details));if(activeHoverSelect)closeHoverSelect(activeHoverSelect);if(activeHoverDetail&&activeHoverDetail!==details)closeHoverDetail(activeHoverDetail);details.open=true;activeHoverDetail=details}
function showTaskOptionsHover(){if(currentPage!=="tasks")return;clearTimeout(taskOptionsHoverTimer);let button=$("[data-hover-task-options]"),panel=$("[data-hover-task-options-panel]");if(!button||!panel)return;panel.hidden=false;button.classList.add("hover-open");button.setAttribute("aria-expanded","true")}
function hideTaskOptionsHover(){if(ui.taskOptionsOpen)return;let button=$("[data-hover-task-options]"),panel=$("[data-hover-task-options-panel]");if(panel)panel.hidden=true;if(button){button.classList.remove("hover-open");button.setAttribute("aria-expanded","false")}}
document.addEventListener("pointerover",event=>{if(!isMouseHover(event))return;let details=event.target.closest?.("details.multi-filter");if(details&&!details.contains(event.relatedTarget))openHoverDetail(details);let taskOwner=event.target.closest?.("[data-hover-task-options],[data-hover-task-options-panel]");if(taskOwner&&!taskOwner.contains(event.relatedTarget))showTaskOptionsHover()});
document.addEventListener("pointerout",event=>{if(!isMouseHover(event))return;let details=event.target.closest?.("details.multi-filter");if(details&&!details.contains(event.relatedTarget)){let next=event.relatedTarget?.closest?.("details.multi-filter");if(next&&next!==details){closeHoverDetail(details);openHoverDetail(next)}else{let timer=setTimeout(()=>{if(!details.matches(":hover")&&!details.matches(":focus-within"))closeHoverDetail(details)},70);hoverDetailTimers.set(details,timer)}}let taskOwner=event.target.closest?.("[data-hover-task-options],[data-hover-task-options-panel]");if(taskOwner&&!taskOwner.contains(event.relatedTarget)&&!event.relatedTarget?.closest?.("[data-hover-task-options],[data-hover-task-options-panel]")){clearTimeout(taskOptionsHoverTimer);taskOptionsHoverTimer=setTimeout(()=>{let button=$("[data-hover-task-options]"),panel=$("[data-hover-task-options-panel]");if(!button?.matches(":hover,:focus-within")&&!panel?.matches(":hover,:focus-within"))hideTaskOptionsHover()},90)}});
document.addEventListener("selectionchange",()=>rememberRichSelection());
document.addEventListener("pointerdown",event=>{let block=event.target.closest?.(".quick-note-editor .ql-editor p,.quick-note-editor .ql-editor li");if(!block)return;let rect=block.getBoundingClientRect();if(event.clientX<=rect.left+25){event.preventDefault();event.stopPropagation();toggleQuickNoteLine(block)}});
document.addEventListener("pointerdown",event=>{let command=event.target.closest("[data-command]");if(command){let editor=richEditorFor(command);if(editor){let quill=quillFor(editor);if(quill){activeRichEditor=editor;updateRichToolbar(editor)}else{richState(editor);rememberRichSelection(editor)}}event.preventDefault()}});
document.addEventListener("focusin",event=>{let editor=event.target.closest?.(".rich-editor");if(editor){if(quillFor(editor)){activeRichEditor=editor;updateRichToolbar(editor)}else{richState(editor);rememberRichSelection(editor)}}else if(!event.target.closest?.(".rich-toolbar,#undoButton,#redoButton"))activeRichEditor=null});
document.addEventListener("compositionstart",event=>{let editor=event.target.closest?.(".rich-editor");if(editor&&!quillFor(editor))editor.dataset.composing="1"});document.addEventListener("compositionend",event=>{let editor=event.target.closest?.(".rich-editor");if(editor&&!quillFor(editor)){editor.dataset.composing="0";setTimeout(()=>richShortcutAfterInput(editor),0)}});
document.addEventListener("beforeinput",event=>{let editor=event.target.closest?.(".rich-editor");if(!editor||quillFor(editor))return;if(event.inputType==="historyUndo"||event.inputType==="historyRedo"){event.preventDefault();richApplyHistory(editor,event.inputType==="historyUndo"?-1:1)}});
$("#confirmAccept").addEventListener("click",()=>{let callback=confirmCallback;confirmCallback=null;closeDialog("confirmDialog");if(typeof callback==="function")callback()});
$("#taskForm").addEventListener("submit",event=>{event.preventDefault();saveTaskDraft()});
$("#taskForm").addEventListener("keydown",event=>{
 if(event.key!=="Enter"||event.isComposing||event.keyCode===229||event.target.closest(".rich-editor")||event.target.id==="taskProgressInput"||event.target.closest("button"))return;
 event.preventDefault();event.stopPropagation();saveTaskDraft();
});
$("#projectForm").addEventListener("submit",event=>{event.preventDefault();saveProjectDraft()});
$("#decisionForm").addEventListener("submit",event=>{event.preventDefault();if(event.submitter?.value==="cancel")return closeDialog("decisionDialog");saveDecisionDraft()});
$("#deleteTaskButton").addEventListener("click",()=>taskDraft&&deleteTask(taskDraft.id));
$("#archiveProjectButton").addEventListener("click",()=>projectDraft&&archiveProject(projectDraft.id));
$("#deleteProjectButton").addEventListener("click",()=>projectDraft&&deleteProject(projectDraft.id));
$("#deleteDecisionButton").addEventListener("click",()=>decisionDraft&&deleteDecision(decisionDraft.id));
$("#choicePopover").addEventListener("click",event=>{let button=event.target.closest("[data-choice]");if(!button)return;let pop=$("#choicePopover");updateProperty(pop.dataset.task,pop.dataset.field,button.dataset.choice);closeChoice()});
document.addEventListener("input",event=>{
 let target=event.target;
 if(target.matches?.(PLANNING_TEXTAREA_SELECTOR))resizePlanningTextarea(target);
 if(target.matches?.(".rich-editor")){richInput(target);if(event.inputType==="insertText"&&event.data===" ")setTimeout(()=>richShortcutAfterInput(target),0)}
 if(target.dataset.overviewNext){let task=taskById(target.dataset.overviewNext);if(task&&!task.archived&&!isDone(task)){recordDirectEdit('next:'+task.id,'修改下一步');task.nextAction=target.value;task.updatedAt=new Date().toISOString();captureCurrentWeek();saveLocal()}}
 else if(target.dataset.weekAction||target.dataset.weekResult){if(weekMode(selectedWeekKey)!=='current')return;let id=target.dataset.weekAction||target.dataset.weekResult,field=target.dataset.weekAction?'text':'result',week=currentWeek();recordDirectEdit('week:'+selectedWeekKey+':'+id+':'+field,'编辑本周推进记录');week.actions=week.actions||{};if(!Object.hasOwn(week.actions,id))week.actions[id]={text:'',result:''};week.actions[id][field]=target.value;saveLocal()}
 else if(target.dataset.topResult!==undefined){if(weekMode(selectedWeekKey)!=='current')return;recordDirectEdit('week:'+selectedWeekKey+':outcome:'+target.dataset.topResult,'记录本周目标结果');currentWeek().topResults[Number(target.dataset.topResult)]=target.value;saveLocal()}
 else if(target.dataset.quickNote!==undefined){let quill=quillFor(target);if(quill){state.quickNote={delta:quill.getContents(),updatedAt:new Date().toISOString()};saveLocal()}}
 else if(target.id==="taskSearch"){taskFilter.query=target.value;renderTasks();requestAnimationFrame(()=>{let input=$("#taskSearch");input?.focus();input?.setSelectionRange(input.value.length,input.value.length)})}
 else if(target.id==="projectTaskSearch"){ui.projectTaskQuery=target.value;renderProjects();requestAnimationFrame(()=>{let input=$("#projectTaskSearch");input?.focus();input?.setSelectionRange(input.value.length,input.value.length)})}
 else if(target.id==="memoSearch"){ui.memoQuery=target.value;renderMemos();requestAnimationFrame(()=>{let input=$("#memoSearch");input?.focus();input?.setSelectionRange(input.value.length,input.value.length)})}
 else if(target.dataset.topIndex!==undefined){let index=Number(target.dataset.topIndex);recordDirectEdit("week:"+selectedWeekKey+":top:"+index,"编辑周重点");let week=currentWeek();week.top[index]=target.value;saveLocal()}
 else if(target.dataset.weekReview){recordDirectEdit("week:"+selectedWeekKey+":"+target.dataset.weekReview,"编辑周复盘");currentWeek()[target.dataset.weekReview]=serializeRichEditor(target);saveLocal()}
 else if(target.dataset.memoTitle!==undefined){let memo=memoById(selectedMemoId);if(memo){recordDirectEdit("memo:"+esc(memo.id)+":title","编辑备忘录标题");memo.title=target.value;memo.updatedAt=new Date().toISOString();saveLocal()}}
 else if(target.dataset.memoContent!==undefined){let memo=memoById(selectedMemoId);if(memo){recordDirectEdit("memo:"+esc(memo.id)+":content","编辑备忘录正文");memo.content=serializeRichEditor(target);memo.updatedAt=new Date().toISOString();saveLocal()}}
 else if(target.id==="relatedSearch")$("#relationResults").innerHTML=relationResults(target.value);
 else if(target.dataset.checkText!==undefined)taskDraft.checklist[Number(target.dataset.checkText)].text=target.value;
 else if((target.id==="globalSearch"||target.id==="searchPageInput")&&!event.isComposing&&target.dataset.composing!=="1")updateGlobalSearch(target.value,target.id)
 if(target.closest?.("#taskEditor")&&target.id!=="relatedSearch"&&target.id!=="attachmentInput")scheduleTaskAutosave();
});
document.addEventListener("compositionstart",event=>{if(event.target.matches?.("#globalSearch,#searchPageInput"))event.target.dataset.composing="1"});
document.addEventListener("compositionend",event=>{if(event.target.matches?.("#globalSearch,#searchPageInput")){event.target.dataset.composing="0";let source=event.target;requestAnimationFrame(()=>updateGlobalSearch(source.value,source.id))}});
$("#globalSearch").addEventListener("focus",event=>{if(currentPage==="search")focusSearchPage();else if(event.target.value.trim())updateGlobalSearch(event.target.value,"globalSearch")});
document.addEventListener("focusout",event=>{let editor=event.target.closest?.(".rich-editor");if(editor&&!quillFor(editor)){richFlush(editor);let clean=serializeRichEditor(editor),live=clean||"<p><br></p>";if(live!==editor.innerHTML){editor.innerHTML=live;updateRichEmpty(editor);richSyncCurrent(editor);notifyRichInput(editor,"formatBlock")}}if(event.target.matches?.("[data-overview-next],[data-week-action],[data-week-result],[data-top-result],[data-top-index],[data-week-review],[data-memo-title],[data-memo-content]")||editor?.matches?.("[data-week-review],[data-memo-content]"))directEditSessions.clear()});
document.addEventListener("change",event=>{
 let target=event.target;
 if(target.id==="searchTaskSort")return changeSearchTaskSort(target.value);
 else if(target.dataset.overviewDate){let id=target.dataset.overviewDate,value=target.value,field=target.dataset.dateField;if(!['planDate','followup'].includes(field))return;return setTaskDate(id,field,value)}
 else if(target.dataset.filterCheck){let field=target.dataset.filterCheck,value=target.value,list=taskFilter[field];target.checked?list.push(value):taskFilter[field]=list.filter(item=>item!==value);taskFilter[field]=[...new Set(taskFilter[field])];renderTasks();requestAnimationFrame(()=>{$('[data-filter-detail="'+field+'"]')?.setAttribute("open","")})}
 else if(target.dataset.bulkSelect){target.checked?ui.selectedTasks.add(target.dataset.bulkSelect):ui.selectedTasks.delete(target.dataset.bulkSelect);requestRender()}
 else if(target.dataset.bulkAll!==undefined){let items=filteredTasks();target.checked?items.forEach(task=>ui.selectedTasks.add(task.id)):items.forEach(task=>ui.selectedTasks.delete(task.id));requestRender()}
 else if(target.id==="bulkStatus"&&target.value){let ids=new Set(ui.selectedTasks),value=target.value;ui.selectedTasks.clear();commit("批量修改状态",draft=>draft.tasks.filter(task=>ids.has(task.id)).forEach(task=>setTaskStatus(task,value,draft)),{immediate:true})}
 else if(target.id==="bulkPriority"&&target.value){let ids=new Set(ui.selectedTasks),value=target.value;ui.selectedTasks.clear();commit("批量修改优先级",draft=>draft.tasks.forEach(task=>{if(ids.has(task.id)){task.priority=value;task.updatedAt=new Date().toISOString()}}),{immediate:true})}
 else if(target.id==="weekPicker"){selectedWeekKey=weekKeyFromInput(target.value);ui.showAllWeekDone=false;requestRender()}
 else if(target.dataset.memoProject!==undefined){let memo=memoById(selectedMemoId);if(memo)commit("修改备忘录关联项目",draft=>{let item=draft.memos.find(value=>value.id===memo.id);item.project=target.value;item.updatedAt=new Date().toISOString()},{immediate:true})}
 else if(target.id==="projectTemplate"){collectProjectDraft();projectTemplateMode=target.value;projectDraft.milestones=projectTemplateMode==="hardware"?hardwareMilestoneTemplate():[];projectMilestoneIndex=0;renderProjectEditor()}
 else if(target.id==="draftProject"){taskDraft.project=target.value;taskDraft.milestone="";$("#draftMilestone").innerHTML=milestoneOptions(taskDraft.project,"");syncHoverSelect($("#draftMilestone"));let jump=$("[data-go-task-project]");if(jump)jump.disabled=!taskDraft.project}
 else if(target.id==="draftStatus"){taskDraft.status=target.value;syncTaskCompletedField()}
 else if(target.id==="draftFocus"){
  if(target.checked){if(taskDraft.archived||["已完成"].includes($("#draftStatus").value)){target.checked=false;return toast("请先恢复事项，再加入今日")}$("#draftWeek").checked=true;$("#draftStatus").value="进行中";syncHoverSelect($("#draftStatus"));syncTaskCompletedField()}
  else if(isPlanDue({planDate:$("#draftPlanDate").value})){$("#draftPlanDate").value="";toast("已取消今日安排和已到期的计划日期")}
 }
 else if(target.id==="draftWeek"){if(!target.checked){$("#draftFocus").checked=false;if(isPlanDue({planDate:$("#draftPlanDate").value})){$("#draftPlanDate").value="";toast("已取消本周、今日安排和已到期的计划日期")}}}
 else if(target.id==="draftPlanDate"){let eligible=!taskDraft.archived&&!["待处理","等待","暂停","已完成"].includes($("#draftStatus").value);if(!target.value||target.value>todayKey())$("#draftFocus").checked=false;else if(eligible){$("#draftFocus").checked=true;$("#draftWeek").checked=true}}
 else if(target.id==="decisionProject"){decisionDraft.project=target.value;decisionDraft.milestone="";$("#decisionMilestone").innerHTML=milestoneOptions(decisionDraft.project,"");syncHoverSelect($("#decisionMilestone"))}
 else if(target.id==="decisionSourceTask"&&target.value){let source=taskById(target.value);if(source){decisionDraft.sourceTaskId=source.id;decisionDraft.project=source.project;decisionDraft.milestone=source.milestone;$("#decisionProject").innerHTML=decisionProjectOptions(source.project);$("#decisionMilestone").innerHTML=milestoneOptions(source.project,source.milestone);syncHoverSelect($("#decisionProject"));syncHoverSelect($("#decisionMilestone"))}}
 else if(target.dataset.checkDone!==undefined)taskDraft.checklist[Number(target.dataset.checkDone)].done=target.checked;
 else if(target.id==="attachmentInput"){let files=Array.from(target.files||[]);target.value="";if(files.length)void uploadTaskFiles(files)}
 else if(target.id==="importInput"){let file=target.files?.[0];target.value="";if(file)importFile(file)}
 if(target.closest?.("#taskEditor")&&target.id!=="relatedSearch"&&target.id!=="attachmentInput")scheduleTaskAutosave();
});
document.addEventListener("keydown",event=>{
 let divider=document.querySelector(".rich-divider.selected");if(divider&&!event.target.isContentEditable&&(event.key==="Delete"||event.key==="Backspace")){let context=richDividerContext(divider);if(context){event.preventDefault();context.quill.deleteText(context.index,1,"user");context.quill.setSelection(Math.max(0,context.index-1),0,"silent");return}}
 if(richKeydown(event))return;
 if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();$("#globalSearch").focus();return}
 let textEditing=!!event.target.closest?.("input,textarea,select,[contenteditable=true],.hover-select");
 if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){if(textEditing)return;event.preventDefault();event.shiftKey?redo():undo();return}
 if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="y"){if(textEditing)return;event.preventDefault();redo();return}
 if(event.key==="Escape"){closeChoice();let dialogs=$$("dialog[open]"),dialog=dialogs.at(-1);if(dialog){event.preventDefault();requestDialogClose(dialog);return}if(currentPage==="search"){event.preventDefault();closeGlobalSearch();return}}
 if(!textEditing&&!$("dialog[open]")&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==="n"){event.preventDefault();openTask("",{inbox:true,status:"待处理"});return}
 if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&["1","2","3","4","5"].includes(event.key)&&!event.target.closest("input,textarea,select,[contenteditable=true],.hover-select")&&!$("dialog[open]")){event.preventDefault();navigate(["today","week","tasks","projects","memos"][Number(event.key)-1])}
});

document.addEventListener('toggle',event=>{let owner=event.target;if(owner.dataset?.waitingGroup){owner.open?ui.waitingExpanded.add(owner.dataset.waitingGroup):ui.waitingExpanded.delete(owner.dataset.waitingGroup)}},true);
document.addEventListener('pointerover',event=>{if(!isMouseHover(event))return;let owner=event.target.closest?.('.inline-help');if(owner)owner.open=true});
document.addEventListener('pointerout',event=>{let owner=event.target.closest?.('.inline-help');if(owner&&!owner.contains(event.relatedTarget)&&!owner.matches(':focus-within'))owner.open=false});
document.addEventListener('focusin',event=>{let owner=event.target.closest?.('.inline-help');if(owner)owner.open=true});
document.addEventListener('focusout',event=>{let owner=event.target.closest?.('.inline-help');if(owner&&!owner.contains(event.relatedTarget))owner.open=false});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.inline-help[open]').forEach(owner=>owner.open=false)});


$("#projectDialog").addEventListener("cancel",event=>{event.preventDefault();requestProjectClose()});

