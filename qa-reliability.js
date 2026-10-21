// Isolated behavior checks: actual application functions, fake cloud transport,
// deterministic timers. No credentials or network access are used.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const js = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
const copy = value => JSON.parse(JSON.stringify(value));

function source(name) {
  const start = js.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  for (let end = js.indexOf('}', start); end >= 0; end = js.indexOf('}', end + 1)) {
    const candidate = js.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; } catch {}
  }
  throw new Error(`could not parse ${name}`);
}
function task(extra = {}) {
  return { id: 'task-1', title: '确认文档', status: '进行中', type: '任务',
    archived: false, inbox: false, focus: false, week: false, completed: '',
    planDate: '', followup: '2026-09-10', updatedAt: 'original', ...extra };
}
function ruleContext() {
  const context = vm.createContext({ Date, todayKey: () => '2026-09-05',
    isDone: t => t.status === '已完成',
    state: { tasks: [] }, clone: copy, statuses: ['待处理','进行中','等待','暂停','已完成'],
    priorities: ['P0','P1','P2','P3'], taskTypes: ['任务','临时事项','长期跟进'],
    sanitizeRichValue: x => x, normalizeRich: x => x, uid: () => 'new-id' });
  for (const name of ['canAdvanceToday','isPlanDue','activateScheduledTasks','setTaskFocus',
    'setTaskStatus','reconcileTaskEdit','applyTaskCardTransition','normalizeProgressLog','normalizeTask']) {
    vm.runInContext(source(name), context);
  }
  vm.runInContext(js.split('\n').find(line => line.startsWith('const TASK_CARD_TRANSITIONS=')), context);
  return context;
}

test('due plans activate Today and week, including long-term tasks; histories are untouched', () => {
  const c = ruleContext();
  const historical = task({ planDate: '2026-09-01' });
  c.state = { tasks: [task({ planDate: '2026-09-05' }), task({ id: 'long', type: '长期跟进', planDate: '2026-09-01' }), task({ id: 'future', planDate: '2026-09-06' })],
    weeks: { old: { taskSnapshots: [historical] } }, snapshots: [{ state: { tasks: [copy(historical)] } }] };
  const historyBefore = JSON.stringify([c.state.weeks, c.state.snapshots]);
  assert.equal(c.activateScheduledTasks(), true);
  assert.equal(c.state.tasks[0].focus, true); assert.equal(c.state.tasks[0].week, true);
  assert.equal(c.state.tasks[1].focus, true); assert.equal(c.state.tasks[1].type, '长期跟进');
  assert.equal(c.state.tasks[2].focus, false);
  assert.equal(JSON.stringify([c.state.weeks, c.state.snapshots]), historyBefore);
  assert.equal(c.activateScheduledTasks(), false, 'activation is idempotent');
});

test('waiting, paused, done, archived and inbox tasks never auto-activate', () => {
  const c = ruleContext();
  c.state.tasks = [{status:'等待'}, {status:'暂停'}, {status:'已完成'}, {archived:true}, {status:'待处理',inbox:true}]
    .map(extra => task({planDate:'2026-09-01', ...extra}));
  assert.equal(c.activateScheduledTasks(), false);
  for (const t of c.state.tasks) assert.equal(t.focus, false);
});

test('same-card sorting preserves every task field', () => {
  const c = ruleContext();
  for (const scope of ['today','waiting','week','long','inbox']) {
    const t = task({type:'长期跟进', status:'暂停', planDate:'2026-09-09',focus:true,week:true});
    const before = copy(t); c.applyTaskCardTransition(t,scope,scope,{tasks:[t]});
    assert.deepEqual(t,before);
  }
});

test('cross-card movement only clears follow-up when leaving waiting status', () => {
  const c = ruleContext();
  const t = task(); c.applyTaskCardTransition(t,'week','long',{tasks:[t]});
  assert.equal(t.followup,'2026-09-10');assert.equal(t.week,false);assert.equal(t.type,'长期跟进');
  c.applyTaskCardTransition(t,'long','week',{tasks:[t]});
  assert.equal(t.followup,'2026-09-10');assert.equal(t.type,'长期跟进');assert.equal(t.week,true);
  const waiting = task({status:'等待'});
  c.applyTaskCardTransition(waiting,'waiting','today',{tasks:[waiting]});
  assert.equal(waiting.followup,'');assert.equal(waiting.status,'进行中');assert.equal(waiting.focus,true);
});

