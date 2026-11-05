const richImageJobs=new Map(),richImageUrls=new Map(),richImageEditors=new Set();
let richImagePointer=null,richImageRefreshQueued=false;
function richImageOwner(editor){
 if(editor.id==="taskNotes")return{type:"task",id:taskDraft?.id,field:"notes"};
 if(editor.dataset.memoContent!==undefined)return{type:"memo",id:selectedMemoId,field:"content"};
 if(editor.dataset.quickNote!==undefined)return{type:"quick",id:"quick-note"};
 if(editor.dataset.journalDate)return{type:"journal",id:journalUI.week,date:editor.dataset.journalDate};
 if(editor.dataset.journalReview)return{type:"summary",id:journalUI.week,field:editor.dataset.journalReview};
 if(editor.dataset.weekReview)return{type:"summary",id:selectedWeekKey,field:Object.keys(WEEKLY_SUMMARY_FIELDS).find(key=>WEEKLY_SUMMARY_FIELDS[key]===editor.dataset.weekReview)};
 if(["decisionConclusion","decisionRationale"].includes(editor.id))return{type:"decision",id:decisionDraft?.id,field:editor.id==="decisionConclusion"?"conclusion":"rationale"};
 return null;
}
function richImageReadOwner(owner){
 if(!owner)return null;
 if(owner.type==="task")return taskById(owner.id)?.notes??null;
 if(owner.type==="memo")return memoById(owner.id)?.content??null;
 if(owner.type==="quick")return state.quickNote?.delta||null;
 if(owner.type==="journal")return state.meta.workJournal?.weeks?.[owner.id]?.days?.[owner.date]?.content??null;
 if(owner.type==="summary")return weeklySummaryHTML(owner.id,owner.field);
 if(owner.type==="decision")return decisionDraft?.id===owner.id&&$("#decisionDialog")?.open?decisionDraft[owner.field]:decisionById(owner.id)?.[owner.field]??null;
 return null;
}
function richImageWriteOwner(owner,value){
 let target,now=new Date().toISOString();
 if(owner.type==="task"){target=taskById(owner.id);if(!target)return false;target.notes=value;target.updatedAt=now;if(taskDraft?.id===owner.id)taskDraft.notes=value;captureCurrentWeek()}
 else if(owner.type==="memo"){target=memoById(owner.id);if(!target)return false;target.content=value;target.updatedAt=now}
 else if(owner.type==="quick")state.quickNote={delta:value,updatedAt:now};
 else if(owner.type==="journal"){target=state.meta.workJournal?.weeks?.[owner.id]?.days?.[owner.date];if(!target)return false;target.content=value;target.updatedAt=now}
 else if(owner.type==="summary")setWeeklySummary(owner.id,owner.field,value);
 else if(owner.type==="decision"){
  if(decisionDraft?.id===owner.id&&$("#decisionDialog")?.open){decisionDraft[owner.field]=value;return true}
  target=decisionById(owner.id);if(!target)return false;target[owner.field]=value;target.updatedAt=now;
 }else return false;
 saveLocal(true);return true;
}
function richImageEditorValue(editor){return editor.__richImageOwner?.type==="quick"?quillFor(editor).getContents():serializeRichEditor(editor)}
function registerRichImageFormats(){
 const Image=Quill.import("formats/image"),Embed=Quill.import("blots/embed"),Delta=Quill.import("delta");
 class WorkImage extends Image{
  static create(value){let canonical=richImageElement(value);if(!canonical)throw Error("无效的图片资源");return canonical}
  static value(node){return richImageFromNode(node)}
  static formats(node){let width=richImageWidth(node.getAttribute("width"));return width?{width}:{} }
  format(name,value){if(name==="width"){let width=richImageWidth(value);width?this.domNode.setAttribute("width",width):this.domNode.removeAttribute("width")}else if(name!=="height"&&name!=="alt")super.format(name,value)}
  html(){return richImageElement(WorkImage.value(this.domNode),this.domNode.getAttribute("width"))?.outerHTML||""}
 }
 class WorkImageUpload extends Embed{
  static create(value){return richUploadElement(value)||super.create()}
  static value(node){return{id:node.dataset.richUpload,name:node.dataset.uploadName||"图片"}}
  html(){return richUploadElement(WorkImageUpload.value(this.domNode))?.outerHTML||""}
 }
 WorkImage.blotName="image";WorkImage.tagName="IMG";WorkImage.className="rich-image";
 WorkImageUpload.blotName="imageUpload";WorkImageUpload.tagName="SPAN";WorkImageUpload.className="rich-image-upload";
 Quill.register(WorkImage,true);Quill.register(WorkImageUpload,true);
 // Stable metadata also survives HTML paste between our editors.
 Quill.register("modules/workImageClipboard",class{constructor(quill){
  quill.clipboard.addMatcher("IMG",(node)=>{let value=richImageFromNode(node),width=richImageWidth(node.getAttribute("width"));return value?new Delta().insert({image:value},width?{width}:{}):new Delta()});
  quill.clipboard.addMatcher("span.rich-image-upload",(node)=>{let value={id:node.dataset.richUpload,name:node.dataset.uploadName};return richUploadElement(value)?new Delta().insert({imageUpload:value}):new Delta()});
 }},true);
}
function initRichImages(editor,quill){
 editor.__richImageOwner=richImageOwner(editor);richImageEditors.add(editor);
 // Add matchers before converting stored HTML (Quill constructor's first pass uses
 // native Image.value, which cannot represent resource objects).
 new (Quill.import("modules/workImageClipboard"))(quill);
 if(editor.dataset.quickNote===undefined){let initial=editor.__richImageInitial;if(initial!==undefined){quill.setContents(quill.clipboard.convert({html:initial,text:""}),"silent");delete editor.__richImageInitial;quill.history.clear()}}
 initRichImageFormatter(editor,quill);
 let schedule=()=>{queueMicrotask(()=>{if(!editor.isConnected)return;refreshRichImages(editor);resolveFinishedRichUploads(editor)})};
 quill.on("text-change",schedule);schedule();
 if(quill.isEnabled()){let observer=new MutationObserver(records=>{if(records.some(record=>record.attributeName==="width")){quill.update("user");clearTimeout(editor.__imageWidthTimer);editor.__imageWidthTimer=setTimeout(()=>{editor.__imageWidthTimer=0;richImageWriteOwner(editor.__richImageOwner,richImageEditorValue(editor))},180)}}).observe(quill.root,{subtree:true,attributes:true,attributeFilter:["width"]});editor.__imageWidthObserver=observer;}
}
function initRichImageFormatter(editor,quill){
 if(!quill.isEnabled()||typeof QuillBlotFormatter2==="undefined")return;
 const {default:Formatter,ImageSpec,ResizeAction,Action}=QuillBlotFormatter2;
 class ImageTools extends Action{
  onCreate=()=>{
   let bar=document.createElement("div");bar.className="rich-image-tools";bar.setAttribute("role","toolbar");bar.setAttribute("aria-label","图片操作");
   for(let [label,action] of [["缩小",-10],["放大",10],["查看大图",0]]){let button=document.createElement("button");button.type="button";button.textContent=label;button.addEventListener("pointerdown",event=>event.preventDefault());button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();let image=this.formatter.currentSpec?.getTargetElement();if(!image)return;if(!action){void openRichImage(image);return}let blot=Quill.find(image),root=this.formatter.quill.root,base=root.clientWidth-parseFloat(getComputedStyle(root).paddingLeft)-parseFloat(getComputedStyle(root).paddingRight),size=image.getBoundingClientRect().width/base*100;this.formatter.quill.formatText(this.formatter.quill.getIndex(blot),1,"width",Math.max(5,Math.min(100,size+action))+"%","user");this.formatter.update()});bar.appendChild(button)}
   this.bar=bar;this.formatter.overlay.appendChild(bar);this.onUpdate();
  };
  onUpdate=()=>{if(!this.bar)return;let root=this.formatter.quill.root,area=root.getBoundingClientRect(),overlay=this.formatter.overlay.getBoundingClientRect();this.bar.style.maxWidth=Math.max(80,area.width-16)+"px";let width=this.bar.getBoundingClientRect().width,left=Math.max(area.left+8,Math.min(overlay.right-width-4,area.right-width-8));this.bar.style.left=(left-overlay.left)+"px";this.bar.style.right="auto"};
  onDestroy=()=>this.bar?.remove();
 }
 class WorkImageSpec extends ImageSpec{getActions=()=>[new ResizeAction(this.formatter),new ImageTools(this.formatter)]}
 const formatter=new Formatter(quill,{specs:[WorkImageSpec],align:{allowAligning:false},delete:{allowKeyboardDelete:false},resize:{allowResizeModeChange:false,useRelativeSize:true,minimumWidthPx:24,handleStyle:{height:"8px",width:"8px",border:"1px solid var(--blue)",borderRadius:"2px",backgroundColor:"var(--panel,#fff)"}},overlay:{style:{backgroundColor:"transparent",border:"1px solid var(--blue)",zIndex:"20"}},image:{registerImageTitleBlot:false,allowAltTitleEdit:false,allowCompressor:false,linkOptions:{allowLinkEdit:false},autoHeight:true},video:{registerCustomVideoBlot:false,registerBackspaceFix:false},tooltip:{containTooltipPosition:false}});
 // Formatter 3.2.0 removes its toolbar unconditionally on destroy, even when
 // no image has ever been selected. Keep its normal cleanup idempotent.
 let destroyToolbar=formatter.toolbar.destroy;
 formatter.toolbar.destroy=()=>{let toolbar=formatter.toolbar;if(toolbar.element.parentNode!==formatter.overlay)formatter.overlay.appendChild(toolbar.element);destroyToolbar()};
 formatter.overlay.addEventListener("dblclick",event=>{if(event.target.closest(".rich-image-tools,.blot-formatter__resize-handle"))return;let image=formatter.currentSpec?.getTargetElement();if(image){event.preventDefault();event.stopPropagation();formatter.hide();void openRichImage(image)}});
 editor.__imageFormatter=formatter;
 quill.root.addEventListener("dblclick",event=>{if(event.target.matches?.("img.rich-image")){formatter.hide();void openRichImage(event.target)}});
 // Overlay handles stay inside the editor's own scrolling/stacking context.
 editor.addEventListener("keydown",event=>{if(event.key==="Escape")formatter.hide()});
}
function richUploadNodes(quill,id){let nodes=[];for(let [index,op] of richDeltaEntries(quill.getContents()))if(op.insert?.imageUpload?.id===id)nodes.push(index);return nodes}
function richDeltaEntries(delta){let index=0;return(delta?.ops||[]).map(op=>{let pair=[index,op];index+=typeof op.insert==="string"?op.insert.length:1;return pair})}
async function pasteRichImages(quill,range,files){
 let editor=quill.container,owner=editor.__richImageOwner;if(!range||!quill.isEnabled()||!owner)return;
 if(!Cloud.user||!Cloud.client)return toast("图片需要登录云端后上传");
 if(owner.type==="task"&&!persistTaskDraft({notify:true}))return;
 let accepted=Array.from(files).filter(file=>RICH_IMAGE_TYPES.includes(file.type)&&file.size<=50*1024*1024);if(accepted.length!==files.length)toast("仅支持不超过 50MB 的常见图片格式");if(!accepted.length)return;
 let Delta=Quill.import("delta"),delta=new Delta().retain(range.index).delete(range.length),jobs=accepted.map(file=>({id:uid("imageupload"),name:file.name||"粘贴图片.png",file,owner:clone(owner),userId:Cloud.user.id,client:Cloud.client,epoch:Cloud.syncEpoch,status:"queued",resource:null,error:""}));
 for(let job of jobs){richImageJobs.set(job.id,job);delta.insert({imageUpload:{id:job.id,name:job.name}})}
 quill.history.cutoff();quill.updateContents(delta,"user");quill.setSelection(range.index+jobs.length,0,"silent");quill.history.cutoff();
 richImageWriteOwner(owner,richImageEditorValue(editor));refreshRichImages(editor);
 // Each upload owns its anchor, original document and account, including retries.
 for(let job of jobs)void runRichImageUpload(job);
}
async function runRichImageUpload(job){
 if(job.status==="uploading")return;job.status="uploading";job.error="";refreshRichImages();
 try{
  if(!job.file)throw Error("请重新选择图片");if(Cloud.user?.id!==job.userId||Cloud.client!==job.client||Cloud.syncEpoch!==job.epoch)throw Error("账户已变化，请切回原账户后重试");
  job.resource=await Cloud.uploadRichImage(job.owner,job.file);job.status="done";job.file=null;
  if(Cloud.user?.id!==job.userId||Cloud.client!==job.client||Cloud.syncEpoch!==job.epoch)return;
  let live=Array.from(richImageEditors).filter(editor=>editor.isConnected&&JSON.stringify(editor.__richImageOwner)===JSON.stringify(job.owner)),source=live.find(editor=>editor===activeRichEditor)||live[0];
  // Flush the latest body before resolving: undo/delete during upload must win.
  if(source)richImageWriteOwner(job.owner,richImageEditorValue(source));
  resolveStoredRichUpload(job);document.querySelectorAll(".rich-editor.ql-container").forEach(editor=>resolveFinishedRichUploads(editor));
 }catch(error){job.status="failed";job.error=error.message||"上传失败，请重试"}
 refreshRichImages();
}
function replaceRichUploadValue(value,id,resource,quick=false){
 if(quick){let found=false,next=clone(value);for(let op of next?.ops||[])if(op.insert?.imageUpload?.id===id){op.insert={image:resource};op.attributes={...(op.attributes||{}),width:"480"};found=true}return found?next:null}
 let template=document.createElement("div");template.innerHTML=value||"";let nodes=Array.from(template.querySelectorAll(".rich-image-upload")).filter(node=>node.dataset.richUpload===id);if(!nodes.length)return null;nodes.forEach(node=>node.replaceWith(richImageElement(resource,"480")));return sanitizeRichValue(template.innerHTML);
}
function resolveStoredRichUpload(job){
 let owner=job.owner,value=richImageReadOwner(owner);
 if(owner.type==="journal"&&!(value||"").includes(job.id)){let days=state.meta.workJournal?.weeks?.[owner.id]?.days||{},date=Object.keys(days).find(date=>days[date].content.includes(job.id));if(date){owner={...owner,date};job.owner=owner;value=days[date].content}}
 if(value===null)return;let next=replaceRichUploadValue(value,job.id,job.resource,owner.type==="quick");if(next!==null)richImageWriteOwner(owner,next);
}
function resolveFinishedRichUploads(editor){
 let quill=quillFor(editor);if(!quill)return;let replaced=false;
 for(let job of richImageJobs.values()){
  if(job.status!=="done"||job.userId!==Cloud.user?.id)continue;
  for(let index of richUploadNodes(quill,job.id).reverse()){
   let Delta=Quill.import("delta"),history=quill.history,ignore=history.ignoreChange;
   // An upload anchor and its final image both occupy one Quill unit. Preserve
   // the user's undo step while replacing any anchors held in redo snapshots.
   history.ignoreChange=true;try{quill.updateContents(new Delta().retain(index).delete(1).insert({image:job.resource},{width:"480"}),"api")}finally{history.ignoreChange=ignore}
   for(let stack of [history.stack.undo,history.stack.redo])for(let item of stack)for(let op of item.delta.ops)if(op.insert?.imageUpload?.id===job.id){op.insert={image:job.resource};op.attributes={...(op.attributes||{}),width:"480"}}
   replaced=true;
  }
 }
 if(replaced)richImageWriteOwner(editor.__richImageOwner,richImageEditorValue(editor));
}
function paintRichUpload(node){
 let job=richImageJobs.get(node.dataset.richUpload),status=job?.status||"missing",signature=status+"|"+(job?.error||"");if(node.dataset.uploadPaint===signature)return;node.dataset.uploadPaint=signature;
 // Preserve Quill Embed's guard nodes and contentNode; change only its content.
 let host=node.querySelector('[contenteditable="false"]')||node;host.replaceChildren();
 let text=document.createElement("span");text.textContent=({queued:"等待上传",uploading:"图片上传中…",done:"图片已上传",failed:job?.error||"上传失败",missing:"上传未完成，请重新选择图片"}[status])+" · "+node.dataset.uploadName;host.appendChild(text);
 node.dataset.uploadStatus=status;
 if(["failed","missing"].includes(status)&&quillFor(node.closest(".rich-editor"))?.isEnabled()){let button=document.createElement("button");button.type="button";button.dataset.richUploadAction=node.dataset.richUpload;button.textContent=job?.file?"重试":"重新选择";host.appendChild(button)}
}
async function richImageSignedUrl(resource,force=false){
 let image=normalizeRichImage(resource),userId=Cloud.user?.id,client=Cloud.client,epoch=Cloud.syncEpoch;if(!image||!userId||!client)throw Error("请登录后查看图片");
 if(!image.path.startsWith(userId+"/"))throw Error("图片属于其他账户");
 let key=userId+"|"+image.path,cached=richImageUrls.get(key);if(!force&&cached?.expires>Date.now())return cached.url;
 let result=await client.storage.from("task-attachments").createSignedUrl(image.path,1800);
 if(Cloud.user?.id!==userId||Cloud.client!==client||Cloud.syncEpoch!==epoch)throw Error("登录账户已变化");
 if(result.error||!result.data?.signedUrl)throw Error(result.error?.message||"图片地址不可用");let url=result.data.signedUrl;richImageUrls.set(key,{url,expires:Date.now()+25*60*1000});return url;
}
function refreshRichImages(root=document){
 for(let editor of richImageEditors)if(!editor.isConnected){editor.__imageWidthObserver?.disconnect();if(editor.__imageWidthTimer){clearTimeout(editor.__imageWidthTimer);richImageWriteOwner(editor.__richImageOwner,richImageEditorValue(editor))}editor.__imageFormatter?.destroy();richImageEditors.delete(editor)}
 root.querySelectorAll(".rich-image-upload").forEach(paintRichUpload);
 root.querySelectorAll("img.rich-image").forEach(image=>{
  let user=Cloud.user?.id||"",signature=user+"|"+image.dataset.richImagePath;if(image.__richImageSignature===signature)return;image.__richImageSignature=signature;image.dataset.imageState="loading";
  let token=uid("imageview");image.__richImageToken=token;
  const load=async force=>{try{let url=await richImageSignedUrl(richImageFromNode(image),force);if(!image.isConnected||image.__richImageToken!==token)return;image.onload=()=>{image.dataset.imageState="ready"};image.onerror=()=>{if(force)image.dataset.imageState="failed";else void load(true)};image.src=url}catch{if(image.__richImageToken===token){image.src=RICH_IMAGE_PLACEHOLDER;image.dataset.imageState="failed"}}};void load(false);
 });
}
async function openRichImage(node){let resource=richImageFromNode(node);if(resource)return openImageResource(resource)}
document.addEventListener("pointermove",event=>{richImagePointer={x:event.clientX,y:event.clientY}} ,{passive:true});
document.addEventListener("paste",event=>{
 if(event.defaultPrevented||!$("#taskDialog")?.open)return;
 let files=clipboardImageFiles(event.clipboardData);if(!files.length)return;
 let hovered=richImagePointer?document.elementFromPoint(richImagePointer.x,richImagePointer.y):null,zone=hovered?.closest?.("[data-attachment-paste]")||event.target.closest?.("[data-attachment-paste]");
 if(!zone||!zone.getClientRects().length)return;
 event.preventDefault();event.stopImmediatePropagation();void uploadTaskFiles(files);
},true);
document.addEventListener("click",event=>{
 let action=event.target.closest?.("[data-rich-upload-action]");if(action){event.preventDefault();event.stopPropagation();let node=action.closest(".rich-image-upload"),editor=node?.closest(".rich-editor"),job=richImageJobs.get(action.dataset.richUploadAction);if(job?.file){job.client=Cloud.client;job.epoch=Cloud.syncEpoch;void runRichImageUpload(job);return}if(!editor||!quillFor(editor)?.isEnabled())return;let input=document.createElement("input");input.type="file";input.accept=RICH_IMAGE_TYPES.join(",");input.onchange=()=>{let file=input.files?.[0];if(!file)return;if(!RICH_IMAGE_TYPES.includes(file.type)||file.size>50*1024*1024)return toast("请选择不超过 50MB 的图片");let next={id:node.dataset.richUpload,name:node.dataset.uploadName,file,owner:clone(editor.__richImageOwner),userId:Cloud.user?.id,client:Cloud.client,epoch:Cloud.syncEpoch,status:"queued",error:""};richImageJobs.set(next.id,next);void runRichImageUpload(next)};input.click();return}
 let image=event.target.closest?.("img.rich-image");if(image&&!quillFor(image.closest(".rich-editor"))?.isEnabled())void openRichImage(image);
});
new MutationObserver(()=>{if(richImageRefreshQueued)return;richImageRefreshQueued=true;queueMicrotask(()=>{richImageRefreshQueued=false;refreshRichImages()})}).observe(document.body,{subtree:true,childList:true});
window.addEventListener("beforeunload",event=>{if([...richImageJobs.values()].some(job=>["queued","uploading"].includes(job.status))){event.preventDefault();event.returnValue=""}});
window.addEventListener("focus",()=>{document.querySelectorAll("img.rich-image").forEach(image=>{if(image.dataset.imageState==="failed")delete image.__richImageSignature});refreshRichImages()});
