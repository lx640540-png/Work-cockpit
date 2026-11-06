const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
let browser,server,origin;
before(async()=>{
 server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','vendor/quill-2.0.3/quill.js','vendor/quill-2.0.3/quill.core.css'].includes(name))return res.writeHead(404).end();res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');fs.createReadStream(path.join(__dirname,name)).pipe(res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve))});
async function fixture(t){
 const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN',timezoneId:'Asia/Shanghai'});t.after(()=>context.close());
 await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await p.clock.install({time:new Date('2026-10-22T10:00:00+08:00')});await p.addInitScript(()=>localStorage.setItem('work-cockpit-local-mode-v1','1'));await p.goto(origin);await p.waitForFunction(()=>!document.documentElement.classList.contains('booting'));
 await p.evaluate(()=>{state.tasks=[normalizeTask({id:'ui-a',title:'核对样机供电条件与验证记录',nextAction:'补充复测结论，记录现场条件和异常现象',focus:true,status:'进行中',priority:'P1'}),normalizeTask({id:'ui-b',title:'跟进保护板规格与测试排期',nextAction:'核对供应商参数和待确认事项',status:'等待',followup:todayKey(),priority:'P0'}),normalizeTask({id:'ui-c',title:'补充客户反馈的验收条件',inbox:true,status:'待处理',priority:'P2'})];state.order.today=[];state.order.pinToday=[];state.order.pinWaiting=[];saveLocal(true);navigate('today')});await p.waitForSelector('[data-drop-scope="today"][data-task="ui-a"]');return p;
}
test('production enables appearance controls without demo flag or demo storage',async t=>{
 const p=await fixture(t);assert.equal(await p.locator('html').getAttribute('data-visual-preview'),'new');assert.equal(await p.locator('#uiPreviewStrip .ui-preview-title strong').innerText(),'工作台');assert(!/示例|试用/.test(await p.locator('#uiPreviewNote').innerText()));
 const before=await p.evaluate(()=>serializeState());await p.click('.ui-preview-settings');await p.selectOption('#previewDensity','compact');await p.selectOption('#previewFont','pingfang');assert.equal(await p.evaluate(()=>serializeState()),before);await p.reload();assert.equal(await p.locator('#previewFont').inputValue(),'pingfang');assert.equal(await p.evaluate(()=>localStorage.getItem('work-cockpit-calm-demo-data-v1')),null);
});
test('today has one visible divider and its drag operation still changes the columns',async t=>{
 const p=await fixture(t);await p.waitForSelector('#todayResizer.ui-resize-divider');
 const geometry=await p.locator('#todayResizer').evaluate(n=>({line:getComputedStyle(n,'::before').width,extra:getComputedStyle(document.querySelector('.today-sidebar-stack')).borderLeftWidth,grip:getComputedStyle(n,'::after').content}));assert.equal(geometry.line,'1px');assert.equal(geometry.extra,'0px');assert(['none','normal'].includes(geometry.grip));
 const before=await p.locator('.today-action-stack').boundingBox(),g=await p.locator('#todayResizer').boundingBox();await p.mouse.move(g.x+g.width/2,g.y+50);await p.mouse.down();await p.mouse.move(g.x+g.width/2-80,g.y+50,{steps:8});await p.mouse.up();const after=await p.locator('.today-action-stack').boundingBox();assert(Math.abs(after.width-before.width)>30);
});
test('pinning never changes row height and trailing buttons center across wrapped properties',async t=>{
 const p=await fixture(t);
 for(const viewport of [{width:1920,height:1080},{width:1536,height:864},{width:1366,height:768},{width:1024,height:600}]){
  await p.setViewportSize(viewport);await p.evaluate(()=>new Promise(requestAnimationFrame));
  for(const [scope,id] of [['today','ui-a'],['waiting','ui-b'],['inbox','ui-c']]){
   const selector='[data-drop-scope="'+scope+'"][data-task="'+id+'"]',row=p.locator(selector);const before=await row.boundingBox(),was=await row.getAttribute('data-pinned');await row.locator('.pin-task').click();await p.waitForSelector(selector+'[data-pinned="'+(was==='1'?'0':'1')+'"]');
   const geometry=await row.evaluate(n=>{const r=n.getBoundingClientRect(),p=n.querySelector('.pin-task').getBoundingClientRect(),hit=n.querySelector('.task-trailing').getBoundingClientRect();return{height:r.height,delta:Math.abs(p.y+p.height/2-r.y-r.height/2),overflow:n.scrollWidth-n.clientWidth,hitInside:hit.left>=r.left&&hit.right<=r.right&&hit.top>=r.top&&hit.bottom<=r.bottom}});
   assert(Math.abs(geometry.height-before.height)<=1,JSON.stringify({viewport,scope,before,geometry}));assert(geometry.delta<=1,JSON.stringify(geometry));assert(geometry.overflow<=1);assert(geometry.hitInside);assert.equal(await p.evaluate(()=>document.scrollingElement.scrollTop),0,'task focus scrolled the outer page behind the top toolbar');
  }
 }
});
test('journal three buttons are horizontally centered in drawer and expanded view',async t=>{
 const p=await fixture(t);await p.click('#journalHandle');
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:1024,height:600}]){
  await p.setViewportSize(viewport);await p.waitForFunction(()=>document.querySelector('#workJournal').getBoundingClientRect().right<=innerWidth+1);
  for(const expanded of [false,true]){
   if(expanded)await p.click('[data-journal-action="expand"]');
   const offsets=await p.locator('.journal-control-rail').evaluate(n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('button')].map(b=>{const a=b.getBoundingClientRect();return Math.abs(a.x+a.width/2-r.x-r.width/2)})});offsets.forEach(delta=>assert(delta<=1,String(delta)));
   if(expanded)await p.click('[data-journal-action="expand"]');
  }
 }
});

