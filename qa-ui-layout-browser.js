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
 await p.evaluate(()=>{state.tasks=[normalizeTask({id:'ui-a',title:'核对样机供电条件与验证记录',nextAction:'补充复测结论，记录现场条件和异常现象',focus:true,status:'进行中',priority:'P1'}),normalizeTask({id:'ui-b',title:'跟进保护板规格与测试排期',nextAction:'核对供应商参数和待确认事项',status:'等待',followup:todayKey(),priority:'P0'}),normalizeTask({id:'ui-c',title:'补充客户反馈的验收条件',inbox:true,status:'待处理',priority:'P2'})];state.order.today=[];state.order.todayPinned=[];state.order.waitingPinned=[];saveLocal(true);navigate('today')});await p.waitForSelector('[data-drop-scope="today"][data-task="ui-a"]');return p;
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
   assert(Math.abs(geometry.height-before.height)<=1,JSON.stringify({viewport,scope,before,geometry}));assert(geometry.delta<=1,JSON.stringify(geometry));assert(geometry.overflow<=1);assert(geometry.hitInside);
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
