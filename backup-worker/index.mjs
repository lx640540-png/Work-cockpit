import '../src/domain/backup-format.js';
const F=globalThis.BackupFormat;
const encoder=new TextEncoder();
const MAX_FILE=20*1024*1024, MAX_ARCHIVE=25*1024*1024;
const DRIVE='https://www.googleapis.com/drive/v3';
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value))).map(b=>b.toString(16).padStart(2,'0')).join('');
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(code,status=502)=>Object.assign(new Error(code),{code,status});
async function request(url,options={}){let r;try{r=await fetch(url,{...options,signal:AbortSignal.timeout(45000)})}catch{throw fail('UPSTREAM_UNREACHABLE')}if(!r.ok)throw fail('UPSTREAM_'+r.status,r.status===401?401:502);return r}
async function limited(response,max){if(Number(response.headers.get('content-length'))>max)throw fail('FILE_TOO_LARGE');let reader=response.body.getReader(),chunks=[],size=0;for(;;){let {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw fail('FILE_TOO_LARGE')}chunks.push(value)}let out=new Uint8Array(size),pos=0;for(const chunk of chunks){out.set(chunk,pos);pos+=chunk.length}return out}
function config(env){for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','BACKUP_ENCRYPTION_KEY','BACKUP_ORIGIN','BACKUP_ALLOWED_USER_ID'])if(!env[key])throw fail('BACKUP_NOT_CONFIGURED',503);return env}
function db(env,path,method='GET',body,extra={}){return request(env.SUPABASE_URL+'/rest/v1/'+path,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'content-type':'application/json',prefer:'return=representation',...extra},body:body===undefined?undefined:JSON.stringify(body)}).then(r=>r.json())}
async function owner(req,env){const bearer=req.headers.get('authorization');if(!bearer?.startsWith('Bearer '))throw fail('AUTH_REQUIRED',401);const r=await request(env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:bearer}});const u=await r.json();if(u.id!==env.BACKUP_ALLOWED_USER_ID)throw fail('OWNER_NOT_ALLOWED',403);return u.id}
function originCheck(req,env){const origin=req.headers.get('origin');if(origin&&origin!==env.BACKUP_ORIGIN)throw fail('ORIGIN_NOT_ALLOWED',403);if(!['GET','HEAD'].includes(req.method)&&origin!==env.BACKUP_ORIGIN)throw fail('ORIGIN_REQUIRED',403)}
async function key(env){const bytes=Uint8Array.from(atob(env.BACKUP_ENCRYPTION_KEY),c=>c.charCodeAt(0));if(bytes.length!==32)throw fail('INVALID_ENCRYPTION_KEY',503);return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])}
export async function seal(value,env,user){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(user)},await key(env),encoder.encode(value)));return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...encrypted))}
export async function unseal(value,env,user){const [iv,data]=value.split('.').map(s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(user)},await key(env),data))}
async function credential(env,user){return (await db(env,'cockpit_backup_credentials?user_id=eq.'+user+'&select=*'))[0]}
async function access(env,user,c){if(!c)throw fail('GOOGLE_NOT_CONNECTED',409);const r=await request('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:await unseal(c.encrypted_token,env,user),grant_type:'refresh_token'})});const data=await r.json();if(!data.access_token)throw fail('GOOGLE_RECONNECT_REQUIRED');return data.access_token}
async function drive(token,path,options={}){return request(DRIVE+path,{...options,headers:{authorization:'Bearer '+token,...options.headers}})}
async function files(token,q){let all=[],page='';do{let args=new URLSearchParams({q:"trashed=false and "+q,fields:'nextPageToken,files(id,name,createdTime,size,sha256Checksum,appProperties)',pageSize:'1000',...(page?{pageToken:page}:{})});let data=await(await drive(token,'/files?'+args)).json();all.push(...data.files);page=data.nextPageToken;if(all.length>10000)throw fail('TOO_MANY_BACKUP_FILES')}while(page);return all}
async function newId(token){return (await(await drive(token,'/files/generateIds?count=1&space=drive&type=files')).json()).ids[0]}
async function folder(token,user,c,env){if(c.folder_id){await drive(token,'/files/'+c.folder_id+'?fields=id');return c.folder_id}let found=await files(token,"mimeType='application/vnd.google-apps.folder' and appProperties has { key='cockpitOwner' and value='"+user+"' }");let id=found[0]?.id;if(!id){const r=await drive(token,'/files?fields=id',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'工作台自动备份',mimeType:'application/vnd.google-apps.folder',appProperties:{cockpitOwner:user}})});id=(await r.json()).id}await db(env,'cockpit_backup_credentials?user_id=eq.'+user,'PATCH',{folder_id:id});return id}
async function media(token,id,max=MAX_FILE){return limited(await drive(token,'/files/'+id+'?alt=media'),max)}
async function upload(token,id,name,bytes,parent,properties){
 const boundary='cockpit_'+crypto.randomUUID(),metadata={id,name,parents:[parent],appProperties:properties};
 const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n',bytes,'\r\n--'+boundary+'--']);
 const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size,sha256Checksum',{method:'POST',signal:AbortSignal.timeout(45000),headers:{authorization:'Bearer '+token,'content-type':'multipart/related; boundary='+boundary},body});
 if(!response.ok&&response.status!==409)throw fail('DRIVE_UPLOAD_'+response.status);
 const expected=await digest(bytes),download=await media(token,id,Math.max(MAX_FILE,bytes.length));if(await digest(download)!==expected)throw fail('DRIVE_CHECKSUM_MISMATCH');return id;
}
async function compress(value){return new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())}
export async function decode(bytes){const plain=await limited(new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))),MAX_ARCHIVE);return JSON.parse(new TextDecoder().decode(plain))}
function storageHeaders(env){return {apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}}
const storagePath=o=>encodeURIComponent(o.bucket)+'/'+o.path.split('/').map(encodeURIComponent).join('/');
async function storageRead(env,o){return limited(await request(env.SUPABASE_URL+'/storage/v1/object/'+storagePath(o),{headers:storageHeaders(env)}),MAX_FILE)}
async function attachmentBackup(env,user,token,parent){
 const objects=await db(env,'rpc/cockpit_backup_objects','POST',{p_owner:user}),result=[];
 for(const o of objects){
  if(Number(o.metadata?.size)>MAX_FILE)throw fail('ATTACHMENT_OVER_20MB');
  const object={bucket:o.bucket_id,path:o.name};if(!object.path.startsWith(user+'/'))throw fail('INVALID_ATTACHMENT_OWNER');
  const bytes=await storageRead(env,object),hash=await digest(bytes);
  const found=await files(token,"'"+parent+"' in parents and appProperties has { key='sha256' and value='"+hash+"' } and appProperties has { key='kind' and value='attachment' }");
  let id=found[0]?.id;if(id){if(await digest(await media(token,id))!==hash)throw fail('ATTACHMENT_CHECKSUM_MISMATCH')}else{id=await newId(token);await upload(token,id,'附件-'+hash.slice(0,16)+'-'+object.path.split('/').pop(),bytes,parent,{kind:'attachment',sha256:hash,cockpitOwner:user})}
  result.push({...object,fileId:id,sha256:hash,size:bytes.length,contentType:o.metadata?.mimetype||'application/octet-stream'});
 }return result;
}
export function validateArchive(archive,user){
 if(archive?.format!=='cockpit-backup-v1'||archive.userId!==user||!Array.isArray(archive.objects))throw fail('INVALID_ARCHIVE');F.validate(archive.state);
 const keys=new Set();for(const o of archive.objects){const k=o.bucket+'/'+o.path;if(!['task-files','task-attachments'].includes(o.bucket)||!o.path.startsWith(user+'/')||(/[\\:\x00-\x1f]/.test(o.path)||o.path.split('/').some(p=>!p||p==='.'||p==='..'))||!/^[\w-]+$/.test(o.fileId)||!Number.isInteger(o.size)||o.size<0||o.size>MAX_FILE||!/^[a-f0-9]{64}$/.test(o.sha256)||keys.has(k))throw fail('INVALID_ARCHIVE_ATTACHMENT');keys.add(k)}
 const paths=new Set(archive.objects.map(o=>o.path));
 function refs(v){if(typeof v==='string'){for(const m of v.matchAll(/data-rich-image-path=["']([^"']+)["']/g))if(!paths.has(m[1].replaceAll('&amp;','&')))throw fail('REFERENCED_ATTACHMENT_MISSING')}else if(v&&typeof v==='object'){if(typeof v.path==='string'&&v.path.includes('/')&&!paths.has(v.path))throw fail('REFERENCED_ATTACHMENT_MISSING');for(const value of Object.values(v))refs(value)}}refs(archive.state);return archive;
}
async function loadArchive(env,user,id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw fail('INVALID_BACKUP_ID',400);
 const run=(await db(env,'cockpit_backup_runs?id=eq.'+id+'&user_id=eq.'+user+'&status=eq.verified&select=id,archive_hash,drive_file_id'))[0];if(!run)throw fail('BACKUP_NOT_FOUND',404);
 const c=await credential(env,user),token=await access(env,user,c),bytes=await media(token,run.drive_file_id,MAX_ARCHIVE);if(await digest(bytes)!==run.archive_hash)throw fail('ARCHIVE_CHECKSUM_MISMATCH');const archive=validateArchive(await decode(bytes),user);return {archive,token};
}
async function restore(env,user,id){
 const {archive,token}=await loadArchive(env,user,id);
 // Verify every required object before changing storage. Existing immutable paths are never overwritten.
 for(const o of archive.objects)if(await digest(await media(token,o.fileId))!==o.sha256)throw fail('ATTACHMENT_CHECKSUM_MISMATCH');
 for(const o of archive.objects){
  const url=env.SUPABASE_URL+'/storage/v1/object/'+storagePath(o),current=await fetch(url,{headers:storageHeaders(env),signal:AbortSignal.timeout(45000)});
  if(current.ok){if(await digest(await limited(current,MAX_FILE))!==o.sha256)throw fail('EXISTING_ATTACHMENT_DIFFERS');continue}
  if(![400,404].includes(current.status))throw fail('STORAGE_READ_FAILED');
  // A 400 is not evidence of absence; confirm with Storage metadata, whose 404 alone permits creation.
  const info=await fetch(env.SUPABASE_URL+'/storage/v1/object/info/'+storagePath(o),{headers:storageHeaders(env),signal:AbortSignal.timeout(45000)});
  let missing=info.status===404;if(!missing&&!info.ok){let reason;try{reason=await info.json()}catch{}missing=String(reason?.statusCode)==='404'}if(!missing)throw fail('STORAGE_ABSENCE_UNCONFIRMED')
  await request(url,{method:'POST',headers:{...storageHeaders(env),'content-type':o.contentType,'x-upsert':'false'},body:await media(token,o.fileId)});
  if(await digest(await storageRead(env,o))!==o.sha256)throw fail('RESTORED_ATTACHMENT_CHECKSUM_MISMATCH');
 }return archive.state;
}
async function status(env,user){const c=await credential(env,user),runs=await db(env,'cockpit_backup_runs?user_id=eq.'+user+'&select=id,source_version,status,summary,attachment_count,error_code,created_at,verified_at,next_retry_at&order=created_at.desc&limit=80');return {configured:true,connected:!!c,lastError:c?.last_error||null,runs}}
async function createRun(env,user){
 const row=(await db(env,'app_states?user_id=eq.'+user+'&select=state,version'))[0];if(!row)throw fail('NO_CLOUD_STATE',409);F.validate(row.state);
 const hash=await digest(F.content(row.state)),summary=F.summary(row.state);
 const existing=(await db(env,'cockpit_backup_runs?user_id=eq.'+user+'&content_hash=eq.'+hash+'&order=created_at.desc&limit=1'))[0];
 if(existing&&['verified','quarantined','pending','running','failed'].includes(existing.status))return existing;
 const latest=(await db(env,'cockpit_backup_runs?user_id=eq.'+user+'&status=eq.verified&order=created_at.desc&limit=1'))[0];
 const quarantined=!Object.values(summary).some(Boolean)||latest&&F.risk(latest.source_state,row.state).length>0;
 const data={id:crypto.randomUUID(),user_id:user,source_version:row.version,content_hash:hash,summary,source_state:row.state,status:quarantined?'quarantined':'pending',error_code:quarantined?'ANOMALOUS_STATE_REQUIRES_REVIEW':null};
 const inserted=await db(env,'cockpit_backup_runs?on_conflict=user_id,source_version,content_hash','POST',data,{prefer:'resolution=ignore-duplicates,return=representation'});return inserted[0]||(await db(env,'cockpit_backup_runs?user_id=eq.'+user+'&source_version=eq.'+row.version+'&content_hash=eq.'+hash))[0];
}
async function cleanup(env,user,token,latestId){
 const rows=await db(env,'cockpit_backup_runs?user_id=eq.'+user+'&status=eq.verified&select=id,drive_file_id,status,pinned,created_at&order=created_at.desc');const keep=F.retained(rows);keep.add(latestId);
 for(const row of rows){if(keep.has(row.id))continue;await drive(token,'/files/'+row.drive_file_id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({trashed:true})});await db(env,'cockpit_backup_runs?id=eq.'+row.id+'&user_id=eq.'+user,'DELETE')}
 await db(env,'rpc/cockpit_backup_prune_history','POST',{p_owner:user});
 // Binary attachments remain immutable; no automatic garbage collection risks a surviving version.
}
export async function perform(env,user,run){
 if(!run||['verified','quarantined'].includes(run.status))return;
 const lease=crypto.randomUUID();if(!await db(env,'rpc/cockpit_backup_claim','POST',{p_id:run.id,p_token:lease}))return;
 const filter='cockpit_backup_runs?id=eq.'+run.id+'&lease_token=eq.'+lease;
 try{
  const c=await credential(env,user),token=await access(env,user,c),parent=await folder(token,user,c,env);
  const objects=run.archive_payload?.objects||await attachmentBackup(env,user,token,parent);
  const archive=run.archive_payload||{format:'cockpit-backup-v1',userId:user,sourceVersion:run.source_version,createdAt:run.created_at,state:run.source_state,objects};validateArchive(archive,user);
  const bytes=await compress(archive),hash=await digest(bytes);if(bytes.length>MAX_ARCHIVE)throw fail('ARCHIVE_TOO_LARGE');
  let id=run.drive_file_id||await newId(token);await db(env,filter,'PATCH',{drive_file_id:id,archive_hash:hash,archive_payload:archive});
  await upload(token,id,'工作台-'+run.created_at.replace(/[:.]/g,'-')+'-v'+run.source_version+'.json.gz',bytes,parent,{kind:'snapshot',cockpitOwner:user,sha256:hash,sourceVersion:String(run.source_version)});
  const saved=validateArchive(await decode(await media(token,id,MAX_ARCHIVE)),user);if(F.stable(saved.state)!==F.stable(run.source_state)||F.stable(saved.objects)!==F.stable(objects))throw fail('RESTORE_DRILL_MISMATCH');
  const updated=await db(env,filter,'PATCH',{status:'verified',verified_at:new Date().toISOString(),attachment_count:objects.length,lease_until:null,lease_token:null,error_code:null});if(!updated.length)throw fail('BACKUP_LEASE_EXPIRED');
  await db(env,'cockpit_backup_credentials?user_id=eq.'+user,'PATCH',{last_error:null});
  try{await cleanup(env,user,token,run.id)}catch{ /* Verified backups survive retention failure. Retry cleanup after next success. */ }
 }catch(error){const code=error.code||'BACKUP_FAILED';await db(env,filter,'PATCH',{status:'failed',lease_until:null,lease_token:null,error_code:code,next_retry_at:new Date(Date.now()+Math.min(1440,2**Math.min(10,(run.attempts||0)+1))*60000).toISOString()});await db(env,'cockpit_backup_credentials?user_id=eq.'+user,'PATCH',{last_error:code})}
}
async function connect(req,env,user){
 const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 await db(env,'cockpit_backup_oauth?expires_at=lt.'+encodeURIComponent(new Date().toISOString()),'DELETE');
 await db(env,'cockpit_backup_oauth','POST',{nonce_hash:await digest(nonce),user_id:user,expires_at:new Date(Date.now()+10*60000).toISOString()});
 const params=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.BACKUP_ORIGIN+'/api/backups/oauth/callback',response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state:nonce});return json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
}
async function callback(req,env){
 const u=new URL(req.url),state=u.searchParams.get('state');if(!state)throw fail('INVALID_OAUTH_STATE',400);
 const rows=await db(env,'cockpit_backup_oauth?nonce_hash=eq.'+await digest(state)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString()),'DELETE');const row=rows[0];if(!row||row.user_id!==env.BACKUP_ALLOWED_USER_ID)throw fail('EXPIRED_OAUTH_STATE',400);
 if(u.searchParams.get('error')||!u.searchParams.get('code'))throw fail('GOOGLE_AUTH_CANCELLED',400);
 const r=await request('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code:u.searchParams.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:env.BACKUP_ORIGIN+'/api/backups/oauth/callback',grant_type:'authorization_code'})});const token=await r.json();
 if(!token.refresh_token||!token.scope?.split(' ').includes('https://www.googleapis.com/auth/drive.file'))throw fail('GOOGLE_OFFLINE_AUTH_REQUIRED',400);
 const existing=await credential(env,row.user_id);
 await db(env,'cockpit_backup_credentials?on_conflict=user_id','POST',{user_id:row.user_id,encrypted_token:await seal(token.refresh_token,env,row.user_id),folder_id:existing?.folder_id||null,last_error:null},{prefer:'resolution=merge-duplicates,return=representation'});
 return new Response(null,{status:303,headers:{location:env.BACKUP_ORIGIN+'/#data','cache-control':'no-store','referrer-policy':'no-referrer'}});
}
export async function handle(req,env,ctx){
 const path=new URL(req.url).pathname;if(!path.startsWith('/api/backups/'))return env.ASSETS.fetch(req);
 try{
  config(env);originCheck(req,env);
  if(path==='/api/backups/oauth/callback'&&req.method==='GET')return await callback(req,env);
  const user=await owner(req,env);
  if(path==='/api/backups/status'&&req.method==='GET')return json(await status(env,user));
  if(path==='/api/backups/connect'&&req.method==='POST')return await connect(req,env,user);
  if(path==='/api/backups/run'&&req.method==='POST'){const run=await createRun(env,user);ctx.waitUntil(perform(env,user,run));return json({id:run.id,status:run.status},202)}
  const match=path.match(/^\/api\/backups\/(archive|restore)\/([a-f0-9-]{36})$/);
  if(match&&req.method===(match[1]==='restore'?'POST':'GET')){const state=match[1]==='restore'?await restore(env,user,match[2]):(await loadArchive(env,user,match[2])).archive.state;return json({state})}
  return json({error:'NOT_FOUND'},404);
 }catch(error){return json({error:error.code||'BACKUP_REQUEST_FAILED'},error.status||500)}
}
export default {fetch:handle,async scheduled(event,env,ctx){config(env);const user=env.BACKUP_ALLOWED_USER_ID;if(!await credential(env,user))return;
 const pending=(await db(env,'cockpit_backup_runs?user_id=eq.'+user+'&status=in.(failed,running,pending)&or=(next_retry_at.is.null,next_retry_at.lte.'+encodeURIComponent(new Date().toISOString())+')&order=created_at.asc&limit=1'))[0];const run=pending||await createRun(env,user);ctx.waitUntil(perform(env,user,run));}};
