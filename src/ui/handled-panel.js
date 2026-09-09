function handledPanel(){
 let tasks=state.tasks.filter(task=>!task.archived&&task.handledOn===todayKey());
 return '<details class="card handled-panel"><summary>本次已处理 · '+tasks.length+' 项</summary><p class="muted">今日已跟进，事项状态保持不变；次日按原计划重新显示。</p>'+tasks.map(task=>'<div class="handled-row"><button class="link-btn" type="button" data-open-task="'+esc(task.id)+'">'+esc(task.title)+'</button><button class="btn" type="button" data-undo-handled="'+esc(task.id)+'">撤销</button></div>').join('')+'</details>';
}
