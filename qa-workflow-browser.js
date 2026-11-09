const switchProjectView = require('./scripts/qa-project-view');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
let browser, server, origin;
const today='2026-09-05', future='2026-09-09';
const makeTask=(id,extra={})=>({id,title:`事项 ${id}`,status:'进行中',type:'任务',priority:'P1',
  focus:false,week:false,inbox:false,archived:false,planDate:'',followup:future,notes:'',nextAction:'确认文档进度',...extra});

before(async()=>{
  server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
    if(!['index.html','vendor/quill-2.0.3/quill.js','vendor/quill-2.0.3/quill.core.css'].includes(name)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8');
    fs.createReadStream(path.join(__dirname,name)).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});

async function fixture(t,tasks,{time='2026-09-05T12:00:00',route='today',projects=[]}={}){
  const context=await browser.newContext({viewport:{width:1600,height:1000},timezoneId:'Asia/Shanghai'});
  t.after(()=>context.close());
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  t.after(()=>assert.deepEqual(errors,[]));
  await page.clock.install({time:new Date(time+'+08:00')});
  await page.addInitScript(({tasks,projects})=>{
    localStorage.setItem('work-cockpit-local-mode-v1','1');
    localStorage.setItem('work-cockpit-visual-preview-v1',JSON.stringify({mode:'old'}));
    if(!localStorage.getItem('work-cockpit-v6'))localStorage.setItem('work-cockpit-v6',JSON.stringify({version:8,tasks,projects,memos:[],
      meta:{activeWeekKey:'2026-08-31'},weeks:{'2026-08-24':{closedAt:'2026-08-30',top:['历史目标'],taskSnapshots:[{id:'historical',title:'历史事项',status:'暂停',type:'任务',focus:true,planDate:'2026-08-24'}]}},order:{long:tasks.map(t=>t.id)}}));
  },{tasks,projects});
  await page.goto(origin+'/index.html#'+route);
  await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'));
  return page;
}
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')));
test('memo panes fit viewport and scroll independently; navigation restores main scrolling',async t=>{
 const page=await fixture(t,[]);
 await page.evaluate(()=>{state.memos=Array.from({length:30},(_,i)=>normalizeMemo({id:'m'+i,title:'备忘录 '+i,content:'<p>内容</p>'.repeat(100)}));navigate('memos')});
 await page.waitForSelector('.memo-editor-body .ql-editor');
 for(const viewport of [{width:1600,height:900},{width:1280,height:640},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  if(viewport.width<820){await page.click('[data-memo-pane="list"]');assert(await page.locator('.memo-list').evaluate(n=>{n.scrollTop=160;return n.scrollTop>0}));await page.click('[data-memo-pane="editor"]');}
  const geometry=await page.evaluate(()=>{const main=document.querySelector('#mainScroll'),list=document.querySelector('.memo-list'),editor=document.querySelector('.memo-editor-body .ql-editor');list.scrollTop=160;editor.scrollTop=180;return{mainOverflow:main.scrollHeight-main.clientHeight,overflow:getComputedStyle(main).overflowY,list:list.scrollTop,editor:editor.scrollTop,bottom:document.querySelector('.memo-layout').getBoundingClientRect().bottom,height:innerHeight,body:document.documentElement.scrollHeight-innerHeight}});
  assert.equal(geometry.overflow,'hidden');assert(geometry.mainOverflow<=2,JSON.stringify(geometry));assert(geometry.body<=2,JSON.stringify(geometry));assert(geometry.bottom<=geometry.height,JSON.stringify(geometry));if(viewport.width>=820)assert(geometry.list>0);assert(geometry.editor>0);
 }
 await page.setViewportSize({width:1600,height:900});await page.click('[data-page="today"]');await page.waitForFunction(()=>!document.body.classList.contains('memo-workspace'));assert.equal(await page.locator('body.memo-workspace').count(),0);
 assert.equal(await page.locator('#mainScroll').evaluate(n=>getComputedStyle(n).overflowY),'auto');
});
test('project cards show completed count and status colors differ in both themes',async t=>{
 const page=await fixture(t,[makeTask('a',{project:'p'}),makeTask('b',{project:'p',status:'已完成'})],{projects:[{id:'p',name:'项目名称',milestones:[]}],route:'projects'});
 await switchProjectView(page,'detail');assert.equal(await page.locator('.project-completion strong').textContent(),'1');assert.equal(await page.locator('.project-list-milestone,.project-list-item .progress').count(),0);
 await page.click('[data-favorite-project="p"]');assert.deepEqual((await stored(page)).favorites,['p']);
 for(const theme of ['light','dark']){
  const colors=await page.evaluate(theme=>{applyTheme(theme);const a=document.createElement('span'),b=document.createElement('span');a.className='pill status-进行中';b.className='pill status-已完成';document.body.append(a,b);const colors=[a,b].map(n=>getComputedStyle(n).backgroundColor);a.remove();b.remove();return colors},theme);assert.notEqual(colors[0],colors[1]);
 }
});
test('Obsidian link persists and rejects unrelated URL schemes',async t=>{
 const page=await fixture(t,[makeTask('a')]);await edit(page,'a');
 const uri='obsidian://open?vault=Work&file=%E7%AC%94%E8%AE%B0';await page.click('[data-edit-obsidian]');await page.fill('#taskObsidianUri',uri);assert.equal(await page.inputValue('#taskObsidianUri'),uri,'input before save');await save(page);assert.equal((await stored(page)).tasks.find(t=>t.id==='a').obsidianUri,uri,'stored after save');await page.reload();assert.equal((await stored(page)).tasks.find(t=>t.id==='a').obsidianUri,uri,'stored after reload');await edit(page,'a');assert.equal(await page.inputValue('#taskObsidianUri'),uri,'reopened input');
 await page.click('[data-edit-obsidian]');await page.fill('#taskObsidianUri','javascript:window.badLink=true');await page.click('[data-open-obsidian]');assert.equal(await page.evaluate(()=>window.badLink),undefined);assert.match(await page.locator('#toast').textContent(),/obsidian/i);
});
test('dropping files saves the current draft and ignores ordinary text drags',async t=>{
 const page=await fixture(t,[makeTask('a'),makeTask('b')]);await edit(page,'a');await page.fill('#taskTitle','已编辑的标题');
 await page.evaluate(()=>{window.uploadCalls=[];Cloud.user={id:'test'};Cloud.client={};Cloud.uploadAttachments=async(id,files)=>{window.uploadCalls.push({id,names:files.map(f=>f.name),title:taskById(id).title})};const data=new DataTransfer();data.items.add(new File(['test'],'说明.txt',{type:'text/plain'}));document.querySelector('#taskNotes').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}))});
 assert.deepEqual(await page.evaluate(()=>window.uploadCalls),[{id:'a',names:['说明.txt'],title:'已编辑的标题'}]);
 await page.evaluate(()=>{openTask('b');const data=new DataTransfer();data.setData('text/plain','ordinary text');document.querySelector('#taskNotes').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}))});assert.equal(await page.evaluate(()=>window.uploadCalls.length),1);
 await page.evaluate(()=>{Cloud.user=null;Cloud.client=null});
});
async function save(page){await page.click('#saveTaskButton');await page.waitForFunction(()=>!document.querySelector('#taskDialog').open);}
async function edit(page,id){await page.click('[data-page="tasks"]');await page.click('#page-tasks [data-open-task="'+id+'"]');await page.waitForFunction(()=>document.activeElement?.id==='taskTitle');}

test('due plans light flags on load/reload; excluded states and historical flags remain unchanged',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('due',{planDate:today}),makeTask('long',{type:'长期跟进',planDate:today}),
    ...['等待','暂停','已完成','待处理'].map((status,i)=>makeTask('excluded'+i,{status,planDate:today})),makeTask('archived',{archived:true,planDate:today})],{route:'tasks'});
  let data=await stored(page);
  for(const id of ['due','long']){assert.equal(data.tasks.find(t=>t.id===id).focus,true);assert.equal(await page.locator('#page-tasks .task-row[data-task="'+id+'"]').count(),1);}
  assert.equal(await page.locator('#page-tasks .task-table').count(),0);
  assert.equal(await page.locator('#page-tasks .all-task-group').count(),1);
  for(const task of data.tasks.filter(t=>!['due','long'].includes(t.id)))assert.equal(task.focus,false);
  assert.equal(data.weeks['2026-08-24'].taskSnapshots[0].focus,true,'historical paused task was rewritten');
  await page.reload();data=await stored(page);assert.equal(data.tasks.find(t=>t.id==='due').focus,true);
});

