const BackupUI={
 status:null,history:[],loading:false,error:'',account:'',checkedAt:0,timer:0,runPending:false,pollFailures:0,
 active(){return this.runPending||!!this.status?.runs?.some(r=>r.status==='pending'||r.status==='running')},
 schedule(){clearTimeout(this.timer);this.timer=0;if(document.hidden||!Cloud.user)return;let expired=this.status?.runs?.some(r=>r.status==='running'&&r.lease_until&&Date.parse(r.lease_until)<Date.now()),delay=!this.active()||expired?60000:Math.min(30000,3000*2**Math.min(this.pollFailures,3));this.timer=setTimeout(()=>{this.timer=0;this.refresh()},delay)},
 updatePanel(){let panel=document.querySelector('#page-data .backup-panel');if(!panel)return;let open=Array.from(panel.querySelectorAll('details'),d=>d.open),focused=document.activeElement,selector=focused?.dataset?.backupAction?'[data-backup-action="'+focused.dataset.backupAction+'"]':null;panel.outerHTML=backupPanelMarkup();let next=document.querySelector('#page-data .backup-panel');next?.querySelectorAll('details').forEach((d,i)=>{if(i<open.length)d.open=open[i]});if(selector)next?.querySelector(selector)?.focus({preventScroll:true})},
 message(code){return ({GOOGLE_RECONNECT_REQUIRED:'Google 授权已失效，请重新连接 Google Drive',GOOGLE_OFFLINE_AUTH_REQUIRED:'Google 持续授权未完成，请重新连接 Google Drive',BACKUP_NOT_CONFIGURED:'备份后台尚未配置，当前没有自动备份保护',GOOGLE_NOT_CONNECTED:'尚未连接 Google Drive',AUTH_REQUIRED:'请先登录云端',OWNER_NOT_ALLOWED:'此账号未启用备份',ANOMALOUS_STATE_REQUIRES_REVIEW:'数据明显减少或为空，已隔离，未替换正常备份',ATTACHMENT_OVER_20MB:'存在超过 20MB 的附件，整份备份尚未完成',UPSTREAM_401:'Google 授权失效或登录已过期，请重新连接',ARCHIVE_CHECKSUM_MISMATCH:'备份校验失败，已停止恢复',COCKPIT_CONFLICT:'云端已有新版本，请刷新后重新核对'})[code]||code||''},
 async api(path,method='GET'){
  if(!Cloud.user||!Cloud.client?.auth?.getSession)throw Error('请先登录云端');let user=Cloud.user.id,session=await Cloud.client.auth.getSession();if(session.error||!session.data?.session?.access_token)throw Error('登录已过期，请重新登录');
  const r=await fetch('/api/backups/'+path,{method,headers:{authorization:'Bearer '+session.data.session.access_token},cache:'no-store'});if(Cloud.user?.id!==user)throw Error('账号已切换，操作已停止');let value;try{value=await r.json()}catch{throw Error('备份接口未部署，请先完成后台配置')}
  if(!r.ok)throw Error(this.message(value.error));return value;
 },
 async refresh(){if(this.loading)return;this.loading=true;this.error='';const user=Cloud.user?.id;if(this.account!==(user||'')){this.status=null;this.history=[]}this.account=user||'';try{
  if(!user)throw Error('登录后可查看云端历史与自动备份');
  const results=await Promise.allSettled([this.api('status'),Promise.resolve().then(()=>Cloud.client.from('app_state_history').select('id,version,summary,reason,created_at').eq('user_id',user).order('created_at',{ascending:false}).limit(80))]);
  if(Cloud.user?.id!==user)return;
  if(results[0].status==='fulfilled'){this.status=results[0].value;this.checkedAt=Date.now();this.pollFailures=0}else{this.pollFailures++;this.error='状态更新失败，显示上次读取的结果：'+results[0].reason.message}
  if(results[1].status==='fulfilled'&&!results[1].value.error)this.history=results[1].value.data||[];else{this.history=[];this.error+=(this.error?'；':'')+'云端历史尚不可用，请检查数据库保护是否部署'}
 }catch(error){this.error=error.message;this.pollFailures++}finally{this.loading=false;this.renderAlert();if(currentPage==='data')this.updatePanel();this.schedule()}},
 warning(){
  if(!Cloud.user||this.account!==Cloud.user.id)return '';
  if(this.error)return this.error;
  const s=this.status;if(!s)return '';
  if(!s.connected)return '自动备份尚未启用：请连接 Google Drive';
  if(s.lastError)return this.message(s.lastError);
  const runs=s.runs||[],latest=runs[0],good=runs.find(r=>r.status==='verified');
  if(latest?.status==='quarantined')return '数据异常减少，已隔离：请检查数据，最近正常备份仍保留';
  if(latest?.status==='failed')return '备份失败：'+this.message(latest.error_code)+'。后台将按计划重试';
  if(latest?.status==='running'&&Date.parse(latest.lease_until)<Date.now())return '备份可能已中断，等待后台确认或重试';
  if(!good&&(!latest||Date.now()-Date.parse(latest.created_at)>86400000))return '尚无已校验的云盘备份，请检查备份状态';
  if(good&&Number(Cloud.version)>Number(good.source_version)&&Date.now()-Date.parse(good.verified_at)>86400000)return '云端已有更新，超过 24 小时没有新的已校验备份，请检查';
  return '';
 },
 renderAlert(){
  let el=document.getElementById('backupHealthAlert'),text=this.warning();
  if(!text){el?.remove();return}
  if(!el){el=document.createElement('div');el.id='backupHealthAlert';el.className='backup-warning';el.setAttribute('role','alert');el.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:900;max-width:min(680px,90vw);padding:12px 16px;border:1px solid #e5b1a8;border-radius:12px;background:#fff2ef;box-shadow:0 4px 16px #0002';document.body.append(el)}
  el.replaceChildren(document.createTextNode('备份提醒：'+text+' '));let b=document.createElement('button');b.className='btn';b.textContent='查看备份';b.onclick=()=>navigate('data');el.append(b);
 },
 observe(){this.renderAlert();if(!Cloud.user){clearTimeout(this.timer);this.timer=0;this.status=null;this.account='';return}if(this.account!==Cloud.user.id&&!this.loading)queueMicrotask(()=>this.refresh());else if(!this.timer&&!this.loading)this.schedule()},
 async connect(){try{const result=await this.api('connect','POST');location.assign(result.url)}catch(error){toast(error.message)}},
 async run(){if(this.runPending)return;try{if(Cloud.importPending||Cloud.pendingRemote||Cloud.writeBlocked||Cloud.status!=='synced')throw Error('请先核对并同步本机数据；备份仅读取已同步的云端版本');this.runPending=true;this.updatePanel();this.schedule();const r=await this.api('run','POST');toast(r.status==='quarantined'?'当前数据异常或为空，已隔离，未生成正常备份':r.status==='verified'?'此云端内容已备份':'备份执行结束，正在读取结果');}catch(error){toast(error.message)}finally{this.runPending=false;await this.refresh()}},
 async restore(kind,id){const restoreAccount=Cloud.user?.id||'';try{
  let value;if(kind==='local'){let row=localRecoveryList().find(r=>r.id===id&&r.owner===recoveryOwner());if(!row)throw Error('找不到本账号的副本');value=row.state}
  else if(kind==='history'){let user=Cloud.user?.id;if(!user)throw Error('请先登录');let r=await Cloud.client.from('app_state_history').select('state').eq('id',id).eq('user_id',user).single();if(r.error)throw r.error;if(Cloud.user?.id!==user)throw Error('账号已切换');value=r.data.state}
  else {let archive=await this.api('archive/'+id);value=archive.state}
  validateImportedData(value);const counts=BackupFormat.summary(value),text=this.counts(counts);
  confirmAction('恢复这个版本到本机？',text+'。当前本机数据会先保存独立副本；恢复后自动上传暂停，核对后再替换云端。'+(kind==='drive'?'恢复时还会校验并补回缺失附件。':''),async()=>{try{if((Cloud.user?.id||'')!==restoreAccount)throw Error('账号已切换，请重新选择版本');if(kind==='drive')value=(await this.api('restore/'+id,'POST')).state;stageRecoveredState(value,'恢复'+(kind==='drive'?'Google Drive':'历史')+'版本');this.refresh()}catch(error){toast(error.message)}},'恢复到本机');
 }catch(error){toast(error.message||'恢复失败')}},
 counts(s){return (s?.tasks||0)+' 项事项 · '+(s?.projects||0)+' 个项目 · '+(s?.memos||0)+' 条备忘 · '+(s?.journalDays||0)+' 份工作记录'},
 async replaceCloud(){try{
  if(!Cloud.user)throw Error('请先登录云端');if(!flushPendingEdits())throw Error('请先重试保存当前编辑');
  const user=Cloud.user.id,remote=await Cloud.fetchRemote(),payload=snapshotCore(),hash=cloudHash(JSON.stringify(payload));validateImportedData(payload);
  confirmAction('确认用本机版本替换云端？','本机：'+this.counts(BackupFormat.summary(payload))+'；云端：'+this.counts(BackupFormat.summary(remote?.state||{}))+'。云端被替换前会保存独立历史。',async()=>{try{
   if(Cloud.user?.id!==user)throw Error('账号已切换');if(cloudHash(serializeState())!==hash)throw Error('确认期间本机数据已变化，请重新核对后替换');
   checkpointLocal('替换云端前的本机副本');clearTimeout(Cloud.timer);Cloud.importPending=true;
   let result;if(remote)result=await Cloud.client.rpc('cockpit_replace_state',{p_state:payload,p_expected_version:Number(remote.version),p_device:Cloud.device,p_confirmation:'REPLACE',p_owner:user});
   else result=await Cloud.client.from('app_states').insert({user_id:user,state:payload,version:1,device_id:Cloud.device}).select('state,version,device_id,updated_at').single();
   if(Cloud.user?.id!==user)throw Error('账号已切换');if(result.error)throw Error(String(result.error.message).includes('COCKPIT_CONFLICT')?'云端已更新，请重新核对；本机恢复数据仍保留':result.error.message);
   let row=Array.isArray(result.data)?result.data[0]:result.data;if(!row)throw Error('替换未确认成功，请保留本机数据');Cloud.pendingRemote=null;Cloud.writeBlocked=false;clearRestorePending();Cloud.acceptMeta(row,hash);closeDialog('conflictDialog');Cloud.renderStatus();toast('云端已替换，旧云端版本已保留');if(cloudHash(serializeState())!==hash)Cloud.schedule();this.refresh();
  }catch(error){toast('替换未完成：'+error.message)}},'确认替换');
 }catch(error){toast(error.message)}}
};
function backupPanelMarkup(){
 const u=Cloud.user?.id||'';if(u&&BackupUI.account!==u&&!BackupUI.loading)queueMicrotask(()=>BackupUI.refresh());const valid=BackupUI.account===u,status=valid?BackupUI.status:null,history=valid?BackupUI.history:[];
 const last=status?.runs?.find(r=>r.status==='verified');
 let label=!u?'未登录':!status?'尚未读取备份状态':!status.connected?'未连接 Google Drive':last?'最近校验成功：'+dateTime(last.verified_at):'已连接，尚无校验成功的备份';
 const actions='<button class="btn" data-backup-action="refresh">'+(BackupUI.loading?'读取中…':'刷新状态')+'</button><button class="btn" data-backup-action="connect">连接 Google Drive</button><button class="btn primary" data-backup-action="run" '+(BackupUI.runPending?'disabled':'')+'>'+(BackupUI.runPending?'备份请求处理中…':'立即备份')+'</button>';
 const items=(status?.runs||[]).map(r=>'<div class="data-item"><div><b>'+esc(r.status==='running'&&r.lease_until&&Date.parse(r.lease_until)<Date.now()?'执行可能已中断，等待后台确认或重试':({verified:'已校验',failed:'备份失败，等待重试',running:'正在备份及校验',pending:'等待备份',quarantined:'已隔离'})[r.status]||r.status)+' · '+dateTime(r.created_at)+'</b><small>'+esc(BackupUI.counts(r.summary))+' · 云端 v'+esc(r.source_version)+' · '+(r.attachment_count||0)+' 个附件</small>'+(r.error_code?'<small>'+esc(BackupUI.message(r.error_code))+'</small>':'')+'</div>'+(r.status==='verified'?'<button class="btn" data-backup-restore="drive" data-backup-id="'+esc(r.id)+'">预览并恢复</button>':'')+'</div>').join('');
 const histories=history.map(r=>'<div class="data-item"><div><b>'+dateTime(r.created_at)+' · v'+esc(r.version)+'</b><small>'+esc(BackupUI.counts(r.summary))+'</small></div><button class="btn" data-backup-restore="history" data-backup-id="'+esc(r.id)+'">预览并恢复</button></div>').join('');
 const locals=localRecoveryList().filter(r=>r.owner===recoveryOwner()).map(r=>'<div class="data-item"><div><b>'+esc(r.label)+'</b><small>'+dateTime(r.createdAt)+' · '+esc(BackupUI.counts(BackupFormat.summary(r.state)))+'</small></div><button class="btn" data-backup-restore="local" data-backup-id="'+esc(r.id)+'">预览并恢复</button></div>').join('');
 return '<article class="card feature-card backup-panel"><div class="feature-head"><h2>自动备份与独立恢复</h2><div class="page-actions">'+actions+'</div></div><p role="status">'+esc(label)+'</p>'+(valid&&BackupUI.error?'<p class="backup-warning">'+esc(BackupUI.error)+'</p>':'')+(status?.lastError?'<p class="backup-warning">'+esc(BackupUI.message(status.lastError))+'</p>':'')+'<p>每小时检查已同步云端数据；发生变化才生成版本。最近 48 小时保留小时版本，近 30 天每天保留一个版本。空数据和异常减少的版本会隔离，保留最近正常备份。</p><details open><summary>Google Drive 备份</summary><div class="data-list">'+(items||'<p>尚无可验证的 Drive 备份。连接成功不等于已完成备份。</p>')+'</div></details><details><summary>数据库独立历史</summary><div class="data-list">'+(histories||'<p>刷新后显示可恢复的历史。</p>')+'</div></details><details><summary>本机独立安全副本（最多 3 份）</summary><div class="data-list">'+(locals||'<p>高风险操作前自动保存，与主数据分开；浏览器清理仍会影响这些副本。</p>')+'</div></details></article>';
}
document.addEventListener('click',event=>{const a=event.target.closest('[data-backup-action]');if(a){const fn=BackupUI[a.dataset.backupAction];if(typeof fn==='function')fn.call(BackupUI)}const r=event.target.closest('[data-backup-restore]');if(r)BackupUI.restore(r.dataset.backupRestore,r.dataset.backupId)});

document.addEventListener('visibilitychange',()=>{if(document.hidden)BackupUI.schedule();else if(Cloud.user){BackupUI.refresh()}});
