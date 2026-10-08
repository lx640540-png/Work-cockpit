// File objects remain transient; only successful attachment metadata is persisted.
const taskUploads=new Map();
const UPLOAD_RETRY_KEY="work-cockpit-upload-retries-v1";
try{for(let job of JSON.parse(localStorage.getItem(UPLOAD_RETRY_KEY)||"[]")){if(job?.taskId&&job?.name){let id=uid("upload");taskUploads.set(id,{...job,id,file:null,status:"failed",error:"页面已刷新，请重新选择文件"})}}}catch{}
function rememberUploadQueue(){try{localStorage.setItem(UPLOAD_RETRY_KEY,JSON.stringify([...taskUploads.values()].filter(job=>job.status!=="done").map(({file,...job})=>job)))}catch{}}

let uploadQueueRunning=false;
function renderTaskUploadQueue(){rememberUploadQueue();let node=$('#taskUploadQueue');if(!node||!taskDraft)return;let jobs=[...taskUploads.values()].filter(j=>j.taskId===taskDraft.id&&j.userId===Cloud.user?.id);node.innerHTML=jobs.map(job=>'<div class="upload-job" data-status="'+job.status+'"><b title="'+esc(job.name)+'">'+esc(job.name)+'</b><span>'+({queued:'等待上传',uploading:'上传中…',done:'已上传',failed:'上传失败'}[job.status])+'</span><small>'+Math.ceil(job.size/1024)+' KB'+(job.error?' · '+esc(job.error):'')+'</small>'+(job.status==='failed'?'<button class="link-btn" type="button" data-retry-upload="'+job.id+'">重试</button><button class="link-btn" type="button" data-reselect-upload="'+job.id+'">重新选择</button>':'')+(job.status!=='uploading'?'<button class="link-btn" type="button" data-discard-upload="'+job.id+'">移除</button>':'')+'</div>').join('')}
function discardTaskUpload(id){let job=taskUploads.get(id);if(!job||job.status==='uploading')return;job.file=null;taskUploads.delete(id);renderTaskUploadQueue()}
function reselectTaskUpload(id){let job=taskUploads.get(id);if(!job||job.status!=='failed')return;let input=document.createElement('input');input.type='file';input.onchange=()=>{if(!input.files.length)return;let taskId=job.taskId;discardTaskUpload(id);enqueueTaskUploads(taskId,input.files)};input.click()}
async function enqueueTaskUploads(taskId,files){
 let userId=Cloud.user?.id;
 for(let file of files){let key=[userId,taskId,file.name,file.size,file.lastModified].join('|');if([...taskUploads.values()].some(j=>j.key===key&&j.status!=='done')){toast('该文件已在上传列表中');continue}let id=uid('upload');taskUploads.set(id,{id,key,taskId,userId,file,name:file.name,size:file.size,status:file.size>50*1024*1024?'failed':'queued',error:file.size>50*1024*1024?'超过 50MB，请压缩后重新选择':''})}
 renderTaskUploadQueue();return drainTaskUploads();
}
async function drainTaskUploads(){
 if(uploadQueueRunning)return;uploadQueueRunning=true;
 try{for(let job of taskUploads.values()){
  if(job.status!=='queued')continue;job.status='uploading';job.error='';renderTaskUploadQueue();
  try{if(!job.file)throw Error('请重新选择文件');if(Cloud.user?.id!==job.userId)throw Error('登录账户已变化，请切回原账户重试');if(!taskById(job.taskId))throw Error('原事项已删除');await Cloud.uploadAttachments(job.taskId,[job.file]);job.status='done';job.file=null}catch(error){job.status='failed';job.error=error.message||'网络中断，请重试'}
  renderTaskUploadQueue();refreshAttachmentThumbnails();
 }}finally{uploadQueueRunning=false}
}
function retryTaskUpload(id){let job=taskUploads.get(id);if(!job||job.status!=='failed')return;if(job.size>50*1024*1024)return toast('请压缩文件到 50MB 以下后重新选择');job.status='queued';return drainTaskUploads()}
function attachmentThumbnail(item){return item.type.startsWith('image/')?'<img class="attachment-thumb" data-image-view="'+esc(item.id)+'" data-attachment-thumb="'+esc(item.id)+'" alt="图片附件" hidden>':''}
async function refreshAttachmentThumbnails(){
 if(!Cloud.user||!Cloud.client?.storage||!taskDraft)return;let taskId=taskDraft.id,userId=Cloud.user.id;
 for(let item of taskDraft.attachments.filter(a=>a.type.startsWith('image/'))){let image=$('[data-attachment-thumb="'+CSS.escape(item.id)+'"]');if(!image||image.dataset.loading)continue;image.dataset.loading='1';let fail=()=>{delete image.dataset.loading;image.hidden=true;let button=image.closest('button');if(button&&!button.querySelector('[data-retry-thumb]')){let retry=document.createElement('span');retry.dataset.retryThumb=item.id;retry.textContent='缩略图加载失败，点击重试';button.appendChild(retry)}};try{let result=await Cloud.client.storage.from('task-attachments').createSignedUrl(item.path,1800);if(taskDraft?.id!==taskId||Cloud.user?.id!==userId||!image.isConnected)continue;if(result.error||!result.data?.signedUrl){fail();continue}image.src=result.data.signedUrl;image.hidden=false;image.onerror=fail;image.closest('button')?.querySelector('[data-retry-thumb]')?.remove()}catch{fail()}}
}
window.addEventListener('beforeunload',event=>{if([...taskUploads.values()].some(j=>j.status==='uploading'||j.status==='queued')){event.preventDefault();event.returnValue=''}});
