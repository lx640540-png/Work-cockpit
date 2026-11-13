/* Trial only: project overview and continuous daily journal. */
const projectOverviewUI={editing:'',expanded:new Set()};
function projectOverviewMarkup(project){
 const html=project.overviewHtml||normalizeRich(project.description),editing=projectOverviewUI.editing===project.id,expanded=projectOverviewUI.expanded.has(project.id),filled=BackupFormat.meaningful(html);
 if(!editing&&!filled)return '<section class="project-overview-document"><button class="link-btn" data-overview-edit="'+esc(project.id)+'">＋ 添加项目概述</button></section>';
 return '<section class="project-overview-document"><header><h3>项目概述</h3><button class="link-btn" '+(editing?'data-overview-done':'data-overview-edit')+'="'+esc(project.id)+'">'+(editing?'完成编辑':'✎ 编辑')+'</button></header>'+(editing?'<div class="editor-box">'+toolbar()+'<div class="rich-editor" data-overview-content="'+esc(project.id)+'" contenteditable="true" data-placeholder="记录项目目标、范围和关键判断…">'+html+'</div></div><small class="muted">编辑后保存在本机；试用页与正式数据隔离。</small>':'<div class="project-overview-reading '+(expanded?'expanded':'')+'">'+html+'</div>'+(html.length>180?'<button class="link-btn" data-overview-expand="'+esc(project.id)+'">'+(expanded?'收起':'展开全部 ▾')+'</button>':''))+'</section>';
}
function trialResizeChecklist(){document.querySelectorAll('#draftChecklist textarea').forEach(el=>{el.style.height='auto';el.style.height=Math.max(28,el.scrollHeight)+'px'})}
document.addEventListener('input',event=>{
 const editor=event.target.closest('[data-overview-content]');if(editor){const project=projectById(editor.dataset.overviewContent);if(project){recordDirectEdit('overview:'+project.id,'编辑项目概述');project.overviewHtml=serializeRichEditor(editor);project.updatedAt=new Date().toISOString();saveLocal();}return}
 if(event.target.matches('#draftChecklist textarea'))trialResizeChecklist();
});
document.addEventListener('click',event=>{
 const edit=event.target.closest('[data-overview-edit]'),done=event.target.closest('[data-overview-done]'),expand=event.target.closest('[data-overview-expand]');
 if(edit||done||expand){if(!flushPendingEdits())return;let id=edit?.dataset.overviewEdit||done?.dataset.overviewDone||expand?.dataset.overviewExpand;if(edit)projectOverviewUI.editing=id;if(done)projectOverviewUI.editing='';if(expand){projectOverviewUI.expanded.has(id)?projectOverviewUI.expanded.delete(id):projectOverviewUI.expanded.add(id)}renderApp();if(edit){const editor=document.querySelector('[data-overview-content]');initQuillEditors(document.querySelector('.project-overview-document'));quillFor(editor)?.focus()}return}
 const mode=event.target.closest('[data-trial-journal-mode]');if(mode){if(!journalFlush())return;journalUI.reviewMode=!journalUI.reviewMode;journalUI.reviewOpen=journalUI.reviewMode;if(journalUI.reviewMode)journalUI.expanded=true;syncWorkJournal();mode.textContent=journalUI.reviewMode?'返回每日记录':'周五整理';}
});
document.addEventListener('keydown',event=>{
 if(!event.target.matches('#draftChecklist textarea')||event.key!=='Enter'||event.shiftKey||event.isComposing||event.keyCode===229)return;
 event.preventDefault();event.stopImmediatePropagation();collectChecklistText();taskDraft.checklist.push(normalizeChecklistItem({text:''}));refreshChecklist({focusLast:true});scheduleTaskAutosave();
},true);
let trialChecklistWidth=0;new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(width===trialChecklistWidth)return;trialChecklistWidth=width;trialResizeChecklist()}).observe(document.querySelector('#taskEditor'));