test('rescheduling in details removes Today immediately and persists the change',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('due',{focus:true,week:true,planDate:today})]);
  await edit(page,'due');await page.fill('#draftPlanDate',future);await page.locator('#draftPlanDate').press('Tab');
  assert.equal(await page.locator('#draftFocus').isChecked(),false);
  await save(page);let task=(await stored(page)).tasks[0];
  assert.equal(task.focus,false);assert.equal(task.week,true);assert.equal(task.planDate,future);assert.equal(task.followup,future);
  await page.click('[data-page="today"]');await page.locator('#page-today.active').waitFor({state:'visible'});await page.locator('[data-drop-zone="today"] .task-row[data-task="due"]').waitFor({state:'detached'});
  await page.reload();assert.equal((await stored(page)).tasks[0].focus,false);
});

test('midnight activates a future long-term plan without altering its type or old week',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('next',{type:'长期跟进',planDate:'2026-09-06'})],{time:'2026-09-05T23:59:30'});
  const history=JSON.stringify((await stored(page)).weeks['2026-08-24']);
  assert.equal((await stored(page)).tasks[0].focus,false);
  await page.clock.setFixedTime(new Date('2026-09-06T00:00:31+08:00'));await page.clock.runFor(61000);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks[0].focus);
  const data=await stored(page);assert.equal(data.tasks[0].type,'长期跟进');assert.equal(JSON.stringify(data.weeks['2026-08-24']),history);
  await page.locator('[data-drop-zone="today"] .task-row[data-task="next"]').waitFor({state:'visible'});
});

test('real pointer sorting inside long-term preserves follow-up, plan, state and pinning',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('a',{type:'长期跟进',planDate:future}),makeTask('b',{type:'长期跟进',planDate:future})],{route:'week'});
  const before=(await stored(page)).tasks.find(t=>t.id==='a');
  const source=page.locator('[data-drag-handle="long"][data-task="a"]'),target=page.locator('[data-drop-zone="long"] .task-row[data-task="b"]');
  await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
  const from=await source.boundingBox(),to=await target.boundingBox();assert(from&&to);
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
  await page.mouse.move(from.x+from.width/2+8,from.y+from.height/2+8,{steps:4});
  await page.mouse.move(to.x+to.width/2,to.y+to.height*.9,{steps:20});await page.mouse.up();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).order.long.join(',')==='b,a');
  const after=(await stored(page)).tasks.find(t=>t.id==='a');
  for(const field of ['followup','planDate','status','type','week','focus'])assert.equal(after[field],before[field],field);
  await page.reload();assert.equal((await stored(page)).order.long.join(','),'b,a');
});

test('detail status changes save normally and legacy repeat rules never generate tasks',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('repeat',{repeat:'daily',planDate:today}),makeTask('other')]);
  await edit(page,'repeat');
  // Select the actual native value through its accessible enhanced control.
  await page.locator('#draftStatus').evaluate(select=>{select.value='等待';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await save(page);assert.equal((await stored(page)).tasks.find(t=>t.id==='repeat').focus,false);
  await edit(page,'repeat');await page.check('#draftFocus');await save(page);
  assert.equal((await stored(page)).tasks.find(t=>t.id==='repeat').status,'进行中');
  await edit(page,'repeat');
  await page.locator('#draftStatus').evaluate(select=>{select.value='已完成';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await save(page);const data=await stored(page);
  assert.equal(data.tasks.find(t=>t.id==='repeat').status,'已完成');assert(data.tasks.some(t=>t.id==='other'));
  assert.equal(data.tasks.length,2,'retired repeat rules must not generate another occurrence');
  assert.equal(await page.locator('#draftRepeat,#draftRepeatUntil').count(),0);
  assert.equal(new Set(data.tasks.map(t=>t.id)).size,data.tasks.length);
});

test('task titles open details and drafts save automatically before backdrop or Escape closes',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('auto',{focus:true,nextAction:'旧的下一步'})]);
  await page.click('[data-drop-zone="today"] [data-task="auto"] .task-secondary-link');
  await page.locator('#taskDialog[open]').waitFor({state:'visible'});
  await page.fill('#taskNext','自动保存后的下一步');
  await page.clock.fastForward(750);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task=>task.id==='auto')?.nextAction==='自动保存后的下一步');
  assert.equal(await page.locator('#taskDialog').getAttribute('open'),'');
  assert.match(await page.locator('#taskAutosaveStatus').textContent(),/已自动保存/);
  await page.fill('#taskTitle','点击外部保存标题');
  await page.mouse.click(2,2);
  await page.waitForFunction(()=>!document.querySelector('#taskDialog')?.open);
  assert.equal((await stored(page)).tasks.find(task=>task.id==='auto').title,'点击外部保存标题');

  await edit(page,'auto');
  await page.fill('#taskTitle','');
  await page.mouse.click(2,2);
  assert.equal(await page.locator('#taskDialog').getAttribute('open'),'','invalid draft must remain open');
  assert.match(await page.locator('#taskAutosaveStatus').textContent(),/请先填写事项名称/);
  await page.fill('#taskTitle','恢复后的标题');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#taskDialog').getAttribute('open'),'');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#taskDialog')?.open);
  assert.equal((await stored(page)).tasks.find(task=>task.id==='auto').title,'恢复后的标题');

  const countBefore=(await stored(page)).tasks.length;
  await page.keyboard.press('n');
  await page.locator('#taskDialog[open]').waitFor({state:'visible'});
  await page.mouse.click(2,2);
  await page.waitForFunction(()=>!document.querySelector('#taskDialog')?.open);
  assert.equal((await stored(page)).tasks.length,countBefore,'blank quick capture created an empty task');
});

const projectFixture=[{id:'p1',name:'项目甲',milestones:[]},{id:'p2',name:'尚未安排的项目',milestones:[]}];
test('project overview edits original tasks, retains empty projects and schedules long-term work',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('long',{type:'长期跟进',project:'p1',nextAction:'发出目录确认',notes:'<p>收到初稿，等待目录确认。</p>'}),makeTask('paused',{project:'p1',status:'暂停'})],{route:'projects',projects:projectFixture});
 assert.equal(await page.locator('[data-overview-project]').count(),2);
 assert.equal(await page.locator('[data-overview-project="p1"] .task-row[data-task="paused"]').count(),1);
 const row=page.locator('[data-overview-project="p1"] .task-row[data-task="long"]');
 const overviewGeometry=await row.evaluate(row=>{const n=row.getBoundingClientRect();return{height:n.height,overflow:row.scrollWidth-row.clientWidth}});
 assert(overviewGeometry.height<150&&overviewGeometry.overflow<=1,JSON.stringify(overviewGeometry));
 await row.locator('[data-open-task="long"]').click();await page.check('#draftWeek');await save(page);
 await page.clock.runFor(250);
 let data=await stored(page);assert.equal(data.tasks.length,2);assert.equal(data.tasks[0].type,'长期跟进');assert.equal(data.tasks[0].week,true);
 assert.equal(data.weeks['2026-08-31'].actions.long.text,undefined);
 const longNext='需要等外壳一起寄送，先整理清单以及需要提前处理的事项，再联系供应商确认寄送时间，并把确认结果更新到项目记录中。';
 await page.locator('[data-overview-next="long"]').fill(longNext);
 const overviewTextarea=await page.locator('[data-overview-next="long"]').evaluate(node=>{const box=node.getBoundingClientRect(),parent=node.parentElement.getBoundingClientRect();return{clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,width:box.width,parentWidth:parent.width-parseFloat(getComputedStyle(node.parentElement).paddingRight||0),overflowY:getComputedStyle(node).overflowY,resize:getComputedStyle(node).resize}});
 assert(overviewTextarea.width>=overviewTextarea.parentWidth-2&&overviewTextarea.clientHeight<=120&&overviewTextarea.clientHeight>0&&['hidden','auto'].includes(overviewTextarea.overflowY)&&overviewTextarea.resize==='none',JSON.stringify(overviewTextarea));
 await page.locator('[data-overview-next="long"]').fill('根据反馈修改目录');await page.locator('[data-overview-next="long"]').press('Tab');await page.clock.fastForward(250);
 data=await stored(page);assert.equal(data.tasks[0].nextAction,'根据反馈修改目录');assert.equal(data.weeks['2026-08-31'].actions.long.text,undefined);
 await row.locator('[data-quick-date="long"]').click();await page.fill('#quickTaskDate',future);await page.click('[data-apply-task-date]');
 data=await stored(page);assert.equal(data.tasks[0].planDate,future);assert.equal(data.tasks[0].focus,false);
 await page.click('[data-collapse-project="p1"]');await page.locator('[data-overview-project="p1"] .task-row[data-task="long"]').waitFor({state:'hidden'});assert.equal(await page.locator('[data-overview-project="p1"] .task-row[data-task="long"]').isVisible(),false);
 await page.click('[data-expand-projects]');await page.locator('[data-overview-project="p1"] .task-row[data-task="long"]').waitFor({state:'visible'});assert.equal(await page.locator('[data-overview-project="p1"] .task-row[data-task="long"]').isVisible(),true);
 await page.click('[data-overview-filter="paused"]');await page.locator('[data-overview-project="p1"] .task-row[data-task="paused"]').waitFor({state:'visible'});assert.equal(await page.locator('[data-overview-project="p1"] .task-row[data-task="paused"]').count(),1);
 await page.click('[data-project-detail="p1"]');await page.locator('.project-master-detail').waitFor({state:'visible'});
 await page.reload();assert.equal((await stored(page)).tasks[0].nextAction,'根据反馈修改目录');
});

