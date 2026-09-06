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
  browser=await chromium.launch({headless:true});
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
    if(!localStorage.getItem('work-cockpit-v6'))localStorage.setItem('work-cockpit-v6',JSON.stringify({version:8,tasks,projects,memos:[],
      meta:{activeWeekKey:'2026-08-31'},weeks:{'2026-08-24':{closedAt:'2026-08-30',top:['历史目标'],taskSnapshots:[{id:'historical',title:'历史事项',status:'暂停',type:'任务',focus:true,planDate:'2026-08-24'}]}},order:{long:tasks.map(t=>t.id)}}));
  },{tasks,projects});
  await page.goto(origin+'/index.html#'+route);
  await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'));
  return page;
}
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')));
async function save(page){await page.click('#saveTaskButton');await page.waitForFunction(()=>!document.querySelector('#taskDialog').open);}
async function edit(page,id){await page.click('[data-page="tasks"]');await page.click('#page-tasks [data-open-task="'+id+'"]');}

test('due plans light flags on load/reload; excluded states and historical flags remain unchanged',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('due',{planDate:today}),makeTask('long',{type:'长期跟进',planDate:today}),
    ...['等待','暂停','已完成','待处理'].map((status,i)=>makeTask('excluded'+i,{status,planDate:today})),makeTask('archived',{archived:true,planDate:today})],{route:'tasks'});
  let data=await stored(page);
  for(const id of ['due','long']){assert.equal(data.tasks.find(t=>t.id===id).focus,true);assert.equal(await page.locator('#page-tasks [data-toggle-focus="'+id+'"].active').count(),1);}
  assert.equal(await page.locator('#page-tasks .task-table thead th').count(),11);
  assert.equal(await page.locator('#page-tasks .task-row').count(),0);
  assert.equal(await page.locator('#page-tasks tr[data-task="due"] .task-marker-cell .flag-btn').count(),2);
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
  await page.clock.fastForward(61000);
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

