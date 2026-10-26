function syncTaskFilterPopover(){
 const panel=$('#taskFilterPanel'),trigger=$('[data-toggle-task-options]');if(!panel||!trigger)return;
 if(currentPage!=='tasks'||!ui.taskOptionsOpen){if(panel.matches(':popover-open'))panel.hidePopover();panel.hidden=true;trigger.setAttribute('aria-expanded','false');return}
 panel.hidden=false;if(typeof panel.showPopover==='function'&&!panel.matches(':popover-open'))panel.showPopover();trigger.setAttribute('aria-expanded','true');positionUiPopover(panel,trigger);
}
function closeTaskFilters(restore=false){
 const panel=$('#taskFilterPanel');ui.taskOptionsOpen=false;ui.taskFilterDetail='';
 if(activeHoverSelect&&panel?.contains(activeHoverSelect))closeHoverSelect(activeHoverSelect);
 panel?.querySelectorAll('details[open]').forEach(detail=>detail.open=false);
 syncTaskFilterPopover();if(restore)$('[data-toggle-task-options]')?.focus({preventScroll:true});
}
function refreshTaskFilterFocus(selector){requestRender();requestAnimationFrame(()=>{const target=$(selector);target?.focus({preventScroll:true});syncTaskFilterPopover()})}
function runBulkTaskEdit(field,value){
 const ids=[...ui.selectedTasks],check=validateBulkTaskEdit(state,ids,field,value);if(!check.ok)return toast(check.message);
 const label={status:'修改状态',priority:'修改优先级',project:'修改项目',planDate:'设置计划日期',archive:'归档',restore:'恢复'}[field];commit('批量'+label,draft=>applyBulkTaskEdit(draft,ids,field,value),{immediate:true});toast('已为 '+ids.length+' 项事项'+label);
}
function handleTaskFilterClick(target){
 if(currentPage!=='tasks')return false;
 if(target.hasAttribute('data-toggle-task-options')){ui.taskOptionsOpen=!ui.taskOptionsOpen;syncTaskFilterPopover();return true}
 if(target.hasAttribute('data-close-task-filter')){closeTaskFilters(true);return true}
 if(target.dataset.quick){const range=target.dataset.quick;taskFilter=['open','done','archived'].includes(range)?taskFilterForRange(taskFilter,range):normalizeTaskFilter({...taskFilter,quick:range});ui.selectedTasks.clear();requestRender();return true}
 if(target.hasAttribute('data-reset-filter')){let {quick,group,sort}=taskFilter;taskFilter={...emptyTaskFilter(),quick:quick==='all'?'open':quick,group,sort};requestRender();return true}
 if(target.dataset.removeTaskFilter){const field=target.dataset.removeTaskFilter,value=target.dataset.filterValue;if(['project','status','priority','type'].includes(field))taskFilter[field]=taskFilter[field].filter(v=>v!==value);else if(field==='query')taskFilter.query='';else if(field==='date'){taskFilter.dateMode='any';taskFilter.dateFrom='';taskFilter.dateTo=''}else if(field==='range')taskFilter.quick='open';requestRender();return true}
 if(target.hasAttribute('data-collapse-task-group')){let key=target.dataset.collapseTaskGroup;ui.collapsedTaskGroups.has(key)?ui.collapsedTaskGroups.delete(key):ui.collapsedTaskGroups.add(key);requestRender();return true}
 if(target.hasAttribute('data-task-bulk-mode')){ui.taskBulkMode=!ui.taskBulkMode;ui.selectedTasks.clear();requestRender();return true}
 if(target.hasAttribute('data-bulk-clear-plan')){runBulkTaskEdit('planDate','');return true}
 if(target.hasAttribute('data-bulk-archive')||target.hasAttribute('data-bulk-restore')){runBulkTaskEdit(target.hasAttribute('data-bulk-restore')?'restore':'archive',true);return true}
 return false;
}
function handleTaskFilterChange(target){
 if(currentPage!=='tasks')return false;
 if(target.dataset.filterCheck){const field=target.dataset.filterCheck;if(!['project','status','priority','type'].includes(field))return true;let values=new Set(taskFilter[field]);target.checked?values.add(target.value):values.delete(target.value);taskFilter[field]=[...values];ui.taskFilterDetail=field;refreshTaskFilterFocus('[data-filter-check="'+field+'"][value="'+CSS.escape(target.value)+'"]');return true}
 const fields={taskDateFilterField:'dateField',taskDateFilterMode:'dateMode',taskDateFrom:'dateFrom',taskDateTo:'dateTo',taskGroupSelect:'group',taskSortSelect:'sort'};
 if(fields[target.id]){taskFilter[fields[target.id]]=target.value;refreshTaskFilterFocus('#'+target.id);return true}
 const bulk={bulkStatus:'status',bulkPriority:'priority',bulkProject:'project',bulkPlanDate:'planDate'};
 if(bulk[target.id]){if(target.value)runBulkTaskEdit(bulk[target.id],target.value==='__none'?'':target.value);return true}
 return false;
}
function onTaskFilterPointerDown(event){if(currentPage==='tasks'&&ui.taskOptionsOpen&&!event.target.closest?.('#taskFilterPanel,[data-toggle-task-options],.multi-menu,.hover-select-menu'))closeTaskFilters()}
document.addEventListener('pointerdown',onTaskFilterPointerDown);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&currentPage==='tasks'&&ui.taskOptionsOpen){event.preventDefault();event.stopImmediatePropagation();closeTaskFilters(true)}},true);
document.addEventListener('toggle',event=>{const node=event.target;if(node.matches?.('details[data-click-only][data-filter-detail]')&&node.isConnected){if(node.open)ui.taskFilterDetail=node.dataset.filterDetail;else if(ui.taskFilterDetail===node.dataset.filterDetail)ui.taskFilterDetail=''}},true);
document.addEventListener('input',event=>{const input=event.target;if(!input.dataset.filterOptionSearch)return;let query=input.value.trim().toLocaleLowerCase();input.closest('.multi-menu').querySelectorAll('label').forEach(label=>label.hidden=!label.textContent.toLocaleLowerCase().includes(query))});
window.addEventListener('resize',()=>{if(ui.taskOptionsOpen)syncTaskFilterPopover()});
