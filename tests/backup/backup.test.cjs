const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const F=require('../../src/domain/backup-format.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const user='86825a70-186a-4f13-aaa8-e1374effc1e8';
function sample(){return {version:8,tasks:[{id:'t1',title:'任务',notes:'<p>结论</p>',attachments:[{id:'a1',path:user+'/t1/a.png'}]}],projects:[{id:'p1',name:'项目一'},{id:'p2',name:'项目二'}],memos:[{id:'m1',content:'备忘'}],decisions:[],snapshots:[],order:{projects:['p2','p1']},weeks:{w:{taskSnapshots:[{id:'t1',title:'历史版本'}]}},meta:{workJournal:{weeks:{w:{days:{d:{content:'<h2>工作记录</h2><p>详情</p>'}}}}}}}}

test('own exports and nested snapshots accept ID ordering; malformed entities and duplicate IDs remain rejected',()=>{let data=sample();data.snapshots=[{id:'s',state:copy(data)}];assert.equal(F.validate(data),data);assert.throws(()=>F.validate({...data,projects:['p1']}),/无效数据/);assert.throws(()=>F.validate({...data,tasks:[{id:'t'},{id:'t'}]}),/重复/);assert.throws(()=>F.validate(JSON.parse('{"tasks":[],"projects":[],"__proto__":{}}')),/不安全/)});
test('category loss stays high risk even when journals survive; editing a title is safe',()=>{const before=sample(),after=copy(before);after.tasks=[];assert.deepEqual(F.risk(before,after),['tasks']);after.tasks=copy(before.tasks);after.tasks[0].title='新标题';assert.deepEqual(F.risk(before,after),[])});
test('retention preserves last good version, hourly window, daily versions, pinned versions',()=>{const now=Date.parse('2026-11-11T12:00:00Z'),row=(id,h,extra={})=>({id,status:'verified',created_at:new Date(now-h*3600000).toISOString(),...extra});const keep=F.retained([row('new',1),row('hour',2),row('daily1',60),row('daily2',59.5),row('expired',800),row('pinned',900,{pinned:true})],now);assert.deepEqual([...keep],['new','hour','daily1','pinned'])});
test('independent checkpoint failure prevents import mutation and pending gate survives refresh',()=>{const storage=new Map(),state=sample();let fail=false,mutated=false;const c=vm.createContext({state,JSON,Date,globalThis:{},window:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota');storage.set(k,v)},removeItem:k=>storage.delete(k)},CLOUD_LINK_KEY:'link',uid:()=> 'snapshot',validateImportedData:F.validate,flushPendingEdits:()=>true,replaceState:()=>{mutated=true},toast:()=>{}});vm.runInContext(fs.readFileSync('src/domain/backup-local.js','utf8'),c);fail=true;assert.throws(()=>c.stageRecoveredState(sample(),'restore'),/安全副本/);assert.equal(mutated,false);fail=false;c.stageRecoveredState(sample(),'restore');assert(c.hasRestorePending());assert.equal(mutated,true);assert.equal(c.localRecoveryList()[0].state.snapshots.length,0);assert.deepEqual(state,sample());});

test('encrypted Google tokens are bound to their owner and cannot be read with a different key',async()=>{const {seal,unseal}=await import('../../backup-worker/index.mjs');const env={BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64')};const value=await seal('fake-refresh-token',env,user);assert(!value.includes('fake-refresh-token'));assert.equal(await unseal(value,env,user),'fake-refresh-token');await assert.rejects(unseal(value,env,'different'));await assert.rejects(unseal(value,{BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64')},user))});

function upstream(env,fixture){
 const runs=[],driveFiles=new Map(),storage=new Map([[user+'/t1/a.png',Buffer.from([137,80,78,71,0,1,2,3])]]);let sequence=0,badUpload=false,interruptManifest=false;
 const credential={user_id:user,encrypted_token:fixture.encrypted,folder_id:'folder'};
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 const fetch=async(url,options={})=>{
  url=String(url);const u=new URL(url),method=options.method||'GET',body=typeof options.body==='string'?JSON.parse(options.body):options.body;
  if(u.hostname==='oauth2.googleapis.com')return response({access_token:'fake-access'});
  if(u.pathname==='/auth/v1/user')return response({id:options.headers?.authorization==='Bearer wrong'?'other':user});
  if(u.pathname.includes('/rest/v1/')){
   const table=u.pathname.split('/rest/v1/')[1];
   if(table==='cockpit_backup_credentials')return response([credential]);
   if(table==='rpc/cockpit_backup_prune_history')return response(null);
   if(table==='rpc/cockpit_backup_claim')return response(true);
   if(table==='rpc/cockpit_backup_objects')return response([...storage].map(([name,bytes])=>({bucket_id:'task-attachments',name,metadata:{size:bytes.length,mimetype:'image/png'}})));
   if(table==='app_states')return response([{state:copy(fixture.state),version:fixture.version||4}]);
   if(table==='cockpit_backup_runs'){
    const filtered=runs.filter(r=>(!u.searchParams.get('id')||r.id===u.searchParams.get('id').slice(3))&&(!u.searchParams.get('content_hash')||r.content_hash===u.searchParams.get('content_hash').slice(3))&&(!u.searchParams.get('status')||u.searchParams.get('status')!=='eq.verified'||r.status==='verified'));
    if(method==='POST'){const r={...body,created_at:'2026-11-11T12:00:00.000Z',attempts:0};runs.unshift(r);return response([r])}
    if(method==='PATCH'){for(const r of filtered)Object.assign(r,body);return response(filtered)}
    return response(filtered);
   }
  }
  if(u.pathname.includes('/storage/v1/object/info/'))return response({},404);
  if(u.pathname.includes('/storage/v1/object/')){const path=decodeURIComponent(u.pathname.split('/storage/v1/object/task-attachments/')[1]);if(method==='POST'){storage.set(path,Buffer.from(options.body));return response({})}if(!storage.has(path))return response({},404);return new Response(storage.get(path));}
  if(u.hostname==='www.googleapis.com'){
   if(u.pathname.includes('/files/generateIds'))return response({ids:['drive'+(++sequence)]});
   if(u.pathname.startsWith('/upload/')){
    if(badUpload)return response({},503);const bytes=Buffer.from(await options.body.arrayBuffer()),boundary=options.headers['content-type'].split('boundary=')[1],head=Buffer.from('\r\n\r\n');const metaStart=bytes.indexOf(head)+head.length,metaEnd=bytes.indexOf(Buffer.from('\r\n--'+boundary),metaStart);const metadata=JSON.parse(bytes.subarray(metaStart,metaEnd).toString());const start=bytes.indexOf(head,metaEnd)+head.length,end=bytes.indexOf(Buffer.from('\r\n--'+boundary+'--'),start);if(driveFiles.has(metadata.id))return response({},409);driveFiles.set(metadata.id,{...metadata,bytes:bytes.subarray(start,end)});if(interruptManifest&&metadata.appProperties?.kind==='snapshot'){interruptManifest=false;return response({},503)}return response({id:metadata.id});
   }
   if(u.pathname.endsWith('/files')){const q=u.searchParams.get('q')||'',sha=q.match(/key='sha256' and value='([^']+)'/);return response({files:[...driveFiles.values()].filter(f=>sha&&f.appProperties?.sha256===sha[1]).map(f=>({id:f.id}))})}
   const id=u.pathname.split('/files/')[1];if(id==='folder')return response({id});const file=driveFiles.get(id);if(file&&u.searchParams.get('alt')==='media')return new Response(file.bytes);if(file)return response({id});return response({},404);
  }
  throw Error('Unexpected fake upstream: '+method+' '+u.pathname);
 };
 return {fetch,runs,driveFiles,storage,breakUploads:value=>badUpload=value,interruptManifest:()=>interruptManifest=true};
}

test('complete backup and restore drill preserves titles, ordering, historical weeks, journal markup and original attachment bytes',async()=>{
 const worker=await import('../../backup-worker/index.mjs'),env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fake-service',GOOGLE_CLIENT_ID:'fake-client',GOOGLE_CLIENT_SECRET:'fake-secret',BACKUP_ORIGIN:'https://cockpit.test',BACKUP_ALLOWED_USER_ID:user,BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,3).toString('base64')};
 const fixture={state:sample(),encrypted:await worker.seal('fake-refresh',env,user)},fake=upstream(env,fixture),original=global.fetch;global.fetch=fake.fetch;
 try{
  const pending=[],ctx={waitUntil:p=>pending.push(p)},headers={authorization:'Bearer user',origin:env.BACKUP_ORIGIN};
  const start=await worker.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers}),env,ctx);assert.equal(start.status,202);await Promise.all(pending);assert.equal(fake.runs[0].status,'verified');assert.equal(fake.runs[0].attachment_count,1);
  const id=fake.runs[0].id;const archive=await worker.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/archive/'+id,{headers}),env,ctx);assert.equal(archive.status,200);assert.deepEqual((await archive.json()).state,fixture.state);
  const image=Buffer.from(fake.storage.get(user+'/t1/a.png'));fake.storage.clear();const restored=await worker.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/restore/'+id,{method:'POST',headers}),env,ctx);assert.equal(restored.status,200);assert.deepEqual((await restored.json()).state,fixture.state);assert.deepEqual(fake.storage.get(user+'/t1/a.png'),image);
  const file=fake.driveFiles.get(fake.runs[0].drive_file_id);file.bytes=Buffer.from('corrupted');const bad=await worker.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/archive/'+id,{headers}),env,ctx);assert.equal(bad.status,502);assert.equal((await bad.json()).error,'ARCHIVE_CHECKSUM_MISMATCH');
 }finally{global.fetch=original}
});
test('partial Drive failure never marks success; a retry completes without replacing a good archive; account and origin checks reject misuse',async()=>{
 const w=await import('../../backup-worker/index.mjs'),env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fake-service',GOOGLE_CLIENT_ID:'fake',GOOGLE_CLIENT_SECRET:'fake',BACKUP_ORIGIN:'https://cockpit.test',BACKUP_ALLOWED_USER_ID:user,BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64')},fixture={state:sample(),encrypted:await w.seal('fake',env,user)},fake=upstream(env,fixture),old=global.fetch;global.fetch=fake.fetch;
 try{const jobs=[],ctx={waitUntil:p=>jobs.push(p)},headers={authorization:'Bearer user',origin:env.BACKUP_ORIGIN};fake.breakUploads(true);await w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers}),env,ctx);await Promise.all(jobs);assert.equal(fake.runs[0].status,'failed');assert(!fake.runs[0].verified_at);fake.breakUploads(false);await w.perform(env,user,fake.runs[0]);assert.equal(fake.runs[0].status,'verified');
 const wrong=await w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/status',{headers:{authorization:'Bearer wrong'}}),env,ctx);assert.equal(wrong.status,403);
 const cross=await w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers:{...headers,origin:'https://evil.test'}}),env,ctx);assert.equal(cross.status,403);
 }finally{global.fetch=old}
});
test('empty cloud state is quarantined and is never uploaded as a successful backup',async()=>{const w=await import('../../backup-worker/index.mjs'),env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fake',GOOGLE_CLIENT_ID:'fake',GOOGLE_CLIENT_SECRET:'fake',BACKUP_ORIGIN:'https://cockpit.test',BACKUP_ALLOWED_USER_ID:user,BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64')},fake=upstream(env,{state:{tasks:[],projects:[],memos:[],decisions:[]}}),old=global.fetch;global.fetch=fake.fetch;try{const jobs=[],r=await w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers:{authorization:'Bearer user',origin:env.BACKUP_ORIGIN}}),env,{waitUntil:p=>jobs.push(p)});assert.equal(r.status,202);await Promise.all(jobs);assert.equal(fake.runs[0].status,'quarantined');assert.equal(fake.driveFiles.size,0)}finally{global.fetch=old}});

test('review-only, image-only and weekly-plan-only work are all meaningful and protected',()=>{
 const empty={tasks:[],projects:[]};const review={...empty,meta:{workJournal:{weeks:{}}}};
 review.meta.workJournal.weeks.w={review:{done:'<p>复盘</p>'},days:{d:{content:'<img data-rich-image-path="u/x">'}}};
 const plan={...empty,weeks:{w:{top:['完成本周验证']}}};
 assert.equal(F.summary(review).journalDays,2);assert.deepEqual(F.risk(review,empty),['journalDays']);assert.equal(F.summary(plan).weekPlans,1);assert.deepEqual(F.risk(plan,empty),['weekPlans']);
});
test('retry rechecks frozen attachments after an interrupted manifest response and rejects missing/corrupt bytes',async()=>{
 const w=await import('../../backup-worker/index.mjs'),env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fake',GOOGLE_CLIENT_ID:'fake',GOOGLE_CLIENT_SECRET:'fake',BACKUP_ORIGIN:'https://cockpit.test',BACKUP_ALLOWED_USER_ID:user,BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64')},fixture={state:sample(),encrypted:await w.seal('fake',env,user)},fake=upstream(env,fixture),old=global.fetch;global.fetch=fake.fetch;
 try{const jobs=[];fake.interruptManifest();await w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers:{authorization:'Bearer user',origin:env.BACKUP_ORIGIN}}),env,{waitUntil:p=>jobs.push(p)});await Promise.all(jobs);const run=fake.runs[0];assert.equal(run.status,'failed');assert(run.archive_payload&&fake.driveFiles.has(run.drive_file_id));const image=fake.driveFiles.get(run.archive_payload.objects[0].fileId),original=Buffer.from(image.bytes);image.bytes=Buffer.from('corrupted');await w.perform(env,user,run);assert.equal(run.status,'failed');assert.equal(run.error_code,'ATTACHMENT_CHECKSUM_MISMATCH');image.bytes=original;await w.perform(env,user,run);assert.equal(run.status,'verified');assert.equal(fake.driveFiles.size,2)}finally{global.fetch=old}
});
test('scheduled backup protects a new cloud revision before an older failed job',async()=>{
 const w=await import('../../backup-worker/index.mjs'),env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fake',GOOGLE_CLIENT_ID:'fake',GOOGLE_CLIENT_SECRET:'fake',BACKUP_ORIGIN:'https://cockpit.test',BACKUP_ALLOWED_USER_ID:user,BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64')},fixture={state:sample(),version:8,encrypted:await w.seal('fake',env,user)},fake=upstream(env,fixture),old=global.fetch;global.fetch=fake.fetch;
 try{const previous={id:crypto.randomUUID(),user_id:user,source_version:3,content_hash:'old-failed-hash',status:'failed',created_at:'2026-11-10T00:00:00Z'};fake.runs.push(previous);const jobs=[];await w.default.scheduled({},env,{waitUntil:p=>jobs.push(p)});await Promise.all(jobs);assert.equal(fake.runs[0].source_version,8);assert.equal(fake.runs[0].status,'verified');assert.equal(previous.status,'failed')}finally{global.fetch=old}
});
test('manual backup keeps the HTTP request open until its work finishes',async()=>{
 const w=await import('../../backup-worker/index.mjs'),env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fake',GOOGLE_CLIENT_ID:'fake',GOOGLE_CLIENT_SECRET:'fake',BACKUP_ORIGIN:'https://cockpit.test',BACKUP_ALLOWED_USER_ID:user,BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64')},fixture={state:sample(),encrypted:await w.seal('fake',env,user)},fake=upstream(env,fixture),old=global.fetch;
 let resume,observed,blocked=false;const reached=new Promise(r=>observed=r),gate=new Promise(r=>resume=r);global.fetch=async(url,options)=>{if(String(url).includes('/upload/')&&!blocked){blocked=true;observed();await gate}return fake.fetch(url,options)};
 try{let done=false,jobs=[];const response=w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers:{authorization:'Bearer user',origin:env.BACKUP_ORIGIN}}),env,{waitUntil:p=>jobs.push(p)}).then(r=>{done=true;return r});await reached;assert.equal(done,false);resume();assert.equal((await response).status,202);await Promise.all(jobs);assert.equal(fake.runs[0].status,'verified')}finally{global.fetch=old}
});

