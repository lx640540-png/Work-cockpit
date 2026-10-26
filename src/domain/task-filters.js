// Device-local query state; filtering never rewrites task membership or ordering.
function emptyTaskFilter(){return{quick:'open',query:'',project:[],type:[],status:[],priority:[],dateField:'planDate',dateMode:'any',dateFrom:'',dateTo:'',group:'project',sort:'manual'}}
function normalizeTaskFilter(value={}){
 let f={...emptyTaskFilter(),...value};for(let key of ['project','type','status','priority'])f[key]=[...new Set(Array.isArray(f[key])?f[key].filter(v=>typeof v==='string'):[])];
 if(!['open','done','archived','all','waiting','followup','overdue','paused'].includes(f.quick))f.quick='open';
 if(['waiting','paused'].includes(f.quick)){f.status=[f.quick==='waiting'?'等待':'暂停'];f.quick='open'}
 if(['followup','overdue'].includes(f.quick)){if(f.quick==='followup')f.status=['等待'];f.dateField=f.quick==='followup'?'followup':'due';f.dateMode=f.quick==='followup'?'due':'overdue';f.quick='open'}
 if(!['planDate','due','followup'].includes(f.dateField))f.dateField='planDate';if(!['any','none','today','week','due','overdue','range'].includes(f.dateMode))f.dateMode='any';
 if(!['none','project','status','type'].includes(f.group))f.group='project';if(!['manual','smart','priority','planDate','due','followup','completed'].includes(f.sort))f.sort='manual';
 f.query=String(f.query||'');f.dateFrom=String(f.dateFrom||'');f.dateTo=String(f.dateTo||'');return f;
}
function taskFilterForRange(filter,range){let f=normalizeTaskFilter(filter);f.quick=range;if(range==='done')f.status=[];else if(range==='open')f.status=f.status.filter(v=>v!=='已完成'&&v!=='已归档');return f}
function taskFilterDateError(f){return f.dateMode==='range'&&((f.dateFrom&&!validTaskDate(f.dateFrom))||(f.dateTo&&!validTaskDate(f.dateTo))||(f.dateFrom&&f.dateTo&&f.dateFrom>f.dateTo))?'日期范围无效，请检查起止日期。':''}
function taskMatchesFilters(task,filter){
 let f=normalizeTaskFilter(filter),today=todayKey();
 if(f.quick==='archived'?!task.archived:task.archived)return false;
 if(f.quick==='open'&&isDone(task)||f.quick==='done'&&!isDone(task))return false;
 for(let field of ['project','type','status','priority'])if(f[field].length&&!f[field].includes(task[field]||''))return false;
 if(taskFilterDateError(f))return false;
 if(f.dateMode!=='any'){let date=task[f.dateField]||'';if(f.dateMode==='none'){if(date)return false}else{if(!date)return false;if(f.dateMode==='today'&&date!==today||f.dateMode==='overdue'&&date>=today||f.dateMode==='due'&&date>today)return false;if(f.dateMode==='week'&&(date<currentWeekKey()||date>weekEnd(currentWeekKey())))return false;if(f.dateMode==='range'&&(f.dateFrom&&date<f.dateFrom||f.dateTo&&date>f.dateTo))return false}}
 return !f.query.trim()||taskSearchMatch(task,f.query).score>0;
}
function sortFilteredTasks(items,filter){
 let f=normalizeTaskFilter(filter),manual=pinOrdered(items,'all');if(f.query.trim())return manual.sort((a,b)=>taskSearchMatch(b,f.query).score-taskSearchMatch(a,f.query).score);
 if(f.sort==='manual')return manual;let order=f.sort==='smart'?smartSort(manual,'all'):manual,rank=new Map(order.map((t,i)=>[t.id,i])),pins=new Map((state.order.pinAll||[]).map((id,i)=>[id,i]));
 return [...order].sort((a,b)=>{let ap=pins.has(a.id),bp=pins.has(b.id);if(ap||bp)return Number(bp)-Number(ap)||(ap&&bp?pins.get(a.id)-pins.get(b.id):0);if(f.sort==='priority')return taskPriority(a)-taskPriority(b)||rank.get(a.id)-rank.get(b.id);if(['planDate','due','followup','completed'].includes(f.sort)){let x=a[f.sort]||'',y=b[f.sort]||'';return Number(!x)-Number(!y)||(f.sort==='completed'?y.localeCompare(x):x.localeCompare(y))||rank.get(a.id)-rank.get(b.id)}return rank.get(a.id)-rank.get(b.id)});
}
function taskFilterChips(filter){
 let f=normalizeTaskFilter(filter),out=[];for(let [field,title] of [['project','项目'],['status','状态'],['priority','优先级'],['type','类型']])for(let value of f[field])out.push({field,value,label:title+'：'+(field==='project'?(value?projectName(value):'通用事项'):value)});
 if(f.query.trim())out.push({field:'query',value:'',label:'搜索：'+f.query.trim()});if(f.quick==='all')out.push({field:'range',value:'',label:'范围：全部未归档'});
 if(f.dateMode!=='any')out.push({field:'date',value:'',label:({planDate:'计划日期',due:'截止日期',followup:'跟进日期'}[f.dateField])+'：'+({none:'未安排',today:'今天',week:'本周',due:'已到期',overdue:'已过期',range:(f.dateFrom||'不限')+'—'+(f.dateTo||'不限')}[f.dateMode])});return out;
}
function validateBulkTaskEdit(draft,ids,field,value){
 let selected=new Set(ids),items=draft.tasks.filter(t=>selected.has(t.id));if(!items.length||items.length!==selected.size)return{ok:false,message:'选中事项已变化，请重新选择'};
 if(!['status','priority','project','planDate','archive','restore'].includes(field))return{ok:false,message:'不支持的批量操作'};
 if(field!=='restore'&&items.some(t=>t.archived))return{ok:false,message:'请先恢复归档事项'};
 if(field==='status'&&!statuses.includes(value)||field==='priority'&&!priorities.includes(value))return{ok:false,message:'请选择有效属性'};
 if(field==='project'&&value&&!draft.projects.some(p=>p.id===value&&!p.archived))return{ok:false,message:'请选择活跃项目'};
 if(field==='planDate'&&(!validTaskDate(value)||items.some(isDone)))return{ok:false,message:'请选择有效日期，并先恢复已完成事项'};
 return{ok:true,items};
}
function applyBulkTaskEdit(draft,ids,field,value){
 let checked=validateBulkTaskEdit(draft,ids,field,value);if(!checked.ok)return checked;let items=checked.items;
 for(let task of items){let previous={...task};if(field==='status')setTaskStatus(task,value,draft);else if(field==='project'){if(task.project!==value)task.milestone='';task.project=value}else if(field==='archive')task.archived=true;else if(field==='restore')task.archived=false;else task[field]=value;if(field==='planDate'){if(!value)task.focus=false;reconcileTaskEdit(task,previous)}task.updatedAt=new Date().toISOString()}
 return{ok:true,changed:items.length};
}
