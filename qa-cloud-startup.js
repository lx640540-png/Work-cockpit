// Read/refresh/write boundary regression. No real accounts or network are used.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const code = fs.readFileSync(process.argv[2] || 'src/core/cloud.js', 'utf8');
const copy = x => JSON.parse(JSON.stringify(x));
const unauthorized = {status:401,error:{code:'PGRST301',message:'JWT expired'}};
function setup() {
 const state={version:8,tasks:[{id:'t1',title:'本机尚未同步内容'}],projects:[],memos:[],decisions:[],weeks:{},meta:{}};
 const storage=new Map(),reads=[],writes=[],refreshes=[],labels=[],responses=[];
 const c=vm.createContext({state,Date,JSON,deviceId:()=> 'device-a',
  serializeState:(value=c.state)=>JSON.stringify(value),snapshotCore:(value=c.state)=>copy(value),
  normalizeState:copy,navigator:{onLine:true},console:{error:()=>{}},
  LOCAL_MODE_KEY:'local',CLOUD_LINK_KEY:'link',STORAGE_KEY:'data',CLOUD_DEVICE_KEY:'device',uid:()=> 'device-a',
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  $:()=>({hidden:true}),clearTimeout:()=>{},setTimeout:()=>1,refreshScheduledTasks:()=>{},
  ensureCurrentWeek:()=>{},captureCurrentWeek:()=>{},requestRender:()=>{}});
 vm.runInContext(code.slice(0,code.indexOf('window.CloudSync=Cloud;'))+'\nglobalThis.cloud=Cloud;',c);
 const cloud=c.cloud;cloud.user={id:'user-a'};cloud.setStatus=(status,label)=>{cloud.status=status;labels.push(label)};
 cloud.subscribe=()=>{};cloud.showConflict=()=>{};
 const row=(value=state,version=4)=>({state:copy(value),version,device_id:'other',updated_at:'2026-09-07'});
 cloud.client={auth:{refreshSession:async()=>{refreshes.push(1);return{data:{session:{user:{id:'user-a'}}}}}},from:()=>{
  const q={mode:'read'};q.select=()=>q;q.eq=()=>q;
  for(const mode of ['insert','update'])q[mode]=payload=>{q.mode=mode;q.payload=copy(payload);return q};
  q.maybeSingle=q.single=async()=>{
   if(q.mode==='read'){reads.push(1);assert(responses.length,'unexpected read');const response=responses.shift();return typeof response==='function'?response():response;}
   writes.push({mode:q.mode,payload:q.payload});return{data:row(q.payload.state,q.payload.version)};
  };return q;
 }};
 return{c,cloud,state,storage,reads,writes,refreshes,labels,responses,row};
}
test('401 initialization followed by repeated manual sync never inserts into unknown cloud state',async()=>{
 const h=setup(),before=JSON.stringify(h.state);
 h.cloud.client.auth.refreshSession=async()=>({error:{message:'invalid refresh token'}});
 h.responses.push(unauthorized,unauthorized);
 await h.cloud.startSession({user:h.cloud.user});
 assert.equal(h.cloud.status,'error');
 await h.cloud.push(true);
 assert.equal(h.writes.length,0);assert.equal(h.reads.length,2);assert.equal(JSON.stringify(h.state),before);
});
test('one refresh recovers expired read and acknowledges existing data without inserting',async()=>{
 const h=setup();h.responses.push(unauthorized,{data:h.row()});
 assert.equal(await h.cloud.startSession({user:h.cloud.user}),true);
 assert.equal(h.refreshes.length,1);assert.equal(h.reads.length,2);assert.equal(h.writes.length,0);assert.equal(h.cloud.rowExists,true);
});
test('a second 401 stops after one refresh and keeps local state',async()=>{
 const h=setup();h.responses.push(unauthorized,unauthorized);
 await h.cloud.startSession({user:h.cloud.user});
 assert.equal(h.refreshes.length,1);assert.equal(h.cloud.remoteReady,false);assert.equal(h.writes.length,0);
});
test('manual retry after failed initialization rereads before updating a known existing version',async()=>{
 const h=setup();h.responses.push({error:{message:'network unavailable'}});
 h.storage.set('link',JSON.stringify({userId:'user-a',version:4,hash:'previous'}));
 await h.cloud.startSession({user:h.cloud.user});
 h.responses.push({data:h.row({...h.state,tasks:[{id:'t1',title:'旧云端内容'}]})});
 assert.equal(await h.cloud.push(true),true);
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].mode,'update');assert.equal(h.writes[0].payload.version,5);
 assert.equal(h.writes[0].payload.state.tasks[0].title,'本机尚未同步内容');
});
test('changed remote version enters conflict instead of overwriting on retry',async()=>{
 const h=setup();h.storage.set('link',JSON.stringify({userId:'user-a',version:3,hash:'previous'}));
 h.responses.push({data:h.row({...h.state,tasks:[{id:'t1',title:'其他电脑更新'}]})});
 await h.cloud.push(true);
 assert.equal(h.cloud.status,'conflict');assert.equal(h.writes.length,0);assert.equal(h.state.tasks[0].title,'本机尚未同步内容');
});
test('repeated sync clicks while reading share one request and only a confirmed missing row is inserted',async()=>{
 const h=setup();let finish;h.responses.push(()=>new Promise(r=>finish=r));
 const first=h.cloud.startSession({user:h.cloud.user}),second=h.cloud.push(true),third=h.cloud.push(true);
 assert.equal(h.reads.length,1);assert.equal(h.writes.length,0);finish({data:null});
 await Promise.all([first,second,third]);
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].mode,'insert');
});
test('duplicate key from a create race rereads and preserves both versions for conflict resolution',async()=>{
 const h=setup();h.cloud.remoteReady=true;h.cloud.rowExists=false;
 const originalFrom=h.cloud.client.from;
 h.cloud.client.from=()=>{const q=originalFrom();q.insert=payload=>{q.mode='insert';q.payload=payload;q.single=async()=>{h.writes.push({mode:'insert'});return{status:409,error:{code:'23505',message:'duplicate key'}}};return q};return q};
 h.responses.push({data:h.row({...h.state,tasks:[{id:'t1',title:'并发创建的云端内容'}]})});
 await h.cloud.push(true);
 assert.equal(h.writes.length,1);assert.equal(h.reads.length,1);assert.equal(h.cloud.status,'conflict');
 assert.equal(h.cloud.pendingRemote.state.tasks[0].title,'并发创建的云端内容');assert.equal(h.state.tasks[0].title,'本机尚未同步内容');
 await h.cloud.push(true);assert.equal(h.writes.length,1);
});
test('late failed initialization cannot mark a newer account as failed',async()=>{
 const h=setup();let finish;h.responses.push(()=>new Promise(r=>finish=r));
 const old=h.cloud.startSession({user:h.cloud.user});
 h.cloud.syncEpoch++;h.cloud.user={id:'user-b'};h.cloud.status='synced';h.cloud.remoteReady=true;
 finish(unauthorized);await old;
 assert.equal(h.cloud.status,'synced');assert.equal(h.cloud.remoteReady,true);assert.equal(h.refreshes.length,0);assert.equal(h.writes.length,0);
});
test('401 on write invalidates cloud knowledge so the next retry must read first',async()=>{
 const h=setup();h.cloud.remoteReady=true;h.cloud.rowExists=true;
 h.cloud.client.from=()=>{const q={update:()=>q,eq:()=>q,select:()=>q,maybeSingle:async()=>unauthorized};return q};
 await h.cloud.push(true);assert.equal(h.cloud.remoteReady,false);assert.equal(h.cloud.status,'error');
});
