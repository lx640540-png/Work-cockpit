// Folding is a line format in the Quill document, never a hidden text embed.
function richFoldValue(value){return /^t[\w-]{1,80}:(text|heading):(open|closed)$/.test(String(value||""))?String(value):""}
function richFoldLineFormat(line){return{...(line?.formats()||{}),...(line?.attributes?.values()||{})}}
function richFoldDepth(value){return Math.max(0,Math.min(8,Math.floor(Number(value)||0)))}
function richFoldSemanticHTML(quill,html,range){
 // Quill's semantic list renderer reconstructs LI tags and drops custom attributors.
 let box=document.createElement("div");box.innerHTML=html;
 let lines=(range?quill.getLines(range.index,Math.max(1,range.length)):quill.getLines()).filter(line=>richFoldLineFormat(line).list);
 box.querySelectorAll("li").forEach((node,index)=>{let format=richFoldLineFormat(lines[index]),depth=richFoldDepth(format.foldDepth),fold=richFoldValue(format.fold);if(depth)node.dataset.richDepth=depth;if(fold)node.dataset.richFold=fold});
 return box.innerHTML;
}
function registerRichFoldFormats(Parchment){
 class Fold extends Parchment.Attributor{add(node,value){return richFoldValue(value)?super.add(node,value):false}value(node){return richFoldValue(super.value(node))}}
 class FoldDepth extends Parchment.Attributor{add(node,value){return super.add(node,richFoldDepth(value))}value(node){return richFoldDepth(super.value(node))||undefined}}
 Quill.register(new Fold("fold","data-rich-fold",{scope:Parchment.Scope.BLOCK}),true);
 Quill.register(new FoldDepth("foldDepth","data-rich-depth",{scope:Parchment.Scope.BLOCK}),true);
}
function richFoldRefresh(quill){
 if(quill.root.closest(".rich-editor")?.classList.contains("ime-composing"))return;
 let stack=[];
 for(let line of quill.getLines()){
  let format=richFoldLineFormat(line),depth=richFoldDepth(format.foldDepth),fold=richFoldValue(format.fold),node=line.domNode;
  while(stack.length&&stack.at(-1).depth>=depth)stack.pop();
  node.classList.toggle("rich-fold-hidden",stack.some(item=>item.closed));node.classList.toggle("rich-fold-title",!!fold);
  node.style.setProperty("--rich-fold-depth",depth);
  if(fold){
   let closed=!quill.isEnabled()&&quill.__richFoldView?.has(line)?quill.__richFoldView.get(line):fold.endsWith(":closed"),button=line.uiNode;
   if(!button?.classList.contains("rich-fold-arrow")){
    button=document.createElement("button");button.type="button";button.className="rich-fold-arrow";button.contentEditable="false";
    button.addEventListener("mousedown",event=>event.preventDefault());
    button.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")event.stopPropagation()});
    button.addEventListener("click",event=>{
     event.preventDefault();event.stopPropagation();let current=richFoldValue(richFoldLineFormat(line).fold);if(!current)return;
     if(!quill.isEnabled()){quill.__richFoldView||=new WeakMap();quill.__richFoldView.set(line,button.getAttribute("aria-expanded")==="true");richFoldRefresh(quill);return}
     let start=quill.getIndex(line),range=quill.getSelection();if(current.endsWith(":open")&&range&&range.index>start){let all=quill.getLines(),at=all.indexOf(line),end=at+1;while(end<all.length&&richFoldDepth(richFoldLineFormat(all[end]).foldDepth)>richFoldDepth(richFoldLineFormat(line).foldDepth))end++;let limit=end<all.length?quill.getIndex(all[end]):quill.getLength();if(range.index<limit)quill.setSelection(start,0,"silent")}
     quill.history.cutoff();quill.formatLine(start,1,"fold",current.replace(/:(open|closed)$/,current.endsWith(":closed")?":open":":closed"),"user");quill.history.cutoff();
    });
    line.attachUI(button);
   }
   button.textContent=closed?"▸":"▾";button.setAttribute("aria-label",closed?"展开折叠内容":"收起折叠内容");button.setAttribute("aria-expanded",String(!closed));button.disabled=false;
   stack.push({depth,closed});
  }else if(line.uiNode?.classList.contains("rich-fold-arrow")){line.uiNode.remove();line.uiNode=null}
 }
}
function insertRichFold(quill,range,kind,remove=false){
 let allLines=quill.getLines(),lines=quill.getLines(range.index,Math.max(1,range.length)),first=lines[0],start=quill.getIndex(first),bodyStart=start+first.length(),depth=richFoldDepth(richFoldLineFormat(first).foldDepth);
 // Include complete selected child sections, even when only their summary is selected.
 if(range.length&&!richFoldLineFormat(first).fold){let left=allLines.indexOf(first),right=allLines.indexOf(lines.at(-1));for(let i=left;i<=right;i++){let format=richFoldLineFormat(allLines[i]);if(format.fold){let end=i+1;while(end<allLines.length&&richFoldDepth(richFoldLineFormat(allLines[end]).foldDepth)>richFoldDepth(format.foldDepth))end++;right=Math.max(right,end-1)}}lines=allLines.slice(left,right+1)}
 if(!richFoldLineFormat(first).fold&&lines.some(line=>richFoldDepth(richFoldLineFormat(line).foldDepth)>=8)){toast("折叠最多支持 8 层嵌套");return}
 let current=richFoldValue(richFoldLineFormat(first).fold);if(current?.includes(":"+kind+":")&&!remove)return;let Delta=Quill.import("delta"),delta=new Delta(),position=0;
 const formatLine=(line,attrs)=>{let newline=quill.getIndex(line)+line.length()-1;delta.retain(newline-position).retain(1,attrs);position=newline+1};
 if(current&&!current.includes(":"+kind+":")){
  formatLine(first,{fold:current.replace(/:(text|heading):/,":"+kind+":"),header:kind==="heading"?(richFoldLineFormat(first).header||2):null});
 }else if(current&&remove){
  let all=quill.getLines(),at=all.indexOf(first);formatLine(first,{fold:null,header:kind==="heading"?2:null});
  for(let i=at+1;i<all.length&&richFoldDepth(richFoldLineFormat(all[i]).foldDepth)>depth;i++)formatLine(all[i],{foldDepth:richFoldDepth(richFoldLineFormat(all[i]).foldDepth)-1||null});
 }else if(!current){
  formatLine(first,{fold:"t"+crypto.randomUUID()+":"+kind+":open",foldDepth:depth||null,header:kind==="heading"?(richFoldLineFormat(first).header||2):null,list:null});
  if(lines.length>1){for(let line of lines.slice(1))formatLine(line,{foldDepth:Math.min(8,richFoldDepth(richFoldLineFormat(line).foldDepth)+1)})}
  else delta.insert("\n",{foldDepth:depth+1});
 }
 quill.history.cutoff();quill.updateContents(delta,"user");quill.history.cutoff();
 quill.setSelection(current?start:lines.length>1?start:Math.min(bodyStart,quill.getLength()-1),0,"silent");
}
function richFoldEnter(quill,range,context){
 let [line]=quill.getLine(range.index),format=richFoldLineFormat(line),depth=richFoldDepth(format.foldDepth),fold=richFoldValue(format.fold);
 if(!fold&&!depth)return true;
 if(fold&&depth>=8){toast("已达到最大嵌套层级，请先退出一层再编辑");return false;}
 if(!range.length&&!fold&&context.empty){
  let attrs=format.list?(format.indent?{indent:Number(format.indent)-1||false}:{list:false,indent:false}):{foldDepth:depth-1||false};
  if(!format.list){outdentRichFoldTail(quill,line);return false}
  quill.history.cutoff();quill.formatLine(range.index,1,attrs,"user");quill.history.cutoff();return false;
 }
 let [endLine,endOffset]=quill.getLine(range.index+range.length),Delta=Quill.import("delta"),attrs={...richFoldLineFormat(endLine),fold:null,foldDepth:fold?Math.min(8,depth+1):depth,header:null},inline=quill.getFormat(range.index,0);
 let delta=new Delta().retain(range.index).delete(range.length).insert("\n",fold?{...format,fold:fold.replace(/:closed$/,":open")}:format).retain(Math.max(0,endLine.length()-endOffset-1)).retain(1,attrs);
 quill.history.cutoff();quill.updateContents(delta,"user");quill.history.cutoff();quill.setSelection(range.index+1,0,"silent");
 for(let name of ["bold","underline","highlight"])if(inline[name])quill.format(name,inline[name],"silent");return false;
}
function richFoldBackspace(quill,range,context){
 if(context.offset||range.length)return true;let line=quill.getLine(range.index)[0],format=richFoldLineFormat(line);
 if(format.fold){insertRichFold(quill,range,format.fold.includes(":heading:")?"heading":"text",true);return false}
 if(format.foldDepth&&format.list){quill.history.cutoff();quill.formatLine(range.index,1,format.indent?{indent:Number(format.indent)-1||false}:{list:false,indent:false},"user");quill.history.cutoff();return false}
 if(!format.foldDepth){let before=quill.getLine(range.index-1)[0];return !before||!richFoldLineFormat(before).foldDepth}
 outdentRichFoldTail(quill,line);return false;
}
function richFoldDelete(quill,range,context){
 if(range.length)return true;let line=quill.getLine(range.index)[0];if(context.offset!==line.length()-1)return true;
 let next=quill.getLine(range.index+1)[0];if(!next||next===line)return true;
 let format=richFoldLineFormat(line),after=richFoldLineFormat(next);if(format.fold?.endsWith(":closed")){quill.history.cutoff();quill.formatLine(range.index,1,"fold",format.fold.replace(/:closed$/,":open"),"user");quill.history.cutoff();return false}
 return !after.fold&&richFoldDepth(format.foldDepth)===richFoldDepth(after.foldDepth);
}
function clearQuillRichFormat(quill,range){
 if(!quill.getLines().some(line=>richFoldLineFormat(line).fold||richFoldLineFormat(line).foldDepth)){quill.removeFormat(range.index,range.length,"user");return}
 let Delta=Quill.import("delta"),inline=new Delta().retain(range.index).retain(range.length,{bold:null,underline:null,highlight:null,focus:null}),blocks=new Delta(),position=0;
 for(let line of quill.getLines(range.index,Math.max(1,range.length))){let newline=quill.getIndex(line)+line.length()-1;blocks.retain(newline-position).retain(1,{header:null,list:null,indent:null});position=newline+1}
 quill.history.cutoff();quill.updateContents(inline.compose(blocks),"user");quill.history.cutoff();
}
function richFoldSelectAll(quill){
 if(!quill.getLines().some(line=>richFoldLineFormat(line).fold))return true;
 let range=quill.getSelection();if(!range)return true;let [line]=quill.getLine(range.index),start=quill.getIndex(line),length=line.length()-1;if(richFoldLineFormat(line).fold){let lines=quill.getLines(),at=lines.indexOf(line)+1,depth=richFoldDepth(richFoldLineFormat(line).foldDepth);while(at<lines.length&&richFoldDepth(richFoldLineFormat(lines[at]).foldDepth)>depth){length+=lines[at].length();at++}}
 if(range.index!==start||range.length!==length){quill.setSelection(start,length,"silent");return false}
 quill.setSelection(0,Math.max(0,quill.getLength()-1),"silent");return false;
}
function richFoldNestedUnits(quill,node){
 let lines=quill.getLines(),at=lines.findIndex(line=>line.domNode===node),stack=[];if(at<0)return null;
 for(let i=0;i<=at;i++){let format=richFoldLineFormat(lines[i]),depth=richFoldDepth(format.foldDepth);while(stack.length&&stack.at(-1).depth>=depth)stack.pop();if(i===at)break;if(format.fold)stack.push({at:i,depth})}
 let parent=stack.at(-1);if(!parent)return null;
 let limit=parent.at+1;while(limit<lines.length&&richFoldDepth(richFoldLineFormat(lines[limit]).foldDepth)>parent.depth)limit++;
 let units=[];for(let i=parent.at+1;i<limit;){let format=richFoldLineFormat(lines[i]),end=i+1;
  if(format.fold)while(end<limit&&richFoldDepth(richFoldLineFormat(lines[end]).foldDepth)>richFoldDepth(format.foldDepth))end++;
  else if(format.list)while(end<limit){let next=richFoldLineFormat(lines[end]);if(!next.list||next.fold||richFoldDepth(next.foldDepth)!==richFoldDepth(format.foldDepth)||(Number(next.indent)||0)<=(Number(format.indent)||0))break;end++}
  let group=lines.slice(i,end);units.push({index:quill.getIndex(lines[i]),length:group.reduce((sum,line)=>sum+line.length(),0),nodes:group.map(line=>line.domNode),format});i=end;
 }return units;
}