test('detail status changes agree with flags and do not lose tasks when generating a repeat',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('repeat',{repeat:'daily',planDate:today}),makeTask('other')]);
  await edit(page,'repeat');
  // Select the actual native value through its accessible enhanced control.
  await page.locator('#draftStatus').evaluate(select=>{select.value='等待';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await save(page);assert.equal((await stored(page)).tasks.find(t=>t.id==='repeat').focus,false);
  await page.locator('#page-tasks [data-toggle-focus="repeat"]').click();
  assert.equal((await stored(page)).tasks.find(t=>t.id==='repeat').status,'进行中');
  await edit(page,'repeat');
  await page.locator('#draftStatus').evaluate(select=>{select.value='已完成';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await save(page);const data=await stored(page);
  assert.equal(data.tasks.find(t=>t.id==='repeat').status,'已完成');assert(data.tasks.some(t=>t.id==='other'));
  assert.equal(data.tasks.length,3,'exactly one next occurrence must be generated');
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
  await page.keyboard.press('Escape');
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
 assert.equal(await page.locator('[data-overview-task="paused"]').count(),0);
 const overviewGeometry=await page.locator('[data-overview-task="long"]').evaluate(row=>{const box=node=>node.getBoundingClientRect(),main=box(row.querySelector('.project-overview-task-main')),next=box(row.querySelector('.overview-next-label')),schedule=box(row.querySelector('.overview-schedule')),whole=box(row);return{mainWidth:main.width,nextWidth:next.width,scheduleWidth:schedule.width,rowHeight:whole.height,gapA:next.left-main.right,gapB:schedule.left-next.right}});
 assert(overviewGeometry.nextWidth>=overviewGeometry.mainWidth&&overviewGeometry.scheduleWidth<=260&&overviewGeometry.rowHeight<150&&overviewGeometry.gapA<=30&&overviewGeometry.gapB<=30,JSON.stringify(overviewGeometry));
 await page.locator('[data-overview-task="long"] [data-toggle-week]').click();
 let data=await stored(page);assert.equal(data.tasks.length,2);assert.equal(data.tasks[0].type,'长期跟进');assert.equal(data.tasks[0].week,true);
 assert.equal(data.weeks['2026-08-31'].actions.long.text,'发出目录确认');
 await page.locator('[data-overview-next="long"]').fill('根据反馈修改目录');await page.locator('[data-overview-next="long"]').press('Tab');await page.clock.fastForward(250);
 data=await stored(page);assert.equal(data.tasks[0].nextAction,'根据反馈修改目录');assert.equal(data.weeks['2026-08-31'].actions.long.text,'发出目录确认');
 await page.locator('[data-overview-date="long"]').fill(future);await page.locator('[data-overview-date="long"]').press('Tab');
 data=await stored(page);assert.equal(data.tasks[0].planDate,future);assert.equal(data.tasks[0].focus,false);
 await page.click('[data-collapse-project="p1"]');await page.locator('[data-overview-task="long"]').waitFor({state:'hidden'});assert.equal(await page.locator('[data-overview-task="long"]').isVisible(),false);
 await page.click('[data-expand-projects]');await page.locator('[data-overview-task="long"]').waitFor({state:'visible'});assert.equal(await page.locator('[data-overview-task="long"]').isVisible(),true);
 await page.click('[data-overview-filter="paused"]');await page.locator('[data-overview-task="paused"]').waitFor({state:'visible'});assert.equal(await page.locator('[data-overview-task="paused"]').count(),1);
 await page.click('[data-project-detail="p1"]');await page.locator('.project-master-detail').waitFor({state:'visible'});
 await page.reload();assert.equal((await stored(page)).tasks[0].nextAction,'根据反馈修改目录');
});

test('weekly planning and review retain their action and results through completion and rollover',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('a',{week:true,project:'p1',nextAction:'确认目录'}),makeTask('b',{week:true,type:'长期跟进',nextAction:'确认交期'})],{route:'week',projects:projectFixture});
 const weeklyGeometry=await page.locator('[data-drop-zone="week"] .task-row[data-task="a"]').evaluate(row=>{const box=node=>node.getBoundingClientRect(),action=box(row.querySelector('.week-action-label')),meta=box(row.querySelector('.task-meta')),whole=box(row);return{rowHeight:whole.height,actionLeft:action.left,actionRight:action.right,metaLeft:meta.left,metaRight:meta.right}});
 assert(weeklyGeometry.rowHeight<150&&weeklyGeometry.metaLeft>=weeklyGeometry.actionLeft-1&&Math.abs(weeklyGeometry.metaRight-weeklyGeometry.actionRight)<2,JSON.stringify(weeklyGeometry));
 await page.locator('[data-week-action="a"]').fill('确认目录并完成初稿');await page.locator('[data-week-action="a"]').press('Tab');
 await page.click('[data-add-top]');await page.locator('[data-top-index="0"]').fill('形成可审核初稿');await page.locator('[data-top-index="0"]').press('Tab');
 await page.click('[data-week-panel="review"]');assert.match(await page.locator('.week-comparison').textContent(),/确认目录并完成初稿/);
 await page.locator('[data-week-result="a"]').fill('目录已确认，初稿完成一半');await page.locator('[data-week-result="a"]').press('Tab');
 await page.locator('[data-top-result="0"]').fill('部分达成，待补插图');await page.locator('[data-top-result="0"]').press('Tab');
 await page.clock.fastForward(250);
 await page.evaluate(()=>updateTask('a','test next action',task=>{task.nextAction='补充插图'}));
 assert.equal((await stored(page)).weeks['2026-08-31'].actions.a.text,'确认目录并完成初稿');
 await page.click('[data-week-panel="plan"]');await page.locator('[data-toggle-task="b"]').click();
 await page.click('[data-week-panel="review"]');assert.match(await page.locator('.week-comparison').textContent(),/事项 b/);
 const before=(await stored(page)).weeks['2026-08-31'];
 await page.clock.fastForward(3*86400000);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')).meta.activeWeekKey==='2026-09-07');
 let data=await stored(page);assert.equal(data.weeks['2026-08-31'].actions.a.text,'确认目录并完成初稿');assert.equal(data.weeks['2026-08-31'].actions.a.result,'目录已确认，初稿完成一半');assert.equal(data.weeks['2026-08-31'].topResults[0],'部分达成，待补插图');
 assert.deepEqual(data.weeks['2026-08-31'].taskSnapshots,before.taskSnapshots);
 assert.equal(data.weeks['2026-09-07'].actions.a.text,'补充插图');assert.equal(data.weeks['2026-09-07'].actions.a.result,'');assert.equal(data.weeks['2026-09-07'].taskIds.includes('b'),false);assert.equal(data.weeks['2026-09-07'].taskSnapshots.some(task=>task.id==='b'),false);
 await page.click('[data-week-shift="-1"]');await page.locator('[data-week-result="a"][readonly]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-week-result="a"]').getAttribute('readonly'),'');
 await page.reload();data=await stored(page);assert.equal(data.weeks['2026-08-31'].actions.a.result,'目录已确认，初稿完成一半');
});

