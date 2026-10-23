function openPlanningReview(scope){
 if(!journalFlush())return;
 const range=planningReviewRange(),next=scope==='next',items=next?openTasks().filter(task=>!['等待','暂停'].includes(task.status)):scope==='today'?todayAdvance():weekTasks();
 const title=next?'确认下周安排':scope==='today'?'检查今日安排':'检查本周安排';
 const explanation=next?'选择已有事项并指定下周日期；不根据总结自动创建任务。等待与暂停事项可先在详情恢复状态。':'逐项决定继续、改期或移出。确认前不会改变事项；移出安排不会删除事项。';
 const rows=items.map(task=>{const date=next?(task.planDate>=range.next&&task.planDate<=range.nextEnd?task.planDate:range.next):scope==='week'?range.next:fmt(addDays(parseDate(todayKey()),1));return '<div class="workflow-planning-row" data-planning-task="'+esc(task.id)+'"><div><strong>'+esc(task.title)+'</strong><small>'+esc(projectName(task.project))+' · '+esc(task.status)+(task.planDate?' · 计划 '+dateShort(task.planDate):'')+'</small></div><label><span class="visually-hidden">'+esc(task.title)+'的安排</span><select data-planning-action><option value="keep">'+(next?'暂不调整':'继续保留')+'</option><option value="'+(next?'schedule':'postpone')+'">'+(next?'安排到下周':'改期')+'</option>'+(next?'':'<option value="remove">移出'+(scope==='today'?'今日':'本周')+'安排</option>')+'</select></label><label class="workflow-planning-date" hidden>日期<input type="date" data-planning-date value="'+date+'" min="'+(next?range.next:fmt(addDays(parseDate(todayKey()),1)))+'" '+(next?'max="'+range.nextEnd+'"':'')+'></label></div>'}).join('');
 workflowDialog(title,explanation,'<div class="workflow-planning-list">'+(rows||'<div class="empty">目前没有需要检查的事项。</div>')+'</div>','确认安排');workflowDialogContext={kind:'planning',scope};
}
function confirmPlanningReview(){
 const scope=workflowDialogContext.scope,decisions=$$('#workflowDialog [data-planning-task]').map(row=>({id:row.dataset.planningTask,action:row.querySelector('[data-planning-action]').value,date:row.querySelector('[data-planning-date]').value}));
 // Validate against a copy first, so a bad later date cannot partially apply earlier rows.
 const check=applyPlanningReview(clone(state),scope,decisions);if(!check.ok)return toast(check.message);
 if(check.changed)commit('确认'+(scope==='next'?'下周':scope==='today'?'今日':'本周')+'安排',draft=>applyPlanningReview(draft,scope,decisions),{immediate:true});
 $('#workflowDialog').close();toast(check.changed?'已更新 '+check.changed+' 项安排':'已保留现有安排');
}
document.addEventListener('change',event=>{
 if(event.target.matches('[data-planning-action]')){const row=event.target.closest('[data-planning-task]');row.querySelector('.workflow-planning-date').hidden=!['postpone','schedule'].includes(event.target.value)}
 if(event.target.id==='curationTarget'){const field=$('#curationTaskField');if(field){field.hidden=event.target.value!=='task';if(!field.hidden)$('#curationTask')?.focus()}}
});
document.addEventListener('click',event=>{const button=event.target.closest('[data-review-planning]');if(button)openPlanningReview(button.dataset.reviewPlanning)});
