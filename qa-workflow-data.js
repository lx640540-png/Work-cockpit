const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
function fixture(){
 const c=vm.createContext({Date,Set,JSON,Object,Array,String,
  strip:value=>String(value||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim(),
  esc:value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  sanitizeRichValue:value=>String(value||''),normalizeRich:value=>String(value||''),
  parseDate:key=>new Date(key+'T00:00:00'),
  fmt:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
  mondayOf:d=>{let r=new Date(d);r.setDate(r.getDate()-(r.getDay()+6)%7);return r},
  addDays:(d,n)=>{let r=new Date(d);r.setDate(r.getDate()+n);return r},
  weekEnd:key=>{let d=new Date(key+'T00:00:00');d.setDate(d.getDate()+6);return c.fmt(d)},
  state:{tasks:[],weeks:{},meta:{}}});
 vm.runInContext(fs.readFileSync('src/core/model.js','utf8').split('function emptyOrder')[0],c);
 for(const path of ['src/domain/work-journal.js','src/domain/workflow.js'])vm.runInContext(fs.readFileSync(path,'utf8'),c);
 return c;
}
test('migration keeps conflicting rich summaries and is idempotent after a save/reload',()=>{
 const c=fixture(),key='2026-10-19';
 c.state.weeks[key]={...c.emptyWeek(),reviewDone:'<h2>周页面原文</h2><p><strong>完成复测</strong></p>'};
 c.state.meta.workJournal={weeks:{[key]:{days:{},deleted:[],review:{achievements:'抽屉原文'},reviewRich:{achievements:'<p><u>收到验证报告</u></p>'}}}};
 c.linkWeeklySummaries(c.state);
 const summary=c.state.weeks[key].reviewDone;assert.match(summary,/<h2>周页面原文<\/h2>/);assert.match(summary,/<strong>完成复测<\/strong>/);assert.match(summary,/<u>收到验证报告<\/u>/);
 c.state=JSON.parse(JSON.stringify(c.state));c.linkWeeklySummaries(c.state);assert.equal(c.state.weeks[key].reviewDone,summary);
});
test('both entry points share edits, including clearing, without resurrecting legacy text',()=>{
 const c=fixture(),key='2026-10-19',journal=c.journalWeek(key);
 c.setWeeklySummary(key,'issues','<p>等待保护板参数</p>');
 assert.equal(journal.reviewRich.issues,c.state.weeks[key].reviewMiss);
 c.setWeeklySummary(key,'issues','');c.linkWeeklySummaries(c.state);
 assert.equal(c.weeklySummaryHTML(key,'issues'),'');assert.equal(journal.review.issues,'');
 c.setWeeklySummary(key,'next','<h3>下周动作</h3><p>补测启动波形</p>');
 c.state=JSON.parse(JSON.stringify(c.state));c.linkWeeklySummaries(c.state);
 assert.equal(c.journalWeek(key).reviewRich.next,c.state.weeks[key].reviewNext);
});
test('journal-only legacy summaries migrate to the correct week, preserving other weeks',()=>{
 const c=fixture();c.state.meta.workJournal={weeks:{'2026-10-19':{days:{},review:{achievements:'本周成果'}},'2026-10-12':{days:{},review:{next:'历史下周动作'}}}};
 c.linkWeeklySummaries(c.state);c.setWeeklySummary('2026-10-19','next','<p>本周的新动作</p>');
 assert.match(c.state.weeks['2026-10-12'].reviewNext,/历史下周动作/);
 assert.match(c.state.weeks['2026-10-19'].reviewDone,/本周成果/);
});
test('record links survive normalization, date moves and temporarily missing tasks',()=>{
 const c=fixture();let raw={weeks:{'2026-10-19':{days:{'2026-10-22':{content:'<p>已复测</p>',taskIds:['a','b','a'],updatedAt:'now'}},deleted:[],review:{}}}};
 let normalized=c.normalizeWorkJournal(raw),day=normalized.weeks['2026-10-19'].days['2026-10-22'];
 assert.deepEqual(Array.from(day.taskIds),['a','b']);c.state.tasks=[{id:'a',title:'已改名的事项'}];assert.equal(c.journalLinkedTasks(day)[0].title,'已改名的事项');
 normalized.weeks['2026-10-19'].days['2026-10-23']=day;delete normalized.weeks['2026-10-19'].days['2026-10-22'];
 const restored=c.normalizeWorkJournal(JSON.parse(JSON.stringify(normalized)));
 assert.deepEqual(Array.from(restored.weeks['2026-10-19'].days['2026-10-23'].taskIds),['a','b']);assert.equal(day.content,'<p>已复测</p>');
});
