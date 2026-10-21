// Shared structure and interaction primitives; business state stays with each page.
function uiDragHandle(attributes="",className="drag-handle",label="拖动调整顺序"){
 return '<button type="button" class="'+className+'" aria-label="'+esc(label)+'" data-tip="'+esc(label)+'" '+attributes+'><svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="3" cy="9" r="1.2"/><circle cx="9" cy="9" r="1.2"/><circle cx="3" cy="15" r="1.2"/><circle cx="9" cy="15" r="1.2"/></svg></button>';
}
function uiSectionHeading(title,actions="",className=""){
 return '<div class="ui-section-heading '+className+'"><div class="ui-section-title">'+title+'</div><div class="ui-section-actions">'+actions+'</div></div>';
}
function uiChoiceOptions(values,current,attribute="data-choice"){
 return values.map(value=>'<button type="button" role="option" aria-selected="'+(value===current)+'" class="'+(value===current?'active':'')+'" '+attribute+'="'+esc(value)+'">'+esc(value)+'</button>').join('');
}
function uiOptionKeydown(event,menu,close){
 let buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();let next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index-1+buttons.length)%buttons.length;buttons[next]?.focus()}
 else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}
 else if(event.key==='Tab')close(false);
}
function bindUiSplitter(handle,{read,write,min=0,max=1,step=.02,reset=.5,position,commit=()=>{}}){
 let pointer=null;
 const update=value=>{let bounds=typeof min==='function'?min():min,limit=typeof max==='function'?max():max;write(Math.max(bounds,Math.min(limit,value)))};
 handle.addEventListener('pointerdown',event=>{if(event.button!==0||handle.getAttribute('aria-disabled')==='true')return;pointer=event.pointerId;handle.setPointerCapture(pointer);handle.classList.add('resizing');event.preventDefault();event.stopPropagation()});
 handle.addEventListener('pointermove',event=>{if(pointer!==event.pointerId)return;event.preventDefault();update(position(event))});
 const end=event=>{if(pointer!==event.pointerId)return;pointer=null;handle.classList.remove('resizing');commit()};
 for(let name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,end);
 handle.addEventListener('keydown',event=>{if(handle.getAttribute('aria-disabled')==='true')return;let horizontal=handle.getAttribute('aria-orientation')!=='horizontal',negative=horizontal?'ArrowLeft':'ArrowUp',positive=horizontal?'ArrowRight':'ArrowDown';if(![negative,positive,'Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();update(event.key==='Home'?typeof min==='function'?min():min:event.key==='End'?typeof max==='function'?max():max:read()+(event.key===negative?-step:step));commit()});
 handle.addEventListener('dblclick',event=>{if(handle.getAttribute('aria-disabled')==='true')return;event.preventDefault();update(reset);commit()});
}

// Shared sidebar row: pages supply content and business attributes, never layout.
function uiSidebarItem({className="",attributes="",title="",titleClass="",leading="",selection="",meta="",detail="",pin=""}){
 return '<article class="ui-list-item ui-sidebar-item '+className+'" '+attributes+'>'+selection+leading+'<div class="ui-sidebar-main memo-item-main"><div class="ui-sidebar-title memo-item-title"><h3 class="'+titleClass+'" title="'+esc(title)+'">'+esc(title)+'</h3></div>'+(meta?'<div class="ui-sidebar-meta memo-meta">'+meta+'</div>':'')+'</div>'+(detail?'<div class="ui-sidebar-detail">'+detail+'</div>':'')+'<div class="ui-sidebar-trailing">'+pin+'</div></article>';
}