test('expired Google refresh authorization produces an actionable reconnect code',async()=>{
 const w=await import('../../backup-worker/index.mjs'),env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fake',GOOGLE_CLIENT_ID:'fake',GOOGLE_CLIENT_SECRET:'fake',BACKUP_ORIGIN:'https://cockpit.test',BACKUP_ALLOWED_USER_ID:user,BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64')},fake=upstream(env,{state:sample(),encrypted:await w.seal('fake',env,user)}),old=global.fetch;
 global.fetch=(url,options)=>String(url).startsWith('https://oauth2.googleapis.com/')?Promise.resolve(Response.json({error:'invalid_grant'},{status:400})):fake.fetch(url,options);
 try{const jobs=[];await w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers:{authorization:'Bearer user',origin:env.BACKUP_ORIGIN}}),env,{waitUntil:p=>jobs.push(p)});await Promise.all(jobs);assert.equal(fake.runs[0].status,'failed');assert.equal(fake.runs[0].error_code,'GOOGLE_RECONNECT_REQUIRED');assert.equal(fake.driveFiles.size,0)}finally{global.fetch=old}
});

test('quarantine approval requires explicit confirmation, rejects stale content and preserves prior good version',async()=>{
 const w=await import('../../backup-worker/index.mjs'),env={SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fake',GOOGLE_CLIENT_ID:'fake',GOOGLE_CLIENT_SECRET:'fake',BACKUP_ORIGIN:'https://cockpit.test',BACKUP_ALLOWED_USER_ID:user,BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64')},fixture={state:sample(),encrypted:await w.seal('fake',env,user)},fake=upstream(env,fixture),old=global.fetch;global.fetch=fake.fetch;const ctx={waitUntil:()=>{}},headers={authorization:'Bearer user',origin:env.BACKUP_ORIGIN};
 try{await w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers}),env,ctx);const good=fake.runs[0];assert.equal(good.status,'verified');fixture.state.memos=[];await w.handle(new Request(env.BACKUP_ORIGIN+'/api/backups/run',{method:'POST',headers}),env,ctx);const row=fake.runs[0],url=env.BACKUP_ORIGIN+'/api/backups/approve/'+row.id;assert.equal(row.status,'quarantined');const approve=confirmation=>w.handle(new Request(url,{method:'POST',headers,body:JSON.stringify({confirmation})}),env,ctx);assert.equal((await approve('')).status,400);fixture.state.tasks[0].title='另一个版本';assert.equal((await approve('ACCEPT_REDUCTION')).status,409);fixture.state=copy(row.source_state);assert.equal((await approve('ACCEPT_REDUCTION')).status,202);assert.equal(row.status,'verified');assert.equal(good.status,'verified');assert.notEqual(row.drive_file_id,good.drive_file_id)}finally{global.fetch=old}
});
