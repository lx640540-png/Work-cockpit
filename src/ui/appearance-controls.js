// Native scroll ownership is unchanged: no editor reparenting or simulated scrolling.
const uiScrollTimers=new WeakMap();
function revealUiScroll(node){
 if(!VISUAL_PREVIEW_ENABLED||!(node instanceof Element))return;
 node.classList.add('ui-scroll-active');clearTimeout(uiScrollTimers.get(node));
 uiScrollTimers.set(node,setTimeout(()=>node.classList.remove('ui-scroll-active'),1000));
}
function closestUiScroller(node){
 for(let el=node instanceof Element?node:null;el;el=el.parentElement){let style=getComputedStyle(el);if((/(auto|scroll)/.test(style.overflowY)&&el.scrollHeight>el.clientHeight+1)||(/(auto|scroll)/.test(style.overflowX)&&el.scrollWidth>el.clientWidth+1))return el}
 return null;
}
function initUiResizeDividers(root=document){
 if(!VISUAL_PREVIEW_ENABLED)return;
 root.querySelectorAll('.today-sidebar-splitter,.column-resizer,.capture-resizer,.project-splitter,.week-splitter,.today-height-resizer,.checklist-resizer,.quick-note-height-resizer,.rich-height-resizer,.planning-width-handle,.journal-resize,.journal-column-splitter,.ui-splitter').forEach(handle=>{
  handle.classList.add('ui-resize-divider');
  let horizontal=handle.matches('.today-sidebar-splitter,.today-height-resizer,.checklist-resizer,.quick-note-height-resizer,.rich-height-resizer');
  handle.dataset.resizeAxis=horizontal?'y':'x';handle.setAttribute('role','separator');handle.setAttribute('aria-orientation',horizontal?'horizontal':'vertical');
  if(handle.dataset.dividerBound)return;handle.dataset.dividerBound='true';
  let spec=uiLegacyResizeSpec(handle);if(!spec)return;
  const sync=()=>{handle.setAttribute('aria-valuemin',spec.min);handle.setAttribute('aria-valuemax',spec.max);handle.setAttribute('aria-valuenow',Math.round(spec.read()*100)/100)};sync();
  handle.addEventListener('pointerup',sync);handle.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();if(spec.reset===undefined)return;spec.write(spec.reset);saveUiLayout();sync();schedulePlanningTextareaResize();scheduleTodayScrollability()});
  handle.addEventListener('keydown',event=>{
   if(handle.getAttribute('aria-disabled')==='true')return;let negative=horizontal?'ArrowUp':'ArrowLeft',positive=horizontal?'ArrowDown':'ArrowRight';if(![negative,positive,'Home','End'].includes(event.key))return;
   event.preventDefault();event.stopPropagation();let value=event.key==='Home'?spec.min:event.key==='End'?spec.max:spec.read()+(event.key===negative?-spec.step:spec.step);
   spec.write(Math.max(spec.min,Math.min(spec.max,value)));saveUiLayout();sync();schedulePlanningTextareaResize();scheduleTodayScrollability();
  });
 });
}
function uiLegacyResizeSpec(handle){
 if(handle.id==='todaySidebarSplitter')return{min:.2,max:.8,step:.02,reset:.55,read:()=>uiLayout.todayWaitingShare,write:value=>{uiLayout.todayWaitingShare=value;$('.today-sidebar-stack')?.style.setProperty('--waiting-share',value)}};
 let ratios={weekPlanSplitter:['weekPlanLeft','#weekPlanSplit','--week-left',.34,.66],weekReviewSplitter:['weekReviewLeft','#weekReviewSplit','--week-left',.34,.66],todayResizer:['todayLeft','#todayExecution','--today-left',.38,.66],captureResizer:['quickNoteLeft','#todayCapture','--quick-left',.34,.66]},ratio=ratios[handle.id];
 if(ratio){let [key,selector,property,min,max]=ratio;return{min,max,step:.02,reset:key==='weekReviewLeft'?.46:key==='todayLeft'?.52:.5,read:()=>uiLayout[key],write:value=>{uiLayout[key]=value;$(selector)?.style.setProperty(property,value*100+'%')}}}
 if(handle.matches('[data-rich-height-resizer]')){let key=handle.dataset.richHeightResizer,spec=RICH_HEIGHT_SPECS[key];return{min:spec.min,max:spec.max,step:16,reset:spec.default,read:()=>uiLayout[key],write:value=>{uiLayout[key]=value;handle.closest('[data-rich-resize]')?.style.setProperty('--rich-editor-height',value+'px')}}}
 if(handle.id==='projectSplitter')return{min:280,max:420,step:16,reset:300,read:()=>uiLayout.projectListWidth,write:value=>{uiLayout.projectListWidth=value;$('#projectWorkspace')?.style.setProperty('--project-list',value+'px')}};
 if(handle.id==='quickNoteHeightResizer')return{min:155,max:520,step:16,reset:190,read:()=>uiLayout.quickNoteHeight,write:value=>{uiLayout.quickNoteHeight=value;$('.quick-note-card')?.style.setProperty('--quick-note-height',value+'px')}};
 if(handle.id==='todayHeightResizer')return{min:400,max:Math.max(480,innerHeight-300),step:16,reset:460,read:()=>uiLayout.todayHeight,write:value=>{uiLayout.todayHeight=value;$('#todayExecution')?.style.setProperty('--today-height',value+'px')}};
 return null;
}
if(VISUAL_PREVIEW_ENABLED){
 document.addEventListener('scroll',event=>revealUiScroll(event.target===document?document.scrollingElement:event.target),true);
 document.addEventListener('focusin',event=>revealUiScroll(closestUiScroller(event.target)));
 let pending=null,frame=0;
 document.addEventListener('pointermove',event=>{pending={target:event.target,x:event.clientX,y:event.clientY};if(frame)return;frame=requestAnimationFrame(()=>{frame=0;let node=closestUiScroller(pending.target);if(!node)return;let rect=node.getBoundingClientRect();if(pending.x>=rect.right-16||pending.y>=rect.bottom-16)revealUiScroll(node)})},{passive:true});
 let scheduled=false;const refresh=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;initUiResizeDividers()})};
 new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});initUiResizeDividers();
}
