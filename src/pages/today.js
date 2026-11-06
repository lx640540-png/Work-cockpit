function pageHead(eyebrow,title,subtitle,actions){return'<div class="page-head"><div><div class="eyebrow">'+esc(eyebrow)+'</div><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div><div class="page-actions">'+(actions||"")+'</div></div>'}
function renderToday(){
 let advance=pinOrdered(todayAdvance(),"today"),waiting=pinOrdered(todayWaiting(),"waiting"),inbox=pinOrdered(inboxTasks(),"inbox");
 let controls=scope=>((scope!=="today"||!state.order.todayGroup)&&state.order[pinKey(scope)]?.length?'<button class="link-btn" data-unpin-all="'+scope+'">'+(scope==='today'?'取消全部先做':'取消所有置顶')+'</button>':'')+'<button class="btn soft" type="button" data-smart-sort="'+scope+'">✦ 智能排序</button>'+(scope==="today"?'<button class="btn soft" type="button" data-toggle-group="today">'+(state.order.todayGroup?"取消项目分组":"按项目分组")+'</button>':"");
 let totalWaiting=waiting.length,due=waiting.filter(task=>isFollowupDue(task));
 let waitingBody=groupedTaskList(waiting,{scope:'waiting',empty:'目前没有等待回复的事项。'});
 $("#page-today").innerHTML=pageHead("TODAY","今天，先做下一步。","先做事项可置顶排序；完成框表示整个事项完成。",'<span class="date-chip">'+new Date().toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"long"})+'</span>')+
 '<div class="today-grid" id="todayGrid"><div class="today-execution today-flow" id="todayExecution" style="--today-left:'+(uiLayout.todayLeft*100).toFixed(2)+'%">'+todayPanelControlsMarkup()+'<div class="today-action-stack"><article class="card drop-card" data-drop-zone="today" data-drop-label="移至今日行动">'+cardHead("今日行动","今天具体做什么；到期事项自动加入",'<button class="btn soft" type="button" data-review-planning="today">检查安排</button>'+controls("today"))+'<div class="drop-hint">移至今日行动</div><div class="items today-task-scroll">'+groupedTaskList(advance,{scope:"today",empty:"今天没有计划推进的事项。",grouped:state.order.todayGroup})+'</div></article>'+quickNoteCard()+'</div>'+
 '<button class="column-resizer" id="todayResizer" type="button" aria-label="调整行动与等待区宽度" data-tip="拖动调整行动与等待区宽度"></button>'+
 '<div class="today-sidebar-stack" style="--waiting-share:'+uiLayout.todayWaitingShare+'"><article class="card drop-card today-waiting" data-drop-zone="waiting" data-drop-label="移至等待与催办">'+cardHead("等待与催办","待催办 "+due.length+" 项 · 等待总数 "+totalWaiting+" 项（含本日已处理）",'<button class="link-btn" type="button" data-open-all-waiting>全部等待 '+totalWaiting+'</button>'+controls("waiting"),"orange")+'<div class="drop-hint">移至等待与催办</div><div class="items today-task-scroll">'+waitingBody+'</div></article>'+
 '<button class="today-sidebar-splitter" id="todaySidebarSplitter" type="button" aria-label="调整等待与催办和临时收件箱高度" data-tip="上下拖动调整两区高度；双击复位"></button><div class="today-capture today-inbox" id="todayCapture"><article class="card drop-card" data-drop-zone="inbox" data-drop-label="移至临时收件箱">'+cardHead("临时收件箱 · "+inbox.length,"先记录，再决定项目、状态和计划日期",'<button class="link-btn" data-action="new-task" data-inbox="1">先记下来 ＋</button>',"orange")+quickCaptureMarkup()+'<div class="items inbox-items">'+groupedTaskList(inbox,{scope:"inbox",empty:"临时收件箱已清空。"})+'</div></article></div></div></div></div>';
 syncTodayPanels();
}

function todayPanelControlsMarkup(){
 return '<button class="today-edge-toggle today-edge-left" type="button" data-today-fold="left" aria-controls="todayActionPane"><span aria-hidden="true">‹</span></button><button class="today-edge-toggle today-edge-right" type="button" data-today-fold="right" aria-controls="todaySidePane"><span aria-hidden="true">›</span></button><output class="today-fold-preview" aria-live="polite" hidden></output>';
}
function syncTodayPanels(){
 const grid=$('#todayExecution');if(!grid)return;
 const collapsed=matchMedia('(max-width:820px)').matches?'':uiLayout.todayCollapsed||'';
 grid.dataset.collapsed=collapsed;
 for(const [side,selector,id] of [['left','.today-action-stack','todayActionPane'],['right','.today-sidebar-stack','todaySidePane']]){
  const pane=grid.querySelector(selector),button=grid.querySelector('[data-today-fold="'+side+'"]');if(!pane||!button)continue;
  const hidden=collapsed===side;pane.id=id;pane.hidden=hidden;pane.inert=hidden;
  const label=(hidden?'恢复':'收起')+(side==='left'?'左栏':'右栏');
  button.setAttribute('aria-label',label);button.setAttribute('aria-expanded',String(!hidden));button.dataset.tip=label;button.title=label;
  button.querySelector('span').textContent=side==='left'?(hidden?'›':'‹'):(hidden?'‹':'›');
 }
 const resizer=grid.querySelector('#todayResizer');
 resizer?.setAttribute('aria-label',collapsed?'拖回恢复'+(collapsed==='left'?'左栏':'右栏'):'调整行动与等待区宽度');
 resizer?.setAttribute('aria-valuenow',String(Math.round(uiLayout.todayLeft*100)/100));
}
function toggleTodayPanel(side){
 if(!['left','right'].includes(side))return;
 uiLayout.todayCollapsed=uiLayout.todayCollapsed===side?'':side;saveUiLayout();syncTodayPanels();scheduleTodayScrollability();schedulePlanningTextareaResize();
}
function previewTodayCollapse(side){
 const grid=$('#todayExecution'),hint=grid?.querySelector('.today-fold-preview');if(!grid||!hint)return;
 grid.dataset.collapsePreview=side||'';hint.hidden=!side;
 hint.textContent=side?.startsWith('restore-')?'松开恢复'+(side.endsWith('left')?'左栏':'右栏'):side?'松开收起'+(side==='left'?'左栏':'右栏'):'';
}
