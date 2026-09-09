function deleteTask(id){
 let task=taskById(id);if(!task)return;
 confirmAction("删除事项？","事项会进入回收站，可在“数据与恢复”中找回；已形成的关键决策会保留。",()=>{commit("删除事项",draft=>{let decisionLinks=draft.decisions.filter(decision=>decision.sourceTaskId===id).map(decision=>decision.id);draft.trash.unshift({id:uid("trash"),type:"task",deletedAt:new Date().toISOString(),data:clone(task),decisionLinks});draft.tasks=draft.tasks.filter(item=>item.id!==id);draft.tasks.forEach(item=>item.relatedTaskIds=item.relatedTaskIds.filter(link=>link!==id));draft.decisions.forEach(decision=>{if(decision.sourceTaskId===id)decision.sourceTaskId=""})},{immediate:true});closeDialog("taskDialog");toast("事项已移入回收站")},"删除");
}
