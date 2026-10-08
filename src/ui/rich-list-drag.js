// Floating decoration never changes editable padding or document structure.
const richDragEditors=new WeakSet(),richDragSelections=new WeakMap();
let richDragUI=null;
function richBlockUnits(quill){
 let lines=quill.getLines(),units=[];
 for(let i=0;i<lines.length;){let line=lines[i],index=quill.getIndex(line),format=quill.getFormat(index,1),end=i+1;
  if(format.list)while(end<lines.length){let next=quill.getFormat(quill.getIndex(lines[end]),1);if(!next.list||(Number(next.indent)||0)<=(Number(format.indent)||0))break;end++}
  let nodes=lines.slice(i,end).map(item=>item.domNode),length=lines.slice(i,end).reduce((sum,item)=>sum+item.length(),0);units.push({index,length,nodes,format});i=end;
 }return units;
}
function richNestedUnits(quill,node){
 let lines=quill.getLines(),at=lines.findIndex(line=>line.domNode===node);if(at<0)return null;let format=quill.getFormat(quill.getIndex(lines[at]),1),indent=Number(format.indent)||0;if(!format.list||!indent)return null;
 let left=at,right=at;const fmt=i=>quill.getFormat(quill.getIndex(lines[i]),1);
 while(left>0&&fmt(left-1).list&&(Number(fmt(left-1).indent)||0)>=indent)left--;
 while(right+1<lines.length&&fmt(right+1).list&&(Number(fmt(right+1).indent)||0)>=indent)right++;
 let units=[];for(let i=left;i<=right;){let start=i,end=i+1;while(end<=right&&(Number(fmt(end).indent)||0)>indent)end++;let index=quill.getIndex(lines[start]);units.push({index,length:lines.slice(start,end).reduce((sum,line)=>sum+line.length(),0),nodes:lines.slice(start,end).map(line=>line.domNode),format:fmt(start)});i=end}return units;
}
function richBlockMoveData(editor,node){
 let q=quillFor(editor);if(!q||!q.isEnabled()||!q.root.contains(node)||editor.classList.contains('ime-composing'))return null;
 let range=q.getSelection()||richDragSelections.get(editor),nested=richNestedUnits(q,node),units=richBlockUnits(q);
 if(nested&&(!range?.length||range.index>=nested[0].index&&range.index+range.length<=nested.at(-1).index+nested.at(-1).length))units=nested;
 let hovered=units.findIndex(unit=>unit.nodes.includes(node));if(hovered<0)return null;let first=hovered,last=hovered;
 if(range?.length){let chosen=units.map((unit,i)=>({unit,i})).filter(({unit})=>unit.index<range.index+range.length&&unit.index+unit.length>range.index);if(chosen.some(({i})=>i===hovered)){first=chosen[0].i;last=chosen.at(-1).i}}
 return{editor,q,units,first,last,old:q.getContents(),count:last-first+1};
}
function moveRichBlocks(data,slot){
 let {q,editor,units,first,last,old}=data;if(!editor.isConnected||!q.isEnabled()||editor.classList.contains('ime-composing')||JSON.stringify(q.getContents())!==JSON.stringify(old)||slot<0||slot>units.length||slot>=first&&slot<=last+1)return false;
 let start=units[0].index,end=units.at(-1).index+units.at(-1).length,pieces=units.map(unit=>old.slice(unit.index,unit.index+unit.length)),moving=pieces.splice(first,last-first+1),at=slot>last?slot-moving.length:slot;pieces.splice(at,0,...moving);
 let next=old.slice(0,start);for(let piece of pieces)next=next.concat(piece);next=next.concat(old.slice(end));let index=start+pieces.slice(0,at).reduce((sum,piece)=>sum+piece.length(),0),length=moving.reduce((sum,piece)=>sum+piece.length(),0);
 q.history.cutoff();q.updateContents(old.diff(next),'user');q.history.cutoff();q.focus({preventScroll:true});q.setSelection(index,data.count>1?Math.max(0,length-1):0,'silent');richDragSelections.set(editor,{index,length:data.count>1?Math.max(0,length-1):0});activeRichEditor=editor;updateRichToolbar(editor);
 q.getLines(index,Math.max(1,length-1)).forEach(line=>{let node=line.domNode;node.classList.add('rich-block-landed');setTimeout(()=>node.classList.remove('rich-block-landed'),450)});return true;
}
function richBlockRect(unit){let first=unit.nodes[0].getBoundingClientRect(),last=unit.nodes.at(-1).getBoundingClientRect();return{top:first.top,bottom:last.bottom,height:last.bottom-first.top}}
function initRichListDrag(editor){
 if(richDragEditors.has(editor)||!quillFor(editor)?.isEnabled())return;richDragEditors.add(editor);let q=quillFor(editor);
 q.on('selection-change',range=>{if(range)richDragSelections.set(editor,{index:range.index,length:range.length})});
 q.on('text-change',()=>{if(richDragUI?.data?.editor===editor&&!richDragUI.drag)richDragHide()});
 editor.addEventListener('compositionstart',()=>{if(richDragUI?.data?.editor===editor)richDragCancel()});
 editor.addEventListener('keydown',event=>{if(event.altKey&&event.shiftKey&&['ArrowUp','ArrowDown'].includes(event.key)){let range=q.getSelection();if(!range)return;let node=q.getLine(range.index)[0]?.domNode,data=richBlockMoveData(editor,node);if(data){event.preventDefault();moveRichBlocks(data,event.key==='ArrowUp'?data.first-1:data.last+2)}}else if(!richDragUI?.drag)richDragHide()});
 if(richDragUI)return;
 let handle=document.createElement('button');handle.type='button';handle.className='rich-list-handle';handle.hidden=true;handle.setAttribute('aria-label','拖动段落；上下方向键移动');handle.title='拖动整段；选中多段后可一起移动（Alt+Shift+↑/↓）';handle.innerHTML='<svg viewBox="0 0 8 12" aria-hidden="true"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/></svg>';document.body.appendChild(handle);
 richDragUI={handle,data:null,drag:null,timer:0,frame:0};
 document.addEventListener('pointermove',richDragPointerMove);document.addEventListener('pointerdown',event=>{if(event.target.closest('.rich-list-handle'))return;if(richDragUI.drag)richDragCancel();else richDragHide()},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&richDragUI.drag){event.preventDefault();event.stopPropagation();richDragCancel()}},true);
 window.addEventListener('scroll',()=>{if(richDragUI.drag)richDragDropPosition();else richDragPosition()},true);window.addEventListener('resize',()=>{if(richDragUI.drag)richDragDropPosition();else richDragPosition()});
 handle.addEventListener('pointerdown',richDragStart);handle.addEventListener('pointermove',event=>{if(!richDragUI.drag)return;richDragTrack(event)});handle.addEventListener('pointerup',richDragFinish);handle.addEventListener('pointercancel',richDragCancel);handle.addEventListener('lostpointercapture',richDragCancel);
 handle.addEventListener('keydown',event=>{let data=richDragUI.data;if(!data)return;if(event.key==='Escape'){event.preventDefault();richDragHide();data.q.focus();return}if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();let slot=event.key==='ArrowUp'?data.first-1:data.last+2;if(moveRichBlocks(data,slot)){let range=data.q.getSelection(),node=data.q.getLine(range.index)[0]?.domNode;richDragShow(richBlockMoveData(data.editor,node));handle.focus({preventScroll:true})}}});
}
function richDragHide(){if(!richDragUI||richDragUI.drag)return;clearTimeout(richDragUI.timer);richDragUI.handle.hidden=true;richDragUI.data=null}
function richDragPosition(){let ui=richDragUI,data=ui?.data;if(!data||ui.drag)return;if(!data.editor.isConnected||!data.units[data.first].nodes[0].isConnected){richDragHide();return}
 let node=data.units[data.first].nodes[0],root=data.q.root,rect=node.getBoundingClientRect(),base=root.getBoundingClientRect(),lineHeight=parseFloat(getComputedStyle(node).lineHeight)||24,padding=parseFloat(getComputedStyle(root).paddingLeft)||0,scroller=data.editor.closest('.journal-body')||root,clip=scroller.getBoundingClientRect();let top=rect.top+(Math.min(rect.height,lineHeight)-24)/2;
 if(top+24<=Math.max(0,clip.top)||top>=Math.min(innerHeight,clip.bottom)){ui.handle.hidden=true;return}Object.assign(ui.handle.style,{left:Math.max(2,base.left+padding-20)+'px',top:top+'px'});ui.handle.hidden=false;
}
function richDragShow(data){if(!data)return;let ui=richDragUI;clearTimeout(ui.timer);ui.data=data;let host=data.editor.closest('dialog[open]')||document.body;if(ui.handle.parentElement!==host)host.appendChild(ui.handle);ui.handle.setAttribute('aria-label','拖动'+data.count+'段；上下方向键移动');richDragPosition()}
function richDragPointerMove(event){let ui=richDragUI;if(!ui||ui.drag||event.buttons)return;if(event.target.closest('.rich-list-handle')){clearTimeout(ui.timer);return}
 let root=event.target.closest('.ql-editor');if(!root)root=document.elementFromPoint(Math.min(innerWidth-1,event.clientX+20),event.clientY)?.closest('.ql-editor');let editor=root?.closest('.rich-editor');
 if(editor&&richDragEditors.has(editor)&&!editor.classList.contains('ime-composing')){let rect=root.getBoundingClientRect(),padding=parseFloat(getComputedStyle(root).paddingLeft)||0;if(event.clientX>=rect.left+padding-24&&event.clientX<=rect.left+padding+8&&event.clientY>=rect.top&&event.clientY<=rect.bottom){let q=quillFor(editor),node=q.getLines().find(line=>{let r=line.domNode.getBoundingClientRect();return event.clientY>=r.top&&event.clientY<=r.bottom})?.domNode;if(node){richDragShow(richBlockMoveData(editor,node));return}}}
 clearTimeout(ui.timer);ui.timer=setTimeout(richDragHide,120);
}
function richDragStart(event){let ui=richDragUI;if(event.button!==0||!ui.data)return;let data=richBlockMoveData(ui.data.editor,ui.data.units[ui.data.first].nodes[0]);if(!data)return;event.preventDefault();clearTimeout(ui.timer);ui.data=data;ui.handle.setPointerCapture(event.pointerId);
 let line=document.createElement('div'),preview=document.createElement('div');line.className='rich-list-drop-line';preview.className='rich-list-drag-preview';line.hidden=true;preview.hidden=true;let title=document.createElement('b'),text=document.createElement('div');title.textContent='移动 '+data.count+' 段';text.textContent=data.units.slice(data.first,data.last+1).map(unit=>data.q.getText(unit.index,unit.length).trim()).join('\n').slice(0,180);preview.append(title,text);ui.handle.parentElement.append(line,preview);
 ui.drag={data,line,preview,started:false,slot:data.first,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,valid:false};
 const tick=()=>{if(!ui.drag)return;if(!data.editor.isConnected){richDragCancel();return}if(ui.drag.started){let scroller=data.editor.closest('.journal-body')||data.q.root,r=scroller.getBoundingClientRect();if(ui.drag.y<r.top+30)scroller.scrollTop-=8;else if(ui.drag.y>r.bottom-30)scroller.scrollTop+=8;richDragDropPosition()}ui.frame=requestAnimationFrame(tick)};ui.frame=requestAnimationFrame(tick);
}
function richDragTrack(event){let drag=richDragUI.drag;if(!drag)return;drag.x=event.clientX;drag.y=event.clientY;if(!drag.started&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>5){drag.started=true;drag.preview.hidden=false;drag.data.units.slice(drag.data.first,drag.data.last+1).forEach(unit=>unit.nodes.forEach(node=>node.classList.add('rich-block-moving')))}richDragDropPosition()}
function richDragDropPosition(){let drag=richDragUI?.drag;if(!drag?.started)return;let {units,q,first,last}=drag.data,root=q.root.getBoundingClientRect(),scroller=drag.data.editor.closest('.journal-body')||q.root,clip=scroller.getBoundingClientRect();let under=document.elementFromPoint(drag.x,drag.y)?.closest('.rich-editor');drag.valid=(!under||under===drag.data.editor)&&drag.x>=root.left-24&&drag.x<=root.right+12&&drag.y>=Math.max(root.top-24,clip.top)&&drag.y<=Math.min(root.bottom+24,clip.bottom);
 let slot=units.findIndex(unit=>{let r=richBlockRect(unit);return drag.y<r.top+r.height/2});if(slot<0)slot=units.length;drag.slot=slot;let y=slot===units.length?richBlockRect(units.at(-1)).bottom:richBlockRect(units[slot]).top;
 let padding=parseFloat(getComputedStyle(q.root).paddingLeft)||0;Object.assign(drag.line.style,{left:(root.left+padding)+'px',width:Math.max(20,root.width-padding-12)+'px',top:y+'px'});drag.line.hidden=!drag.valid||slot>=first&&slot<=last+1||y<clip.top||y>clip.bottom;
 drag.preview.classList.toggle('invalid',!drag.valid);drag.preview.querySelector('b').textContent=drag.valid?'移动 '+drag.data.count+' 段':'仅在当前正文内移动';Object.assign(drag.preview.style,{left:Math.max(4,Math.min(innerWidth-284,drag.x+14))+'px',top:Math.max(4,Math.min(innerHeight-drag.preview.offsetHeight-8,drag.y+14))+'px'});
}
function richDragFinish(){let drag=richDragUI?.drag;if(!drag)return;let {data,slot,started,valid}=drag;richDragCancel();if(started&&valid)moveRichBlocks(data,slot)}
function richDragCancel(){let ui=richDragUI;if(!ui)return;cancelAnimationFrame(ui.frame);if(ui.drag){ui.drag.data.units.forEach(unit=>unit.nodes.forEach(node=>node.classList.remove('rich-block-moving')));ui.drag.line.remove();ui.drag.preview.remove();ui.drag=null}richDragHide()}
