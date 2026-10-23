// Explicit handoffs reuse tasks, week actions and plan dates; no duplicate task records.
function appendJournalTaskResult(draft,key,id,blocks){
 const task=draft.tasks.find(item=>item.id===id&&!item.archived);if(!task)return 0;
 const groups=new Map();for(const block of blocks||[]){const text=String(block.text||'').trim();if(!text)continue;if(!groups.has(block.date))groups.set(block.date,[]);groups.get(block.date).push(text)}
 const existing=draft.weeks[key],previous=existing?.actions?.[id]||{text:'',result:''};let result=previous.result||'',added=0;
 for(const [date,texts] of groups){for(const text of texts){const entry=date+' · '+text;if(result.includes(entry))continue;result+=(result?'\n\n':'')+entry;added++}}
 if(!added)return 0;
 const week=existing||(draft.weeks[key]=emptyWeek());week.actions||={};week.actions[id]={...previous,result};week.taskIds=[...new Set([...(week.taskIds||[]),id])];week.taskSnapshots||=[];
 if(!week.taskSnapshots.some(item=>item.id===id))week.taskSnapshots.push(clone(task));return added;
}
function planningReviewRange(now=todayKey()){
 const start=fmt(mondayOf(parseDate(now))),next=fmt(addDays(parseDate(start),7));return{start,end:weekEnd(start),next,nextEnd:weekEnd(next)};
}
function applyPlanningReview(draft,scope,decisions,now=todayKey()){
 if(!['today','week','next'].includes(scope))return{ok:false,message:'未知的安排范围'};
 const range=planningReviewRange(now),changes=[];
 for(const choice of decisions||[]){
  if(choice.action==='keep')continue;
  const task=draft.tasks.find(item=>item.id===choice.id);if(!task||task.archived||isDone(task))return{ok:false,message:'事项已完成或移除，请重新检查安排'};
  if(!['remove','postpone','schedule'].includes(choice.action)||scope==='next'&&choice.action!=='schedule'||scope!=='next'&&choice.action==='schedule')return{ok:false,message:'请选择有效的安排操作'};
  if(['postpone','schedule'].includes(choice.action)&&(!journalDateValid(choice.date)||choice.date<=now))return{ok:false,message:'改期日期需要晚于今天'};
  if(scope==='next'&&(choice.date<range.next||choice.date>range.nextEnd))return{ok:false,message:'请选择下周范围内的日期'};
  if(scope==='next'&&['等待','暂停'].includes(task.status))return{ok:false,message:'等待或暂停事项请先在详情恢复为可推进状态'};
  changes.push({task,...choice});
 }
 let changed=0;
 for(const choice of changes){const {task}=choice,before=JSON.stringify(task);
  if(choice.action==='remove'){if(scope==='week')setTaskWeek(task,false,draft);else setTaskFocus(task,false,draft)}
  else{if(scope==='next'&&task.status==='待处理')setTaskStatus(task,'进行中',draft);task.focus=false;task.planDate=choice.date;if(scope!=='next'){if(choice.date>range.end)task.week=false;else if(scope==='week')task.week=true}}
  if(JSON.stringify(task)!==before){task.updatedAt=new Date().toISOString();changed++}
 }
 return{ok:true,changed};
}
