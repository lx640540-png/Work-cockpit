// Scheduling changes dates and Today membership, never task status or historical weeks.
function isFollowupDue(task,today=todayKey()){
 return !task.archived&&!isDone(task)&&task.status==="等待"&&!!task.followup&&task.followup<=today&&task.handledOn!==today;
}
function taskScheduleField(task){return task.status==="等待"?"followup":"planDate"}
function validTaskDate(value){return value===""||/^\d{4}-\d{2}-\d{2}$/.test(value)&&fmt(parseDate(value))===value}
function taskDateFlags(task,today=todayKey()){
 let open=!task.archived&&!isDone(task);
 return {plan:open&&canAdvanceToday(task)&&!!task.planDate&&task.planDate<today,
  followup:open&&task.status==="等待"&&!!task.followup&&task.followup<today,
  due:open&&!!task.due&&task.due<today};
}
function setTaskDate(id,field,value){
 let task=taskById(id);if(!task||task.archived||isDone(task)||!["planDate","followup","due"].includes(field))return false;
 if(!validTaskDate(value)){toast("请选择有效日期");return false}
 updateTask(id,"调整"+({planDate:"计划日期",followup:"跟进日期",due:"截止日期"}[field]),item=>{
  let previous={...item};item[field]=value;
  if(field==="planDate"&&!value)item.focus=false;
  reconcileTaskEdit(item,previous);
 });return true;
}
function taskDateWarnings(task){
 let flags=taskDateFlags(task);
 return (flags.plan?'<span class="date-warning plan">计划已过 '+dateShort(task.planDate)+'</span>':"")+
  (flags.followup&&!isFollowupDue(task)?'<span class="date-warning followup">跟进逾期 '+dateShort(task.followup)+'</span>':"")+
  (flags.due?'<span class="date-warning deadline">截止逾期 '+dateShort(task.due)+'</span>':"");
}