test('weekly next actions share task data and snapshots retain results through completion and rollover',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('a',{week:true,project:'p1',nextAction:'确认目录'}),makeTask('b',{week:true,type:'长期跟进',nextAction:'确认交期'})],{route:'week',projects:projectFixture});
 page.setDefaultTimeout(10000);await page.setViewportSize({width:2560,height:1440});await page.evaluate(()=>{uiLayout.weekPlanLeft=.66;saveUiLayout();renderNow()});await page.locator('#page-week [data-overview-next="a"]').waitFor({state:'visible'});
 const weeklyGeometry=await page.locator('[data-drop-zone="week"] .task-row[data-task="a"]').evaluate(row=>{const box=node=>node.getBoundingClientRect(),action=box(row.querySelector('.overview-next-label')),meta=box(row.querySelector('.task-meta')),whole=box(row);return{rowHeight:whole.height,actionLeft:action.left,actionRight:action.right,metaLeft:meta.left,metaRight:meta.right,metaTop:meta.top,metaBottom:meta.bottom,actionTop:action.top,actionBottom:action.bottom,rowRight:whole.right}});
 assert(weeklyGeometry.rowHeight<150&&(weeklyGeometry.metaLeft>=weeklyGeometry.actionRight-1||weeklyGeometry.metaTop>=weeklyGeometry.actionBottom-1||weeklyGeometry.metaBottom<=weeklyGeometry.actionTop+1)&&weeklyGeometry.metaRight<=weeklyGeometry.rowRight,JSON.stringify(weeklyGeometry));
 assert(await page.locator('#page-week [data-overview-next="a"]').isVisible());
 const longWeekAction='确认目录并完成初稿，同时补齐结构示意、测试结论和仍待确认的问题，提交给相关人员审核后记录下一轮修改项。';
 await page.locator('[data-overview-next="a"]').fill(longWeekAction);
 const weekTextarea=await page.locator('[data-overview-next="a"]').evaluate(node=>{const box=node.getBoundingClientRect(),parent=node.parentElement.getBoundingClientRect();return{clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,width:box.width,parentWidth:parent.width-parseFloat(getComputedStyle(node.parentElement).paddingRight||0),overflowY:getComputedStyle(node).overflowY,resize:getComputedStyle(node).resize}});
 assert(weekTextarea.width>=weekTextarea.parentWidth-2&&weekTextarea.clientHeight<=120&&weekTextarea.clientHeight>0&&['hidden','auto'].includes(weekTextarea.overflowY)&&weekTextarea.resize==='none',JSON.stringify(weekTextarea));
 await page.locator('[data-overview-next="a"]').fill('确认目录并完成初稿');await page.locator('[data-overview-next="a"]').press('Tab');
 await page.click('[data-add-top]');await page.locator('[data-top-index="0"]').fill('形成可审核初稿');await page.locator('[data-top-index="0"]').press('Tab');
 await page.click('[data-week-panel="review"]');assert.match(await page.locator('.week-comparison').textContent(),/确认目录并完成初稿/);
 await page.locator('[data-week-result="a"]').fill('目录已确认，初稿完成一半');await page.locator('[data-week-result="a"]').press('Tab');
 await page.locator('[data-top-result="0"]').fill('部分达成，待补插图');await page.locator('[data-top-result="0"]').press('Tab');
 await page.clock.fastForward(250);
 await page.evaluate(()=>updateTask('a','test next action',task=>{task.nextAction='补充插图'}));
 assert.equal((await stored(page)).weeks['2026-08-31'].actions.a.text,undefined);assert.equal((await stored(page)).tasks.find(t=>t.id==='a').nextAction,'补充插图');
 await page.click('[data-week-panel="plan"]');await page.locator('[data-toggle-task="b"]').click();
 await page.click('[data-week-panel="review"]');assert.match(await page.locator('.week-comparison').textContent(),/事项 b/);
 const before=(await stored(page)).weeks['2026-08-31'];
 // Freeze the target wall-clock date independently of timer advancement.
 await page.clock.setFixedTime(new Date('2026-09-08T12:00:00+08:00'));await page.clock.runFor(61000);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).meta.activeWeekKey==='2026-09-07');
 let data=await stored(page);assert.equal(data.weeks['2026-08-31'].actions.a.text,undefined);assert.equal(data.weeks['2026-08-31'].actions.a.result,'目录已确认，初稿完成一半');assert.equal(data.weeks['2026-08-31'].topResults[0],'部分达成，待补插图');
 assert.deepEqual(data.weeks['2026-08-31'].taskSnapshots,before.taskSnapshots);
 assert.equal(data.weeks['2026-09-07'].actions.a.text,undefined);assert.equal(data.weeks['2026-09-07'].taskSnapshots.find(t=>t.id==='a').nextAction,'补充插图');assert.equal(data.weeks['2026-09-07'].actions.a.result,'');assert.equal(data.weeks['2026-09-07'].taskIds.includes('b'),false);assert.equal(data.weeks['2026-09-07'].taskSnapshots.some(task=>task.id==='b'),false);
 await page.waitForFunction(()=>!renderFrame&&document.querySelector('#weekPicker').value===weekInputValue(currentWeekKey()));
 await page.click('[data-week-shift="-1"]');await page.clock.runFor(100);await page.waitForFunction(()=>!renderFrame&&document.querySelector('#weekPicker').value===weekInputValue('2026-08-31'));
 await page.locator('[data-week-result="a"][readonly]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-week-result="a"]').getAttribute('readonly'),'');
 await page.reload();data=await stored(page);assert.equal(data.weeks['2026-08-31'].actions.a.result,'目录已确认，初稿完成一半');
});

test('Today highlights next actions and shows all waiting dates in a continuous list',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('do',{focus:true,nextAction:'发出样品确认'}),makeTask('fallback',{focus:true,nextAction:''}),makeTask('due',{status:'等待',followup:today}),makeTask('later',{status:'等待',followup:future}),makeTask('no-date',{status:'等待',followup:''})]);
 assert.equal(await page.locator('[data-task="do"] .task-title-link').textContent(),'发出样品确认');
 assert.equal(await page.locator('[data-task="fallback"] .task-title-link').textContent(),'事项 fallback');
 assert.equal(await page.locator('[data-drop-zone="today"] [data-task="due"]').count(),0);
 assert.equal(await page.locator('[data-drop-zone="waiting"] .task-row[data-task="due"]').isVisible(),true);
 assert.equal(await page.locator('.task-row[data-task="later"]').isVisible(),true);assert.equal(await page.locator('.task-row[data-task="no-date"]').isVisible(),true);
 assert.equal(await page.locator('[data-waiting-group]').count(),0);assert.equal(await page.locator('.task-row[data-task="later"]').isVisible(),true);
 await page.locator('[data-pin-task="do"]').click();await page.locator('.section-caption').waitFor({state:'visible'});assert.match(await page.locator('.section-caption').textContent(),/今日先做/);
 assert.equal(await page.locator('.task-row[data-task="later"]').isVisible(),true,'flat waiting list survives render');
 const modes=await page.locator('.today-task-scroll').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).overflowY));assert(modes.includes('visible'));assert(modes.every(mode=>['visible','auto'].includes(mode)));
 const positions=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();return {actionBottom:box('[data-drop-zone="today"]').bottom,noteTop:box('.quick-note-card').top,waitTop:box('[data-drop-zone="waiting"]').top,actionTop:box('[data-drop-zone="today"]').top,inboxTop:box('#todayCapture').top,waitBottom:box('[data-drop-zone="waiting"]').bottom}});
 assert(positions.noteTop>=positions.actionBottom);assert(Math.abs(positions.waitTop-positions.actionTop)<2);assert(positions.inboxTop>=positions.waitBottom);
 await page.locator('[data-toggle-task="do"]').click();assert.equal((await stored(page)).tasks.find(task=>task.id==='do').status,'已完成');
});