test('flag and Today drop use the same transition for inbox, waiting and paused tasks', () => {
  const c = ruleContext();
  for (const status of ['进行中','待处理','等待','暂停']) {
    const a=task({status,inbox:status==='待处理'}), b=copy(a);
    c.setTaskFocus(a,true,{tasks:[a]});c.applyTaskCardTransition(b,'other','today',{tasks:[b]});
    delete a.updatedAt;delete b.updatedAt;assert.deepEqual(a,b);
    assert.equal(a.focus,true);assert.equal(a.week,true);assert.equal(a.inbox,false);
  }
});

test('rescheduling clears Today, retains week/follow-up and reactivates on the new date', () => {
  const c=ruleContext(), previous=task({focus:true,week:true,planDate:'2026-09-05'});
  const t={...previous,planDate:'2026-09-09'};c.reconcileTaskEdit(t,previous);
  assert.equal(t.focus,false);assert.equal(t.week,true);assert.equal(t.followup,previous.followup);
  c.state.tasks=[t];assert.equal(c.activateScheduledTasks(),false);
  c.todayKey=()=> '2026-09-09';assert.equal(c.activateScheduledTasks(),true);assert.equal(t.focus,true);
});

test('manual removal cancels an expired plan, preserves future plans and follow-up', () => {
  const c=ruleContext();
  for (const date of ['2026-09-01','2026-09-05','2026-09-09']) {
    const t=task({focus:true,week:true,planDate:date});c.setTaskFocus(t,false,{tasks:[t]});
    assert.equal(t.focus,false);assert.equal(t.week,true);assert.equal(t.followup,'2026-09-10');
    assert.equal(t.planDate,date>'2026-09-05'?date:'');
    c.state.tasks=[t];assert.equal(c.activateScheduledTasks(),false);
  }
});

test('changing type preserves schedule; moving to the long backlog explicitly removes this week', () => {
  const c=ruleContext(), previous=task({focus:true,week:true,planDate:'2026-09-09'});
  const edited={...previous,type:'长期跟进'}, dropped=copy(previous);
  c.reconcileTaskEdit(edited,previous);c.applyTaskCardTransition(dropped,'week','long',{tasks:[dropped]});
  assert.equal(edited.focus,true);assert.equal(edited.week,true);assert.equal(dropped.focus,false);assert.equal(dropped.week,false);assert.equal(edited.type,dropped.type);assert.equal(edited.planDate,dropped.planDate);assert.equal(edited.followup,dropped.followup);
});

test('normalization never activates dated historical task snapshots', () => {
  const c=ruleContext(), snapshot=task({planDate:'2026-09-01'});
  assert.equal(c.normalizeTask(snapshot,0).focus,false);
});

test('status transitions clear incompatible focus and ignore legacy recurrence', () => {
 const c=ruleContext();
 for(const status of ['待处理','等待','暂停','已完成']){const t=task({focus:true});c.setTaskStatus(t,status,{tasks:[t]});assert.equal(t.focus,false)}
 const t=task({repeat:'daily',repeatUntil:'2030-01-01'}),draft={tasks:[t]};
 c.setTaskStatus(t,'已完成',draft);c.setTaskStatus(t,'进行中',draft);c.setTaskStatus(t,'已完成',draft);
 assert.equal(draft.tasks.length,1);assert.equal(t.completed,'2026-09-05');
});

