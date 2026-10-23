function currentWeek(){return state.weeks[selectedWeekKey]||(state.weeks[selectedWeekKey]=emptyWeek())}
function captureWeek(key,close=false){
 let week=state.weeks[key]||emptyWeek(),start=key,end=weekEnd(key),isCurrent=key===currentWeekKey(),member=new Set(week.taskIds||[]);
 if(!isCurrent&&state.weeks[key]){if(close&&!week.closedAt)week.closedAt=new Date().toISOString();return week}
 let completedHere=task=>!!task.completed&&task.completed>=start&&task.completed<=end;
 // Membership records that a task was planned, not only its current toggle.
 let previous=new Map((week.taskSnapshots||[]).map(task=>[task.id,task]));
 state.tasks.filter(task=>task.week&&!task.archived&&(!isDone(task)||completedHere(task))).forEach(task=>member.add(task.id));
 let taskIds=Array.from(member).filter(id=>{let task=state.tasks.find(item=>item.id===id)||previous.get(id);return task&&(!isDone(task)||!task.completed||task.completed>=start||!!week.actions?.[id]?.result)});
 member=new Set(taskIds);
 let taskSnapshots=state.tasks.filter(task=>member.has(task.id)||completedHere(task)).map(clone);
 taskIds.forEach(id=>{if(!taskSnapshots.some(task=>task.id===id)&&previous.has(id))taskSnapshots.push(clone(previous.get(id)))});
 let projectIds=new Set(taskSnapshots.map(task=>task.project).filter(Boolean));
 let actions={...(week.actions||{})};if(isCurrent)taskSnapshots.filter(task=>member.has(task.id)).forEach(task=>{if(!Object.hasOwn(actions,task.id))actions[task.id]={text:task.nextAction||"",result:""}});
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
  existing={...emptyWeek(),...existing,taskIds:[...new Set([...existing.taskIds,...active])],carriedTaskIds:[...new Set((existing.carriedTaskIds||[]).filter(id=>validTasks.has(id)))],activatedAt:existing.activatedAt||new Date().toISOString(),closedAt:""};
 }
 existing.actions=existing.actions||{};state.tasks.filter(task=>task.week&&!task.archived&&(!isDone(task)||task.completed>=now&&task.completed<=weekEnd(now))).forEach(task=>{if(!Object.hasOwn(existing.actions,task.id))existing.actions[task.id]={text:task.nextAction||"",result:""}});
 state.weeks[now]=existing;state.meta.activeWeekKey=now;
}
