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

async function fixture(t,tasks,{time='2026-09-05T12:00:00',route='today'}={}){
  const context=await browser.newContext({viewport:{width:1600,height:1000},timezoneId:'Asia/Shanghai'});
  t.after(()=>context.close());
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  t.after(()=>assert.deepEqual(errors,[]));
  await page.clock.install({time:new Date(time+'+08:00')});
  await page.addInitScript(({tasks})=>{
    localStorage.setItem('work-cockpit-local-mode-v1','1');
    if(!localStorage.getItem('work-cockpit-v6'))localStorage.setItem('work-cockpit-v6',JSON.stringify({version:8,tasks,projects:[],memos:[],
      meta:{activeWeekKey:'2026-08-31'},weeks:{'2026-08-24':{closedAt:'2026-08-30',top:['历史目标'],taskSnapshots:[{id:'historical',title:'历史事项',status:'暂停',type:'任务',focus:true,planDate:'2026-08-24'}]}},order:{long:tasks.map(t=>t.id)}}));
  },{tasks});
  await page.goto(origin+'/index.html#'+route);
  await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'));
  return page;
}
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('work-cockpit-v6')));
async function save(page){await page.click('#saveTaskButton');await page.waitForFunction(()=>!document.querySelector('#taskDialog').open);}
async function edit(page,id){await page.click('[data-page="tasks"]');await page.click('#page-tasks [data-edit-task="'+id+'"]');}

test('due plans light flags on load/reload; excluded states and historical flags remain unchanged',{timeout:30000},async t=>{
  const page=await fixture(t,[makeTask('due',{planDate:today}),makeTask('long',{type:'长期跟进',planDate:today}),
    ...['等待','暂停','已完成','待处理'].map((status,i)=>makeTask('excluded'+i,{status,planDate:today})),makeTask('archived',{archived:true,planDate:today})],{route:'tasks'});
  let data=await stored(page);
  for(const id of ['due','long']){assert.equal(data.tasks.find(t=>t.id===id).focus,true);assert.equal(await page.locator('#page-tasks [data-toggle-focus="'+id+'"].active').count(),1);}
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