test('Today highlights next actions and pins while dated waiting stays separate and expandable',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('do',{focus:true,nextAction:'发出样品确认'}),makeTask('fallback',{focus:true,nextAction:''}),makeTask('due',{status:'等待',followup:today}),makeTask('later',{status:'等待',followup:future}),makeTask('no-date',{status:'等待',followup:''})]);
 assert.equal(await page.locator('[data-task="do"] .task-title-link').textContent(),'发出样品确认');
 assert.equal(await page.locator('[data-task="fallback"] .task-title-link').textContent(),'事项 fallback');
 assert.equal(await page.locator('[data-drop-zone="today"] [data-task="due"]').count(),0);
 assert.equal(await page.locator('[data-drop-zone="waiting"] .task-row[data-task="due"]').isVisible(),true);
 assert.equal(await page.locator('.task-row[data-task="later"]').isVisible(),false);assert.equal(await page.locator('.task-row[data-task="no-date"]').isVisible(),false);
 await page.click('[data-waiting-group="future"] summary');assert.equal(await page.locator('.task-row[data-task="later"]').isVisible(),true);
 await page.locator('[data-pin-task="do"]').click();await page.locator('.section-caption').waitFor({state:'visible'});assert.match(await page.locator('.section-caption').textContent(),/今日先做/);
 assert.equal(await page.locator('.task-row[data-task="later"]').isVisible(),true,'expanded state survives render');
 const modes=await page.locator('.today-task-scroll').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).overflowY));assert.deepEqual(modes,['visible','visible']);
 const positions=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();return {actionBottom:box('[data-drop-zone="today"]').bottom,noteTop:box('.quick-note-card').top,waitTop:box('[data-drop-zone="waiting"]').top,actionTop:box('[data-drop-zone="today"]').top,inboxTop:box('#todayCapture').top,flowBottom:box('#todayExecution').bottom}});
 assert(positions.noteTop>=positions.actionBottom);assert(Math.abs(positions.waitTop-positions.actionTop)<2);assert(positions.inboxTop>=positions.flowBottom);
 await page.locator('[data-toggle-task="do"]').click();assert.equal((await stored(page)).tasks.find(task=>task.id==='do').status,'已完成');
});

test('overview preserves notes verbatim, uses waiting follow-up dates, and supports narrow viewports',{timeout:30000},async t=>{
 const page=await fixture(t,[makeTask('wait',{project:'p1',status:'等待',notes:'<p>第一段记录</p><p>第二段记录，尚未收到最终确认。</p>'})],{route:'projects',projects:projectFixture});
 const before=(await stored(page)).tasks[0];await page.locator('[data-overview-date="wait"]').fill(today);await page.locator('[data-overview-date="wait"]').press('Tab');
 let data=await stored(page);assert.equal(data.tasks[0].followup,today);assert.equal(data.tasks[0].planDate,before.planDate);assert.equal(data.tasks[0].notes,before.notes);assert.equal(data.tasks[0].focus,false);
 await page.locator('.progress-record summary').click();assert.match(await page.locator('.progress-record>div').textContent(),/第二段记录/);
 await page.locator('.inline-help summary').focus();assert.equal(await page.locator('.inline-help').getAttribute('open'),'');await page.keyboard.press('Escape');assert.equal(await page.locator('.inline-help').getAttribute('open'),null);
 await page.setViewportSize({width:390,height:844});
 const width=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth,main:mainScroll.scrollWidth,client:mainScroll.clientWidth}));assert(width.body<=width.viewport+1&&width.main<=width.client+1,JSON.stringify(width));
 assert.equal(await page.locator('[data-overview-next="wait"]').isVisible(),true);
});
