// Persist storage paths, never expiring signed URLs or clipboard base64 payloads.
const RICH_IMAGE_PLACEHOLDER="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const RICH_IMAGE_TYPES=["image/png","image/jpeg","image/webp","image/gif","image/avif","image/bmp"];
function normalizeRichImage(value){
 if(!value||typeof value!=="object")return null;
 let path=String(value.path||""),id=String(value.id||"");
 if(!/^[\w-]{1,100}$/.test(id)||path.length>1024||!/^[-\w]+\//.test(path)||/[\\:\x00-\x1f]/.test(path)||path.split("/").some(part=>!part||part==="."||part===".."))return null;
 return{id,path,name:String(value.name||"图片").slice(0,240),type:RICH_IMAGE_TYPES.includes(value.type)?value.type:"image/png"};
}
function richImageWidth(value){let text=String(value||""),percent=text.endsWith("%"),number=Number(percent?text.slice(0,-1):text);if(!Number.isFinite(number)||number<=0)return"";return String(Math.round(Math.max(percent?5:24,Math.min(percent?100:4096,number))))+(percent?"%":"")}
function richImageFromNode(node){return normalizeRichImage({id:node.dataset.richImageId,path:node.dataset.richImagePath,name:node.getAttribute("alt"),type:node.dataset.richImageType})}
function richImageElement(value,width){
 let image=normalizeRichImage(value);if(!image)return null;
 let node=document.createElement("img");node.className="rich-image";node.setAttribute("src",RICH_IMAGE_PLACEHOLDER);node.setAttribute("alt",image.name);node.dataset.richImageId=image.id;node.dataset.richImagePath=image.path;node.dataset.richImageType=image.type;let size=richImageWidth(width);if(size)node.setAttribute("width",size);return node;
}
function richUploadElement(value){
 let id=String(value?.id||""),name=String(value?.name||"图片").slice(0,240);if(!/^[\w-]{1,100}$/.test(id))return null;
 let node=document.createElement("span");node.className="rich-image-upload";node.dataset.richUpload=id;node.dataset.uploadName=name;node.contentEditable="false";node.textContent="图片待上传 · "+name;return node;
}
function clipboardImageFiles(data){
 let files=Array.from(data?.files||[]).filter(file=>RICH_IMAGE_TYPES.includes(file.type));if(files.length)return files;
 return Array.from(data?.items||[]).filter(item=>item.kind==="file"&&RICH_IMAGE_TYPES.includes(item.type)).map(item=>item.getAsFile()).filter(Boolean);
}

function richImageFileDrop(event){
 if(!event.target.closest?.(".rich-editor"))return false;
 let files=Array.from(event.dataTransfer?.files||[]);if(files.length)return files.every(file=>RICH_IMAGE_TYPES.includes(file.type));
 let items=Array.from(event.dataTransfer?.items||[]).filter(item=>item.kind==="file");return items.length>0&&items.every(item=>RICH_IMAGE_TYPES.includes(item.type));
}
