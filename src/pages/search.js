// One ranking pipeline for previews, category totals and complete results.
const searchView={category:"all",limits:{task:10,project:8,decision:6,memo:6},taskSort:"relevance",groupTasksByProject:false,scrollTop:0,windowY:0,restoring:false};
const SEARCH_CATEGORIES={task:"事项",project:"项目",decision:"决策",memo:"备忘录"};
const SEARCH_TASK_SORTS={relevance:"相关度优先",status:"按状态",completedDesc:"完成日期：新到旧",completedAsc:"完成日期：旧到新"};
function resetSearchView(){searchView.category="all";searchView.limits={task:10,project:8,decision:6,memo:6};searchView.taskSort="relevance";searchView.groupTasksByProject=false;searchView.scrollTop=0;searchView.windowY=0}
function normalizedSearchText(value){return String(value||"").normalize("NFKC").toLocaleLowerCase("zh-CN")}
function searchRank(primary,secondary,q,inactive=false){let title=normalizedSearchText(primary),rest=normalizedSearchText(secondary),score=title===q?120:title.startsWith(q)?90:title.includes(q)?65:rest.includes(q)?35:0;return score-(inactive?8:0)}
function collectGlobalResults(query){
 let q=normalizedSearchText(query).trim(),result={task:[],project:[],decision:[],memo:[]};if(!q)return result;
 let rank=(items,primary,secondary,inactive)=>items.map(item=>({item,score:searchRank(primary(item),secondary(item),q,inactive(item))})).filter(value=>value.score>0).sort((a,b)=>b.score-a.score||String(b.item.updatedAt||"").localeCompare(String(a.item.updatedAt||""))).map(value=>value.item);
 result.task=rank(state.tasks,task=>task.title,task=>{let project=projectById(task.project),milestone=milestoneOf(task,project);return[task.nextAction,strip(task.notes),...(task.progressLog||[]).map(entry=>entry.text),task.status,task.priority,project?.name,project?.code,milestone?.name].join(" ")},task=>task.archived||isDone(task));
 result.project=rank(state.projects,project=>project.name,project=>[project.code,project.description,...project.milestones.flatMap(item=>[item.name,item.criteria])].join(" "),project=>project.archived);
 result.decision=rank(state.decisions,decision=>decision.title,decision=>[strip(decision.conclusion),strip(decision.rationale),projectName(decision.project)].join(" "),decision=>decision.archived);
 result.memo=rank(state.memos,memo=>memo.title,memo=>[strip(memo.content),projectName(memo.project)].join(" "),memo=>memo.archived);
 return result;
}
function searchExcerpt(text,query){
 let content=String(text||""),at=normalizedSearchText(content).indexOf(normalizedSearchText(query).trim()),start=Math.max(0,at-24),end=Math.min(content.length,start+120);
 return (start?'…':'')+content.slice(start,end)+(end<content.length?'…':'');
}
function searchTaskStatus(task){return task.archived?"已归档":task.status}
function searchTaskStatusRank(task){let value=searchTaskStatus(task),order=["进行中","等待","待处理","暂停","已完成","已归档"],rank=order.indexOf(value);return rank<0?order.length:rank}
function sortSearchTasks(items){
 let rows=[...items],tie=(a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||""));
 if(searchView.taskSort==="status")rows.sort((a,b)=>searchTaskStatusRank(a)-searchTaskStatusRank(b)||tie(a,b));
 if(searchView.taskSort==="completedDesc")rows.sort((a,b)=>{let left=a.completed||"",right=b.completed||"";return left&&right?right.localeCompare(left)||tie(a,b):left?-1:right?1:tie(a,b)});
 if(searchView.taskSort==="completedAsc")rows.sort((a,b)=>{let left=a.completed||"",right=b.completed||"";return left&&right?left.localeCompare(right)||tie(a,b):left?-1:right?1:tie(a,b)});
 return rows;
}
function searchTaskControls(){
 let options=Object.entries(SEARCH_TASK_SORTS).map(([value,label])=>'<option value="'+value+'" '+(searchView.taskSort===value?'selected':'')+'>'+label+'</option>').join('');
 return '<div class="search-task-tools" aria-label="事项结果整理"><label><span>事项排序</span><select id="searchTaskSort">'+options+'</select></label><button type="button" class="btn '+(searchView.groupTasksByProject?'soft':'')+'" data-search-project-group aria-pressed="'+searchView.groupTasksByProject+'">按项目整理</button></div>';
}
function searchTaskResultRows(items,query){
 if(!searchView.groupTasksByProject)return items.map(item=>searchResultRow("task",item,query)).join('');
 let groups=new Map();items.forEach(item=>{let project=projectById(item.project),key=project?.id||"",group=groups.get(key)||{key,name:project?.name||"通用事项",items:[]};group.items.push(item);groups.set(key,group)});
 return [...groups.values()].sort((a,b)=>a.key?b.key?a.name.localeCompare(b.name,"zh-CN"): -1:b.key?1:0).map(group=>'<section class="search-project-group"><div class="search-project-heading"><b>'+esc(group.name)+'</b><span>'+group.items.length+' 项</span></div>'+group.items.map(item=>searchResultRow("task",item,query)).join('')+'</section>').join('');
}
function searchResultRow(kind,item,query){
 let label=SEARCH_CATEGORIES[kind],title=item.title||item.name,meta=[],body="";
 if(kind==="task"){
  let project=projectById(item.project),status=searchTaskStatus(item),completed=item.completed?'<span class="search-completed-date"><span>完成日期</span><time datetime="'+esc(item.completed)+'">'+esc(item.completed)+'</time></span>':'';meta=[project?.name||"通用事项",milestoneOf(item,project)?.name,item.nextAction];body=[strip(item.notes),...(item.progressLog||[]).map(entry=>entry.text)].join(" ");
  let excerpt=body.trim()?searchExcerpt(body,query):"";
  return '<button class="data-item search-result search-task-result" type="button" data-search-task="'+esc(item.id)+'"><span class="search-result-main"><span class="search-result-title"><b>'+esc(title)+'</b><span class="pill search-status status-'+esc(status)+'">'+esc(status)+'</span></span><small>'+esc(meta.filter(Boolean).join(" · "))+'</small>'+(excerpt?'<small class="search-excerpt">'+esc(excerpt)+'</small>':'')+'</span><span class="search-result-side">'+completed+'<span class="search-open" aria-hidden="true">↗</span></span></button>';
 }
 else if(kind==="project"){meta=[item.archived?"已归档":"进行中",item.code,currentMilestone(item)?.name];body=[item.description,...item.milestones.flatMap(m=>[m.name,m.criteria])].join(" ")}
 else if(kind==="decision"){meta=[item.archived?"已归档":"有效",projectName(item.project)];body=[strip(item.conclusion),strip(item.rationale)].join(" ")}
 else{meta=[item.archived?"已归档":"进行中",projectName(item.project)];body=strip(item.content)}
 let excerpt=body.trim()?searchExcerpt(body,query):"";
 return '<button class="data-item search-result" type="button" data-search-'+kind+'="'+esc(item.id)+'"><span><b>'+label+' · '+esc(title)+'</b><small>'+esc(meta.filter(Boolean).join(" · "))+'</small>'+(excerpt?'<small class="search-excerpt">'+esc(excerpt)+'</small>':'')+'</span><span aria-hidden="true">↗</span></button>';
}
function globalResults(query){
 if(!String(query||"").trim())return '<div class="empty">输入关键词搜索项目、事项、里程碑、决策和备忘录。</div>';
 let results=collectGlobalResults(query),total=Object.values(results).reduce((sum,rows)=>sum+rows.length,0);
 let tabs=[['all','全部',total],...Object.entries(SEARCH_CATEGORIES).map(([kind,label])=>[kind,label,results[kind].length])].map(([kind,label,count])=>'<button type="button" class="btn '+(searchView.category===kind?'soft':'')+'" data-search-category="'+kind+'" aria-pressed="'+(searchView.category===kind)+'">'+label+' '+count+'</button>').join('');
 let groups=Object.entries(results).filter(([kind])=>searchView.category==='all'||searchView.category===kind).map(([kind,items])=>{
  if(!items.length)return '';
  let ordered=kind==="task"?sortSearchTasks(items):items,shown=ordered.slice(0,searchView.limits[kind]),more=shown.length<items.length,tools=kind==="task"?searchTaskControls():"",rows=kind==="task"?searchTaskResultRows(shown,query):shown.map(item=>searchResultRow(kind,item,query)).join('');
  return '<section class="search-result-group" data-result-group="'+kind+'"><div class="search-result-heading"><b>'+SEARCH_CATEGORIES[kind]+' · '+items.length+' 项</b>'+(more&&searchView.category==='all'?'<button type="button" class="link-btn" data-search-category="'+kind+'">查看全部 '+items.length+' 项 →</button>':'')+'</div>'+tools+rows+'<div class="search-result-footer">已显示 '+shown.length+' / '+items.length+' 项'+(more?'<button type="button" class="btn" data-search-more="'+kind+'">加载更多</button>':'')+'</div></section>';
 }).join('');
 return '<div class="search-result-count" role="status">共找到 '+total+' 项匹配结果</div><div class="search-category-tabs">'+tabs+'</div>'+(groups||'<div class="empty">当前分类没有匹配结果。</div>');
}
function rememberSearchPosition(){if(currentPage!=="search"||searchView.restoring)return;searchView.scrollTop=$("#mainScroll").scrollTop;searchView.windowY=window.scrollY}
function restoreSearchPosition(){searchView.restoring=true;requestAnimationFrame(()=>{if(currentPage==="search"){$("#mainScroll").scrollTo({top:searchView.scrollTop,behavior:"auto"});window.scrollTo({top:searchView.windowY,behavior:"auto"})}searchView.restoring=false})}
function changeSearchCategory(category){
 if(category!=="all"&&!Object.hasOwn(SEARCH_CATEGORIES,category))return;
 searchView.category=category;if(category!=="all")searchView.limits[category]=Math.max(20,searchView.limits[category]);searchView.scrollTop=0;searchView.windowY=0;
 $("#searchPageResults").innerHTML=globalResults(globalSearchQuery);restoreSearchPosition();
}
function loadMoreSearch(kind){
 if(!Object.hasOwn(SEARCH_CATEGORIES,kind))return;
 rememberSearchPosition();searchView.limits[kind]+=20;$("#searchPageResults").innerHTML=globalResults(globalSearchQuery);restoreSearchPosition();
}
function changeSearchTaskSort(value){if(!Object.hasOwn(SEARCH_TASK_SORTS,value))return;searchView.taskSort=value;searchView.scrollTop=0;searchView.windowY=0;let results=$("#searchPageResults");if(results)results.innerHTML=globalResults(globalSearchQuery);restoreSearchPosition()}
function toggleSearchProjectGrouping(){searchView.groupTasksByProject=!searchView.groupTasksByProject;searchView.scrollTop=0;searchView.windowY=0;let results=$("#searchPageResults");if(results)results.innerHTML=globalResults(globalSearchQuery);restoreSearchPosition()}
document.addEventListener("scroll",event=>{if(event.target===$("#mainScroll")||event.target===document)rememberSearchPosition()},true);
function renderSearchPage(){
 let value=globalSearchQuery;
 $("#page-search").innerHTML=pageHead("GLOBAL SEARCH","全局搜索","在一个页面中查找并打开事项、项目、里程碑、关键决策与备忘录。",'<button class="btn" type="button" data-close-search-page>关闭搜索</button>')+
 '<div class="search-page-shell"><article class="card search-page-main"><div class="search-page-field"><span aria-hidden="true">⌕</span><input id="searchPageInput" value="'+esc(value)+'" placeholder="输入中文、英文、项目名或下一步行动……" autocomplete="off" enterkeyhint="search"><button class="search-page-clear" type="button" data-clear-search aria-label="清空搜索">×</button></div><div class="search-page-results" id="searchPageResults">'+globalResults(value)+'</div></article><aside class="card search-page-help"><h3>搜索范围</h3><p>事项名称、下一步、备注、项目与里程碑、关键决策、备忘录正文。</p><h3>快捷操作</h3><p><kbd>Ctrl/⌘ K</kbd> 从任意页面进入搜索；<kbd>Esc</kbd> 返回上一页。</p><p>点击任意结果即可进入对应详情，返回时保留关键词、分类、已加载结果和滚动位置。</p></aside></div>';
 let top=$("#globalSearch");if(top&&top.value!==value)top.value=value;restoreSearchPosition();
}
function focusSearchPage(){
 requestAnimationFrame(()=>{let input=$("#searchPageInput");if(!input)return;if(input.value!==globalSearchQuery)input.value=globalSearchQuery;input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length)});
}
function syncSearchInputs(sourceId){
 let top=$("#globalSearch"),page=$("#searchPageInput");if(top&&sourceId!=="globalSearch"&&top.value!==globalSearchQuery)top.value=globalSearchQuery;if(page&&sourceId!=="searchPageInput"&&page.value!==globalSearchQuery)page.value=globalSearchQuery;
}
function updateGlobalSearch(query,sourceId=""){
 let entering=currentPage!=="search",next=String(query??"");if(next!==globalSearchQuery)resetSearchView();globalSearchQuery=next;
 if(entering){searchReturnPage=currentPage;navigate("search");focusSearchPage();return}
 syncSearchInputs(sourceId);let results=$("#searchPageResults");if(results)results.innerHTML=globalResults(globalSearchQuery);restoreSearchPosition();
}
function closeGlobalSearch(){
 resetSearchView();globalSearchQuery="";let top=$("#globalSearch");if(top)top.value="";
 if(currentPage!=="search")return;let page=["today","week","tasks","projects","memos","data"].includes(searchReturnPage)?searchReturnPage:"today";currentPage=page;navigationDepth=Math.max(0,navigationDepth-1);history.replaceState({page,appRoute:true,appNavDepth:navigationDepth},"","#"+page);$("#mainScroll").scrollTo({top:0,behavior:"auto"});requestRender();
}
