function cloudHash(value){let text=typeof value==="string"?value:JSON.stringify(value),hash=2166136261;for(let index=0;index<text.length;index++){hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(16).padStart(8,"0")}
function deviceId(){let value=localStorage.getItem(CLOUD_DEVICE_KEY);if(!value){value=uid("device");localStorage.setItem(CLOUD_DEVICE_KEY,value)}return value}
function hasBusinessData(value=state){let quick=(value.quickNote?.delta?.ops||[]).some(op=>String(op.insert||"").trim());return!!(Object.values(value.meta?.workJournal?.weeks||{}).some(week=>Object.values(week.days||{}).some(day=>strip(day.content))||Object.values(week.review||{}).some(text=>String(text).trim()))||value.tasks.length||value.projects.length||value.memos.length||value.decisions?.length||quick||Object.values(value.weeks||{}).some(week=>week.top?.length))}
const Cloud={
 client:null,user:null,channel:null,version:0,rowExists:false,remoteReady:false,sessionCheck:null,device:deviceId(),lastHash:"",timer:0,pushing:false,pendingPush:false,syncEpoch:0,applying:false,pendingRemote:null,importPending:typeof hasRestorePending==='function'&&hasRestorePending(),writeBlocked:false,authMode:"login",status:"local",
 config(){try{return{...DEFAULT_CLOUD_CONFIG,...JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)||"null")}}catch(error){return DEFAULT_CLOUD_CONFIG}},
 renderAccount(){let button=$("#accountEmail"),email=this.user?.email||this.user?.user_metadata?.email||"";if(!button)return;button.hidden=!email;button.textContent=email},
 setStatus(status,label){this.status=status;let button=$("#syncButton");button.className="sync-badge "+status;button.textContent=label||({local:"本地模式",connecting:"连接中",syncing:"同步中",synced:"已同步",error:"同步失败",conflict:"待处理冲突"}[status]||status);this.renderAccount()},
 showConflict(accountChanged=false){$("#conflictDialog h2").textContent=accountChanged?"检测到云账号切换":"检测到多端同时修改";$("#conflictDialog .modal-body p").textContent=accountChanged?"为避免把上一账号的数据自动写入当前账号，请明确选择保留本机数据或采用当前账号云端数据；被替换版本会先生成恢复快照。":"自动同步已暂停。请选择保留本机或采用云端；被替换的版本会先生成恢复快照。";showDialog($("#conflictDialog"))},
 async init(){
  let config=this.config();$("#cloudUrl").value=config.url||"";$("#cloudKey").value=config.key||"";
  if(!window.supabase?.createClient){this.setStatus("local","本地模式");$("#cloudGate").hidden=true;return}
  try{
   this.client=window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}});
   this.client.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){this.syncEpoch++;this.remoteReady=false;this.sessionCheck=null;this.pendingPush=false;this.pushing=false;clearTimeout(this.timer);this.user=null;this.setStatus("local","本地模式")}else if(event==="SIGNED_IN"&&session?.user&&!this.user)setTimeout(()=>this.startSession(session),0)});
   let result=await this.client.auth.getSession();
   if(result.error)throw result.error;
   if(result.data.session)await this.startSession(result.data.session);
   else if(localStorage.getItem(LOCAL_MODE_KEY)==="1"){$("#cloudGate").hidden=true;this.setStatus("local","本地模式")}
   else{$("#cloudGate").hidden=false;this.setStatus("local","未登录")}
  }catch(error){console.warn("云端连接失败",error);this.setStatus("error","连接失败");$("#cloudGate").hidden=localStorage.getItem(LOCAL_MODE_KEY)==="1"}
 },
 async startSession(session){
  // Initialization and manual retry share a single read/reconciliation for this account.
  if(this.sessionCheck?.userId===session.user.id&&this.sessionCheck.epoch===this.syncEpoch)return this.sessionCheck.promise;
  let check={userId:session.user.id,epoch:0,promise:null};this.sessionCheck=check;
  check.promise=this.connectSession(session).finally(()=>{if(this.sessionCheck===check)this.sessionCheck=null});check.epoch=this.syncEpoch;
  return check.promise;
 },
 async connectSession(session){
  this.syncEpoch++;this.remoteReady=false;this.pushing=false;this.pendingPush=false;clearTimeout(this.timer);this.pendingRemote=null;$("#authPassword").value="";this.user=session.user;const sessionEpoch=this.syncEpoch;localStorage.removeItem(LOCAL_MODE_KEY);$("#cloudGate").hidden=true;this.setStatus("connecting","连接中");
  try{
   let row=await this.fetchRemote();if(sessionEpoch!==this.syncEpoch||this.user?.id!==session.user.id)return false;this.remoteReady=true;let localSerialized=serializeState(),localHash=cloudHash(localSerialized),link=null;
   try{link=JSON.parse(localStorage.getItem(CLOUD_LINK_KEY)||"null")}catch(error){}
   let accountChanged=!!(link?.userId&&String(link.userId)!==String(this.user.id));
   if(this.importPending){this.rowExists=!!row;this.version=Number(row?.version||0);this.setStatus("error","待确认本机恢复数据")}
   else if(accountChanged&&hasBusinessData(state)){this.rowExists=!!row;this.version=Number(row?.version||0);this.pendingRemote=row||{state:emptyState(),version:0,device_id:"",updated_at:new Date().toISOString(),missing:true};this.setStatus("conflict","确认账号数据");this.showConflict(true)}
   else if(!row){this.rowExists=false;this.version=0;await this.push(true)}
   else{
    this.rowExists=true;this.version=Number(row.version||0);let remoteState=normalizeState(row.state),remoteSerialized=serializeState(remoteState),remoteHash=cloudHash(remoteSerialized);
    if(localHash===remoteHash)this.acceptMeta(row,remoteHash);
    else if(!hasBusinessData(state)){this.applyRemote(row,false)}
    else if(link&&Number(link.version)===this.version){this.lastHash=String(link.hash||"");await this.push(true)}
    else if(link&&String(link.hash)===localHash){this.applyRemote(row,false)}
    else{this.pendingRemote=row;this.setStatus("conflict","存在冲突");this.showConflict()}
   }
   if(this.user?.id===session.user.id)this.subscribe();return this.status==="synced";
  }catch(error){if(sessionEpoch===this.syncEpoch&&this.user?.id===session.user.id){this.remoteReady=false;console.error("云同步初始化失败",error);this.setStatus("error",this.isAuthError(error)?"登录验证失败":"同步失败")}return false}
 },
 isAuthError(value){return Number(value?.status)===401||["PGRST301","PGRST303"].includes(value?.code||value?.error?.code)},
 async fetchRemote(){
  const client=this.client,userId=this.user?.id,epoch=this.syncEpoch;
  const isCurrent=()=>client===this.client&&epoch===this.syncEpoch&&userId===this.user?.id;
  const read=()=>client.from("app_states").select("state,version,device_id,updated_at").eq("user_id",userId).maybeSingle();
  let result=await read();
  if(!isCurrent())throw new Error("会话已切换");
  // One bounded credential refresh; a failed read never means the row is absent.
  if(result.error&&this.isAuthError(result)&&client.auth?.refreshSession){
   const refreshed=await client.auth.refreshSession();
   if(!isCurrent())throw new Error("会话已切换");
   if(refreshed.error||!refreshed.data?.session||refreshed.data.session.user?.id!==userId)throw Object.assign(new Error("登录验证失败，请重新登录"),{status:401});
   result=await read();if(!isCurrent())throw new Error("会话已切换");
  }
  if(result.error)throw Object.assign({},result.error,{status:result.status||result.error.status});return result.data;
 },
 acceptMeta(row,hash,markSynced=true){
  this.remoteReady=true;this.rowExists=true;this.version=Number(row.version||this.version||0);this.lastHash=hash||cloudHash(serializeState());
  localStorage.setItem(CLOUD_LINK_KEY,JSON.stringify({userId:this.user.id,version:this.version,hash:this.lastHash,deviceId:this.device,updatedAt:row.updated_at||new Date().toISOString()}));if(markSynced)this.setStatus("synced","已同步");
 },
 schedule(){
  if(this.applying||!this.user||!this.client||this.importPending||this.pendingRemote||this.status==="conflict"||this.writeBlocked)return;
  this.pendingPush=true;clearTimeout(this.timer);if(!this.pushing)this.timer=setTimeout(()=>this.push(),650);this.setStatus("syncing","待同步");
 },
 async push(force=false){
  if(this.applying||!this.user||!this.client||this.importPending||this.pendingRemote||this.status==="conflict"||this.writeBlocked)return false;
  if(this.pushing){this.pendingPush=true;return false}
  if(!navigator.onLine){this.pendingPush=true;this.setStatus("syncing","离线待同步");return false}
  if(!this.remoteReady)return this.startSession({user:this.user});
  clearTimeout(this.timer);this.pushing=true;
  const epoch=this.syncEpoch,userId=this.user.id,client=this.client,isCurrent=()=>epoch===this.syncEpoch&&this.user?.id===userId&&this.client===client;
  try{
   do{
    this.pendingPush=false;
    if(!navigator.onLine){this.pendingPush=true;this.setStatus("syncing","离线待同步");return false}
    let payload=snapshotCore(),hash=cloudHash(JSON.stringify(payload));
    if(!force&&hash===this.lastHash){this.setStatus("synced","已同步");return true}
    force=false;this.setStatus("syncing","同步中");let result;
    if(!this.rowExists)result=await client.from("app_states").insert({user_id:userId,state:payload,version:1,device_id:this.device,updated_at:new Date().toISOString()}).select("state,version,device_id,updated_at").single();
    else result=await client.from("app_states").update({state:payload,version:this.version+1,device_id:this.device,updated_at:new Date().toISOString()}).eq("user_id",userId).eq("version",this.version).select("state,version,device_id,updated_at").maybeSingle();
    if(!isCurrent())return false;
    if(result.error?.code==="23505"){
     // Another client may have created the row since our successful empty read.
     this.remoteReady=false;let remote=await this.fetchRemote();if(!isCurrent())return false;
     if(!remote)throw result.error;
     this.remoteReady=true;this.rowExists=true;this.version=Number(remote.version||0);this.pendingRemote=remote;
     this.setStatus("conflict","存在冲突");this.showConflict();return false;
    }
    if(result.error)throw Object.assign({},result.error,{status:result.status||result.error.status});
    if(!result.data){let remote=await this.fetchRemote();if(!isCurrent())return false;this.pendingRemote=remote;this.setStatus("conflict","存在冲突");this.showConflict();return false}
    this.acceptMeta(result.data,hash,false);
    if(this.pendingRemote||this.status==="conflict"||this.importPending)return false;
    this.pendingPush=this.pendingPush||cloudHash(serializeState())!==hash;
   }while(this.pendingPush&&isCurrent());
   if(!isCurrent())return false;this.setStatus("synced","已同步");return true;
  }catch(error){if(isCurrent()){this.pendingPush=true;if(this.isAuthError(error)||error.code==="23505")this.remoteReady=false;if(String(error.message||"").includes("COCKPIT_PROTECTED")){this.writeBlocked=true;this.pendingPush=false;this.setStatus("error","已拦截异常覆盖");return false}console.error("云同步写入失败",error);this.setStatus("error",this.isAuthError(error)?"登录验证失败":"同步失败")}return false}
  finally{if(isCurrent())this.pushing=false}
 },
 applyRemote(row,backup=true){
  if(typeof BackupFormat!=="undefined"&&BackupFormat.risk(state,row.state).length&&!backup){this.pendingRemote=row;this.setStatus("conflict","云端数据异常减少");this.showConflict();return false}
  if(typeof checkpointLocal==="function"&&hasBusinessData(state))checkpointLocal("采用云端前的独立安全副本");
  this.syncEpoch++;this.pushing=false;this.pendingPush=false;clearTimeout(this.timer);this.applying=true;
  try{
   let recovery=backup&&hasBusinessData(state)?{id:uid("snapshot"),label:"采用云端前的本机安全快照",createdAt:new Date().toISOString(),state:snapshotCore()}:null;
   state=normalizeState(row.state);if(recovery){recovery.state.snapshots=[];state.snapshots.unshift(recovery);state.snapshots=state.snapshots.slice(0,12)}ensureCurrentWeek();captureCurrentWeek();localStorage.setItem(STORAGE_KEY,serializeState());this.acceptMeta(row,cloudHash(serializeState()));undoStack=[];redoStack=[];requestRender();
  }finally{this.applying=false}
  refreshScheduledTasks();
 },
 subscribe(){
  if(this.channel)this.client.removeChannel(this.channel);
  this.channel=this.client.channel("app-state-"+this.user.id).on("postgres_changes",{event:"UPDATE",schema:"public",table:"app_states",filter:"user_id=eq."+this.user.id},payload=>this.remoteChanged(payload.new)).subscribe();
 },
 remoteChanged(row){
  if(!row||row.device_id===this.device||Number(row.version)<=this.version)return;
  if(this.importPending){this.pendingRemote=row;return}
  let localHash=cloudHash(serializeState());
  if(localHash===this.lastHash&&!this.pushing)this.applyRemote(row,false);
  else{this.pendingRemote=row;this.setStatus("conflict","存在冲突");this.showConflict()}
 },
 async useRemote(){if(!this.pendingRemote)return;let missing=!!this.pendingRemote.missing;this.applyRemote(this.pendingRemote,true);if(missing){this.rowExists=false;this.version=0}this.pendingRemote=null;this.importPending=false;if(typeof clearRestorePending==="function")clearRestorePending();this.writeBlocked=false;if(cloudHash(serializeState())!==this.lastHash)this.schedule();closeDialog("conflictDialog");toast(missing?"已切换为空白云端账号，本机原数据已存入安全快照":"已采用云端版本")},
 async keepLocal(){if(typeof BackupUI!=="undefined")return BackupUI.replaceCloud();toast("请通过数据与恢复核对版本后再替换云端")},
 renderStatus(){
  let account=this.user?.email||this.user?.user_metadata?.email||"未登录",pending=(this.importPending||this.writeBlocked)?'<div class="data-item"><div><b>等待核对本机数据</b><small>自动上传已暂停，请核对后选择恢复云端或替换云端。</small></div><div><button class="btn" id="discardImport">恢复云端</button><button class="btn primary" id="uploadImport">替换云端</button></div></div>':"";
  $("#syncDialogBody").innerHTML='<div class="data-list"><div class="data-item"><div><b>'+esc(this.user?"已登录":"本地模式")+'</b><small>'+esc(account)+' · '+esc($("#syncButton").textContent)+'</small></div><button class="btn" id="syncNow" '+(this.user?"":"disabled")+'>立即同步</button></div>'+pending+'</div><div class="page-actions" style="margin-top:16px"><button class="btn" id="showLogin">'+(this.user?"切换账号":"登录云端")+'</button>'+(this.user?'<button class="btn danger" id="logoutCloud">退出登录</button>':"")+'</div>';
  $("#syncNow")?.addEventListener("click",()=>this.push(true));$("#showLogin")?.addEventListener("click",()=>{closeDialog("syncDialog");$("#cloudGate").hidden=false});$("#logoutCloud")?.addEventListener("click",()=>this.logout());
  $("#uploadImport")?.addEventListener("click",()=>BackupUI.replaceCloud());$("#discardImport")?.addEventListener("click",async()=>{let row=await this.fetchRemote();if(row){this.applyRemote(row,true);clearRestorePending();this.writeBlocked=false}this.renderStatus()});
 },
 async logout(){this.syncEpoch++;this.remoteReady=false;this.sessionCheck=null;this.pendingPush=false;this.pushing=false;if(this.client&&this.channel){await this.client.removeChannel(this.channel);this.channel=null}if(this.client)await this.client.auth.signOut();this.user=null;this.writeBlocked=false;this.version=0;this.rowExists=false;this.lastHash="";this.pendingRemote=null;clearTimeout(this.timer);localStorage.setItem(LOCAL_MODE_KEY,"1");this.setStatus("local","本地模式");closeDialog("syncDialog")},
 async uploadAttachments(taskId,files){
  if(!taskById(taskId))throw Error("原事项已删除");
  if(!this.user||!this.client)throw Error("请登录云端后上传");
  let userId=this.user.id,client=this.client,epoch=this.syncEpoch;
  for(let file of files){
   if(file.size>50*1024*1024)throw Error(file.name+" 超过 50MB");
   if(this.user?.id!==userId||this.client!==client||this.syncEpoch!==epoch)throw Error("登录账户已变化");
   let safe=file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g,"_"),path=userId+"/"+taskId+"/"+uid("file")+"-"+safe,result=await client.storage.from("task-attachments").upload(path,file,{upsert:false});
   if(result.error)throw Error("上传失败："+(result.error.message||file.name));
   if(this.user?.id!==userId||this.client!==client||this.syncEpoch!==epoch||!taskById(taskId)){
    try{await client.storage.from("task-attachments").remove([path])}catch{}
    throw Error("事项或账户已变化，未添加附件");
   }
   let meta={id:uid("attachment"),name:file.name,type:file.type||"application/octet-stream",size:file.size,path,createdAt:new Date().toISOString()};
   try{commit("上传附件",draft=>{let task=draft.tasks.find(item=>item.id===taskId);if(task)task.attachments.push(meta)},{immediate:true})}catch(error){if(!localSaveError)throw error;toast("文件已上传，但本地保存失败；请重试保存，勿重复上传")}
   if(taskDraft?.id===taskId){taskDraft.attachments.push(meta);let list=$(".attachment-list");if(list)list.innerHTML=attachmentMarkup()}
  }
 },
 async uploadRichImage(owner,file){
  if(!this.user||!this.client)throw Error("请登录云端后上传");
  if(!RICH_IMAGE_TYPES.includes(file.type)||file.size>50*1024*1024)throw Error("请选择不超过 50MB 的图片");
  if(owner.type==="task"&&!taskById(owner.id))throw Error("原事项已删除");
  let userId=this.user.id,client=this.client,epoch=this.syncEpoch,safe=(file.name||"粘贴图片.png").replace(/[^\w.\-\u4e00-\u9fa5]/g,"_"),folder=String(owner.id||"document").replace(/[^\w.-]/g,"_"),path=userId+"/rich-"+owner.type+"/"+folder+"/"+uid("image")+"-"+safe;
  let result=await client.storage.from("task-attachments").upload(path,file,{upsert:false});
  if(result.error)throw Error("上传失败："+(result.error.message||file.name));
  if(this.user?.id!==userId||this.client!==client||this.syncEpoch!==epoch){try{await client.storage.from("task-attachments").remove([path])}catch{}throw Error("登录账户已变化，图片未插入")}
  return normalizeRichImage({id:uid("image"),path,name:file.name||"粘贴图片.png",type:file.type});
 },
 async previewAttachment(item,container){
  if(!item||!container)return;if(!this.client||!this.user){container.textContent="请登录后查看附件";return}let token=uid("preview"),userId=this.user.id,taskId=taskDraft?.id;container.dataset.previewToken=token;
  let current=()=>container.isConnected&&container.dataset.previewToken===token&&this.user?.id===userId&&taskDraft?.id===taskId;
  try{let result=await this.client.storage.from("task-attachments").createSignedUrl(item.path,1800);if(!current())return;if(result.error||!result.data?.signedUrl)throw Error(result.error?.message||"无法生成预览地址");let url=result.data.signedUrl;
   if(item.type.startsWith("image/")){container.innerHTML='<button type="button" class="attachment-large-preview" data-image-view="'+esc(item.id)+'" aria-label="查看'+esc(item.name)+'大图"><img src="'+esc(url)+'" alt="'+esc(item.name)+'"><small>点击查看大图</small></button>';let image=container.querySelector("img");image.onerror=()=>{if(current())container.innerHTML='<span>图片加载失败</span><button type="button" class="btn" data-preview-attachment="'+esc(item.id)+'">重试预览</button>'}}
   else if(item.type==="application/pdf")container.innerHTML='<iframe title="'+esc(item.name)+'" src="'+esc(url)+'" style="width:100%;height:260px;border:0"></iframe>';
   else container.innerHTML='<a class="btn" href="'+esc(url)+'" target="_blank" rel="noopener">打开 / 下载 '+esc(item.name)+'</a>';
  }catch(error){if(current())container.innerHTML='<span>'+esc(error.message||"预览失败")+'</span><button type="button" class="btn" data-preview-attachment="'+esc(item.id)+'">重试预览</button>'}
 },
 async removeAttachment(taskId,item){
  if(!item)return;commit("移除附件",draft=>{let task=draft.tasks.find(value=>value.id===taskId);if(task)task.attachments=task.attachments.filter(value=>value.id!==item.id)},{immediate:true});if(taskDraft?.id===taskId){taskDraft.attachments=taskDraft.attachments.filter(value=>value.id!==item.id);if(attachmentPreviewId===item.id){attachmentPreviewId="";let preview=$("#attachmentPreview");if(preview){preview.textContent="选择附件后在这里预览";preview.classList.remove("has-preview")}}let list=$(".attachment-list");if(list)list.innerHTML=attachmentMarkup()}toast("附件已移除；云端文件暂时保留，可通过撤销恢复")
 }
};
window.CloudSync=Cloud;
$("#keepLocalButton").addEventListener("click",()=>Cloud.keepLocal());
$("#useRemoteButton").addEventListener("click",()=>Cloud.useRemote());
$$("[data-auth-mode]").forEach(button=>button.addEventListener("click",()=>{Cloud.authMode=button.dataset.authMode;$$("[data-auth-mode]").forEach(item=>item.classList.toggle("active",item===button));$("#authSubmit").textContent=Cloud.authMode==="login"?"登录":"注册";$("#authPassword").autocomplete=Cloud.authMode==="login"?"current-password":"new-password"}));
$("#localModeButton").addEventListener("click",()=>{localStorage.setItem(LOCAL_MODE_KEY,"1");$("#cloudGate").hidden=true;Cloud.setStatus("local","本地模式")});
$("#saveCloudConfig").addEventListener("click",()=>{let url=$("#cloudUrl").value.trim().replace(/\/$/,""),key=$("#cloudKey").value.trim();if(!url.startsWith("https://")||key.length<20)return toast("连接设置格式不正确");localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify({url,key}));toast("连接设置已保存，请刷新页面")});
$("#authForm").addEventListener("submit",async event=>{
 event.preventDefault();let email=$("#authEmail").value.trim(),password=$("#authPassword").value,message=$("#authMessage");message.textContent="正在处理……";
 try{let result=Cloud.authMode==="login"?await Cloud.client.auth.signInWithPassword({email,password}):await Cloud.client.auth.signUp({email,password});if(result.error)throw result.error;if(Cloud.authMode==="register"&&!result.data.session)message.textContent="注册成功，请检查邮箱完成验证。";else{message.textContent="";await Cloud.startSession(result.data.session)}}catch(error){message.textContent=error.message||"登录失败"}
});

