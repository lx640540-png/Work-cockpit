function searchRank(primary,secondary,q,inactive=false){let title=String(primary||"").normalize("NFKC").toLocaleLowerCase("zh-CN"),rest=String(secondary||"").normalize("NFKC").toLocaleLowerCase("zh-CN"),score=title===q?120:title.startsWith(q)?90:title.includes(q)?65:rest.includes(q)?35:0;return score-(inactive?8:0)}
function globalResults(query){
 let q=String(query||"").normalize("NFKC").trim().toLocaleLowerCase("zh-CN");if(!q)return'<div class="empty">输入关键词搜索项目、事项、里程碑、决策和备忘录。</div>';
 let rows=[],rank=(items,primary,secondary,inactive,limit)=>items.map(item=>({item,score:searchRank(primary(item),secondary(item),q,inactive(item))})).filter(value=>value.score>0).sort((a,b)=>b.score-a.score||String(b.item.updatedAt||"").localeCompare(String(a.item.updatedAt||""))).slice(0,limit).map(value=>value.item);
 rank(state.tasks,task=>task.title,task=>{let project=projectById(task.project),milestone=milestoneOf(task,project);return[task.nextAction,strip(task.notes),task.status,task.priority,project?.name,project?.code,milestone?.name].join(" ")},task=>task.archived||isDone(task),10).forEach(task=>{let project=projectById(task.project),milestone=milestoneOf(task,project),stateLabel=task.archived?"已归档":task.status;rows.push('<button class="data-item" style="width:100%;text-align:left" data-search-task="'+task.id+'"><span><b>事项 · '+esc(task.title)+'</b><small>'+esc([stateLabel,project?.code,project?.name,milestone?.name,task.nextAction].filter(Boolean).join(" · "))+'</small></span><span>↗</span></button>')});
 rank(state.projects,project=>project.name,project=>[project.code,project.description,...project.milestones.flatMap(item=>[item.name,item.criteria])].join(" "),project=>project.archived,8).forEach(project=>rows.push('<button class="data-item" style="width:100%;text-align:left" data-search-project="'+project.id+'"><span><b>项目 · '+esc(project.name)+'</b><small>'+esc([project.archived?"已归档":"进行中",project.code,currentMilestone(project)?.name||"暂无里程碑"].filter(Boolean).join(" · "))+'</small></span><span>↗</span></button>'));
 rank(state.decisions,decision=>decision.title,decision=>[strip(decision.conclusion),strip(decision.rationale),projectName(decision.project)].join(" "),decision=>decision.archived,6).forEach(decision=>rows.push('<button class="data-item" style="width:100%;text-align:left" data-search-decision="'+decision.id+'"><span><b>决策 · '+esc(decision.title)+'</b><small>'+esc([decision.archived?"已归档":"有效",projectName(decision.project),strip(decision.conclusion)].filter(Boolean).join(" · "))+'</small></span><span>↗</span></button>'));
 rank(state.memos,memo=>memo.title,memo=>[strip(memo.content),projectName(memo.project)].join(" "),memo=>memo.archived,6).forEach(memo=>rows.push('<button class="data-item" style="width:100%;text-align:left" data-search-memo="'+memo.id+'"><span><b>备忘录 · '+esc(memo.title)+'</b><small>'+esc([memo.archived?"已归档":"进行中",projectName(memo.project),strip(memo.content).slice(0,80)].filter(Boolean).join(" · "))+'</small></span><span>↗</span></button>'));
 return rows.join("")||'<div class="empty">没有匹配结果。</div>';
}
function renderSearchPage(){
 let value=globalSearchQuery;
 $("#page-search").innerHTML=pageHead("GLOBAL SEARCH","全局搜索","在一个页面中查找并打开事项、项目、里程碑、关键决策与备忘录。",'<button class="btn" type="button" data-close-search-page>关闭搜索</button>')+
 '<div class="search-page-shell"><article class="card search-page-main"><div class="search-page-field"><span aria-hidden="true">⌕</span><input id="searchPageInput" value="'+esc(value)+'" placeholder="输入中文、英文、项目名或下一步行动……" autocomplete="off" enterkeyhint="search"><button class="search-page-clear" type="button" data-clear-search aria-label="清空搜索">×</button></div><div class="search-page-results" id="searchPageResults">'+globalResults(value)+'</div></article><aside class="card search-page-help"><h3>搜索范围</h3><p>事项名称、下一步、备注、项目与里程碑、关键决策、备忘录正文。</p><h3>快捷操作</h3><p><kbd>Ctrl/⌘ K</kbd> 从任意页面进入搜索；<kbd>Esc</kbd> 返回上一页。</p><p>点击任意结果即可进入对应详情，返回时仍保留本次关键词。</p></aside></div>';
 let top=$("#globalSearch");if(top&&top.value!==value)top.value=value;
}
function focusSearchPage(){
 requestAnimationFrame(()=>{let input=$("#searchPageInput");if(!input)return;if(input.value!==globalSearchQuery)input.value=globalSearchQuery;input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length)});
}
function syncSearchInputs(sourceId){
 let top=$("#globalSearch"),page=$("#searchPageInput");if(top&&sourceId!=="globalSearch"&&top.value!==globalSearchQuery)top.value=globalSearchQuery;if(page&&sourceId!=="searchPageInput"&&page.value!==globalSearchQuery)page.value=globalSearchQuery;
}
function updateGlobalSearch(query,sourceId=""){
 let entering=currentPage!=="search";globalSearchQuery=String(query??"");
 if(entering){searchReturnPage=currentPage;navigate("search");focusSearchPage();return}
 syncSearchInputs(sourceId);let results=$("#searchPageResults");if(results)results.innerHTML=globalResults(globalSearchQuery);
}
function closeGlobalSearch(){
 globalSearchQuery="";let top=$("#globalSearch");if(top)top.value="";
 if(currentPage!=="search")return;let page=["today","week","tasks","projects","memos","data"].includes(searchReturnPage)?searchReturnPage:"today";currentPage=page;navigationDepth=Math.max(0,navigationDepth-1);history.replaceState({page,appRoute:true,appNavDepth:navigationDepth},"","#"+page);$("#mainScroll").scrollTo({top:0,behavior:"auto"});requestRender();
}

