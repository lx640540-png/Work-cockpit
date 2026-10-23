// Coordinate the task modal and live journal without rebuilding either editor.
let taskJournalPane='journal',taskJournalTogether=false;
function journalWorkspaceMetrics(viewportWidth,mainLeft,preferredWidth,expanded,taskOpen){
 const compact=taskOpen&&viewportWidth<1120;
 const start=taskOpen?0:Math.max(0,mainLeft);
 const available=Math.max(1,viewportWidth-start);
 const maxWidth=taskOpen&&!compact&&!expanded?Math.max(360,viewportWidth-744):available;
 const width=expanded||compact||viewportWidth<=820?available:Math.min(maxWidth,Math.max(360,preferredWidth));
 return {width,left:viewportWidth-width,maxWidth,compact,taskWidth:Math.max(0,viewportWidth-width-24)};
}
function taskJournalTabs(){return '<nav class="task-journal-tabs" aria-label="任务与记录"><button type="button" data-task-journal-pane="task">任务详情</button><button type="button" data-task-journal-pane="journal">工作记录</button></nav>'}
function syncTaskJournalLayout(metrics){
 const modal=$('#taskDialog'),panel=$('#workJournal');if(!modal||!panel)return;
 const together=modal.open&&journalUI.open;
 if(together&&!taskJournalTogether)taskJournalPane='journal';taskJournalTogether=together;
 const compact=together&&!!metrics?.compact;
 modal.classList.toggle('task-journal-docked',together&&!compact&&!journalUI.expanded);
 modal.classList.toggle('task-journal-compact',compact);
 modal.classList.toggle('task-journal-record',compact&&taskJournalPane==='journal');
 modal.classList.toggle('task-journal-expanded',together&&journalUI.expanded&&!compact);
 if(together&&metrics)modal.style.setProperty('--task-available-width',metrics.taskWidth+'px');else modal.style.removeProperty('--task-available-width');
 const form=$('#taskForm'),formHead=$('.modal-head',form),journalHead=$('.journal-heading',panel);
 if(together){
  if(!formHead.querySelector('.task-journal-tabs'))formHead.insertAdjacentHTML('afterbegin',taskJournalTabs());
  if(!journalHead.querySelector('.task-journal-tabs'))journalHead.insertAdjacentHTML('beforeend',taskJournalTabs());
 }
 modal.querySelectorAll('[data-task-journal-pane]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.taskJournalPane===taskJournalPane)));
 panel.querySelectorAll('[data-task-journal-pane]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.taskJournalPane===taskJournalPane)));
 panel.hidden=!journalUI.open||(compact&&taskJournalPane==='task');
 const support=$('.task-support-disclosure',modal),narrow=together&&!compact&&metrics?.taskWidth<1120;
 if(support&&support.dataset.compact!==String(narrow)){support.open=!narrow;support.dataset.compact=String(narrow)}
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-task-journal-pane]');if(!button)return;
 taskJournalPane=button.dataset.taskJournalPane;journalLayout();
 const target=taskJournalPane==='task'?$('#taskTitle'):journalActiveEditor();target?.focus({preventScroll:true});
});
