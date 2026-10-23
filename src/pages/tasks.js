function quickCounts(){
 let open=openTasks(),today=todayKey();
 return{open:open.length,waiting:open.filter(task=>task.status==="等待").length,followup:open.filter(task=>isFollowupDue(task,today)).length,overdue:open.filter(task=>task.due&&task.due<today).length,paused:open.filter(task=>task.status==="暂停").length,done:state.tasks.filter(task=>isDone(task)&&!task.archived).length,archived:state.tasks.filter(task=>task.archived).length};
}
function filteredTasks(){
 let today=todayKey(),items=state.tasks.filter(task=>{
  if(taskFilter.quick==="all"&&task.archived)return false;
  if(taskFilter.quick==="open"&&(task.archived||isDone(task)))return false;
  if(taskFilter.quick==="waiting"&&!(!task.archived&&!isDone(task)&&task.status==="等待"))return false;
  if(taskFilter.quick==="followup"&&!isFollowupDue(task,today))return false;
  if(taskFilter.quick==="overdue"&&!(!task.archived&&!isDone(task)&&task.due&&task.due<today))return false;
  if(taskFilter.quick==="paused"&&!(!task.archived&&!isDone(task)&&task.status==="暂停"))return false;
  if(taskFilter.quick==="done"&&!(!task.archived&&isDone(task)))return false;
  if(taskFilter.quick==="archived"&&!task.archived)return false;
  if(taskFilter.project.length&&!taskFilter.project.includes(task.project))return false;if(taskFilter.type.length&&!taskFilter.type.includes(task.type))return false;if(taskFilter.status.length&&!taskFilter.status.includes(task.status))return false;
  return !taskFilter.query.trim()||taskSearchMatch(task,taskFilter.query).score>0;
 });
 return taskFilter.query.trim()?items.sort((a,b)=>taskSearchMatch(b,taskFilter.query).score-taskSearchMatch(a,taskFilter.query).score):pinOrdered(items,"all");
}
function tableRow(task){return taskRow(task,{scope:'all',query:taskFilter.query,attributes:'data-all-task-row',selection:true})}
function multiFilter(label,field,options){
 let selected=taskFilter[field],title=selected.length?label+" "+selected.length:label;
 return'<details class="multi-filter" data-hover-expand data-filter-detail="'+field+'"><summary>'+esc(title)+'</summary><div class="multi-menu">'+options.map(option=>{let value=typeof option==="string"?option:option.value,text=typeof option==="string"?option:option.label;return'<label><input type="checkbox" data-filter-check="'+field+'" value="'+esc(value)+'" '+(selected.includes(value)?"checked":"")+'><span>'+esc(text)+'</span></label>'}).join("")+'</div></details>';
}
function renderTasks(){
 let counts=quickCounts(),quick=[["open","所有待办"],["waiting","等待回复"],["followup","今日催办"],["overdue","截止逾期"],["paused","已暂停"],["done","已完成"],["archived","已归档"]],items=filteredTasks();
 let visibleIds=new Set(items.map(task=>task.id));ui.selectedTasks=new Set(Array.from(ui.selectedTasks).filter(id=>visibleIds.has(id)));
 let quickHtml=quick.map(item=>'<button class="quick-btn '+(taskFilter.quick===item[0]?"active":"")+'" data-quick="'+item[0]+'">'+item[1]+' <em>'+counts[item[0]]+'</em></button>').join("");
 let projectOptions=state.projects.filter(project=>!project.archived).map(project=>({value:project.id,label:project.name}));
 let advancedCount=taskFilter.project.length+taskFilter.type.length+taskFilter.status.length,advancedLabel='筛选与分组'+(advancedCount?' · '+advancedCount:'');
 let groups=new Map();
 if(taskFilter.group!=="none")items.forEach(task=>{let key=taskFilter.group==="project"?task.project||"":taskFilter.group==="status"?task.status:task.type,label=taskFilter.group==="project"?projectName(task.project):key;if(!groups.has(key))groups.set(key,{label,items:[]});groups.get(key).items.push(task)});
 if(taskFilter.group==='project'){
  let rank=new Map(state.order.projects.map((id,index)=>[id,index]));
  groups=new Map([...groups].sort(([a],[b])=>Number(!a)-Number(!b)||Number(state.favorites.includes(b))-Number(state.favorites.includes(a))||(rank.get(a)??9999)-(rank.get(b)??9999)));
 }
 let body=taskFilter.group==="none"?items.map(tableRow).join(""):Array.from(groups.values()).map(group=>'<section class="all-task-group"><h2>'+esc(group.label)+' <small>'+group.items.length+' 项</small></h2>'+group.items.map(tableRow).join("")+'</section>').join("");
 let bulk=ui.selectedTasks.size?'<div class="bulk-bar"><b>已选择 '+ui.selectedTasks.size+' 项</b><select class="control" id="bulkStatus"><option value="">修改状态</option>'+statuses.map(value=>'<option>'+value+'</option>').join("")+'</select><select class="control" id="bulkPriority"><option value="">修改优先级</option>'+priorities.map(value=>'<option>'+value+'</option>').join("")+'</select><button class="btn" data-bulk-archive>归档</button><button class="btn danger" data-bulk-delete>删除</button><button class="btn" data-bulk-clear>取消选择</button></div>':"";
 $("#page-tasks").innerHTML=pageHead("SINGLE SOURCE OF TRUTH","所有事项","每件事情只保存在这里一次；今天和本周只是视图。",'<button class="btn primary" data-action="new-task">＋ 新建事项</button>')+
 '<div class="quickviews">'+quickHtml+'</div>'+ (taskFilter.query.trim()?'<p class="muted search-order-note">搜索结果按相关度排序；清空搜索后可拖动排序。</p>':'')+'<div class="task-primary-toolbar"><label class="search-field"><span>⌕</span><input id="taskSearch" value="'+esc(taskFilter.query)+'" placeholder="搜索事项、项目编号、里程碑、状态……"></label><button class="btn task-options-toggle '+(ui.taskOptionsOpen?'active':'')+'" type="button" data-hover-task-options data-toggle-task-options aria-expanded="'+(ui.taskOptionsOpen?'true':'false')+'">'+advancedLabel+' '+(ui.taskOptionsOpen?'收起':'展开')+'</button></div><div class="task-advanced-panel" data-hover-task-options-panel '+(ui.taskOptionsOpen?'':'hidden')+'>'+multiFilter("项目","project",projectOptions)+multiFilter("类型","type",taskTypes)+multiFilter("状态","status",statuses)+'<span class="muted">分组</span><div class="segmented"><button data-task-group="none" class="'+(taskFilter.group==="none"?"active":"")+'">不分组</button><button data-task-group="project" class="'+(taskFilter.group==="project"?"active":"")+'">项目</button><button data-task-group="status" class="'+(taskFilter.group==="status"?"active":"")+'">状态</button><button data-task-group="type" class="'+(taskFilter.group==="type"?"active":"")+'">类型</button></div><button class="btn soft" data-smart-sort="all">✦ 智能排序</button><button class="btn" data-reset-filter>清除筛选</button><span class="filter-note">同类筛选按“或”，不同类别按“且”；隐藏事项不会保留批量选择。</span></div>'+
 bulk+'<div class="card all-task-list"><label class="all-task-select"><input class="bulk-check" type="checkbox" data-bulk-all '+(items.length&&items.every(task=>ui.selectedTasks.has(task.id))?'checked':'')+'> 选择当前结果 <span>'+items.length+' 项</span></label><div class="all-task-rows">'+(body||'<div class="empty">没有符合条件的事项。</div>')+'</div></div>';
}
