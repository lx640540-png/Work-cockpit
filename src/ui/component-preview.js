// Preview-only integration. Showcase examples never enter synchronized business data.
let componentPreview={open:false,page:null,focus:null},journalShortcutReturn=null;
const scopedPlanningCards=new WeakMap();
let scopedPlanningPrefs={};try{scopedPlanningPrefs=JSON.parse(localStorage.getItem('work-cockpit-planning-columns-v2')||'{}')}catch{}
let planningRowsObserver=null;const observedPlanningRows=new Set();
function syncPlanningRow(main){
 if(!main.isConnected||!main.getBoundingClientRect().width)return;const label=main.querySelector('.planning-resizable'),card=main.closest('.drop-card,.project-overview-group,.component-task-example,.all-task-list');if(!label||!card)return;
 let width=main.getBoundingClientRect().width,meta=Math.min(210,Math.max(96,Math.round(width*.35))),identity=Math.min(160,Math.max(90,width*.4)),budget=Math.max(0,width-meta-identity-24),preferred=scopedPlanningCards.get(card)?.value||320,effective=Math.min(preferred,budget),hidden=budget<=160;
 if(hidden&&label.dataset.composing==='1')hidden=false;if(hidden&&label.contains(document.activeElement))document.activeElement.blur();
 main.style.setProperty('--planning-meta-width',meta+'px');main.style.setProperty('--planning-editor-effective-width',effective+'px');main.style.setProperty('--planning-editor-opacity',Math.max(0,Math.min(1,(budget-160)/16)));main.classList.toggle('is-editor-hidden',hidden);label.setAttribute('aria-hidden',String(hidden));
 label.querySelectorAll('textarea,[data-scoped-planning]').forEach(node=>node.tabIndex=hidden?-1:0);
}
function initScopedPlanningResize(root=document){
 if(!planningRowsObserver)planningRowsObserver=new ResizeObserver(entries=>entries.forEach(entry=>syncPlanningRow(entry.target)));
 for(const row of observedPlanningRows)if(!row.isConnected){planningRowsObserver.unobserve(row);observedPlanningRows.delete(row)}
 root.querySelectorAll('.overview-next-label').forEach(label=>{
  let card=label.closest('.drop-card,.project-overview-group,.component-task-example,.all-task-list');if(!card)return;
  let key=card.closest('#componentPreview')?'showcase':card.matches('.all-task-list')?'all:tasks':card.dataset.overviewProject!==undefined?'project:'+card.dataset.overviewProject:'week:'+(card.dataset.dropZone||'actions');
  if(!scopedPlanningCards.has(card)){let value=Math.max(160,Math.min(640,Number(scopedPlanningPrefs[key])||320));scopedPlanningCards.set(card,{key,value});card.style.setProperty('--planning-editor-width',value+'px')}
  let pref=scopedPlanningCards.get(card),main=label.closest('.ui-planning-row');label.classList.add('planning-resizable');
  if(!label.querySelector('[data-scoped-planning]')){
   let handle=document.createElement('span');Object.assign(handle.dataset,{planningResize:'',scopedPlanning:'',tip:'调整当前卡片的下一步列；双击复位'});handle.className='planning-width-handle';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整下一步列宽度');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-valuemin','160');handle.setAttribute('aria-valuemax','640');label.append(handle);
   bindUiSplitter(handle,{read:()=>pref.value,write:value=>{pref.value=value;card.style.setProperty('--planning-editor-width',value+'px');card.querySelectorAll('[data-scoped-planning]').forEach(node=>node.setAttribute('aria-valuenow',Math.round(value)));card.querySelectorAll('.ui-planning-row').forEach(syncPlanningRow);schedulePlanningTextareaResize()},min:160,max:640,step:16,reset:320,position:event=>event.clientX-label.getBoundingClientRect().left,commit:()=>{if(key==='showcase')return;scopedPlanningPrefs[key]=pref.value;try{localStorage.setItem('work-cockpit-planning-columns-v2',JSON.stringify(scopedPlanningPrefs))}catch{}}});handle.setAttribute('aria-valuenow',Math.round(pref.value));
   label.addEventListener('compositionstart',()=>label.dataset.composing='1');label.addEventListener('compositionend',()=>{label.dataset.composing='0';syncPlanningRow(main)});
  }
  if(main){if(!observedPlanningRows.has(main)){observedPlanningRows.add(main);planningRowsObserver.observe(main)}syncPlanningRow(main)}
 });
}
function journalMountAboveModal(){
 let panel=$('#workJournal');if(!panel)return;if(!journalUI.open){syncTaskJournalLayout();return;}
 if($('#workflowDialog')?.open){if(panel.parentElement!==document.body)document.body.appendChild(panel);return;}
 let modal=[...document.querySelectorAll('dialog[open]')].filter(node=>!panel.contains(node)&&!node.matches('.journal-copy-dialog')).at(-1),host=expandedRichBox&&(!modal||modal.contains(expandedRichBox))?expandedRichBox:modal||document.body;
 if(panel.parentElement!==host){let active=panel.contains(document.activeElement)?document.activeElement:null;host.appendChild(panel);active?.focus({preventScroll:true})}journalLayout();
}
function toggleJournalShortcut(){
 initWorkJournal();let panel=$('#workJournal');
 if(journalUI.open){
  let active=document.activeElement;if(panel.contains(active))active.blur();
  if(!journalFlush())return;
  journalCloseCalendar();journalUI.open=false;journalRemember();syncWorkJournal();if(panel.parentElement!==document.body)document.body.appendChild(panel);
  if(journalShortcutReturn?.isConnected)journalShortcutReturn.focus({preventScroll:true});journalShortcutReturn=null;
 }else{
  journalShortcutReturn=document.activeElement;journalUI.open=true;syncWorkJournal();journalMountAboveModal();
 }
}
window.addEventListener('keydown',event=>{
 if(!VISUAL_PREVIEW_ENABLED)return;
 // Physical key, intentionally valid in all editable fields and during composition.
 if(event.code==='Backquote'){
  event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;toggleJournalShortcut();return;
 }
 if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.isComposing&&['Digit1','Digit2','Digit3'].includes(event.code)){
  let editor=event.target.closest?.('.rich-editor');if(!editor||!quillFor(editor)?.isEnabled())return;
  event.preventDefault();event.stopImmediatePropagation();applyRichCommand({Digit1:'heading2',Digit2:'heading3',Digit3:'paragraph'}[event.code],editor);
 }
},true);
if(VISUAL_PREVIEW_ENABLED){
 new MutationObserver(()=>{if(journalUI.open)journalMountAboveModal();else syncTaskJournalLayout()}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 document.addEventListener('focusin',event=>{let editor=event.target.closest?.('#workJournal [data-journal-review]');if(editor)journalUI.lastReview=editor.dataset.journalReview});
}
function componentPreviewMarkup(){
 let sample={...state.tasks[0],id:'component-example',title:'核对样机供电与测试条件，补充复测结论',nextAction:'记录测试条件与验证结果',project:state.projects[0]?.id||'',status:'进行中',priority:'P1',type:'任务',focus:false,week:true,planDate:todayKey(),due:'',completed:''};
 return '<div class="component-preview-content">'+uiSectionHeading('<div><p class="eyebrow">COMPONENTS</p><h1 tabindex="-1">组件展示</h1><p class="muted">与工作台共用任务条、侧栏项、编辑器和分割线；在这里检查状态、内容和窄栏适配。</p></div>','<button type="button" class="btn" data-component-back>返回工作台</button>','component-preview-head')+
 '<div class="component-preview-controls"><label>示例宽度 <input type="range" min="340" max="1120" value="1000" data-component-width><output>1000px</output></label><label>列表状态 <select data-component-state><option value="normal">普通</option><option value="hover">悬停</option><option value="selected">选中</option><option value="disabled">禁用</option></select></label><span>真实悬停、Tab聚焦及拖动也可直接操作</span></div>'+
 '<section class="component-example"><h2>按钮与业务状态</h2><div class="component-control-row"><button class="btn primary">主要操作</button><button class="btn">次要操作</button><button class="link-btn">轻量操作</button><button class="btn danger">删除</button><button class="btn" disabled>暂不可用</button></div><div class="component-control-row">'+['进行中','已完成','等待','暂停'].map(status=>propertyButton({...sample,status},'status',true)).join('')+['P0','P1','P2'].map(priority=>propertyButton({...sample,priority},'priority',true)).join('')+'</div></section>'+
 '<section class="component-example"><h2>任务条与编辑列</h2><p class="muted">拖动输入区右侧分割线只调整本卡片；缩窄容器可检查预览收起与属性换行。</p><div class="component-width-frame"><div class="component-task-example drop-card" data-component-frame>'+taskRow(sample,{scope:'week'})+'</div></div></section>'+
 '<section class="component-example"><h2>共用侧栏列表项：项目与备忘录</h2><div class="component-memo-example" data-component-frame>'+projectListItem({...state.projects[0],name:'样机验证与交付'},{current:true,pinned:true})+'</div><div class="component-memo-example" data-component-frame>'+memoListItem({id:'component-memo',title:'样机验证前的检查',project:sample.project,updatedAt:new Date().toISOString(),pinned:true,content:''},{current:true,selected:false,selecting:false})+'</div></section>'+
 '<section class="component-example"><h2>执行任务条与就地操作</h2><p class="muted">完成框表示整个事项完成；安排操作在任务详情中完成，工作记录也从详情进入。属性保持可见，置顶固定在最右侧。</p><div class="component-width-frame"><div class="component-task-example drop-card" data-component-frame>'+taskRow(sample,{scope:'today'})+'</div></div></section>'+
 '<section class="component-example"><h2>拖动手柄与插入位置</h2><div class="component-sort-example">'+['确认测试条件','记录实测数据','整理验证结论'].map((title,index)=>'<div class="ui-list-item component-sort-row" data-component-sort="'+index+'">'+uiDragHandle('draggable="true" data-component-drag="'+index+'"')+'<span>'+title+'</span></div>').join('')+'</div></section>'+
 '<section class="component-example"><h2>富文本与标题快捷键</h2><p class="muted">Alt+1 二级标题 · Alt+2 三级标题 · Alt+3 正文。Esc下方按键可随时打开／收回工作记录。</p><div class="editor-box component-rich-example">'+toolbar()+'<div class="rich-editor" data-component-editor contenteditable="true"><h2>验证记录</h2><p>直接编辑这一段，检查工具栏、列表和段落移动。</p><ol><li>核对供电条件</li><li>记录复测结论</li></ol></div></div></section>'+
 '<section class="component-example"><h2>可调整分栏</h2><div class="component-split-example"><div>左侧内容区</div><button class="ui-splitter" type="button" role="separator" aria-label="调整示例分栏" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="75" aria-valuenow="50"></button><div>右侧内容区</div></div><p class="muted">支持拖动、方向键及双击复位。</p></section>'+
 '<section class="component-example"><h2>空内容、无结果与只读</h2><div class="component-empty-grid"><div class="empty">还没有记录<br><small>添加日期后开始记录。</small></div><div class="empty">没有匹配结果<br><small>可以调整关键词或筛选。</small></div><div class="empty">历史周只读<br><small>内容可阅读、复制。</small></div></div></section></div>';
}
function layoutComponentPreview(){
 let box=$('#componentPreview');if(!box||!componentPreview.open)return;
 let main=$('.main').getBoundingClientRect(),bar=$('.topbar').getBoundingClientRect(),top=Math.max(main.top,bar.bottom);Object.assign(box.style,{left:main.left+'px',top:top+'px',width:main.width+'px',height:Math.max(0,Math.min(innerHeight,main.bottom)-top)+'px'});
}
function initComponentPreview(){
 if($('#componentPreview'))return;let box=document.createElement('section');box.id='componentPreview';box.hidden=true;box.setAttribute('aria-label','组件展示');document.body.appendChild(box);
 box.addEventListener('click',event=>{
  event.stopPropagation();let button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-component-back'))return toggleComponentPreview(false);
  if(button.dataset.command)return applyRichCommand(button.dataset.command,button);
  if(button.dataset.property){let field=button.dataset.property,values=field==='status'?statuses:priorities,index=values.findIndex(value=>button.classList.contains((field==='status'?'status-':'priority-')+value)),value=values[(index+1)%values.length];button.className='property-btn '+(field==='status'?'status-':'priority-')+value;button.textContent=value+'⌄';return}
  if(button.matches('.pin-task,.memo-pin,.favorite')){let active=button.classList.toggle('active');button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'取消置顶':'置顶');return}
  if(button.matches('.check')){button.classList.toggle('done');button.textContent=button.classList.contains('done')?'✓':''}
 });
 box.addEventListener('input',event=>{event.stopPropagation();let node=event.target;if(node.hasAttribute('data-component-width')){box.style.setProperty('--component-example-width',node.value+'px');node.nextElementSibling.textContent=node.value+'px'}if(node.hasAttribute('data-component-state')){box.querySelectorAll('.ui-list-item').forEach(row=>{row.dataset.uiState=node.value;row.querySelectorAll('button,input,textarea,[data-scoped-planning]').forEach(control=>{let disabled=node.value==='disabled';control.disabled=disabled;if(control.hasAttribute('data-scoped-planning')){control.setAttribute('aria-disabled',String(disabled));control.tabIndex=disabled?-1:0}})})}});
 box.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'&&!expandedRichBox){event.preventDefault();toggleComponentPreview(false)}});
 let dragging=null;box.addEventListener('dragstart',event=>{event.stopPropagation();let handle=event.target.closest('[data-component-drag]');if(!handle)return;dragging=handle.closest('[data-component-sort]');dragging.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','component-sort')});
 box.addEventListener('dragover',event=>{event.stopPropagation();let row=event.target.closest('[data-component-sort]');if(!row||!dragging||row===dragging)return;event.preventDefault();box.querySelectorAll('.drag-before,.drag-after').forEach(n=>n.classList.remove('drag-before','drag-after'));markDropPosition(row,event)});
 box.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();let row=event.target.closest('[data-component-sort]');if(row&&dragging&&row!==dragging)row.parentElement.insertBefore(dragging,row.dataset.dropPosition==='after'?row.nextSibling:row);box.querySelectorAll('.dragging,.drag-before,.drag-after').forEach(n=>n.classList.remove('dragging','drag-before','drag-after'));dragging=null});
 box.addEventListener('dragend',event=>{event.stopPropagation();box.querySelectorAll('.dragging,.drag-before,.drag-after').forEach(n=>n.classList.remove('dragging','drag-before','drag-after'));dragging=null});
}
function toggleComponentPreview(open=!componentPreview.open){
 if(!VISUAL_PREVIEW_ENABLED)return;initComponentPreview();let box=$('#componentPreview'),button=$('[data-preview-components]'),main=$('#mainScroll');
 if(open===componentPreview.open)return;
 if(open){
  if(!journalFlush())return;componentPreview.page=currentPage;componentPreview.focus=document.activeElement;
  if(!box.firstElementChild){box.innerHTML=componentPreviewMarkup();initQuillEditors(box);initScopedPlanningResize(box);let split=box.querySelector('.component-split-example'),grip=split.querySelector('[role=separator]'),value=.5;bindUiSplitter(grip,{read:()=>value,write:next=>{value=next;split.style.setProperty('--sample-left',value*100+'%');grip.setAttribute('aria-valuenow',Math.round(value*100))},min:.25,max:.75,reset:.5,position:event=>{let rect=split.getBoundingClientRect();return(event.clientX-rect.left)/rect.width}})}
  componentPreview.open=true;main.inert=true;main.setAttribute('aria-hidden','true');box.hidden=false;layoutComponentPreview();box.querySelector('h1').focus({preventScroll:true});
 }else{if(expandedRichBox?.closest('#componentPreview'))closeRichExpanded(false);componentPreview.open=false;box.hidden=true;main.inert=false;main.removeAttribute('aria-hidden');if(componentPreview.focus?.isConnected)componentPreview.focus.focus({preventScroll:true})}
 button?.setAttribute('aria-pressed',String(open));
}
window.addEventListener('resize',layoutComponentPreview);
document.addEventListener('click',event=>{if(componentPreview.open&&event.target.closest('.nav-button,[data-page]'))toggleComponentPreview(false)},true);
