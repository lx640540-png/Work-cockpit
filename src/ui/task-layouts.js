// A single double-column task editor. Layout preferences from the trial are ignored.
let taskLayoutContext=null,taskLayoutMutation=null;
function taskChecklistSummary(){let count=taskDraft.checklist.filter(item=>item.done).length;return'<span>检查清单</span><span class="checklist-progress">'+count+' / '+taskDraft.checklist.length+'</span><span class="checklist-chevron" aria-hidden="true">'+(taskChecklistCollapsed?'⌄':'⌃')+'</span>'}
function taskLayoutField(id){return $("#"+id)?.closest(".field")}
function initTaskLayouts(){
 let root=$("#taskEditor"),modal=$("#taskDialog"),main=$(".task-content-column",root),props=$(".task-column:first-child",root),support=$(".attachment-column",root);if(!main||!props||!support)return;
 taskLayoutMutation?.disconnect();let previous=taskLayoutContext,same=previous?.id===taskDraft.id;modal.dataset.taskLayout="d";$("#saveTaskButton").textContent="关闭";
 let inner=document.createElement("div");inner.className="task-editor-inner";while(main.firstChild)inner.append(main.firstChild);main.append(inner);
 taskLayoutField("taskTitle").classList.add("task-name-field");taskLayoutField("taskNext").classList.add("task-next-field");
 let topRow=document.createElement("div"),chips=document.createElement("div"),time=document.createElement("div"),flags=document.createElement("div");topRow.className="task-v43-title-row";chips.className="task-v43-chips";time.className="task-v43-time";flags.className="task-v43-flags";inner.prepend(topRow,chips,time);topRow.append(taskLayoutField("taskTitle"));
 for(let id of["draftStatus","draftPriority","draftProject","draftType","draftMilestone"]){let field=taskLayoutField(id);field.querySelector("label").htmlFor=id;field.querySelector(".hover-select-trigger")?.setAttribute("aria-label",field.querySelector("label").textContent);chips.append(field)}
 let projectLink=$(".task-project-link",props);if(projectLink)chips.append(projectLink);
 for(let id of["draftPlanDate","draftDue","draftCompleted","draftFollowup"])time.append(taskLayoutField(id));time.append(flags);
 for(let id of["draftFocus","draftWeek"])flags.append($("#"+id).closest("label"));time.append($(".task-record-section",props));props.remove();$("#checklistResizer",inner)?.remove();
 let focus=document.createElement("button");focus.type="button";focus.className="task-focus-toggle";focus.dataset.taskFocus="";focus.textContent="⛶ 专注编辑";$(".task-notes-field .obsidian-heading",inner).append(focus);
 let labels={attachments:"附件",related:"关联",decisions:"决策",history:"周记录"},quick=document.createElement("nav");quick.className="task-support-shortcuts";quick.setAttribute("aria-label","事项辅助内容");quick.innerHTML=Object.entries(labels).map(([key,label])=>'<button type="button" data-task-support="'+key+'" data-task-quick aria-controls="taskSupport-'+key+'" aria-expanded="false">'+label+' <span data-task-support-count="'+key+'">0</span></button>').join("")+'<button type="button" data-task-support-toggle aria-controls="taskSupportPanel" aria-expanded="false" data-tip="辅助栏：非输入状态按 Tab 开关">辅助栏</button>';topRow.append(quick);
 support.id="taskSupportPanel";support.setAttribute("aria-label","事项辅助栏");let content=$(".task-support-content",support),sections=Array.from(content.children);Object.keys(labels).forEach((key,index)=>{sections[index].id="taskSupport-"+key;sections[index].dataset.taskSupportSection=key;sections[index].setAttribute("role","region");sections[index].setAttribute("aria-label",labels[key])});
 let supportScroll=document.createElement("div");supportScroll.className="task-support-scroll";supportScroll.innerHTML='<div class="task-support-heading"><strong>辅助内容</strong><button type="button" data-task-support-close aria-label="收起事项辅助栏">×</button></div>';supportScroll.append($(".checklist-section",inner),content);support.replaceChildren(supportScroll);
 taskLayoutContext={id:taskDraft.id,root,modal,main,inner,support,supportScroll,content,panel:same?previous.panel:"related",open:same?previous.open:true,scrolls:same?previous.scrolls:{}};
 showTaskSupport(taskLayoutContext.panel,taskLayoutContext.open);refreshTaskLayoutMeta();taskLayoutMutation=new MutationObserver(refreshTaskLayoutMeta);for(let node of root.querySelectorAll(".attachment-list,#relatedList,#taskDecisionList,#taskUploadQueue"))taskLayoutMutation.observe(node,{childList:true,subtree:true});
}
function refreshTaskLayoutMeta(){
 let c=taskLayoutContext;if(!c||!taskDraft||c.id!==taskDraft.id)return;let counts={attachments:taskDraft.attachments.length,related:relatedDraft.size,decisions:state.decisions.filter(item=>!item.archived&&item.sourceTaskId===taskDraft.id).length,history:taskHistoryEntries(taskDraft.id).length};c.root.querySelectorAll("[data-task-support-count]").forEach(node=>{let value=String(counts[node.dataset.taskSupportCount]);if(node.textContent!==value)node.textContent=value});
}
function showTaskSupport(panel,open=true,focus=false){
 let c=taskLayoutContext;if(!c||!["attachments","related","decisions","history"].includes(panel))return;
 if(c.open)c.scrolls[c.panel]=c.supportScroll.scrollTop;let focusedInside=c.support.contains(document.activeElement);c.panel=panel;c.open=open;c.modal.dataset.taskSupportOpen=String(open);c.support.hidden=!open;
 c.root.querySelectorAll("[data-task-support-section]").forEach(node=>node.hidden=node.dataset.taskSupportSection!==panel);
 c.root.querySelectorAll("[data-task-support]").forEach(button=>{let active=open&&button.dataset.taskSupport===panel;button.classList.toggle("active",active);button.setAttribute("aria-expanded",String(active))});
 c.root.querySelector("[data-task-support-toggle]").setAttribute("aria-expanded",String(open));c.supportScroll.scrollTop=c.scrolls[panel]||0;
 if(focus||(!open&&focusedInside))c.root.querySelector('[data-task-quick][data-task-support="'+panel+'"]').focus({preventScroll:true});
}
document.addEventListener("click",event=>{
 if(event.target.closest("[data-task-focus]")){toggleRichExpanded($("#taskNotes"));return}
 let panel=event.target.closest("[data-task-support]");if(panel){let c=taskLayoutContext;showTaskSupport(panel.dataset.taskSupport,!(c.open&&c.panel===panel.dataset.taskSupport));return}
 if(event.target.closest("[data-task-support-close]"))showTaskSupport(taskLayoutContext.panel,false,true);
 if(event.target.closest("[data-task-support-toggle]"))showTaskSupport(taskLayoutContext.panel,!taskLayoutContext.open);
});
document.addEventListener("keydown",event=>{
 let c=taskLayoutContext;if(!$("#taskDialog")?.open||!c||Array.from(document.querySelectorAll("dialog[open]")).at(-1)?.id!=="taskDialog")return;
 if(event.key==="Tab"&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&!expandedRichBox&&!activeHoverSelect&&!event.target.closest('input,textarea,select,[contenteditable="true"],[role="listbox"],[role="option"]')){event.preventDefault();event.stopImmediatePropagation();showTaskSupport(c.panel,!c.open);return}
 if(event.key==="Escape"&&c.open&&!activeHoverSelect&&!expandedRichBox){event.preventDefault();event.stopImmediatePropagation();showTaskSupport(c.panel,false,true);return}
 let tab=event.target.closest("[data-task-quick][data-task-support]");if(!tab||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
 event.preventDefault();let tabs=Array.from(tab.parentElement.querySelectorAll("[data-task-support]")),index=tabs.indexOf(tab),next=event.key==="Home"?0:event.key==="End"?tabs.length-1:(index+(event.key==="ArrowLeft"?-1:1)+tabs.length)%tabs.length;showTaskSupport(tabs[next].dataset.taskSupport,true,true);
},true);