test('overview keeps notes in task details, uses waiting follow-up dates, and supports narrow inline edits',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('wait',{project:'p1',status:'等待',notes:'<p>第一段记录</p><p>第二段记录，尚未收到最终确认。</p>'})],{route:'projects',projects:projectFixture});
 const before=(await stored(page)).tasks[0];await page.click('[data-overview-project="p1"] [data-quick-date="wait"]');await page.click('[data-set-task-date="'+today+'"]');
 let data=await stored(page);assert.equal(data.tasks[0].followup,today);assert.equal(data.tasks[0].planDate,before.planDate);assert.equal(data.tasks[0].notes,before.notes);assert.equal(data.tasks[0].focus,false);
 assert.equal(await page.locator('.project-overview-tasks .progress-record').count(),0);await page.locator('[data-task="wait"] [data-open-task="wait"]').click();await page.locator('#taskDialog[open]').waitFor();assert.match(await page.locator('#taskNotes .ql-editor').innerText(),/第二段记录/);await page.locator('#saveTaskButton').click();
 await page.locator('.inline-help summary').focus();assert.equal(await page.locator('.inline-help').getAttribute('open'),'');await page.keyboard.press('Escape');assert.equal(await page.locator('.inline-help').getAttribute('open'),null);
 await page.setViewportSize({width:390,height:844});
 const width=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth,main:mainScroll.scrollWidth,client:mainScroll.clientWidth}));assert(width.body<=width.viewport+1&&width.main<=width.client+1,JSON.stringify(width));
 assert.equal(await page.locator('[data-overview-next="wait"]').isVisible(),true);assert.equal(await page.locator('[data-overview-next="wait"]').inputValue(),before.nextAction);await page.locator('[data-overview-next="wait"]').fill('窄窗口中继续编辑');await page.locator('[data-overview-next="wait"]').press('Tab');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(task=>task.id==='wait').nextAction==='窄窗口中继续编辑');assert.equal((await stored(page)).tasks[0].nextAction,'窄窗口中继续编辑');
});


test('legacy handled markers never hide active or due waiting tasks after reload',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('active',{focus:true,week:true,inbox:true,nextAction:'',handledOn:today}),makeTask('waiting',{status:'等待',followup:today,handledOn:today})]);
 assert.equal(await page.locator('[data-drop-zone="today"] [data-task="active"] .task-next').count(),0);
 assert.equal(await page.locator('[data-organize-task],[data-handle-task],[data-undo-handled],.handled-panel').count(),0);
 assert.equal((await stored(page)).tasks.find(t=>t.id==='active').inbox,false);
 for(const reload of [false,true]){
  if(reload)await page.reload();
  assert.equal(await page.locator('[data-drop-zone="today"] .task-row[data-task="active"]').count(),1);
  assert.equal(await page.locator('[data-drop-zone="waiting"] .task-row[data-task="waiting"]').count(),1);
  assert.match(await page.locator('.today-waiting .card-subtitle').textContent(),/待催办 1 项/);
 }
});

test('project settings preserves drafts across decisions and protects close on short screens',{timeout:30000},async t=>{
 const page=await fixture(t,[],{projects:projectFixture,route:'projects'});page.setDefaultTimeout(5000);
 await page.evaluate(()=>openProject('p1'));await page.fill('#projectName','未保存名称');
 await page.fill('#projectDescription','尚未保存的说明');await page.click('[data-project-settings-tab="records"]');await page.click('[data-project-panel="decisions"]');
 await page.click('#projectDialog [data-new-decision]');await page.fill('#decisionTitle','草稿保护验证');
 await page.locator('#decisionForm button[value="default"]').click();
 await page.click('[data-project-settings-tab="basic"]');assert.equal(await page.inputValue('#projectName'),'未保存名称');assert.equal(await page.inputValue('#projectDescription'),'尚未保存的说明');
 for(const width of [1366,800]){
  await page.setViewportSize({width,height:600});
  const box=await page.locator('#projectDialog .modal-actions').boundingBox();assert(box.y>=0&&box.y+box.height<=600);
  const overflow=await page.locator('#projectDialog').evaluate(n=>n.scrollWidth-n.clientWidth);assert(overflow<=1);
 }
 await page.click('#projectDialog [data-close="projectDialog"]');await page.locator('#confirmDialog[open]').waitFor();
 assert.equal(await page.locator('#projectDialog').evaluate(n=>n.open),true);
 await page.click('#confirmAccept');assert.equal((await stored(page)).projects[0].name,projectFixture[0].name);
});

test('shared width handles persist per card and compact editors remain reachable',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('a',{focus:true,week:true,project:'p1'}),makeTask('b',{week:true,project:'p1'})],{projects:projectFixture});page.setDefaultTimeout(5000);await page.setViewportSize({width:1920,height:1080});
 await page.click('[data-page="projects"]');
 const handle=page.locator('[data-overview-project="p1"] [data-scoped-planning]').first();await handle.scrollIntoViewIfNeeded();
 const before=Number(await handle.getAttribute('aria-valuenow'));await handle.focus();await handle.press('ArrowRight');
 const value=Number(await handle.getAttribute('aria-valuenow'));assert.equal(value,before+16);
 assert.equal(await page.locator('[data-overview-project="p1"] [data-scoped-planning]').last().getAttribute('aria-valuenow'),String(value));
 await page.reload();assert.equal(await page.locator('[data-overview-project="p1"] [data-scoped-planning]').first().getAttribute('aria-valuenow'),String(value));
 await page.click('[data-page="week"]');await page.locator('#page-week.active').waitFor();await page.evaluate(()=>{uiLayout.weekPlanLeft=.66;saveUiLayout();renderNow()});const field=page.locator('#page-week [data-overview-next="a"]');await field.waitFor({state:'visible'});await page.setViewportSize({width:390,height:844});await field.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#page-week [data-task="a"] .ui-planning-row').classList.contains('is-editor-stacked'));await field.fill('窄屏保留下一步');await field.press('Tab');await page.setViewportSize({width:1920,height:1080});assert.equal(await field.inputValue(),'窄屏保留下一步');
 await page.setViewportSize({width:800,height:700});const overflow=await page.locator('#mainScroll').evaluate(n=>n.scrollWidth-n.clientWidth);assert(overflow<=1);
});

test('wheel scrolls while holding a dragged task without completing or reclassifying it',{timeout:30000},async t=>{
 const page=await fixture(t,Array.from({length:24},(_,i)=>makeTask('drag'+i,{focus:true,week:true})));const handle=page.locator('[data-drag-handle="today"][data-task="drag0"]');await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+20,box.y+15,{steps:5});await page.waitForFunction(()=>!!activeSortableTask);
 const before=await page.locator('#mainScroll').evaluate(n=>n.scrollTop);await page.mouse.wheel(0,380);await page.waitForFunction(before=>document.querySelector('#mainScroll').scrollTop>before+50,before);
 await page.mouse.up();await page.waitForFunction(()=>!activeSortableTask);const tasks=(await stored(page)).tasks;assert.equal(tasks.length,24);assert(tasks.every(task=>task.status==='进行中'&&task.focus&&!task.inbox));
});


test('pending inbox needs no classification and detail saves keep task content', {timeout:30000}, async t=>{
 const page=await fixture(t,[makeTask('pending',{status:'待处理',inbox:false,project:'p1',notes:'保留记录'})],{projects:projectFixture});
 await page.locator('[data-drop-zone="inbox"] .task-row[data-task="pending"]').waitFor();
 await page.evaluate(()=>openTask('pending'));
 assert.equal(await page.locator('#draftInbox').count(),0);
 await page.selectOption('#draftStatus','进行中');await page.check('#draftFocus');
 await page.click('#taskDialog [data-close="taskDialog"]');
 await page.locator('[data-drop-zone="today"] .task-row[data-task="pending"]').waitFor();
 await page.reload();
 assert.equal(await page.locator('[data-drop-zone="inbox"] .task-row[data-task="pending"]').count(),0);
 const value=(await stored(page)).tasks.find(task=>task.id==='pending');
 assert.equal(value.project,'p1');assert(value.notes.includes('保留记录'));assert.equal(value.status,'进行中');
 await page.evaluate(()=>navigate('tasks'));await page.locator('#page-tasks.active').waitFor();
 assert.equal(await page.locator('#page-tasks [data-quick="inbox"]').count(),0);
 assert(!(await page.locator('#page-tasks').innerText()).includes('待整理'));
});

