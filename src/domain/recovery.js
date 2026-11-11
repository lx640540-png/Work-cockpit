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
 let item=state.snapshots.find(value=>value.id===id);if(!item)return;confirmAction("恢复快照？","当前数据会先再生成一份快照，然后恢复所选版本。",()=>{checkpointLocal("恢复快照前的独立安全副本");markRestorePending();let current=snapshotCore();current.snapshots=[];replaceState(item.state,"恢复快照");state.snapshots.unshift({id:uid("snapshot"),label:"恢复前的安全快照",createdAt:new Date().toISOString(),state:current});state.snapshots=state.snapshots.slice(0,12);saveLocal(true)},"恢复");
}

