function archiveProject(id){
 let project=projectById(id);if(!project)return;if(project.archived){commit("恢复项目",draft=>draft.projects.find(value=>value.id===id).archived=false,{immediate:true});closeDialog("projectDialog");return}confirmAction("归档项目？","项目事项仍会保留，但项目不再出现在日常项目视图。",()=>{commit("归档项目",draft=>{let item=draft.projects.find(value=>value.id===id);item.archived=true;draft.favorites=draft.favorites.filter(value=>value!==id)},{immediate:true});closeDialog("projectDialog")},"归档");
}
function deleteProject(id){
 let project=projectById(id);if(!project)return;
 confirmTwice("删除项目？","项目会进入回收站；关联任务和关键决策会保留，但会解除项目及里程碑关联。",()=>{
  commit("删除项目",draft=>{
   let links=draft.tasks.filter(task=>task.project===id).map(task=>({id:task.id,milestone:task.milestone||""})),decisionLinks=draft.decisions.filter(decision=>decision.project===id).map(decision=>({id:decision.id,milestone:decision.milestone||""}));
   draft.trash.unshift({id:uid("trash"),type:"project",deletedAt:new Date().toISOString(),data:clone(project),links,decisionLinks});
   draft.projects=draft.projects.filter(item=>item.id!==id);draft.order.projects=draft.order.projects.filter(value=>value!==id);draft.favorites=draft.favorites.filter(value=>value!==id);
   draft.tasks.forEach(task=>{if(task.project===id){task.project="";task.milestone="";task.updatedAt=new Date().toISOString()}});
   draft.decisions.forEach(decision=>{if(decision.project===id){decision.project="";decision.milestone=""}});
  },{immediate:true});
  if(selectedProjectId===id)selectedProjectId="";closeDialog("projectDialog");toast("项目已移入回收站");
 },"确认删除");
}
