function progressLogRows(entries){
 return [...entries].reverse().map(entry=>{let date=new Date(entry.createdAt),label=Number.isFinite(date.getTime())?date.toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"未记录时间";return '<li><time>'+esc(label)+'</time><p>'+esc(entry.text)+'</p></li>'}).join('');
}
function taskProgressMarkup(task){return '<section class="task-section progress-log-section"><div class="task-section-title"><span>推进记录 · '+(task.progressLog||[]).length+'</span><button type="button" class="link-btn" data-add-progress>记录进展</button></div><label for="taskProgressInput">本次进展</label><textarea id="taskProgressInput" rows="2" maxlength="2000" aria-label="本次进展">'+esc(task.progressDraft||'')+'</textarea><small class="muted">输入自动保存为草稿，点击“记录进展”后加入时间记录。</small><div id="taskProgressList"><ol class="progress-log-list">'+progressLogRows(task.progressLog||[])+'</ol></div></section>'}
function addTaskProgress(){
 if(!taskDraft)return;let text=$("#taskProgressInput")?.value.trim();if(!text)return toast("请先填写本次进展");
 if(!persistTaskDraft())return;
 let id=taskDraft.id;
 updateTask(id,"记录推进进展",task=>{task.progressLog.push({id:uid("progress"),text,createdAt:new Date().toISOString()});task.progressDraft=""});
 taskDraft=clone(taskById(id));taskAutosaveSignature=taskDraftSignature(taskDraft);directEditSessions.delete("task:auto:"+id);
 $("#taskProgressInput").value="";$("#taskProgressList").innerHTML='<ol class="progress-log-list">'+progressLogRows(taskDraft.progressLog)+'</ol>';
 $(".progress-log-section .task-section-title span").textContent="推进记录 · "+taskDraft.progressLog.length;
 setTaskAutosaveStatus("saved","推进记录已保存");
}
function weekProgressMarkup(task,key){
 let entries=progressEntriesForWeek(task,key);if(!entries.length)return "";
 return '<details class="week-progress-records"><summary>本周推进记录 · '+entries.length+'</summary><ol class="progress-log-list">'+progressLogRows(entries)+'</ol></details>';
}
