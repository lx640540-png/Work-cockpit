function currentWeek(){return state.weeks[selectedWeekKey]||(state.weeks[selectedWeekKey]=emptyWeek())}
function captureWeek(key,close=false){
 let week=state.weeks[key]||emptyWeek(),start=key,end=weekEnd(key),isCurrent=key===currentWeekKey(),member=new Set(week.taskIds||[]);
 if(!isCurrent&&state.weeks[key]){if(close&&!week.closedAt)week.closedAt=new Date().toISOString();return week}
 let completedHere=task=>!!task.completed&&task.completed>=start&&task.completed<=end;
 let taskSnapshots=state.tasks.filter(task=>(isCurrent?task.week&&!task.archived&&(!isDone(task)||completedHere(task)):member.has(task.id))||completedHere(task)).map(clone);
 let taskIds=isCurrent?taskSnapshots.filter(task=>task.week&&!task.archived).map(task=>task.id):Array.from(member);
 let projectIds=new Set(taskSnapshots.map(task=>task.project).filter(Boolean));
 let actions={...(week.actions||{})};if(isCurrent)taskSnapshots.filter(task=>task.week&&!task.archived).forEach(task=>{if(!Object.hasOwn(actions,task.id))actions[task.id]={text:task.nextAction||"",result:""}});
 week={...emptyWeek(),...week,actions,taskIds,taskSnapshots,projectSnapshots:state.projects.filter(project=>projectIds.has(project.id)).map(clone)};
 if(close&&!week.closedAt)week.closedAt=new Date().toISOString();
 state.weeks[key]=week;return week;
}
function captureCurrentWeek(){captureWeek(currentWeekKey(),false)}
function ensureCurrentWeek(){
 let now=currentWeekKey(),activeKey=String(state.meta?.activeWeekKey||""),previous=activeKey&&activeKey<now?activeKey:Object.keys(state.weeks).filter(key=>key<now).sort().pop(),existing=normalizeWeek(state.weeks[now]||emptyWeek()),active=state.tasks.filter(task=>task.week&&!task.archived&&!isDone(task)).map(task=>task.id);
 if(activeKey&&activeKey<now){
  if(previous)captureWeek(previous,true);
  let plannedTop=existing.top.slice(0,3);
  existing={...emptyWeek(),top:plannedTop,taskIds:active,carriedTaskIds:[...active],carriedFromWeek:active.length?previous||activeKey:"",activatedAt:new Date().toISOString()};
 }else{
  if(!activeKey&&previous&&!state.weeks[previous]?.closedAt)captureWeek(previous,true);
  let validTasks=new Set(state.tasks.map(task=>task.id));
  existing={...emptyWeek(),...existing,taskIds:active,carriedTaskIds:[...new Set((existing.carriedTaskIds||[]).filter(id=>validTasks.has(id)))],activatedAt:existing.activatedAt||new Date().toISOString(),closedAt:""};
 }
 existing.actions=existing.actions||{};state.tasks.filter(task=>task.week&&!task.archived&&(!isDone(task)||task.completed>=now&&task.completed<=weekEnd(now))).forEach(task=>{if(!Object.hasOwn(existing.actions,task.id))existing.actions[task.id]={text:task.nextAction||"",result:""}});
 state.weeks[now]=existing;state.meta.activeWeekKey=now;
}