test('iteration: quick dates preserve status, deadlines, week and historical records',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('schedule',{focus:true,week:true,planDate:today,due:'2026-09-12'}),makeTask('wait-date',{status:'等待',followup:today,planDate:'2026-09-01',handledOn:today})]);
 const history=JSON.stringify((await stored(page)).weeks['2026-08-24']);
 await page.click('#page-today [data-quick-date="schedule"]');
 await page.click('[data-set-task-date="2026-09-06"]');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(x=>x.id==='schedule').planDate==='2026-09-06');
 let task=(await stored(page)).tasks.find(x=>x.id==='schedule');assert.equal(task.focus,false);assert.equal(task.week,true);assert.equal(task.status,'进行中');assert.equal(task.due,'2026-09-12');
 await page.locator('#page-today [data-quick-date="schedule"]').waitFor({state:'detached'});
 await page.click('[data-page="tasks"]');await page.click('#page-tasks [data-quick-date="wait-date"]');
 await page.click('[data-set-task-date="2026-09-07"]');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(x=>x.id==='wait-date').followup==='2026-09-07');
 task=(await stored(page)).tasks.find(x=>x.id==='wait-date');assert.equal(task.status,'等待');assert.equal(task.handledOn,undefined);assert.equal(task.planDate,'2026-09-01');
 await page.click('#page-tasks [data-quick-date="schedule"]');await page.click('[data-set-task-date=""]');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).tasks.find(x=>x.id==='schedule').planDate==='');
 assert.equal(JSON.stringify((await stored(page)).weeks['2026-08-24']),history);
 await page.reload();task=(await stored(page)).tasks.find(x=>x.id==='schedule');assert.equal(task.planDate,'');assert.equal(task.week,true);assert.equal(task.due,'2026-09-12');
});

test('iteration: compact Today counts only actionable follow-ups and exposes total waiting',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('due-wait',{status:'等待',followup:today}),makeTask('past-wait',{status:'等待',followup:'2026-09-04'}),makeTask('later',{status:'等待'}),makeTask('undated',{status:'等待',followup:''}),makeTask('handled-wait',{status:'等待',followup:today,handledOn:today}),makeTask('archived-wait',{status:'等待',followup:today,archived:true})]);
 assert.match(await page.locator('.today-waiting .card-subtitle').textContent(),/待催办 3 项/);
 assert.match(await page.locator('[data-open-all-waiting]').textContent(),/5/);
 assert.equal(await page.locator('#page-today .summary-grid').count(),0);
 await page.click('[data-toggle-task="due-wait"]');await page.waitForFunction(()=>document.querySelector('.today-waiting .card-subtitle').textContent.includes('待催办 2 项'));
 assert.match(await page.locator('[data-open-all-waiting]').textContent(),/4/);
 await page.click('[data-open-all-waiting]');await page.locator('#page-tasks.active').waitFor();assert.equal(await page.locator('#page-tasks .task-row[data-task]').count(),4);
 await page.click('[data-toggle-task-options]');await page.click('[data-quick="followup"]');await page.waitForFunction(()=>document.querySelectorAll('#page-tasks .task-row[data-task]').length===2);
 assert.equal(await page.locator('#page-tasks .task-row[data-task="past-wait"]').count(),1);
});

test('iteration: complete search pages past previews and retains context after opening results',{timeout:30000},async t=>{
 const tasks=Array.from({length:46},(_,i)=>makeTask('s'+i,{title:'查找目标 '+String(i).padStart(2,'0'),notes:'<p>较长的背景说明。'.repeat(12)+'独特正文命中</p>'}));
 const page=await fixture(t,tasks,{projects:[{id:'search-project',name:'查找目标项目',milestones:[]}]});
 await page.fill('#globalSearch','查找目标');await page.locator('#page-search.active').waitFor();
 assert.match(await page.locator('.search-result-count').textContent(),/47/);assert.equal(await page.locator('[data-search-task]').count(),10);
 await page.locator('.search-result-heading [data-search-category="task"]').click();assert.equal(await page.locator('[data-search-task]').count(),20);
 await page.click('[data-search-more="task"]');assert.equal(await page.locator('[data-search-task]').count(),40);
 await page.click('[data-search-more="task"]');assert.equal(await page.locator('[data-search-task]').count(),46);
 await page.waitForFunction(()=>!renderFrame&&!searchView.restoring);await page.locator('[data-search-task="s40"]').scrollIntoViewIfNeeded();await page.clock.runFor(60);
 const top=await page.locator('#mainScroll').evaluate(n=>n.scrollTop);assert(top>100);
 await page.click('[data-search-task="s40"]');await page.locator('#taskDialog[open]').waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.clock.runFor(100);
 assert.equal(await page.locator('#searchPageInput').inputValue(),'查找目标');assert.equal(await page.locator('[data-search-task]').count(),46);
 assert(Math.abs((await page.locator('#mainScroll').evaluate(n=>n.scrollTop))-top)<5);
 await page.fill('#searchPageInput','独特正文命中');assert.equal(await page.locator('[data-search-task]').count(),10);
 assert.match(await page.locator('[data-search-task]').first().textContent(),/独特正文命中/);
 await page.fill('#searchPageInput','查找目标');await page.click('[data-search-project="search-project"]');await page.locator('#page-projects.active').waitFor();
 await page.click('#backButton');await page.locator('#page-search.active').waitFor();assert.equal(await page.locator('#searchPageInput').inputValue(),'查找目标');
 await page.click('[data-clear-search]');assert.equal(await page.locator('[data-search-task]').count(),0);
});

test('search: task status, completion date, sorting and project grouping are visible',{timeout:30000},async t=>{
 const tasks=[
  makeTask('search-active',{title:'交付复核',status:'进行中',project:'project-b',updatedAt:'2026-09-14T08:00:00.000Z'}),
  makeTask('search-waiting',{title:'交付等待',status:'等待',project:'project-a',updatedAt:'2026-09-13T08:00:00.000Z'}),
  makeTask('search-done-new',{title:'交付新完成',status:'已完成',completed:'2026-09-12',project:'project-a'}),
  makeTask('search-done-old',{title:'交付早完成',status:'已完成',completed:'2026-09-03',project:'project-b'}),
  makeTask('search-general',{title:'交付通用',status:'待处理'})
 ];
 const projects=[{id:'project-b',name:'乙项目',milestones:[]},{id:'project-a',name:'甲项目',milestones:[]}];
 const page=await fixture(t,tasks,{projects,route:'tasks'});await page.fill('#globalSearch','交付');await page.locator('#page-search.active').waitFor();
 assert.equal(await page.locator('[data-search-task="search-done-new"] .search-status').textContent(),'已完成');
 assert.equal(await page.locator('[data-search-task="search-done-new"] time').textContent(),'2026-09-12');
 assert.equal(await page.locator('[data-search-task="search-active"] time').count(),0);
 await page.selectOption('#searchTaskSort','completedDesc');
 assert.deepEqual(await page.locator('[data-search-task]').evaluateAll(rows=>rows.map(row=>row.dataset.searchTask).slice(0,2)),['search-done-new','search-done-old']);
 await page.selectOption('#searchTaskSort','completedAsc');
 assert.deepEqual(await page.locator('[data-search-task]').evaluateAll(rows=>rows.map(row=>row.dataset.searchTask).slice(0,2)),['search-done-old','search-done-new']);
 await page.selectOption('#searchTaskSort','status');
 assert.deepEqual(await page.locator('[data-search-task]').evaluateAll(rows=>rows.map(row=>row.querySelector('.search-status').textContent)),['进行中','等待','待处理','已完成','已完成']);
 await page.click('[data-search-project-group]');assert.equal(await page.locator('.search-project-group').count(),3);
 assert.deepEqual(await page.locator('.search-project-heading b').allTextContents(),['甲项目','乙项目','通用事项']);
 await page.click('[data-search-task="search-done-new"]');await page.locator('#taskDialog[open]').waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#searchTaskSort').inputValue(),'status');assert.equal(await page.locator('[data-search-project-group]').getAttribute('aria-pressed'),'true');
});

