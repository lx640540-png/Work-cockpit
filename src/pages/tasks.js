function quickCounts(){
 let open=openTasks(),today=todayKey();
 return{open:open.length,waiting:open.filter(task=>task.status==="等待").length,followup:open.filter(task=>task.status==="等待"&&task.followup&&task.followup<=today).length,overdue:open.filter(task=>task.due&&task.due<today).length,paused:open.filter(task=>task.status==="暂停").length,done:state.tasks.filter(task=>isDone(task)&&!task.archived).length,archived:state.tasks.filter(task=>task.archived).length};
}
function filteredTasks(){
 let today=todayKey(),items=state.tasks.filter(task=>{
  if(taskFilter.quick==="all"&&task.archived)return false;
  if(taskFilter.quick==="open"&&(task.archived||isDone(task)))return false;
  if(taskFilter.quick==="waiting"&&!(!task.archived&&!isDone(task)&&task.status==="等待"))return false;
  if(taskFilter.quick==="followup"&&!(!task.archived&&!isDone(task)&&task.status==="等待"&&task.followup&&task.followup<=today))return false;
  if(taskFilter.quick==="overdue"&&!(!task.archived&&!isDone(task)&&task.due&&task.due<today))return false;
  if(taskFilter.quick==="paused"&&!(!task.archived&&!isDone(task)&&task.status==="暂停"))return false;
  if(taskFilter.quick==="done"&&!(!task.archived&&isDone(task)))return false;
  if(taskFilter.quick==="archived"&&!task.archived)return false;
  if(taskFilter.project.length&&!taskFilter.project.includes(task.project))return false;if(taskFilter.type.length&&!taskFilter.type.includes(task.type))return false;if(taskFilter.status.length&&!taskFilter.status.includes(task.status))return false;
  let query=taskFilter.query.normalize("NFKC").toLocaleLowerCase("zh-CN"),project=projectById(task.project),milestone=milestoneOf(task,project),searchText=[task.title,task.nextAction,strip(task.notes),task.status,task.priority,project?.name,project?.code,milestone?.name].join(" ").normalize("NFKC").toLocaleLowerCase("zh-CN");return!query||searchText.includes(query);
 });
 return pinOrdered(items,"all");
}
function tableRow(task){
 let project=projectById(task.project),milestone=milestoneOf(task,project);
 let note=strip(task.notes).trim();
 return'<tr data-drop-scope="all" data-task="'+task.id+'"><td><button class="drag-handle" data-drag-handle="all" data-task="'+task.id+'">⠿</button></td><td><input class="bulk-check" type="checkbox" data-bulk-select="'+task.id+'" '+(ui.selectedTasks.has(task.id)?"checked":"")+'></td><td><div class="task-marker-cell"><button class="flag-btn focus '+(task.focus?"active":"")+'" data-toggle-focus="'+task.id+'" data-tip="切换今日行动；加入时同时加入本周，移出时取消已到期的计划日期">★</button><button class="flag-btn '+(task.week?"active":"")+'" data-toggle-week="'+task.id+'" data-tip="切换本周行动">◆</button></div></td><td><button class="check '+(isDone(task)?"done":"")+'" data-toggle-task="'+task.id+'">'+(isDone(task)?"✓":"")+'</button></td><td><button class="table-title-link" type="button" data-open-task="'+esc(task.id)+'">'+esc(task.title)+'</button><span class="pill">'+esc(task.type)+'</span></td><td><div class="table-sub table-next"><b>下一步 · </b>'+esc(task.nextAction||"—")+'</div>'+(note?'<div class="table-sub table-note">'+esc(note)+'</div>':'')+'</td><td><b>'+esc(project?.name||"通用事项")+'</b><div class="muted" style="font-size:11px">'+esc(milestone?.name||"")+'</div></td><td><div class="table-status-cell"><button class="pin-task '+(isPinned(task.id,'all')?'active':'')+'" data-pin-task="'+task.id+'" data-pin-scope="all" data-tip="置顶全部事项视图"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2l8 8-3 1-4 4 1 5-1 1-5-6-5 5-1-1 5-5-6-5 1-1 5 1 4-4z"/></svg></button>'+propertyButton(task,"status",false)+'</div></td><td>'+propertyButton(task,"priority",false)+'</td><td><div class="table-date"><span class="muted">计划：'+dateShort(task.planDate)+'</span><br><span class="muted">完成：'+dateShort(task.completed)+'</span></div></td><td aria-hidden="true"></td></tr>';
}
function multiFilter(label,field,options){
 let selected=taskFilter[field],title=selected.length?label+" "+selected.length:label;
 return'<details class="multi-filter" data-hover-expand data-filter-detail="'+field+'"><summary>'+esc(title)+'</summary><div class="multi-menu">'+options.map(option=>{let value=typeof option==="string"?option:option.value,text=typeof option==="string"?option:option.label;return'<label><input type="checkbox" data-filter-check="'+field+'" value="'+esc(value)+'" '+(selected.includes(value)?"checked":"")+'><span>'+esc(text)+'</span></label>'}).join("")+'</div></details>';
}
function renderTasks(){
 let counts=quickCounts(),quick=[["open","所有待办"],["waiting","等待回复"],["followup","今日催办"],["overdue","已逾期"],["paused","已暂停"],["done","已完成"],["archived","已归档"]],items=filteredTasks();
 let visibleIds=new Set(items.map(task=>task.id));ui.selectedTasks=new Set(Array.from(ui.selectedTasks).filter(id=>visibleIds.has(id)));
 let quickHtml=quick.map(item=>'<button class="quick-btn '+(taskFilter.quick===item[0]?"active":"")+'" data-quick="'+item[0]+'">'+item[1]+' <em>'+counts[item[0]]+'</em></button>').join("");
 let projectOptions=state.projects.filter(project=>!project.archived).map(project=>({value:project.id,label:project.name}));
 let advancedCount=taskFilter.project.length+taskFilter.type.length+taskFilter.status.length,advancedLabel='筛选与分组'+(advancedCount?' · '+advancedCount:'');
 let groups=new Map();
 if(taskFilter.group!=="none")items.forEach(task=>{let key=taskFilter.group==="project"?task.project||"":taskFilter.group==="status"?task.status:task.type,label=taskFilter.group==="project"?projectName(task.project):key;if(!groups.has(key))groups.set(key,{label,items:[]});groups.get(key).items.push(task)});
 let body=taskFilter.group==="none"?items.map(tableRow).join(""):Array.from(groups.values()).map(group=>'<tr class="group-row"><td colspan="11">'+esc(group.label)+' · '+group.items.length+' 项</td></tr>'+group.items.map(tableRow).join("")).join("");
 let bulk=ui.selectedTasks.size?'<div class="bulk-bar"><b>已选择 '+ui.selectedTasks.size+' 项</b><select class="control" id="bulkStatus"><option value="">修改状态</option>'+statuses.map(value=>'<option>'+value+'</option>').join("")+'</select><select class="control" id="bulkPriority"><option value="">修改优先级</option>'+priorities.map(value=>'<option>'+value+'</option>').join("")+'</select><button class="btn" data-bulk-archive>归档</button><button class="btn danger" data-bulk-delete>删除</button><button class="btn" data-bulk-clear>取消选择</button></div>':"";
 $("#page-tasks").innerHTML=pageHead("SINGLE SOURCE OF TRUTH","所有事项","每件事情只保存在这里一次；今天和本周只是视图。",'<button class="btn primary" data-action="new-task">＋ 新建事项</button>')+
 '<div class="quickviews">'+quickHtml+'</div><div class="task-primary-toolbar"><label class="search-field"><span>⌕</span><input id="taskSearch" value="'+esc(taskFilter.query)+'" placeholder="搜索事项、项目编号、里程碑、状态……"></label><button class="btn task-options-toggle '+(ui.taskOptionsOpen?'active':'')+'" type="button" data-hover-task-options data-toggle-task-options aria-expanded="'+(ui.taskOptionsOpen?'true':'false')+'">'+advancedLabel+' '+(ui.taskOptionsOpen?'收起':'展开')+'</button></div><div class="task-advanced-panel" data-hover-task-options-panel '+(ui.taskOptionsOpen?'':'hidden')+'>'+multiFilter("项目","project",projectOptions)+multiFilter("类型","type",taskTypes)+multiFilter("状态","status",statuses)+'<span class="muted">分组</span><div class="segmented"><button data-task-group="none" class="'+(taskFilter.group==="none"?"active":"")+'">不分组</button><button data-task-group="project" class="'+(taskFilter.group==="project"?"active":"")+'">项目</button><button data-task-group="status" class="'+(taskFilter.group==="status"?"active":"")+'">状态</button><button data-task-group="type" class="'+(taskFilter.group==="type"?"active":"")+'">类型</button></div><button class="btn soft" data-smart-sort="all">✦ 智能排序</button><button class="btn" data-reset-filter>清除筛选</button><span class="filter-note">同类筛选按“或”，不同类别按“且”；隐藏事项不会保留批量选择。</span></div>'+
 bulk+'<div class="card table-card"><table class="task-table"><thead><tr><th></th><th><input class="bulk-check" type="checkbox" data-bulk-all '+(items.length&&items.every(task=>ui.selectedTasks.has(task.id))?"checked":"")+'></th><th>行动</th><th>完成</th><th>事项</th><th>下一步 / 备注</th><th>项目 / 里程碑</th><th>状态</th><th>优先级</th><th>日期</th><th></th></tr></thead><tbody>'+(body||'<tr><td colspan="11"><div class="empty">没有符合条件的事项。</div></td></tr>')+'</tbody></table></div>';
}