// Lift only the chosen block/subtree; later siblings stay in their parent.
function outdentRichFoldTail(quill,line){
 let all=quill.getLines(),at=all.indexOf(line),depth=richFoldDepth(richFoldLineFormat(line).foldDepth);if(!depth)return false;
 let end=at+1;if(richFoldLineFormat(line).fold)while(end<all.length&&richFoldDepth(richFoldLineFormat(all[end]).foldDepth)>depth)end++;
 let parent=at-1;while(parent>=0&&!(richFoldLineFormat(all[parent]).fold&&richFoldDepth(richFoldLineFormat(all[parent]).foldDepth)<depth))parent--;
 let limit=end;if(parent>=0){let pd=richFoldDepth(richFoldLineFormat(all[parent]).foldDepth);limit=parent+1;while(limit<all.length&&richFoldDepth(richFoldLineFormat(all[limit]).foldDepth)>pd)limit++}
 let start=quill.getIndex(line),finish=end<all.length?quill.getIndex(all[end]):quill.getLength(),target=limit<all.length?quill.getIndex(all[limit]):quill.getLength(),Delta=Quill.import("delta"),format=new Delta(),position=0;
 for(let item of all.slice(at,end)){let n=quill.getIndex(item)+item.length()-1-start;format.retain(n-position).retain(1,{foldDepth:richFoldDepth(richFoldLineFormat(item).foldDepth)-1||null});position=n+1}
 let part=quill.getContents(start,finish-start).compose(format),change=new Delta().retain(start).delete(finish-start).retain(Math.max(0,target-finish)).concat(part);
 quill.history.cutoff();quill.updateContents(change,"user");quill.history.cutoff();quill.setSelection(target-(finish-start),0,"silent");return true;
}
function richFoldTab(quill,range,back){
 let all=quill.getLines(),[line]=quill.getLine(range.index),at=all.indexOf(line),depth=richFoldDepth(richFoldLineFormat(line).foldDepth);
 let format=richFoldLineFormat(line);if(format.list&&(!back||Number(format.indent)>0))return true;
 if(back){if(!depth)return true;outdentRichFoldTail(quill,line);return false}
 let before=at-1;while(before>=0&&richFoldDepth(richFoldLineFormat(all[before]).foldDepth)>depth)before--;
 if(before<0||!richFoldLineFormat(all[before]).fold||richFoldDepth(richFoldLineFormat(all[before]).foldDepth)!==depth)return true;
 let end=at+1;if(richFoldLineFormat(line).fold)while(end<all.length&&richFoldDepth(richFoldLineFormat(all[end]).foldDepth)>depth)end++;
 if(all.slice(at,end).some(item=>richFoldDepth(richFoldLineFormat(item).foldDepth)>=8)){toast("折叠最多支持 8 层嵌套");return false}
 let Delta=Quill.import("delta"),delta=new Delta(),position=0;
 for(let item of all.slice(at,end)){let n=quill.getIndex(item)+item.length()-1;delta.retain(n-position).retain(1,{foldDepth:richFoldDepth(richFoldLineFormat(item).foldDepth)+1});position=n+1}
 if(richFoldLineFormat(all[before]).fold.endsWith(":closed"))quill.formatLine(quill.getIndex(all[before]),1,"fold",richFoldLineFormat(all[before]).fold.replace(":closed",":open"),"user");
 quill.history.cutoff();quill.updateContents(delta,"user");quill.history.cutoff();quill.setSelection(range.index,range.length,"silent");return false;
}
function toggleRichFoldAtSelection(quill,range){let [line]=quill.getLine(range.index);if(richFoldLineFormat(line).fold){line.uiNode?.click();return false}return true}
