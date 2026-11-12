function taskPriority(task){return priorities.indexOf(task.priority)}
function smartSort(items,scope){
 let today=todayKey();
 return [...items].sort((a,b)=>{
  if(scope==="waiting")return(a.followup||"9999-12-31").localeCompare(b.followup||"9999-12-31");
  if(scope==="done")return(b.completed||b.updatedAt||"").localeCompare(a.completed||a.updatedAt||"");
  if(scope==="long")return(a.followup||a.due||"9999-12-31").localeCompare(b.followup||b.due||"9999-12-31");
  let overdueA=a.due&&a.due<today?-100:0,overdueB=b.due&&b.due<today?-100:0;
  return(overdueA+taskPriority(a)*10)-(overdueB+taskPriority(b)*10)||(a.planDate||"9999").localeCompare(b.planDate||"9999")||(a.due||"9999").localeCompare(b.due||"9999");
 });
}
function ordered(items,scope){
 let order=state.order[scope]||[],rank=new Map(order.map((id,index)=>[id,index])),fallback=new Map(items.map((task,index)=>[task.id,index]));return[...items].sort((a,b)=>(rank.get(a.id)??order.length+(fallback.get(a.id)||0))-(rank.get(b.id)??order.length+(fallback.get(b.id)||0)));
}
function reconcileVisibleOrder(existing,beforeIds,afterIds){
 let touched=new Set([...beforeIds,...afterIds]),queue=[...afterIds],next=[],insertAt=-1;
 for(let id of existing||[]){
  if(touched.has(id)){if(queue.length)next.push(queue.shift());insertAt=next.length}
  else next.push(id);
 }
 if(queue.length)next.splice(insertAt<0?next.length:insertAt,0,...queue);
 return[...new Set(next)];
}
function applySmartOrder(items,scope){
 let pins=new Set(state.order[pinKey(scope)]||[]),sorted=smartSort(items.filter(task=>pins.has(task.id)),scope).concat(smartSort(items.filter(task=>!pins.has(task.id)),scope)),visible=new Set(sorted.map(task=>task.id)),old=state.order[scope]||[];
 commit("智能排序",draft=>{draft.order[scope]=sorted.map(task=>task.id).concat(old.filter(id=>!visible.has(id)))},{immediate:true});toast("已完成智能排序；后续修改不会自动重排");
}
function reorderId(list,fromId,toId,position="before"){let from=list.indexOf(fromId);if(from<0||fromId===toId)return false;let item=list.splice(from,1)[0],to=toId?list.indexOf(toId):-1;if(to<0)list.push(item);else list.splice(to+(position==="after"?1:0),0,item);return true}
function reorderIndex(list,from,to,position="before"){if(from<0||to<0||from>=list.length||to>=list.length||from===to)return false;let target=list[to],item=list.splice(from,1)[0],next=list.indexOf(target);list.splice(next+(position==="after"?1:0),0,item);return true}
function moveOrder(scope,fromId,toId,position="before"){
 let order=state.order[scope]||(state.order[scope]=[]);if(order.indexOf(fromId)<0||fromId===toId)return;
 commit("手动调整顺序",draft=>reorderId(draft.order[scope],fromId,toId,position),{immediate:true});
}
function canAdvanceToday(task){return!task.archived&&!isDone(task)&&!["待处理","等待","暂停"].includes(task.status)}
function isPlanDue(task,today=todayKey()){return!!task.planDate&&task.planDate<=today}
function activateScheduledTasks(value=state){
 let changed=false,today=todayKey(),range=planningReviewRange(today);
 value.tasks.forEach(task=>{if(!canAdvanceToday(task))return;let updated=false;if(task.planDate>=range.start&&task.planDate<=range.end&&!task.week){task.week=true;updated=true}if(isPlanDue(task,today)&&!task.focus){task.focus=true;task.week=true;updated=true}if(updated){task.updatedAt=new Date().toISOString();changed=true}});
 return changed;
}
function refreshScheduledTasks(){if(activateScheduledTasks()){captureCurrentWeek();saveLocal(true);requestRender()}}
function setTaskFocus(task,active,draft){
 if(active){if(task.archived||isDone(task))return;setTaskStatus(task,"进行中",draft);task.focus=true;task.week=true}
 else{task.focus=false;if(isPlanDue(task))task.planDate=""}
}
function setTaskWeek(task,active,draft){
 task.week=!!active;if(active)return;
 setTaskFocus(task,false,draft);
 if(task.planDate&&task.planDate<=planningReviewRange().end)task.planDate="";
}
function reconcileTaskEdit(task,previous){
 if(previous&&task.planDate!==previous.planDate&&(!task.planDate||task.planDate>todayKey()))task.focus=false;
 if(!canAdvanceToday(task))task.focus=false;
 if(task.focus)task.week=true;
}
function applyTaskCardTransition(task,fromScope,toScope,draft){
 if(fromScope===toScope)return;
 let previous={...task},transition=TASK_CARD_TRANSITIONS[toScope];if(!transition?.accept)return;
 transition.apply(task,draft);reconcileTaskEdit(task,previous);
}
const TASK_CARD_TRANSITIONS=Object.freeze({today:{label:"我来推进",accept:true,apply(task,draft){setTaskFocus(task,true,draft)}},waiting:{label:"等待与催办",accept:true,apply(task,draft){setTaskStatus(task,"等待",draft)}},inbox:{label:"临时收件箱",accept:true,apply(task,draft){setTaskStatus(task,"待处理",draft)}},week:{label:"本周推进事项",accept:true,apply(task){task.week=true}},long:{label:"长期跟进",accept:true,apply(task,draft){task.type="长期跟进";setTaskWeek(task,false,draft)}},done:{label:"本周完成",accept:false}});
const pinKey=scope=>"pin"+scope.charAt(0).toUpperCase()+scope.slice(1);
function isPinned(taskId,scope){return(state.order[pinKey(scope)]||[]).includes(taskId)}
function pinOrdered(items,scope){let rows=ordered(items,scope),pins=new Set(state.order[pinKey(scope)]||[]);return rows.filter(task=>pins.has(task.id)).concat(rows.filter(task=>!pins.has(task.id)))}
function updateTask(id,label,updater){commit(label,draft=>{let task=draft.tasks.find(item=>item.id===id);if(!task)return;updater(task,draft);task.updatedAt=new Date().toISOString()},{immediate:true})}
function moveTask(id,fromScope,toScope,toId="",position="before"){let transition=TASK_CARD_TRANSITIONS[toScope];if(!transition?.accept||id===toId)return;commit("移动事项至"+transition.label,draft=>{let task=draft.tasks.find(item=>item.id===id);if(!task)return;let sourcePinKey=pinKey(fromScope),targetPinKey=pinKey(toScope),wasPinned=(draft.order[sourcePinKey]||[]).includes(id);applyTaskCardTransition(task,fromScope,toScope,draft);task.updatedAt=new Date().toISOString();let source=draft.order[fromScope]||[],target=(draft.order[toScope]||[]).filter(value=>value!==id);draft.order[fromScope]=source.filter(value=>value!==id);let at=toId?target.indexOf(toId):-1;target.splice(at<0?target.length:at+(position==="after"?1:0),0,id);draft.order[toScope]=target;draft.order[sourcePinKey]=(draft.order[sourcePinKey]||[]).filter(value=>value!==id);let targetPins=new Set((draft.order[targetPinKey]||[]).filter(value=>value!==id));if(wasPinned)targetPins.add(id);draft.order[targetPinKey]=target.filter(value=>targetPins.has(value))},{immediate:true})}
function followupReminder(task){if(!isFollowupDue(task))return"";let days=Math.round((parseDate(todayKey())-parseDate(task.followup))/86400000),text=days?"跟进逾期 "+days+" 天":"今日跟进";return'<span class="followup reminder" data-tip="跟进日期已到，请确认进展">◷ '+text+'</span>'}
function openTasks(){return state.tasks.filter(task=>!task.archived&&!isDone(task))}
function todayAdvance(){return openTasks().filter(task=>canAdvanceToday(task)&&task.focus)}
function todayWaiting(){return openTasks().filter(task=>task.status==="等待")}
function inboxTasks(){return openTasks().filter(task=>task.inbox)}
function weekTasks(){return openTasks().filter(task=>task.week)}
function longTasks(){return openTasks().filter(task=>task.type==="长期跟进")}
if(typeof localReadIssue==="undefined"||!localReadIssue){
 ensureCurrentWeek();captureCurrentWeek();
 localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshotCore()));
}
function setTaskStatus(item,value,draft,options={}){
 let previousStatus=item.status;item.status=value;
 item.inbox=value==="待处理";
 if(previousStatus==="等待"&&value!=="等待")item.followup="";
 if(["待处理","等待","暂停","已完成"].includes(value))item.focus=false;
 if(options.fromToday&&value==="进行中"){item.focus=true;item.week=true}
 if(value==="已完成"){if(!item.completed)item.completed=todayKey()}else item.completed="";
 item.updatedAt=new Date().toISOString();
}
function toggleTask(id){
 let task=taskById(id);if(!task)return;
 updateTask(id,isDone(task)?"恢复事项":"完成事项",(item,draft)=>setTaskStatus(item,isDone(item)?"进行中":"已完成",draft));
}
function updateProperty(id,field,value){let task=taskById(id);if(!task)return;updateTask(id,"修改事项"+(field==="status"?"状态":"优先级"),(item,draft)=>{if(field==="status")setTaskStatus(item,value,draft,{fromToday:currentPage==="today"});else item.priority=value})}

function applyTaskDraftToState(saved){
 let links=new Set(saved.relatedTaskIds),index=state.tasks.findIndex(task=>task.id===saved.id),previous=index>=0?state.tasks[index]:null;
 if(previous&&saved.status!==previous.status){let status=saved.status,completed=saved.completed,followup=saved.followup;saved.status=previous.status;saved.completed=previous.completed;setTaskStatus(saved,status,state);if(completed)saved.completed=completed;if(followup!==previous.followup)saved.followup=followup}
 reconcileTaskEdit(saved,previous);index=state.tasks.findIndex(task=>task.id===saved.id);if(index>=0)state.tasks[index]=saved;else state.tasks.unshift(saved);
 state.tasks.forEach(task=>{if(task.id===saved.id)return;let related=new Set(task.relatedTaskIds||[]);links.has(task.id)?related.add(saved.id):related.delete(saved.id);task.relatedTaskIds=Array.from(related)});
}

