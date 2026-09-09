const PLANNING_WIDTH_KEY="work-cockpit-planning-width-v1";
let planningWidth=45,planningPointer=null,tableSortables=[];
try{let saved=Number(localStorage.getItem(PLANNING_WIDTH_KEY));if(saved>=20&&saved<=70)planningWidth=saved}catch(error){}
function applyPlanningWidth(value){planningWidth=Math.max(20,Math.min(70,value));document.documentElement.style.setProperty('--planning-width',planningWidth+'%');document.querySelectorAll('[data-planning-resize]').forEach(handle=>handle.setAttribute('aria-valuenow',Math.round(planningWidth)));schedulePlanningTextareaResize()}
function initPlanningResize(){
 document.querySelectorAll('.week-action-label,.overview-next-label').forEach(label=>{
  label.classList.add('planning-resizable');if(label.querySelector('[data-planning-resize]'))return;
  let handle=document.createElement('span');handle.dataset.planningResize='';handle.className='planning-width-handle';handle.tabIndex=0;handle.setAttribute('role','slider');handle.setAttribute('aria-label','统一调整任务输入框宽度');handle.setAttribute('aria-valuemin','20');handle.setAttribute('aria-valuemax','70');handle.setAttribute('aria-orientation','horizontal');handle.dataset.tip='左右拖动统一调整输入框宽度；双击恢复默认';label.append(handle);
 });applyPlanningWidth(planningWidth);
}
function savePlanningWidth(){localStorage.setItem(PLANNING_WIDTH_KEY,String(planningWidth))}
document.addEventListener('pointerdown',event=>{let handle=event.target.closest?.('[data-planning-resize]');if(!handle||event.button!==0)return;let row=handle.closest('.project-overview-task,.task-main');if(!row)return;event.preventDefault();event.stopPropagation();planningPointer={handle,id:event.pointerId,x:event.clientX,width:row.getBoundingClientRect().width,start:planningWidth};handle.setPointerCapture(event.pointerId);handle.classList.add('active')},true);
document.addEventListener('pointermove',event=>{if(!planningPointer||event.pointerId!==planningPointer.id)return;event.preventDefault();applyPlanningWidth(planningPointer.start+(event.clientX-planningPointer.x)/planningPointer.width*100)});
function endPlanningResize(event){if(!planningPointer||event.pointerId!==planningPointer.id)return;planningPointer.handle.classList.remove('active');planningPointer=null;savePlanningWidth()}
document.addEventListener('pointerup',endPlanningResize);document.addEventListener('pointercancel',endPlanningResize);document.addEventListener('lostpointercapture',endPlanningResize);
document.addEventListener('dblclick',event=>{if(!event.target.closest?.('[data-planning-resize]'))return;event.preventDefault();applyPlanningWidth(45);savePlanningWidth()});
document.addEventListener('keydown',event=>{if(!event.target.matches?.('[data-planning-resize]'))return;let value=event.key==='ArrowLeft'?planningWidth-2:event.key==='ArrowRight'?planningWidth+2:event.key==='Home'?20:event.key==='End'?70:null;if(value===null)return;event.preventDefault();event.stopPropagation();applyPlanningWidth(value);savePlanningWidth()},true);
function initTableSorting(){
 tableSortables.forEach(sortable=>sortable.destroy());tableSortables=[];if(typeof Sortable!=='function')return;
 document.querySelectorAll('#page-tasks .task-table tbody').forEach(body=>{let before=[];tableSortables.push(new Sortable(body,{draggable:'tr[data-task]',handle:'[data-drag-handle="all"]',forceFallback:true,fallbackOnBody:true,fallbackTolerance:4,animation:150,scroll:true,onStart(){before=Array.from(body.querySelectorAll('tr[data-task]'),row=>row.dataset.task)},onEnd(){let after=Array.from(body.querySelectorAll('tr[data-task]'),row=>row.dataset.task);commit('调整事项顺序',draft=>{draft.order.all=reconcileVisibleOrder(draft.order.all,before,after)},{immediate:true})}}))});
}
