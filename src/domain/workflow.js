// Both weekly entry points edit state.weeks; the journal copy is a compatibility mirror.
const WEEKLY_SUMMARY_LABELS={achievements:'实际成果',issues:'未完成 / 原因',next:'下周继续关注'};
const WEEKLY_SUMMARY_FIELDS={achievements:'reviewDone',issues:'reviewMiss',next:'reviewNext'};
function summaryPlain(html){return String(html||'').replace(/<\/(?:p|h[1-6]|li|div)>|<br\s*\/?\s*>/gi,'\n').split('\n').map(line=>strip(line)).join('\n').trim()}
function linkWeeklySummaries(draft,keys=null){
 const journal=draft.meta?.workJournal?.weeks||{};
 for(const key of keys||Object.keys(journal)){
  if(!journal[key])continue;
  const source=journal[key],week=draft.weeks[key]||(draft.weeks[key]=emptyWeek());
  for(const [field,name] of Object.entries(WEEKLY_SUMMARY_FIELDS)){
   const legacy=week.sharedSummaryVersion?'':journalReviewHTML(source,field),current=week[name]||'';
   if(!week.sharedSummaryVersion&&summaryPlain(legacy)&&summaryPlain(legacy)!==summaryPlain(current)){
    week[name]=summaryPlain(current)?current+'<p><strong>工作记录中保留的整理</strong></p>'+legacy:legacy;
   }
   source.reviewRich||(source.reviewRich={});source.review||(source.review={});
   source.reviewRich[field]=week[name]||'';source.review[field]=summaryPlain(week[name]);
  }
  week.sharedSummaryVersion=1;
 }
 return draft;
}
function weeklySummaryHTML(key,field,draft=state){return draft.weeks[key]?.[WEEKLY_SUMMARY_FIELDS[field]]||''}
function setWeeklySummary(key,field,html,draft=state){
 const name=WEEKLY_SUMMARY_FIELDS[field];if(!name)return;
 const week=draft.weeks[key]||(draft.weeks[key]=emptyWeek());
 week[name]=sanitizeRichValue(normalizeRich(html));week.sharedSummaryVersion=1;
 const journal=draft.meta.workJournal?.weeks?.[key];
 if(journal){journal.reviewRich||(journal.reviewRich={});journal.review||(journal.review={});journal.reviewRich[field]=week[name];journal.review[field]=summaryPlain(week[name])}
}
function journalLinkedTasks(day,draft=state){return(day?.taskIds||[]).map(id=>draft.tasks.find(task=>task.id===id)).filter(Boolean)}
function projectTaskMatchesAttention(task,filter,today=todayKey()){
 if(filter==='all'||!filter)return true;
 if(task.archived||isDone(task))return false;
 if(filter==='waiting')return task.status==='等待';
 if(filter==='overdue')return !!task.due&&task.due<today;
 if(filter==='attention')return task.status==='等待'||!!task.due&&task.due<today;
 if(filter==='actionable')return task.status==='进行中'&&!!(task.nextAction||'').trim();
 if(filter==='missing-next')return task.status==='进行中'&&!(task.nextAction||"").trim();
 return true;
}
function projectBriefData(project,tasks){
 const members=tasks.filter(task=>task.project===project.id&&!task.archived),open=members.filter(task=>!isDone(task)),current=project.milestones.find(item=>item.isCurrent??item.status==="当前阶段")||null;
 const waiting=open.filter(task=>task.status==='等待').sort((a,b)=>(a.followup||'9999').localeCompare(b.followup||'9999')||taskPriority(a)-taskPriority(b));
 const overdue=open.filter(task=>task.due&&task.due<todayKey()).sort((a,b)=>a.due.localeCompare(b.due)||taskPriority(a)-taskPriority(b));
 const attention=[...new Map([...overdue,...waiting].map(task=>[task.id,task])).values()];
 const next=open.filter(task=>task.status==='进行中'&&(task.nextAction||"").trim()).sort((a,b)=>Number(b.focus)-Number(a.focus)||taskPriority(a)-taskPriority(b)||(a.planDate||'9999').localeCompare(b.planDate||'9999'));
 const recent=members.filter(isDone).sort((a,b)=>(b.completed||'').localeCompare(a.completed||'')||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 return{current,blocked:project.milestones.find(item=>item.status==='阻塞')||null,blockedStages:project.milestones.filter(item=>item.status==='阻塞'),stagesDone:project.milestones.length>0&&project.milestones.every(item=>(item.stageStatus?["已通过","已跳过"].includes(item.stageStatus):item.status==="已完成")),waiting,overdue,attention,next,recent,missingNext:open.filter(task=>task.status==='进行中'&&!(task.nextAction||"").trim()),open};
}