function cloudContext() {
  const timers=new Map(), writes=[], labels=[], storage=new Map();let timerId=0;
  const context=vm.createContext({ Date, state:{tasks:[task()],meta:{}},
    snapshotCore:()=>copy(context.state), serializeState:()=>JSON.stringify(context.state), deviceId:()=> 'device-a',
    navigator:{onLine:true}, console:{error:()=>{}}, CLOUD_LINK_KEY:'link',LOCAL_MODE_KEY:'local',
    localStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),getItem:k=>storage.get(k)||null},
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),
    closeDialog:()=>{}, refreshScheduledTasks:()=>{} });
  vm.runInContext(source('cloudHash'),context);
  vm.runInContext(js.slice(js.indexOf('const Cloud={'),js.indexOf('window.CloudSync=Cloud;'))+'\nglobalThis.cloud=Cloud;',context);
  const cloud=context.cloud;
  cloud.user={id:'user-a'};cloud.remoteReady=true;cloud.rowExists=true;cloud.version=1;cloud.lastHash=context.cloudHash(JSON.stringify(context.state));
  cloud.setStatus=(status,label)=>{cloud.status=status;labels.push({status,label})};cloud.showConflict=()=>{};
  cloud.client={auth:{signOut:async()=>{}},from:()=>{
    const query={};
    for(const name of ['update','insert'])query[name]=payload=>{query.payload=copy(payload);return query};
    query.eq=(field,value)=>{query[field]=value;return query};query.select=()=>query;
    query.single=query.maybeSingle=()=>new Promise(resolve=>writes.push({query,resolve}));return query;
  }};
  const finish=(index,error=null)=>{const w=writes[index];w.resolve(error?{error}:{data:{...w.query.payload}})};
  const runTimers=async()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)await fn()};
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
  return {context,cloud,timers,writes,labels,storage,finish,runTimers,flush};
}

test('an edit during upload is drained before reporting synced, with no parallel requests',async()=>{
  const h=cloudContext();h.context.state.tasks[0].title='first';
  const upload=h.cloud.push();assert.equal(h.writes.length,1);
  h.context.state.tasks[0].title='latest';h.cloud.schedule();await h.cloud.push();
  assert.equal(h.writes.length,1);assert.equal(h.cloud.status,'syncing');
  h.finish(0);await h.flush();assert.equal(h.writes.length,2);
  assert.equal(h.writes[1].query.payload.state.tasks[0].title,'latest');assert.equal(h.writes[1].query.version,2);
  assert(!h.labels.some(x=>x.status==='synced'),'no stale acknowledgement is shown');
  h.finish(1);assert.equal(await upload,true);assert.equal(h.cloud.status,'synced');assert.equal(h.cloud.version,3);
  assert.equal(JSON.parse(h.storage.get('link')).hash,h.context.cloudHash(JSON.stringify(h.context.state)));
});

test('a debounced edit not yet scheduled for upload is detected from the live state',async()=>{
  const h=cloudContext();h.context.state.tasks[0].title='first';const upload=h.cloud.push();
  h.context.state.tasks[0].title='unscheduled latest';h.finish(0);await h.flush();
  assert.equal(h.writes.length,2);h.finish(1);assert.equal(await upload,true);
});

test('redundant scheduling during upload does not create a redundant write',async()=>{
  const h=cloudContext();const upload=h.cloud.push(true);h.cloud.schedule();h.finish(0);
  assert.equal(await upload,true);assert.equal(h.writes.length,1);
});

test('failed uploads keep local data; explicit retry uploads the newest edit',async()=>{
  const h=cloudContext();h.context.state.tasks[0].title='first';const upload=h.cloud.push();
  h.context.state.tasks[0].title='latest';h.cloud.schedule();h.finish(0,new Error('transport unavailable'));
  assert.equal(await upload,false);assert.equal(h.cloud.status,'error');assert.equal(h.cloud.pushing,false);
  assert.equal(h.context.state.tasks[0].title,'latest');assert.equal(h.timers.size,0);
  const retry=h.cloud.push();assert.equal(h.writes[1].query.payload.state.tasks[0].title,'latest');
  h.finish(1);assert.equal(await retry,true);
});

test('offline edits stay local and are uploaded after connectivity returns',async()=>{
  const h=cloudContext();h.context.state.tasks[0].title='offline';h.context.navigator.onLine=false;
  assert.equal(await h.cloud.push(),false);assert.equal(h.writes.length,0);assert.equal(h.cloud.status,'syncing');
  h.context.navigator.onLine=true;const upload=h.cloud.push();h.finish(0);assert.equal(await upload,true);
});

