let taskDateTrigger=null;
function taskDateButton(task,readonly=false){
 let field=taskScheduleField(task),label=field==="followup"?"跟进":"计划",reminder=isFollowupDue(task),days=reminder?Math.round((parseDate(todayKey())-parseDate(task.followup))/86400000):0,text=reminder?(days?"跟进逾期 "+days+" 天":"今日跟进"):label+" "+(task[field]?dateShort(task[field]):"未安排");
 if(readonly||task.archived||isDone(task))return '<span class="task-date-label">'+label+' '+dateShort(task[field])+'</span>';
 return '<button type="button" class="task-date-button '+(reminder?'followup reminder':'')+'" data-quick-date="'+esc(task.id)+'" aria-label="调整'+esc(task.title)+'的'+label+'日期" aria-haspopup="dialog" aria-expanded="false">'+text+' ⌄</button>';
}
function closeTaskDateMenu(restoreFocus=false){
 let pop=$("#taskDatePopover");if(pop)pop.hidden=true;
 taskDateTrigger?.setAttribute("aria-expanded","false");if(restoreFocus&&taskDateTrigger?.isConnected)taskDateTrigger.focus({preventScroll:true});taskDateTrigger=null;
}
function openTaskDateMenu(trigger,id){
 let task=taskById(id);if(!task||task.archived||isDone(task))return;
 closeChoice();closeTaskDateMenu();taskDateTrigger=trigger;trigger.setAttribute("aria-expanded","true");
 let pop=$("#taskDatePopover");if(!pop){pop=document.createElement("div");pop.id="taskDatePopover";pop.className="task-date-popover";pop.setAttribute("role","dialog");document.body.appendChild(pop)}
 let field=taskScheduleField(task),label=field==="followup"?"跟进日期":"计划日期",today=parseDate(todayKey()),nextMonday=fmt(addDays(today,((8-today.getDay())%7)||7));
 pop.dataset.task=id;pop.dataset.field=field;pop.setAttribute("aria-label","调整"+label);
 pop.innerHTML='<b>'+label+'</b><div class="date-shortcuts">'+[[todayKey(),'今天'],[fmt(addDays(today,1)),'明天'],[nextMonday,'下周一']].map(([date,text])=>'<button class="btn" type="button" data-set-task-date="'+date+'">'+text+'</button>').join('')+'</div><label>指定日期<input type="date" id="quickTaskDate" value="'+esc(task[field])+'"></label><div class="date-menu-actions"><button type="button" class="link-btn" data-set-task-date="">清除日期</button><button type="button" class="btn primary" data-apply-task-date>应用</button></div>';
 pop.hidden=false;let rect=trigger.getBoundingClientRect();pop.style.left=Math.max(8,Math.min(rect.left,innerWidth-pop.offsetWidth-8))+"px";pop.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-pop.offsetHeight-8))+"px";pop.querySelector('button').focus({preventScroll:true});
}
function applyQuickTaskDate(value){let pop=$("#taskDatePopover");if(!pop||pop.hidden)return;if(setTaskDate(pop.dataset.task,pop.dataset.field,value))closeTaskDateMenu(true)}
document.addEventListener("pointerdown",event=>{if(!event.target.closest?.("#taskDatePopover,[data-quick-date]"))closeTaskDateMenu()});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("#taskDatePopover")?.hidden&&taskDateTrigger){event.preventDefault();event.stopImmediatePropagation();closeTaskDateMenu(true)}},true);
document.addEventListener("scroll",event=>{if(taskDateTrigger&&!event.target.closest?.("#taskDatePopover"))closeTaskDateMenu()},true);
window.addEventListener("resize",()=>closeTaskDateMenu());
