// Reorder Quill list ranges through Delta, never by rearranging editable DOM.
function richListGroups(quill,node){
 let lines=quill.getLines(),at=lines.findIndex(line=>line.domNode===node);if(at<0)return null;
 let format=quill.getFormat(quill.getIndex(lines[at]),1);if(!format.list)return null;let indent=Number(format.indent)||0,type=format.list,left=at,right=at;
 const fmtAt=i=>quill.getFormat(quill.getIndex(lines[i]),1);
 while(left>0){let f=fmtAt(left-1);if(!f.list||(Number(f.indent)||0)<indent||((Number(f.indent)||0)===indent&&f.list!==type))break;left--}
 while(right+1<lines.length){let f=fmtAt(right+1);if(!f.list||(Number(f.indent)||0)<indent||((Number(f.indent)||0)===indent&&f.list!==type))break;right++}
 let groups=[];for(let i=left;i<=right;i++){let f=fmtAt(i);if((Number(f.indent)||0)!==indent)continue;let end=i+1;while(end<=right&&(Number(fmtAt(end).indent)||0)>indent)end++;let index=quill.getIndex(lines[i]),length=lines.slice(i,end).reduce((sum,line)=>sum+line.length(),0);groups.push({node:lines[i].domNode,index,length})}
 let source=groups.findIndex(group=>group.node===node);return source<0?null:{groups,source};
}
function moveRichList(editor,node,to){
 let q=quillFor(editor),data=q&&richListGroups(q,node);if(!data||to<0||to>=data.groups.length||to===data.source||editor.classList.contains('ime-composing'))return false;
 let Delta=Quill.import('delta'),old=q.getContents(),start=data.groups[0].index,end=data.groups.at(-1).index+data.groups.at(-1).length;
 let pieces=data.groups.map(group=>q.getContents(group.index,group.length)),moving=pieces.splice(data.source,1)[0];pieces.splice(to,0,moving);
 let next=old.slice(0,start);for(let piece of pieces)next=next.concat(piece);next=next.concat(old.slice(end));q.history.cutoff();q.updateContents(old.diff(next),'user');q.history.cutoff();
 let selection=start+pieces.slice(0,to).reduce((sum,piece)=>sum+piece.length(),0);q.setSelection(selection,0,'silent');q.focus({preventScroll:true});activeRichEditor=editor;return true;
}
function initRichListDrag(editor){
 let q=quillFor(editor);if(!q||!q.isEnabled()||editor.__listDrag)return;editor.__listDrag=true;editor.classList.add('rich-list-draggable');
 let handle=document.createElement('button');handle.type='button';handle.className='rich-list-handle';handle.hidden=true;handle.innerHTML='<svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>';handle.setAttribute('aria-label','拖动列表项；上下方向键移动');handle.title='拖动排序，或使用上下方向键';editor.appendChild(handle);
 let current=null,drag=null,frame=0;
 const hide=()=>{if(drag)return;handle.hidden=true;current=null};
 const show=node=>{if(drag||editor.classList.contains('ime-composing'))return;current=node;let rect=node.getBoundingClientRect(),base=editor.getBoundingClientRect();handle.style.top=(rect.top-base.top+editor.scrollTop)+'px';handle.hidden=false};
 editor.addEventListener('pointermove',event=>{if(drag)return;let node=event.target.closest('li');if(node&&q.root.contains(node))show(node)});
 editor.addEventListener('pointerleave',()=>{if(document.activeElement!==handle)hide()});
 editor.addEventListener('focusin',event=>{if(event.target===handle)return;let range=q.getSelection();if(range){let node=q.getLine(range.index)[0]?.domNode;if(node?.tagName==='LI')show(node)}});
 q.on('selection-change',range=>{if(!range||drag)return;let node=q.getLine(range.index)[0]?.domNode;if(node?.tagName==='LI')show(node);else hide()});
 q.on('text-change',()=>{if(!drag)hide()});editor.addEventListener('compositionstart',hide);
 handle.addEventListener('keydown',event=>{if(event.key==='Escape'){hide();q.focus();return}if(!['ArrowUp','ArrowDown'].includes(event.key)||!current)return;event.preventDefault();let data=richListGroups(q,current),target=data?.source+(event.key==='ArrowUp'?-1:1);if(data&&moveRichList(editor,current,target)){let node=q.getLine(q.getSelection().index)[0]?.domNode;show(node);handle.focus({preventScroll:true})}});
 const cleanup=()=>{cancelAnimationFrame(frame);drag?.line.remove();drag?.preview.remove();drag=null;editor.classList.remove('rich-list-dragging');hide()};
 handle.addEventListener('pointerdown',event=>{
  if(event.button!==0||!current||editor.classList.contains('ime-composing'))return;let data=richListGroups(q,current);if(!data)return;event.preventDefault();handle.setPointerCapture(event.pointerId);
  let line=document.createElement('div'),preview=document.createElement('div');line.className='rich-list-drop-line';preview.className='rich-list-drag-preview';preview.textContent=current.textContent;document.body.append(line,preview);
  drag={...data,node:current,to:data.source,line,preview,x:event.clientX,y:event.clientY,started:false,startX:event.clientX,startY:event.clientY};line.hidden=true;preview.hidden=true;
  const tick=()=>{if(!drag)return;if(!editor.isConnected){cleanup();return}if(drag.started){let scroller=editor.closest('.journal-body')||q.root,rect=scroller.getBoundingClientRect();if(drag.y<rect.top+35)scroller.scrollTop-=10;else if(drag.y>rect.bottom-35)scroller.scrollTop+=10;updateDrop()}frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick);
 });
 function updateDrop(){if(!drag)return;let groups=drag.groups,slot=groups.findIndex(group=>drag.y<group.node.getBoundingClientRect().top+group.node.getBoundingClientRect().height/2);if(slot<0)slot=groups.length;drag.to=Math.max(0,Math.min(groups.length-1,slot-(slot>drag.source?1:0)));
  let target=groups[Math.min(slot,groups.length-1)].node.getBoundingClientRect(),root=q.root.getBoundingClientRect();Object.assign(drag.line.style,{left:(root.left+28)+'px',width:Math.max(20,root.width-48)+'px',top:(slot===groups.length?groups.at(-1).node.getBoundingClientRect().bottom:target.top)+'px'});drag.line.hidden=drag.to===drag.source;
  Object.assign(drag.preview.style,{left:(drag.x+12)+'px',top:(drag.y+12)+'px'});
 }
 handle.addEventListener('pointermove',event=>{if(!drag)return;drag.x=event.clientX;drag.y=event.clientY;if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>5){drag.started=true;drag.preview.hidden=false;editor.classList.add('rich-list-dragging')}if(drag.started)updateDrop()});
 handle.addEventListener('pointerup',()=>{if(!drag)return;let {node,to,started}=drag;cleanup();if(started)moveRichList(editor,node,to)});
 handle.addEventListener('pointercancel',cleanup);handle.addEventListener('lostpointercapture',cleanup);handle.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();cleanup()}});
}