test('version conflicts stop automatic and forced uploads until explicitly resolved',async()=>{
  const h=cloudContext();h.context.state.tasks[0].title='local';h.cloud.fetchRemote=async()=>({version:5,state:{tasks:[]}});
  const upload=h.cloud.push();h.writes[0].resolve({data:null});assert.equal(await upload,false);
  h.cloud.schedule();assert.equal(await h.cloud.push(true),false);assert.equal(h.writes.length,1);assert.equal(h.cloud.status,'conflict');
});

test('logout invalidates a delayed upload response and does not recreate synced metadata',async()=>{
  const h=cloudContext();h.context.state.tasks[0].title='first';const upload=h.cloud.push();
  await h.cloud.logout();h.finish(0);assert.equal(await upload,false);
  assert.equal(h.cloud.status,'local');assert.equal(h.cloud.version,0);assert.equal(h.storage.has('link'),false);
});

test('an older session cannot acknowledge or queue writes for a newer account',async()=>{
  const h=cloudContext();h.context.state.tasks[0].title='first';const upload=h.cloud.push();
  h.cloud.syncEpoch++;h.cloud.user={id:'user-b'};h.cloud.version=19;h.cloud.status='connecting';h.cloud.pushing=false;
  h.finish(0);assert.equal(await upload,false);assert.equal(h.cloud.version,19);assert.equal(h.cloud.status,'connecting');assert.equal(h.writes.length,1);
});


test('moving a due plan to the long backlog does not immediately reactivate it',()=>{
 const c=ruleContext(),t=task({focus:true,week:true,planDate:'2026-09-05'});c.state.tasks=[t];
 c.applyTaskCardTransition(t,'week','long',c.state);assert.equal(c.activateScheduledTasks(),false);
 assert.equal(t.week,false);assert.equal(t.focus,false);assert.equal(t.type,'长期跟进');assert.equal(t.followup,'2026-09-10');
});



test('legacy classification is derived from status without changing task content', () => {
 const c=ruleContext();
 for(const status of ['待处理','进行中','等待','暂停','已完成']) {
  const value=task({inbox:true});c.setTaskStatus(value,status,{tasks:[value]});
  assert.equal(c.normalizeTask(value).inbox,status==='待处理');
 }
 assert.equal(c.normalizeTask(task({status:'待处理',inbox:false})).inbox,true);
 const legacy=task({status:'待处理'});delete legacy.inbox;assert.equal(c.normalizeTask(legacy).inbox,true);
 const value=c.normalizeTask(task({inbox:true,planDate:'2026-09-05'}));c.state.tasks=[value];c.activateScheduledTasks();assert.equal(value.focus,true);assert.equal(value.inbox,false);
});
test('retired handled and recurrence fields are discarded without completing the task', () => {
 const c=ruleContext(),value=c.normalizeTask(task({handledOn:'2026-09-05',repeat:'daily',repeatUntil:'2030-01-01'}));
 assert.equal(value.handledOn,undefined);assert.equal(value.repeat,undefined);assert.equal(value.repeatUntil,undefined);assert.equal(value.status,'进行中');assert.equal(value.completed,'');
});

test('dragging to inbox sets pending status and moves order and pin',()=>{
 const c=ruleContext();c.state={tasks:[task({focus:true})],order:{today:['a','task-1','b'],inbox:['other'],pinToday:['task-1'],pinInbox:[]}};
 c.pinKey=s=>'pin'+s[0].toUpperCase()+s.slice(1);c.commit=(_,fn)=>fn(c.state);
 vm.runInContext(source('moveTask'),c);const before=copy(c.state.tasks[0]);
 c.moveTask('task-1','today','inbox','other','before');
 assert.equal(c.state.tasks[0].status,'待处理');assert.equal(c.state.tasks[0].focus,false);assert.equal(c.state.tasks[0].followup,before.followup);assert.equal(c.state.tasks[0].inbox,true);
 assert.deepEqual([...c.state.order.today],['a','b']);assert.deepEqual([...c.state.order.pinToday],[]);assert.deepEqual([...c.state.order.inbox],['task-1','other']);
});