test('retired progress payloads survive import normalization, editing, export and reload',{timeout:30000},async t=>{
 const legacy={progressDraft:'未提交的旧草稿',progressLog:[{id:'old-entry',text:'旧推进记录专用词',createdAt:'2026-09-05T10:00:00Z'}]};
 const page=await fixture(t,[makeTask('progress',{week:true,nextAction:'原有下一步',...legacy})],{route:'tasks'});
 const history=JSON.stringify((await stored(page)).weeks['2026-08-24']);
 await edit(page,'progress');
 assert.equal(await page.locator('#taskProgressInput,#taskProgressList,[data-add-progress],.progress-log-section').count(),0);
 await page.fill('#taskTitle','更新后的事项');await page.clock.fastForward(800);await page.keyboard.press('Escape');
 let data=await page.evaluate(()=>normalizeState(JSON.parse(serializeState()))),value=data.tasks.find(t=>t.id==='progress');
 assert.deepEqual(value.progressLog,legacy.progressLog);assert.equal(value.progressDraft,legacy.progressDraft);assert.equal(value.nextAction,'原有下一步');assert.equal(value.title,'更新后的事项');
 assert.equal(JSON.stringify((await stored(page)).weeks['2026-08-24']),history);
 assert.deepEqual(await page.evaluate(()=>collectGlobalResults('旧推进记录专用词').task.map(t=>t.id)),[]);
 await page.reload();value=(await stored(page)).tasks.find(t=>t.id==='progress');assert.deepEqual(value.progressLog,legacy.progressLog);assert.equal(value.progressDraft,legacy.progressDraft);
 await page.click('[data-page="week"]');assert.equal(await page.locator('.week-progress-records').count(),0);
});

test('fix: clearing a plan stays cleared after later detail autosaves',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('clear-plan',{focus:true,week:true,planDate:today,title:'原标题'})],{route:'tasks'});
 await edit(page,'clear-plan');await page.fill('#draftPlanDate','');await page.clock.fastForward(800);
 assert.equal(await page.locator('#draftFocus').isChecked(),false);
 await page.fill('#taskTitle','修改后的标题');await page.clock.fastForward(800);await page.keyboard.press('Escape');
 const task=(await stored(page)).tasks.find(x=>x.id==='clear-plan');assert.equal(task.planDate,'');assert.equal(task.focus,false);assert.equal(task.week,true);assert.equal(task.title,'修改后的标题');
});



test('iteration: new task next action stays blank without placeholders across creation paths',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('source',{nextAction:'保留已有内容'})],{route:'tasks',projects:projectFixture});
 await page.click('#page-tasks [data-action="new-task"]');assert.equal(await page.locator('#taskNext').inputValue(),'');assert.equal(await page.locator('#taskNext').getAttribute('placeholder'),null);
 await page.fill('#taskTitle','新建空下一步');await save(page);
 let task=(await stored(page)).tasks.find(x=>x.title==='新建空下一步');assert.equal(task.nextAction,'');
 await edit(page,'source');assert.equal(await page.locator('#taskNext').inputValue(),'保留已有内容');await page.click('[data-new-related-task]');assert.equal(await page.locator('#taskNext').inputValue(),'');await page.keyboard.press('Escape');
 await page.reload();task=(await stored(page)).tasks.find(x=>x.title==='新建空下一步');assert.equal(task.nextAction,'');
});

test('iteration: dates and compact layout remain usable on narrow screens',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('narrow',{focus:true,planDate:today}),makeTask('narrow-wait',{status:'等待',followup:today})]);
 const shots=path.join(__dirname,'artifacts/browser-regression');fs.mkdirSync(shots,{recursive:true});
 await page.screenshot({path:path.join(shots,'iteration-today-desktop.png')});
 for(const width of [900,390]){
  // Native viewport resize events are independent of Playwright's mocked clock.
  // Wait for their handlers before opening a menu that intentionally closes on resize.
  await page.evaluate(()=>{window.qaViewportResized=false;window.addEventListener('resize',()=>window.qaViewportResized=true,{once:true})});
  await page.setViewportSize({width,height:900});
  await page.waitForFunction(width=>window.qaViewportResized&&innerWidth===width,width);
  const trigger=page.locator('#page-today [data-quick-date="narrow"]');await trigger.scrollIntoViewIfNeeded();await page.clock.runFor(100);
  await trigger.click();await page.locator('#taskDatePopover').waitFor({state:'visible'});
  const menu=await page.locator('#taskDatePopover').boundingBox();assert(menu&&menu.x>=0&&menu.x+menu.width<=width&&menu.y>=0&&menu.y+menu.height<=900,JSON.stringify(menu));
  if(width===390)await page.screenshot({path:path.join(shots,'iteration-date-mobile.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#taskDatePopover').isVisible(),false);
 }
 await page.setViewportSize({width:1600,height:1000});await edit(page,'narrow');await page.screenshot({path:path.join(shots,'iteration-task-detail.png')});
});

test('rich text: headings highlights expanded editing and three-level indentation persist',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('rich',{title:'富文本第一轮',notes:''})],{route:'tasks'});await edit(page,'rich');
 const editor=page.locator('#taskNotes');
 await editor.evaluate(node=>{let q=node.__quill;q.setText('当前结论\n待确认内容\n段落说明\n第一项\n第二项\n','user');q.setSelection(0,4,'silent')});
 await page.click('.task-notes-editor [data-command="heading2"]');
 await editor.evaluate(node=>node.__quill.setSelection(5,5,'silent'));await page.click('.task-notes-editor [data-command="highlightYellow"]');
 await editor.evaluate(node=>node.__quill.setSelection(11,0,'silent'));for(let level=0;level<3;level++)await page.click('.task-notes-editor [data-command="indent"]');
 assert.equal(await page.locator('.task-notes-editor [data-command="indent"]').isDisabled(),true,'paragraph indent did not stop at level three');
 await editor.evaluate(node=>node.__quill.setSelection(16,7,'silent'));await page.click('.task-notes-editor [data-command="insertOrderedList"]');
 await editor.evaluate(node=>{node.__quill.setSelection(20,0,'silent');node.__quill.focus()});await page.keyboard.press('Tab');
 const formats=await editor.evaluate(node=>{let q=node.__quill;return{heading:q.getFormat(0,1).header,highlight:q.getFormat(5,5).highlight,paragraphIndent:q.getFormat(11,1).indent,list:q.getFormat(16,7).list,child:q.getFormat(20,1)}});
 assert.equal(formats.heading,2);assert.equal(formats.highlight,'yellow');assert.equal(formats.paragraphIndent,3);assert.equal(formats.list,'ordered');assert.equal(formats.child.list,'ordered');assert.equal(formats.child.indent,1);
 await editor.evaluate(node=>{node.__quill.__expandedIdentity='same-editor';node.__quill.setSelection(node.__quill.getLength()-1,0,'silent')});await page.click('[data-task-focus]');
 assert.equal(await page.locator('.task-notes-editor').evaluate(node=>node.classList.contains('rich-expanded')&&document.body.classList.contains('rich-expanded-open')&&node.querySelector('.rich-editor').__quill.__expandedIdentity==='same-editor'),true,'expanded mode replaced the editor or did not lock the background');
 await editor.evaluate(node=>node.__quill.insertText(node.__quill.getLength()-1,'展开中编辑','user'));await editor.press('Escape');
 assert.equal(await page.locator('.task-notes-editor').evaluate(node=>!node.classList.contains('rich-expanded')&&!document.body.classList.contains('rich-expanded-open')),true,'Escape did not leave expanded mode');assert.equal(await page.locator('#taskDialog').getAttribute('open'),'','Escape closed task detail together with expanded mode');
 await save(page);let notes=(await stored(page)).tasks.find(task=>task.id==='rich').notes;
 assert.match(notes,/<h2>当前结论<\/h2>/);assert.match(notes,/rich-highlight-yellow/);assert.match(notes,/ql-indent-3/);assert.match(notes,/<ol>/);assert.match(notes,/展开中编辑/);
 await page.reload();await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'));await edit(page,'rich');
 const restored=await page.locator('#taskNotes').evaluate(node=>{let q=node.__quill;return{html:q.getSemanticHTML(),heading:q.getFormat(0,1).header,highlight:q.getFormat(5,5).highlight,paragraphIndent:q.getFormat(11,1).indent,child:q.getFormat(20,1)}});
 assert.equal(restored.heading,2);assert.equal(restored.highlight,'yellow');assert.equal(restored.paragraphIndent,3);assert.equal(restored.child.list,'ordered');assert.equal(restored.child.indent,1);assert.match(restored.html,/展开中编辑/);
});

