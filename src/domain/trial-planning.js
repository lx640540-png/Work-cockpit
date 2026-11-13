// Trial data only; production storage and schema are unchanged.
const TRIAL_STAGE_STATES=["未开始","进行中","待验收","已通过","已跳过"];
function normalizeTrialStage(raw){
 let stageStatus=TRIAL_STAGE_STATES.includes(raw?.stageStatus)?raw.stageStatus:raw?.status==="已完成"?"已通过":["当前阶段","阻塞"].includes(raw?.status)?"进行中":"未开始",isCurrent=typeof raw?.isCurrent==="boolean"?raw.isCurrent:raw?.status==="当前阶段";
 return{stageStatus,isCurrent,goal:String(raw?.goal||""),conclusion:String(raw?.conclusion||""),relatedTaskIds:[...new Set((Array.isArray(raw?.relatedTaskIds)?raw.relatedTaskIds:[]).map(String))],acceptance:(Array.isArray(raw?.acceptance)?raw.acceptance:[]).filter(row=>row&&typeof row==="object").map(row=>({id:String(row.id||uid("acceptance")),deliverable:String(row.deliverable||""),condition:String(row.condition||""),evidence:String(row.evidence||""),result:["待验证","通过","不通过","不适用"].includes(row.result)?row.result:"待验证"})),status:isCurrent?"当前阶段":stageStatus==="已通过"?"已完成":raw?.status==="阻塞"?"阻塞":"未开始"};
}
function trialEvidenceURL(value){try{let url=new URL(value);return ["https:","http:"].includes(url.protocol)?url.href:""}catch{return ""}}
function trialScheduleItems(key,mode,week){
 let tasks=mode==="past"?(week.taskSnapshots||[]):state.tasks,end=weekEnd(key),inside=date=>date&&date>=key&&date<=end;
 return tasks.filter(task=>!task.archived&&(!isDone(task)||mode==="past")&&(inside(task[taskScheduleField(task)])||inside(task.due)||(mode!=="future"&&task.week)));
}
function trialScheduleBucket(task,key){let date=task[taskScheduleField(task)];return date&&date>=key&&date<=weekEnd(key)?date:""}
function moveTrialScheduleTask(id,date,key=selectedWeekKey){
 if(weekMode(key)==="past"||!validTaskDate(date)||date&&(date<key||date>weekEnd(key)))return false;
 let task=taskById(id);if(!task||task.archived||isDone(task))return false;
 return setTaskDate(id,taskScheduleField(task),date,{keepWeek:weekMode(key)==="current"});
}
