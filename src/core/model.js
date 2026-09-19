function emptyWeek(){return{actions:{},topResults:[],top:[],taskIds:[],carriedTaskIds:[],taskSnapshots:[],projectSnapshots:[],reviewDone:"",reviewMiss:"",reviewNext:"",carriedFromWeek:"",activatedAt:"",closedAt:""}}
function emptyOrder(){return{today:[],week:[],waiting:[],inbox:[],done:[],long:[],all:[],memoActive:[],memoArchived:[],projects:[],pinToday:[],pinWaiting:[],pinInbox:[],pinWeek:[],pinLong:[],pinAll:[],todayGroup:false,weekGroup:false}}
function emptyQuickNote(){return{delta:{ops:[{insert:"\n",attributes:{quickDone:"0"}}]},updatedAt:""}}
function normalizeQuickNote(raw){let source=raw&&typeof raw==="object"?raw:{},delta=source.delta&&Array.isArray(source.delta.ops)?clone(source.delta):emptyQuickNote().delta;return{delta,updatedAt:String(source.updatedAt||"")}}
function emptyState(){return{version:8,tasks:[],projects:[],memos:[],decisions:[],weeks:{},trash:[],snapshots:[],favorites:[],quickNote:emptyQuickNote(),order:emptyOrder(),meta:{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),activeWeekKey:""}}}
function normalizeMilestone(raw,index){
 return{id:String(raw?.id||uid("milestone")),name:String(raw?.name||"里程碑 "+(index+1)),due:String(raw?.due||raw?.date||""),status:["未开始","当前阶段","阻塞","已完成"].includes(raw?.status)?raw.status:"未开始",criteria:String(raw?.criteria||raw?.doneCriteria||"")};
}
function hardwareMilestoneTemplate(){
 let stages=[
  ["需求冻结","用户场景、产品范围、关键接口、验收标准和主要约束已确认。"],
  ["方案设计","系统方案及结构、电子、固件接口已评审；BOM 初版、认证路径和主要风险已明确。"],
      ["EVT 样机验证","工程样机完成关键功能与性能验证；主要设计问题已闭环，可进入设计验证。"],
      ["DVT / 认证","量产意向样机通过功能、可靠性、环境与必要认证测试；图纸、BOM 和固件形成受控版本。"],
      ["小批量试产","工装、治具、SOP、检验方法和包装资料已验证；良率、重大缺陷与供应准备满足量产放行要求。"],
      ["量产","量产放行已批准；质量、交付、售后反馈和持续改进机制已进入稳定运行。"]
 ];
 return stages.map((stage,index)=>normalizeMilestone({id:uid("milestone"),name:stage[0],status:index===0?"当前阶段":"未开始",criteria:stage[1]},index));
}
function normalizeProject(raw,index){
 let milestones=Array.isArray(raw?.milestones)?raw.milestones.map(normalizeMilestone):[];
 let currentSeen=false;milestones.forEach(milestone=>{if(milestone.status!=="当前阶段")return;if(currentSeen)milestone.status="未开始";else currentSeen=true});
 return{id:String(raw?.id||uid("project")),name:String(raw?.name||"未命名项目"),code:String(raw?.code||""),description:String(raw?.description||""),archived:!!raw?.archived,createdAt:raw?.createdAt||new Date().toISOString(),updatedAt:raw?.updatedAt||new Date().toISOString(),milestones};
}
function normalizeTask(raw,index){
 let status=statuses.includes(raw?.status)?raw.status:(raw?.completed?"已完成":"待处理"),priority=priorities.includes(raw?.priority)?raw.priority:(raw?.priority==="A"?"P0":raw?.priority==="B"?"P1":raw?.priority==="C"?"P2":"P1"),completed=status==="已完成"?String(raw?.completed||raw?.updatedAt||todayKey()).slice(0,10):"";
 let inbox=status==="待处理",focus=!!raw?.focus&&status!=="等待";
 return{id:String(raw?.id||uid("task")),title:String(raw?.title||"未命名事项"),nextAction:String(raw?.nextAction??raw?.next??""),notes:sanitizeRichValue(normalizeRich(raw?.notes||raw?.note||"")),obsidianUri:String(raw?.obsidianUri||""),project:raw?.project?String(raw.project):"",milestone:raw?.milestone?String(raw.milestone):"",type:taskTypes.includes(raw?.type)?raw.type:"任务",status,priority,handledOn:String(raw?.handledOn||""),progressLog:normalizeProgressLog(raw?.progressLog),progressDraft:String(raw?.progressDraft||""),focus,week:!!raw?.week||focus,inbox,archived:!!raw?.archived,planDate:String(raw?.planDate||""),due:String(raw?.due||""),followup:String(raw?.followup||""),completed,repeat:String(raw?.repeat||""),repeatUntil:String(raw?.repeatUntil||""),checklist:Array.isArray(raw?.checklist)?raw.checklist.map((item,itemIndex)=>({id:String(item?.id||uid("check")),text:String(item?.text||""),done:!!item?.done})):[],attachments:Array.isArray(raw?.attachments)?raw.attachments.filter(item=>item&&item.path).map(item=>({id:String(item.id||uid("attachment")),name:String(item.name||"附件"),type:String(item.type||"application/octet-stream"),size:Number(item.size||0),path:String(item.path),createdAt:item.createdAt||new Date().toISOString()})):[],relatedTaskIds:Array.isArray(raw?.relatedTaskIds)?raw.relatedTaskIds.map(String):[],createdAt:raw?.createdAt||new Date().toISOString(),updatedAt:raw?.updatedAt||new Date().toISOString()};
}
function normalizeMemo(raw,index){
 return{id:String(raw?.id||uid("memo")),title:String(raw?.title||"新备忘录"),content:sanitizeRichValue(normalizeRich(raw?.content||raw?.body||"")),project:raw?.project?String(raw.project):"",pinned:!!raw?.pinned,archived:!!raw?.archived,createdAt:raw?.createdAt||new Date().toISOString(),updatedAt:raw?.updatedAt||new Date().toISOString()};
}
function normalizeDecision(raw,index){
 return{id:String(raw?.id||uid("decision")),title:String(raw?.title||"未命名决策"),conclusion:sanitizeRichValue(normalizeRich(raw?.conclusion||raw?.summary||"")),rationale:sanitizeRichValue(normalizeRich(raw?.rationale||raw?.reason||"")),project:raw?.project?String(raw.project):"",milestone:raw?.milestone?String(raw.milestone):"",sourceTaskId:raw?.sourceTaskId?String(raw.sourceTaskId):"",date:String(raw?.date||todayKey()),archived:!!raw?.archived,createdAt:raw?.createdAt||new Date().toISOString(),updatedAt:raw?.updatedAt||new Date().toISOString()};
}
function normalizeWeek(raw){
 let base=emptyWeek(),source=raw&&typeof raw==="object"?raw:{};
 return{...base,...clone(source),actions:Object.fromEntries(Object.entries(source.actions||{}).filter(([,value])=>value&&typeof value==="object").map(([id,value])=>[id,{text:String(value.text||""),result:String(value.result||"")}])),topResults:Array.isArray(source.topResults)?source.topResults.slice(0,3).map(value=>String(value||"")):[],top:Array.isArray(source.top)?source.top.slice(0,3).map(value=>typeof value==="object"?String(value.text||value.title||""):String(value||"")):[],taskIds:Array.isArray(source.taskIds)?source.taskIds.map(String):[],carriedTaskIds:Array.isArray(source.carriedTaskIds)?source.carriedTaskIds.map(String):[],taskSnapshots:Array.isArray(source.taskSnapshots)?source.taskSnapshots.map(normalizeTask):[],projectSnapshots:Array.isArray(source.projectSnapshots)?source.projectSnapshots.map(normalizeProject):[],reviewDone:sanitizeRichValue(normalizeRich(source.reviewDone)),reviewMiss:sanitizeRichValue(normalizeRich(source.reviewMiss)),reviewNext:sanitizeRichValue(normalizeRich(source.reviewNext))};
}
function normalizeState(raw){
 let base=emptyState(),source=raw&&typeof raw==="object"?raw:{},weeks={};
 Object.entries(source.weeks||source.weekHistory||{}).forEach(([key,value])=>weeks[key]=normalizeWeek(value));
 let legacyWeek=source.week?normalizeWeek(source.week):null,key=currentWeekKey();
 if(legacyWeek&&!Object.keys(weeks).length)weeks[key]=legacyWeek;
 let oldOrder=source.order||source.viewOrderState||{},order=emptyOrder();
 Object.keys(order).forEach(name=>{if(Array.isArray(order[name]))order[name]=Array.isArray(oldOrder[name])?oldOrder[name].map(String):[];else order[name]=!!oldOrder[name]});
 let next={...base,...source,version:8,tasks:Array.isArray(source.tasks)?source.tasks.map(normalizeTask):[],projects:Array.isArray(source.projects)?source.projects.map(normalizeProject):[],memos:Array.isArray(source.memos)?source.memos.map(normalizeMemo):[],decisions:Array.isArray(source.decisions)?source.decisions.map(normalizeDecision):[],weeks,trash:Array.isArray(source.trash)?source.trash.filter(item=>item&&item.data):[],snapshots:Array.isArray(source.snapshots)?source.snapshots.filter(item=>item&&item.state).slice(0,12):[],favorites:Array.isArray(source.favorites)?source.favorites.map(String):Array.isArray(source.favoriteProjectIds)?source.favoriteProjectIds.map(String):[],quickNote:normalizeQuickNote(source.quickNote),order,meta:{...base.meta,...(source.meta||{}),activeWeekKey:String(source.meta?.activeWeekKey||source.activeWeekKey||""),updatedAt:source.meta?.updatedAt||source.savedAt||new Date().toISOString()}};
 next.tasks.forEach(task=>{if(!canAdvanceToday(task))task.focus=false});
 let projectIds=new Set(next.projects.map(item=>item.id)),taskIds=new Set(next.tasks.map(item=>item.id)),memoIds=new Set(next.memos.map(item=>item.id));
 next.tasks.forEach(task=>{if(task.project&&!projectIds.has(task.project)){task.project="";task.milestone=""}if(task.project){let project=next.projects.find(item=>item.id===task.project);if(task.milestone&&!project?.milestones.some(item=>item.id===task.milestone))task.milestone=""}else task.milestone="";task.relatedTaskIds=[...new Set(task.relatedTaskIds.filter(id=>id!==task.id&&taskIds.has(id)))]});
 next.decisions.forEach(decision=>{if(decision.project&&!projectIds.has(decision.project)){decision.project="";decision.milestone=""}if(decision.project){let project=next.projects.find(item=>item.id===decision.project);if(decision.milestone&&!project?.milestones.some(item=>item.id===decision.milestone))decision.milestone=""}if(decision.sourceTaskId&&!taskIds.has(decision.sourceTaskId))decision.sourceTaskId=""});
 next.projects.forEach(project=>project.milestones.forEach(milestone=>milestone.id=String(milestone.id)));
 next.favorites=[...new Set(next.favorites.filter(id=>projectIds.has(id)))];
 let today=todayKey(),open=task=>!task.archived&&!isDone(task),members={
  today:task=>canAdvanceToday(task)&&(task.focus||isPlanDue(task,today)),
  waiting:task=>open(task)&&task.status==='等待',
  inbox:task=>open(task)&&task.inbox,
  week:task=>open(task)&&task.week,
  long:task=>open(task)&&task.type==="长期跟进",
  done:task=>!!task.completed&&!task.archived,
  all:task=>!task.archived
 };
 Object.entries(members).forEach(([scope,accept])=>{let valid=new Set(next.tasks.filter(accept).map(task=>task.id)),pin="pin"+scope.charAt(0).toUpperCase()+scope.slice(1);next.order[scope]=[...new Set(next.order[scope].filter(id=>valid.has(id)))];if(next.order[pin])next.order[pin]=[...new Set(next.order[pin].filter(id=>valid.has(id)))]});
 next.order.memoActive=[...new Set(next.order.memoActive.filter(id=>memoIds.has(id)))];
 next.order.memoArchived=[...new Set(next.order.memoArchived.filter(id=>memoIds.has(id)))];
 next.order.projects=[...new Set(next.order.projects.filter(id=>projectIds.has(id)))];next.projects.forEach(project=>{if(!next.order.projects.includes(project.id))next.order.projects.push(project.id)});
 return next;
}
function loadLocalState(){
 let raw=null;
 try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")}catch(error){console.warn("新版数据读取失败",error)}
 if(!raw)for(let key of LEGACY_KEYS){try{raw=JSON.parse(localStorage.getItem(key)||"null")}catch(error){}if(raw)break}
 return normalizeState(raw);
}