const richLines=editor=>editor.evaluate(node=>node.__quill.getLines().map(line=>({text:line.domNode.textContent,list:line.formats().list||'',indent:line.formats().indent||0,header:line.formats().header||0,padding:parseFloat(getComputedStyle(line.domNode).paddingLeft)})));
async function seedRich(editor,ops,index=0,length=0){await editor.evaluate(async(node,{ops,index,length})=>{const q=node.__quill;q.setContents({ops},'silent');q.history.clear();q.focus({preventScroll:true});q.setSelection(index,length,'silent');await new Promise(requestAnimationFrame);q.update('silent');q.focus({preventScroll:true});q.setSelection(index,length,'user')},{ops,index,length});}

test('rich text: paragraph Tab keeps native focus, grouped indentation preserves levels and headings reset padding',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('indent')],{route:'tasks'});await edit(page,'indent');const editor=page.locator('#taskNotes'),indent=page.locator('.task-notes-editor [data-command="indent"]'),outdent=page.locator('.task-notes-editor [data-command="outdent"]');
 for(const depth of [0,3]){
  await seedRich(editor,[{insert:'段落'},{insert:'\n',attributes:depth?{indent:depth}:{}}]);
  const before=await editor.evaluate(node=>node.__quill.getContents());await page.keyboard.press('Tab');
  assert.deepEqual(await editor.evaluate(node=>node.__quill.getContents()),before,'Tab modified a paragraph');
  assert.equal(await editor.evaluate(node=>node.contains(document.activeElement)),false,'Tab trapped focus in the editor');
  await editor.evaluate(node=>node.__quill.setSelection(0,0,'user'));await page.keyboard.press('Shift+Tab');
  assert.deepEqual(await editor.evaluate(node=>node.__quill.getContents()),before,'Shift+Tab modified a paragraph');
  assert.equal(await editor.evaluate(node=>node.contains(document.activeElement)),false,'Shift+Tab trapped focus in the editor');
 }
 await seedRich(editor,[{insert:'甲'},{insert:'\n',attributes:{indent:1}},{insert:'乙'},{insert:'\n',attributes:{indent:2}}],0,3);
 await indent.click();assert.deepEqual((await richLines(editor)).map(l=>l.indent),[2,3]);assert.deepEqual((await richLines(editor)).map(l=>l.padding),[48,72]);assert.equal(await indent.isDisabled(),true);
 await outdent.click();assert.deepEqual((await richLines(editor)).map(l=>l.indent),[1,2]);
 await outdent.click();assert.deepEqual((await richLines(editor)).map(l=>l.indent),[0,1]);assert.equal(await outdent.isDisabled(),true,'outdent would flatten the selected relative hierarchy');
 await editor.evaluate(node=>node.__quill.setSelection(2,0,'user'));await page.click('.task-notes-editor [data-command="heading2"]');
 assert.deepEqual((await richLines(editor)).map(l=>[l.header,l.indent,l.padding]),[[0,0,0],[2,0,0]]);
 await save(page);await page.reload();await edit(page,'indent');assert.deepEqual((await richLines(page.locator('#taskNotes'))).map(l=>[l.header,l.indent]),[[0,0],[2,0]]);
});

test('rich text: list subtrees move atomically through toolbar and keyboard, keep decimal numbering and undo separately',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('tree')],{route:'tasks'});await edit(page,'tree');const editor=page.locator('#taskNotes'),root=editor.locator('.ql-editor');
 const ops=[{insert:'甲'},{insert:'\n',attributes:{list:'ordered'}},{insert:'乙'},{insert:'\n',attributes:{list:'ordered'}},{insert:'丙'},{insert:'\n',attributes:{list:'ordered',indent:1}},{insert:'丁'},{insert:'\n',attributes:{list:'ordered',indent:2}},{insert:'戊'},{insert:'\n',attributes:{list:'ordered'}}];
 await seedRich(editor,ops,2,3);await page.click('.task-notes-editor [data-command="indent"]');
 assert.deepEqual((await richLines(editor)).map(l=>l.indent),[0,1,2,3,0],'an unselected descendant was left behind');
 assert.deepEqual((await richLines(editor)).map(l=>l.list),Array(5).fill('ordered'));
 const markers=await editor.locator('li[class*="ql-indent-"]>.ql-ui').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n,'::before').content));assert(markers.every(m=>/^counter\(list-[123](?:, decimal)?\) "\. "$/.test(m)),JSON.stringify(markers));
 const moved=await editor.evaluate(node=>node.__quill.getContents());await root.press('Tab');assert.deepEqual(await editor.evaluate(node=>node.__quill.getContents()),moved,'Tab bypassed depth or parent validation');
 await root.press('Control+z');assert.deepEqual((await richLines(editor)).map(l=>l.indent),[0,0,1,2,0]);
 await root.press('Control+Shift+z');assert.deepEqual((await richLines(editor)).map(l=>l.indent),[0,1,2,3,0]);
 await editor.evaluate(node=>node.__quill.setSelection(2,3,'user'));
 await root.press('Shift+Tab');assert.deepEqual((await richLines(editor)).map(l=>l.indent),[0,0,1,2,0]);
 await editor.evaluate(node=>{const q=node.__quill;q.setSelection(2,0,'user');q.history.clear();q.insertText(2,'新','user');q.setSelection(2,0,'user')});
 await root.press('Tab');await root.press('Control+z');assert.equal((await richLines(editor))[1].text,'新乙','undoing indent also erased recently typed text');assert.deepEqual((await richLines(editor)).map(l=>l.indent),[0,0,1,2,0]);
 await root.press('Control+Shift+z');await save(page);await page.reload();await edit(page,'tree');assert.deepEqual((await richLines(page.locator('#taskNotes'))).map(l=>l.indent),[0,1,2,3,0]);
});

test('rich text: empty Enter exits one list level, Backspace lifts children and composition is untouched',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('keys')],{route:'tasks'});await edit(page,'keys');const editor=page.locator('#taskNotes'),root=editor.locator('.ql-editor');
 await seedRich(editor,[{insert:'甲'},{insert:'\n',attributes:{list:'ordered'}},{insert:'乙'},{insert:'\n',attributes:{list:'ordered',indent:1}},{insert:'丙'},{insert:'\n',attributes:{list:'ordered',indent:2}},{insert:'\n',attributes:{list:'ordered',indent:3}}],6);
 for(const depth of [2,1,0]){await editor.evaluate(node=>{const q=node.__quill;q.focus({preventScroll:true});q.setSelection(q.getLength()-1,0,'user')});await root.press('Enter');const last=(await richLines(editor)).at(-1);assert.equal(last.indent,depth);assert.equal(last.list,'ordered');}
 await editor.evaluate(node=>{const q=node.__quill;q.focus({preventScroll:true});q.setSelection(q.getLength()-1,0,'user')});await root.press('Enter');assert.equal((await richLines(editor)).at(-1).list,'');
 await seedRich(editor,[{insert:'甲'},{insert:'\n',attributes:{list:'bullet'}},{insert:'乙'},{insert:'\n',attributes:{list:'bullet',indent:1}},{insert:'丙'},{insert:'\n',attributes:{list:'bullet',indent:2}}],2);
 await root.press('Backspace');assert.deepEqual((await richLines(editor)).map(l=>[l.text,l.indent,l.list]),[['甲',0,'bullet'],['乙',0,'bullet'],['丙',1,'bullet']]);
 await editor.evaluate(node=>node.__quill.setSelection(5,0,'user'));await root.press('Enter');assert.deepEqual((await richLines(editor)).at(-1).indent,1);assert.equal((await richLines(editor)).at(-1).list,'bullet');
 const before=await editor.evaluate(node=>node.__quill.getContents());await editor.locator('.ql-editor').evaluate(node=>{node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));for(const key of ['Tab','Enter','Backspace'])node.dispatchEvent(new KeyboardEvent('keydown',{key,isComposing:true,bubbles:true,cancelable:true}));node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))});assert.deepEqual(await editor.evaluate(node=>node.__quill.getContents()),before);
});

