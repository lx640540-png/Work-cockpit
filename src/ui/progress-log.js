function progressLogRows(entries,editable=false){
 return [...entries].reverse().map(entry=>{let date=new Date(entry.createdAt),label=Number.isFinite(date.getTime())?date.toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"未记录时间",actions=editable?'<span class="progress-log-actions"><button type="button" class="link-btn" data-edit-progress="'+esc(entry.id)+'">编辑</button><button type="button" class="link-btn danger" data-delete-progress="'+esc(entry.id)+'">删除</button></span>':'';return '<li data-progress-entry="'+esc(entry.id)+'"><div class="progress-log-meta"><time>'+esc(label)+'</time>'+actions+'</div><p>'+esc(entry.text)+'</p></li>'}).join('');
}
function taskProgressInputMarkup(task){return '<section class="task-section progress-input-section"><div class="task-section-title"><label for="taskProgressInput">本次进展</label><button type="button" class="link-btn" data-add-progress>记录进展</button></div><textarea id="taskProgressInput" rows="3" maxlength="2000" aria-label="本次进展">'+esc(task.progressDraft||'')+'</textarea><small>自动保存草稿，点击“记录进展”形成记录。</small></section>'}
function taskProgressHistory(task){let entries=task.progressLog||[],recent=entries.slice(-3),older=entries.slice(0,-3);return '<ol class="progress-log-list">'+progressLogRows(recent,true)+'</ol>'+(older.length?'<details class="progress-history-more"><summary>较早记录 · '+older.length+'</summary><ol class="progress-log-list">'+progressLogRows(older,true)+'</ol></details>':'')}
function taskProgressMarkup(task){return '<section class="task-section progress-log-section"><div class="task-section-title"><span>推进记录 · '+(task.progressLog||[]).length+'</span></div><div id="taskProgressList">'+taskProgressHistory(task)+'</div></section>'}
function refreshTaskProgressList(){if(!taskDraft)return;let list=$("#taskProgressList");if(list)list.innerHTML=taskProgressHistory(taskDraft);let count=$(".progress-log-section .task-section-title span");if(count)count.textContent="推进记录 · "+(taskDraft.progressLog||[]).length}
function addTaskProgress(){
 if(!taskDraft)return;let text=$("#taskProgressInput")?.value.trim();if(!text)return toast("请先填写本次进展");
 if(!persistTaskDraft())return;
 let id=taskDraft.id;
 updateTask(id,"记录推进进展",task=>{task.progressLog.push({id:uid("progress"),text,createdAt:new Date().toISOString()});task.progressDraft=""});
 taskDraft=clone(taskById(id));taskAutosaveSignature=taskDraftSignature(taskDraft);directEditSessions.delete("task:auto:"+id);
 $("#taskProgressInput").value="";refreshTaskProgressList();
 setTaskAutosaveStatus("saved","推进记录已保存");
}
function beginEditTaskProgress(id){
 let entry=taskDraft?.progressLog?.find(item=>item.id===id),row=$('[data-progress-entry="'+CSS.escape(id)+'"]');if(!entry||!row)return;
 row.innerHTML='<textarea class="progress-edit-input" rows="3" maxlength="2000" aria-label="编辑推进记录">'+esc(entry.text)+'</textarea><div class="progress-edit-actions"><button type="button" class="btn primary" data-save-progress="'+esc(id)+'">保存</button><button type="button" class="btn" data-cancel-progress-edit>取消</button></div>';let input=row.querySelector("textarea");input.focus();input.setSelectionRange(input.value.length,input.value.length);
}
function saveTaskProgressEdit(id){
 let input=$('[data-progress-entry="'+CSS.escape(id)+'"] .progress-edit-input'),text=input?.value.trim();if(!text)return toast("推进记录不能为空");
 updateTask(taskDraft.id,"编辑推进记录",task=>{let entry=task.progressLog.find(item=>item.id===id);if(entry)entry.text=text});taskDraft=clone(taskById(taskDraft.id));taskAutosaveSignature=taskDraftSignature(taskDraft);refreshTaskProgressList();setTaskAutosaveStatus("saved","推进记录已更新");
}
function deleteTaskProgress(id){
 let entry=taskDraft?.progressLog?.find(item=>item.id===id);if(!entry)return;
 confirmAction("删除这条推进记录？","删除后可使用全局撤销恢复。",()=>{updateTask(taskDraft.id,"删除推进记录",task=>task.progressLog=task.progressLog.filter(item=>item.id!==id));taskDraft=clone(taskById(taskDraft.id));taskAutosaveSignature=taskDraftSignature(taskDraft);refreshTaskProgressList();setTaskAutosaveStatus("saved","推进记录已删除")},"删除");
}
function weekProgressMarkup(task,key){
 let entries=progressEntriesForWeek(task,key);if(!entries.length)return "";
 return '<details class="week-progress-records"><summary>本周推进记录 · '+entries.length+'</summary><ol class="progress-log-list">'+progressLogRows(entries)+'</ol></details>';
}
