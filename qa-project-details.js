const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
function readFunction(path,name){
 const text=fs.readFileSync(path,'utf8'),start=text.indexOf('function '+name+'(');assert(start>=0);
 for(let end=text.indexOf('}',start);end>=0;end=text.indexOf('}',end+1)){let code=text.slice(start,end+1);try{new vm.Script('('+code+')');return code}catch{}}
 throw Error('Cannot read '+name);
}
const makeTask=(id,extra={})=>({id,project:'p1',status:'进行中',archived:false,nextAction:'安排复测',focus:false,priority:'P1',due:'',completed:'',...extra});
const project={id:'p1',milestones:[{id:'m1',name:'尚未开始',status:'未开始'}]};
function briefFixture(){
 const c=vm.createContext({Date,Map,Set,String,Object,Array,todayKey:()=> '2026-10-23',isDone:task=>task.status==='已完成',taskPriority:task=>['P0','P1','P2','P3'].indexOf(task.priority)});
 vm.runInContext(fs.readFileSync('src/domain/workflow.js','utf8'),c);return c;
}
test('unstarted stages are not presented as the current stage; blocked and finished stages are distinct',()=>{
 const c=briefFixture(),first=c.projectBriefData(project,[]);
 assert.equal(first.current,null);assert.equal(first.blocked,null);assert.equal(first.stagesDone,false);
 const blocked=c.projectBriefData({id:'p1',milestones:[{id:'m1',status:'阻塞'}]},[]);assert.equal(blocked.current,null);assert.equal(blocked.blocked.id,'m1');
 const done=c.projectBriefData({id:'p1',milestones:[{id:'m1',status:'已完成'}]},[]);assert.equal(done.stagesDone,true);assert.equal(done.current,null);
});
test('project counts exclude archived and foreign tasks, deduplicate waiting plus overdue, and retain all results',()=>{
 const c=briefFixture(),tasks=[makeTask('both',{status:'等待',due:'2026-10-21',followup:'2026-10-23'}),makeTask('waiting',{status:'等待'}),makeTask('overdue',{due:'2026-10-22'}),makeTask('overdue2',{due:'2026-10-20'}),makeTask('archived',{archived:true,due:'2026-10-20'}),makeTask('foreign',{project:'p2',due:'2026-10-20'}),makeTask('done',{status:'已完成',due:'2026-10-20',completed:'2026-10-21'})];
 const result=c.projectBriefData(project,tasks);assert.equal(result.waiting.length,2);assert.equal(result.overdue.length,3);assert.equal(result.attention.length,4);
 assert.deepEqual(Array.from(result.attention,x=>x.id),['overdue2','both','overdue','waiting']);assert.equal(result.recent.length,1);
 assert.equal(tasks.length,7,'overview must not mutate the task collection');
});
test('next actions prioritize Today while recent results use completion date with a stable timestamp tiebreak',()=>{
 const c=briefFixture(),result=c.projectBriefData(project,[makeTask('priority',{priority:'P0'}),makeTask('today',{focus:true,priority:'P2'}),makeTask('waiting',{status:'等待'}),makeTask('empty',{nextAction:'  '}),makeTask('early',{status:'已完成',completed:'2026-10-21'}),makeTask('later1',{status:'已完成',completed:'2026-10-22',updatedAt:'2026-10-22T10:00:00Z'}),makeTask('later2',{status:'已完成',completed:'2026-10-22',updatedAt:'2026-10-22T11:00:00Z'})]);
 assert.deepEqual(Array.from(result.next,x=>x.id),['today','priority']);assert.deepEqual(Array.from(result.missingNext,x=>x.id),['empty']);
 assert.deepEqual(Array.from(result.recent,x=>x.id),['later2','later1','early']);
});
test('summary filters agree with visible counters and never include completed waiting work',()=>{
 const c=briefFixture(),done=makeTask('done',{status:'已完成',due:'2026-10-21'}),waiting=makeTask('w',{status:'等待'}),missing=makeTask('m',{nextAction:''});
 assert.equal(c.projectTaskMatchesAttention(done,'attention'),false);assert.equal(c.projectTaskMatchesAttention(missing,'actionable'),false);assert.equal(c.projectTaskMatchesAttention(makeTask('action'),'actionable'),true);assert.equal(c.projectTaskMatchesAttention(waiting,'waiting'),true);assert.equal(c.projectTaskMatchesAttention(waiting,'overdue'),false);assert.equal(c.projectTaskMatchesAttention(missing,'missing-next'),true);
 assert.equal(c.projectTaskMatchesAttention(makeTask('today',{due:'2026-10-23'}),'overdue'),false);
});
test('old grouping preferences cannot defeat the project default; manual grouping works within the current visit',()=>{
 const c=vm.createContext({Map,Set,Object,Array,String,JSON,taskFilter:{query:'',project:[],type:[],status:[],group:'none',quick:'open'},ui:{},localStorage:{getItem:()=>JSON.stringify({taskFilter:{query:'充电',project:[],type:[],status:[],group:'none',quick:'open'},selectedProjectId:'p1'})},WORKSPACE_VIEW_KEY:'view',projectPositions:new Map(),searchView:{},workspacePositions:{},journalDateValid:()=>false,$:()=>({value:''})});
 vm.runInContext(readFunction('src/domain/task-filters.js','emptyTaskFilter'),c);vm.runInContext(readFunction('src/domain/task-filters.js','normalizeTaskFilter'),c);vm.runInContext(readFunction('src/ui/view-state.js','restoreWorkspacePreferences'),c);vm.runInContext(readFunction('src/ui/view-state.js','applyTaskPageDefaults'),c);
 c.restoreWorkspacePreferences();assert.equal(c.taskFilter.group,'project');assert.equal(c.taskFilter.query,'充电');assert.equal(c.selectedProjectId,'p1');
 c.taskFilter.group='status';c.applyTaskPageDefaults('tasks','tasks');assert.equal(c.taskFilter.group,'status');
 c.applyTaskPageDefaults('today','tasks');c.applyTaskPageDefaults('tasks','today');assert.equal(c.taskFilter.group,'project');
});
test('saving an unnamed project or milestone reveals the right input without writing a placeholder name',()=>{
 let written=0,focused='';const c=vm.createContext({projectDraft:{name:'',milestones:[]},projectSettingsTab:'records',projectMilestoneIndex:0,collectProjectDraft:()=>{},renderProjectEditor:()=>{},$:selector=>({focus:()=>focused=selector}),toast:()=>{},commit:()=>written++});
 vm.runInContext(readFunction('src/ui/project-settings.js','saveProjectDraft'),c);
 assert.equal(c.saveProjectDraft(),false);assert.equal(c.projectSettingsTab,'basic');assert.equal(focused,'#projectName');assert.equal(written,0);
 c.projectDraft={name:'项目甲',milestones:[{name:'有效阶段'},{name:''}]};assert.equal(c.saveProjectDraft(),false);assert.equal(c.projectSettingsTab,'milestones');assert.equal(c.projectMilestoneIndex,1);assert.equal(focused,'#milestoneName');assert.equal(written,0);
});