test('rich text: highlighter icons retain size and selection across colors, themes and expanded narrow view',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('colors')],{route:'tasks'});await edit(page,'colors');const editor=page.locator('#taskNotes');await seedRich(editor,[{insert:'重点内容\n'}],0,2);
 for(const [color,label] of [['Yellow','黄'],['Green','绿'],['Blue','蓝']]){
  const button=page.locator('.task-notes-editor [data-command="highlight'+color+'"]');await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');
  assert.equal(await editor.evaluate(node=>node.__quill.getFormat(0,2).highlight),color.toLowerCase());assert.equal(await editor.evaluate(node=>node.__quill.getFormat(2,2).highlight||''),'');
  await page.mouse.move(0,0);await button.hover();await page.clock.fastForward(450);assert.equal(await page.locator('#tooltip').textContent(),label+'色高亮；再次点击清除');
  await button.click();assert.equal(await button.getAttribute('aria-pressed'),'false');assert.equal(await editor.evaluate(node=>node.__quill.getFormat(0,2).highlight||''),'');
 }
 for(const [width,theme] of [[1600,'light'],[760,'dark']]){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  if(width===760)await page.click('[data-task-focus]');
  const sizes=await page.locator('.task-notes-editor .rich-highlight-button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect(),s=n.querySelector('svg').getBoundingClientRect();return[b.width,b.height,s.width,s.height,s.left>=b.left&&s.right<=b.right&&s.top>=b.top&&s.bottom<=b.bottom]}));
  assert.deepEqual(sizes,Array(3).fill([29,29,18,18,true]));
  assert.equal(await page.locator('.task-notes-editor .rich-toolbar').evaluate(n=>n.scrollWidth<=n.clientWidth),true,'toolbar overflowed');
 }
 await page.click('.task-notes-editor [data-command="highlightGreen"]');await page.keyboard.press('Escape');await save(page);await page.reload();await edit(page,'colors');assert.equal(await page.locator('#taskNotes').evaluate(node=>node.__quill.getFormat(0,2).highlight),'green');
});

test('completion: shared search matches tokens, reversed tokens and title gaps with safe highlights',async t=>{
 const page=await fixture(t,[makeTask('search',{title:'靶机电池充电异常排查',project:'p',notes:'<p>确认接线，已更换电源模块</p>',progressLog:[{id:'g',text:'已更换电源模块',createdAt:'2026-09-05T10:00:00Z'}]}),makeTask('other',{title:'其他事项'})],{projects:[{id:'p',name:'验证项目',milestones:[]}],route:'tasks'});
 const result=await page.evaluate(()=>{
  const queries=['充电异常','靶机 异常','异常 靶机','靶机异常','更换 模块'];
  return {matches:queries.map(q=>{taskFilter.query=q;return [filteredTasks().map(t=>t.id),collectGlobalResults(q).task.map(t=>t.id)]}),noMatch:taskSearchMatch(taskById('search'),'电池 香蕉').score,html:highlightSearch('<img src=x>靶机异常','靶机 异常'),source:taskSearchHint(taskById('search'),'更换 模块')};
 });
 for(const pair of result.matches)assert.deepEqual(pair,[['search'],['search']]);assert.equal(result.noMatch,0);assert(!result.html.includes('<img'));assert(result.html.includes('<mark>靶机异常</mark>'));assert(result.source.includes('备注'));
 await page.fill('#taskSearch','异常 靶机');await page.waitForFunction(()=>!renderFrame&&document.querySelectorAll('#page-tasks mark').length===2);assert.equal(await page.locator('[data-task="search"] mark').count(),2);
 await page.click('[data-page="projects"]');await switchProjectView(page,'detail');await page.fill('#projectTaskSearch','更换 模块');assert.equal(await page.locator('[data-project-task="search"]').count(),1);
});

test('completion: project panels stay inside viewport and preserve per-view positions',async t=>{
 const projects=Array.from({length:25},(_,i)=>({id:'p'+i,name:'项目 '+i,milestones:[]}));
 const page=await fixture(t,Array.from({length:45},(_,i)=>makeTask('t'+i,{project:'p0'})),{projects,route:'projects'});
 await switchProjectView(page,'detail');await page.waitForSelector('body.project-workspace');
 for(const size of [{width:1600,height:900},{width:1280,height:640}]){
  await page.setViewportSize(size);
  const g=await page.evaluate(()=>{const main=$('#mainScroll'),left=$('.project-list-panel'),right=$('.project-detail-scroll');left.scrollTop=120;right.scrollTop=180;return {main:main.scrollHeight-main.clientHeight,overflow:getComputedStyle(main).overflowY,left:left.scrollTop,right:right.scrollTop,bottom:$('#projectWorkspace').getBoundingClientRect().bottom,height:innerHeight}});
  assert.equal(g.overflow,'hidden');assert(g.main<=2,JSON.stringify(g));assert(g.bottom<=g.height,JSON.stringify(g));assert(g.left>0);assert(g.right>0);
 }
 await switchProjectView(page,'overview');await page.waitForFunction(()=>!document.body.classList.contains('project-workspace'));
 await switchProjectView(page,'detail');await page.waitForSelector('.project-detail-scroll');assert(await page.locator('.project-detail-scroll').evaluate(n=>n.scrollTop>=170));
 await page.setViewportSize({width:390,height:844});await page.click('[data-project-pane="list"]');assert(await page.locator('.project-list-panel').isVisible());assert(!(await page.locator('.project-detail-panel').isVisible()));await page.click('[data-select-project="p0"]');await page.waitForSelector('.project-detail-panel',{state:'visible'});assert(!(await page.locator('.project-list-panel').isVisible()));
});

test('completion: OB links survive legacy normalization',async t=>{
 const page=await fixture(t,[makeTask('a')]);await edit(page,'a');
 const result=await page.evaluate(()=>{let next=normalizeState({...snapshotCore(),meta:{...state.meta,obsidianLinks:{a:'obsidian://open?vault=Work&file=笔记'}},tasks:[{id:'a',title:'事项',status:'进行中'}]});let recovered=next.tasks[0].obsidianUri;next.tasks[0].obsidianUri='';next=normalizeState(next);return{recovered,cleared:next.meta.obsidianLinks.a}});assert(result.recovered.includes('笔记'));assert.equal(result.cleared,'');
});

test('completion: attachment queue retries actual upload handler and keeps original task on switching',async t=>{
 const page=await fixture(t,[makeTask('a'),makeTask('b')]);await edit(page,'a');
 await page.evaluate(()=>{window.attempts=0;window.pendingUpload=null;Cloud.user={id:'test-user'};Cloud.client={storage:{from:()=>({upload:async()=>{window.attempts++;if(window.attempts===1)return{error:{message:'offline'}};return new Promise(resolve=>window.pendingUpload=resolve)},remove:async()=>({error:null})})}};void uploadTaskFiles([new File(['image'],'测试.txt',{type:'text/plain'})])});
 await page.waitForSelector('[data-status="failed"]');assert.equal((await stored(page)).tasks.find(t=>t.id==='a').attachments.length,0);
 await page.click('[data-retry-upload]');await page.waitForFunction(()=>!!window.pendingUpload);
 await page.evaluate(()=>{closeTaskDialog();openTask('b');window.pendingUpload({error:null})});
 await page.waitForFunction(()=>taskById('a').attachments.length===1);const data=await stored(page);assert.equal(data.tasks.find(t=>t.id==='a').attachments.length,1);assert.equal(data.tasks.find(t=>t.id==='b').attachments.length,0);assert.equal(await page.locator('#taskUploadQueue .upload-job').count(),0);
 await page.evaluate(()=>{Cloud.user=null;Cloud.client=null});
});

test('completion: overview collapse corners, inbox disclosure and empty project count',async t=>{
 const page=await fixture(t,Array.from({length:9},(_,i)=>makeTask('i'+i,{status:'待处理',inbox:true})),{projects:[{id:'empty',name:'一个很长很长很长很长很长很长的项目名称',milestones:[]}]});
 assert((await page.locator('[data-drop-zone="inbox"] .card-title').textContent()).includes('9'));assert.equal(await page.locator('.inbox-items .task-row').count(),9);assert.equal(await page.locator('.inbox-items').evaluate(n=>getComputedStyle(n).overflowY),'visible');
 await page.click('[data-page="projects"]');await page.click('[data-collapse-project="empty"]');await page.waitForSelector('.project-overview-group.is-collapsed');const corners=await page.locator('.is-collapsed .project-overview-head').evaluate(n=>{let c=getComputedStyle(n);return{top:c.borderTopLeftRadius,bottom:c.borderBottomLeftRadius,border:c.borderBottomWidth}});assert.equal(corners.top,corners.bottom);assert.equal(corners.border,'0px');
 await switchProjectView(page,'detail');assert.equal(await page.locator('.project-completion strong').textContent(),'0');
});