test('project index counts only unfinished live tasks and keeps count and pin aligned',async t=>{
 const p=await fixture(t);await p.evaluate(()=>{state.projects=[normalizeProject({id:'p1',name:'一个需要换成两行显示的较长项目名称'}),normalizeProject({id:'p2',name:'空项目'}),normalizeProject({id:'p3',name:'另一项目'})];state.tasks=[normalizeTask({id:'open',project:'p1',title:'进行中',status:'进行中'}),normalizeTask({id:'wait',project:'p1',title:'等待',status:'等待'}),normalizeTask({id:'pause',project:'p1',title:'暂停',status:'暂停'}),normalizeTask({id:'done',project:'p1',title:'完成',status:'已完成'}),normalizeTask({id:'archived',project:'p1',title:'归档',archived:true})];state.favorites=['p1'];ui.projectView='detail';selectedProjectId='p1';saveLocal(true);navigate('projects')});await p.waitForSelector('.project-list-item');
 assert.equal(await p.locator('[data-select-project="p1"] .project-completion').innerText(),'3');assert.equal(await p.locator('[data-select-project="p2"] .project-completion').innerText(),'0');assert.equal(await p.locator('.project-completion small').count(),0);assert.equal(await p.locator('.project-list-divider').count(),0);assert.equal(await p.locator('.project-list-item .ui-sidebar-divider').count(),3);
 const g=await p.locator('[data-select-project="p1"]').evaluate(n=>{const cy=e=>{const r=e.getBoundingClientRect();return r.y+r.height/2};return{title:cy(n.querySelector('.ui-sidebar-main')),count:cy(n.querySelector('.project-completion')),pin:cy(n.querySelector('.favorite')),overflow:n.scrollWidth-n.clientWidth}});assert(Math.abs(g.title-g.count)<=1&&Math.abs(g.count-g.pin)<=1,JSON.stringify(g));assert(g.overflow<=1);const lines=await p.locator('.project-list-item .ui-sidebar-divider').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none'&&getComputedStyle(n).opacity!=='0').map(n=>n.getBoundingClientRect().height));assert.deepEqual(lines,[1]);
});

test('flat waiting order survives dates and pinning; tall lists fill their allocated height',async t=>{
 const p=await fixture(t);await p.setViewportSize({width:1920,height:1440});await p.evaluate(()=>{state.tasks=Array.from({length:16},(_,i)=>normalizeTask({id:'wait-'+i,title:'供应商确认 '+i,status:'等待',followup:i%3===0?'':i%3===1?'2026-10-21':'2026-10-30'}));state.order.waiting=state.tasks.map(t=>t.id).reverse();state.order.pinWaiting=['wait-7'];uiLayout.todayWaitingShare=.8;saveLocal(true);renderNow()});
 assert.equal(await p.locator('.today-waiting details').count(),0);const ids=await p.locator('.today-waiting .task-row').evaluateAll(nodes=>nodes.map(n=>n.dataset.task));assert.deepEqual(ids,['wait-7',...Array.from({length:16},(_,i)=>'wait-'+(15-i)).filter(id=>id!=='wait-7')]);
 const g=await p.locator('.today-waiting>.items').evaluate(n=>{const r=n.getBoundingClientRect(),card=n.parentElement.getBoundingClientRect();n.scrollTop=n.scrollHeight;const end=[...n.querySelectorAll('.task-row')].at(-1).getBoundingClientRect();return{height:r.height,bottomGap:card.bottom-r.bottom,lastBottom:end.bottom,listBottom:r.bottom,scroll:n.scrollHeight-n.clientHeight}});assert(g.height>460,JSON.stringify(g));assert(Math.abs(g.bottomGap)<=1,JSON.stringify(g));assert(g.scroll>0&&g.lastBottom<=g.listBottom-8,JSON.stringify(g));
 await p.locator('.today-waiting .pin-task[data-pin-task="wait-0"]').click();await p.waitForSelector('.today-waiting .task-row[data-task="wait-0"][data-pinned="1"]');assert.equal(await p.locator('.today-waiting .task-row[data-task="wait-0"]').getAttribute('data-pinned'),'1');assert.equal(await p.locator('.today-waiting .task-row').count(),16);
});

