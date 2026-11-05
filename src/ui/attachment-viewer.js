const imageViewerState={taskId:'',attachmentId:'',resource:null,token:0,zoom:1,fit:true};
function initAttachmentViewer(){
 if($('#imageViewer'))return;
 let dialog=document.createElement('dialog');dialog.id='imageViewer';dialog.className='image-viewer';
 dialog.innerHTML='<header><b id="imageViewerTitle">图片预览</b><div><button type="button" data-image-action="previous" aria-label="上一张图片">‹</button><button type="button" data-image-action="next" aria-label="下一张图片">›</button><button type="button" data-image-action="out" aria-label="缩小图片">−</button><button type="button" data-image-action="fit">适合窗口</button><button type="button" data-image-action="reset">原始大小</button><button type="button" data-image-action="in" aria-label="放大图片">＋</button><button type="button" data-close="imageViewer" aria-label="关闭图片预览">×</button></div></header><div class="image-viewer-body" role="status"></div>';
 document.body.appendChild(dialog);
 dialog.addEventListener('click',event=>{
  let button=event.target.closest('[data-image-action]');if(!button)return;let action=button.dataset.imageAction;
  if(['in','out','reset','fit'].includes(action)){
   let image=$('#imageViewer img');if(!image?.naturalWidth)return;
   let current=image.getBoundingClientRect().width/image.naturalWidth;
   imageViewerState.fit=action==='fit';imageViewerState.zoom=action==='reset'?1:Math.max(.1,Math.min(4,current+(action==='in'?.25:-.25)));layoutAttachmentImage();return;
  }
  let images=taskById(imageViewerState.taskId)?.attachments.filter(item=>item.type.startsWith('image/'))||[],index=images.findIndex(item=>item.id===imageViewerState.attachmentId),item=images[(index+(action==='next'?1:-1)+images.length)%images.length];if(item)void openAttachmentImage(item.id,imageViewerState.taskId);
 });
 dialog.addEventListener('close',()=>{imageViewerState.token++;imageViewerState.resource=null;$('.image-viewer-body',dialog).replaceChildren()});
 dialog.addEventListener('keydown',event=>{if(event.target.closest('button'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();$('[data-image-action="'+(event.key==='ArrowLeft'?'previous':'next')+'"]',dialog).click()}});
 window.addEventListener('resize',layoutAttachmentImage);
}
function layoutAttachmentImage(){
 let image=$('#imageViewer img'),area=$('#imageViewer .image-viewer-body');if(!image?.naturalWidth||!area)return;
 let fit=Math.min(1,(area.clientWidth-36)/image.naturalWidth,(area.clientHeight-36)/image.naturalHeight),scale=imageViewerState.fit?fit:imageViewerState.zoom;
 image.style.width=Math.max(1,image.naturalWidth*scale)+'px';$('[data-image-action="reset"]',$('#imageViewer')).textContent='原始大小';$('[data-image-action="fit"]',$('#imageViewer')).setAttribute('aria-pressed',String(imageViewerState.fit));image.title=Math.round(scale*100)+'%';
}
async function openAttachmentImage(id,taskId=taskDraft?.id){
 let item=taskById(taskId)?.attachments.find(item=>item.id===id);if(!item||!item.type.startsWith('image/'))return;
 return openImageResource(item,{taskId,attachmentId:id});
}
async function openImageResource(resource,context={}){
 initAttachmentViewer();let dialog=$('#imageViewer'),area=$('.image-viewer-body',dialog),token=++imageViewerState.token,userId=Cloud.user?.id,client=Cloud.client,epoch=Cloud.syncEpoch;
 Object.assign(imageViewerState,{taskId:context.taskId||'',attachmentId:context.attachmentId||'',resource,zoom:1,fit:true});
 $('#imageViewerTitle').textContent=resource.name||'图片';for(let action of ['previous','next'])$('[data-image-action="'+action+'"]',dialog).hidden=!context.taskId;
 area.textContent='正在加载大图…';showDialog(dialog);let current=()=>dialog.open&&token===imageViewerState.token&&Cloud.user?.id===userId&&Cloud.client===client&&Cloud.syncEpoch===epoch;
 try{
  if(!client||!userId)throw Error('请登录后查看图片');if(!resource.path.startsWith(userId+'/'))throw Error('图片属于其他账户');
  let result=await client.storage.from('task-attachments').createSignedUrl(resource.path,1800);if(!current())return;
  if(result.error||!result.data?.signedUrl)throw Error(result.error?.message||'图片地址不可用');
  let image=document.createElement('img');image.alt=resource.name||'图片';image.onload=()=>{if(current())layoutAttachmentImage()};image.onerror=()=>{if(current())showImageViewerRetry('图片加载失败，请重试',resource,context)};image.src=result.data.signedUrl;area.replaceChildren(image);if(image.complete)layoutAttachmentImage();
 }catch(error){if(current())showImageViewerRetry(error.message||'图片加载失败',resource,context)}
}
function showImageViewerRetry(message,resource,context){let area=$('#imageViewer .image-viewer-body');area.textContent=message;let retry=document.createElement('button');retry.className='btn';retry.type='button';retry.textContent='重试';retry.onclick=()=>openImageResource(resource,context);area.appendChild(retry)}