test('Today uses the right side at medium widths and releases the full title width when narrow',async t=>{
 const p=await fixture(t);assert.equal(await p.locator('#page-today .summary-grid,[data-summary-target]').count(),0);await p.evaluate(()=>{uiLayout.todayLeft=.52;saveUiLayout();renderNow()});
 const medium=await p.locator('[data-drop-scope="today"][data-task="ui-a"]').evaluate(n=>{const r=s=>n.querySelector(s).getBoundingClientRect(),m=r('.task-main'),a=r('.task-meta');return{mainRight:m.right,metaLeft:a.left,mainTop:m.top,mainBottom:m.bottom,metaTop:a.top,metaBottom:a.bottom,overflow:n.scrollWidth-n.clientWidth}});assert(medium.metaLeft>=medium.mainRight-1,JSON.stringify(medium));assert(Math.min(medium.mainBottom,medium.metaBottom)>Math.max(medium.mainTop,medium.metaTop));assert(medium.overflow<=1);
 await p.setViewportSize({width:390,height:844});const narrow=await p.locator('[data-drop-scope="today"][data-task="ui-a"]').evaluate(n=>{const main=n.querySelector('.task-main').getBoundingClientRect(),meta=n.querySelector('.task-meta').getBoundingClientRect(),pin=n.querySelector('.task-trailing').getBoundingClientRect();return{mainRight:main.right,pinLeft:pin.left,metaTop:meta.top,mainBottom:main.bottom,overflow:n.scrollWidth-n.clientWidth}});assert(narrow.metaTop>=narrow.mainBottom-1,JSON.stringify(narrow));assert(narrow.pinLeft-narrow.mainRight<=12,JSON.stringify(narrow));assert(narrow.overflow<=1);
});

test('next actions use shared columns, wrap below titles in narrow cards and retain edits across widths',async t=>{
 const p=await fixture(t);await p.setViewportSize({width:2560,height:1440});await p.evaluate(()=>{taskById('ui-a').week=true;uiLayout.weekPlanLeft=.8;saveLocal(true);navigate('week')});await p.waitForSelector('#page-week [data-overview-next="ui-a"]');
 for(const width of [1100,760,480]){
  await p.locator('[data-drop-zone="week"]').evaluate((n,width)=>{n.style.width=width+'px'},width);const row=p.locator('[data-drop-scope="week"][data-task="ui-a"]');await p.waitForFunction(()=>!renderFrame);await p.evaluate(()=>new Promise(requestAnimationFrame));
  const field=row.locator('textarea');
  if(width===480){
   await p.waitForFunction(()=>document.querySelector('#page-week [data-task="ui-a"] .ui-planning-row').classList.contains('is-editor-stacked'));
   assert(await field.isVisible());assert.equal(await field.getAttribute('tabindex'),'0');const stacked=await row.evaluate(n=>{const a=n.querySelector('.week-task-identity').getBoundingClientRect(),b=n.querySelector('.overview-next-label').getBoundingClientRect(),c=n.querySelector('.task-meta').getBoundingClientRect();return{identityBottom:a.bottom,editorTop:b.top,editorBottom:b.bottom,metaTop:c.top,overflow:n.scrollWidth-n.clientWidth}});assert(stacked.editorTop>=stacked.identityBottom&&stacked.metaTop>=stacked.editorBottom&&stacked.overflow<=1,JSON.stringify(stacked));
   await field.fill('保留复测结论 '+width);await field.press('Tab');
  }else{
   assert(await field.isVisible());await field.fill('保留复测结论 '+width);await field.press('Tab');
   const g=await row.evaluate(n=>{const r=e=>{const a=e.getBoundingClientRect();return{x:a.x,right:a.right,top:a.top,bottom:a.bottom,width:a.width}};return{identity:r(n.querySelector('.week-task-identity')),editor:r(n.querySelector('.planning-resizable')),meta:r(n.querySelector('.task-meta')),leading:r(n.querySelector('.task-leading')),pin:r(n.querySelector('.task-trailing')),overflow:n.scrollWidth-n.clientWidth}});
   assert(g.overflow<=1,JSON.stringify({width,g}));const center=r=>(r.top+r.bottom)/2;assert(Math.abs(center(g.leading)-center(g.identity))<=1&&Math.abs(center(g.pin)-center(g.identity))<=1,JSON.stringify({width,g}));assert(g.editor.x>=g.identity.right-1&&g.meta.x>=g.editor.right-1,JSON.stringify(g));
  }
 }
 await p.reload();await p.waitForSelector('#page-week [data-overview-next="ui-a"]');assert.equal(await p.locator('#page-week [data-overview-next="ui-a"]').inputValue(),'保留复测结论 480');
});
