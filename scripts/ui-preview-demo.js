/* Runs only in the separately packaged demo, before boot(). */
// Demo files stay in this browser's IndexedDB; production never loads this script.
let demoImageDb;
function demoFileStore(){return demoImageDb||(demoImageDb=new Promise((resolve,reject)=>{let request=indexedDB.open("cockpit-demo-images-v1",1);request.onupgradeneeded=()=>request.result.createObjectStore("files");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)}))}
async function demoFileRequest(mode,action){let db=await demoFileStore();return new Promise((resolve,reject)=>{let transaction=db.transaction("files",mode),request=action(transaction.objectStore("files"));let value;request.onsuccess=()=>{value=request.result};transaction.oncomplete=()=>resolve(value);transaction.onabort=transaction.onerror=()=>reject(transaction.error||request.error)})}
// The preview uses synthetic state only and never contacts the production backup service.
BackupUI.refresh=async function(){this.account=Cloud.user?.id||'';this.error='这是界面演示：状态为模拟数据，不会连接或备份正式工作台。';if(currentPage==='data')this.updatePanel()};
BackupUI.api=async()=>{throw Error('试用页只演示界面，不能连接正式备份')};
BackupUI.run=async function(){if(this.runPending)return;this.account=Cloud.user?.id||'';this.runPending=true;const row={id:'demo-only',status:'running',created_at:new Date().toISOString(),source_version:1,summary:BackupFormat.summary(state),attachment_count:0};this.status={connected:true,runs:[row]};this.error='这是界面演示：状态为模拟数据，不会连接或备份正式工作台。';this.updatePanel();setTimeout(()=>{row.status='verified';row.verified_at=new Date().toISOString();this.runPending=false;if(currentPage==='data')this.updatePanel()},5000)};
const backupDemoMarkup=backupPanelMarkup;backupPanelMarkup=function(){return backupDemoMarkup().replace('最近校验成功：','演示 · 最近校验成功：').replace('正在备份及校验','演示 · 正在备份及校验').replace('已校验 ·','演示 · 已校验 ·')};
BackupUI.observe=()=>{};BackupUI.renderAlert=()=>{};
Cloud.schedule=()=>{};
Cloud.push=async()=>{};
Cloud.init=async function(){
 this.user={id:"demo-user",email:"演示数据"};this.client={storage:{from:()=>({upload:async(path,file)=>{await demoFileRequest("readwrite",store=>store.put(file,path));return{error:null}},createSignedUrl:async path=>{let file=await demoFileRequest("readonly",store=>store.get(path));return file?{data:{signedUrl:URL.createObjectURL(file)}}:{error:{message:"演示图片未保存在此浏览器，请重新粘贴"}}},remove:async paths=>{for(let path of paths)await demoFileRequest("readwrite",store=>store.delete(path));return{error:null}}})}};
 this.setStatus("local","示例 · 本地保存");$("#cloudGate").hidden=true};
["#syncButton","#accountEmail"].forEach(selector=>$(selector).addEventListener("click",event=>{event.stopImmediatePropagation();toast("试用内容仅保存在当前浏览器，与正式工作台分开。")},true));
localStorage.setItem(LOCAL_MODE_KEY,"1");
if(!localStorage.getItem("cockpit-calm-demo-seeded-v1")){
 visualPreview.mode="new";rememberVisualPreview();
 const today=todayKey(),weekKey=currentWeekKey(),ago=days=>fmt(addDays(new Date(),-days));
 state=emptyState();
 state.projects=[
  {id:"demo-laser",name:"激光靶系统",code:"LASER",description:"版本验证与交付准备",milestones:[{id:"demo-test",name:"样机验证",status:"当前阶段",criteria:"低电量启动、充电指示和通信复测通过；异常有复现条件与验证结论。",due:fmt(addDays(new Date(),7))}]},
  {id:"demo-terminal",name:"报靶终端",code:"TERMINAL",description:"界面与设备协同验证"},
  {id:"demo-process",name:"产品与交付",code:"PRODUCT",description:"需求整理与交付资料"}
 ];
 const task=(id,title,nextAction,project,priority,extra={})=>({id,title,nextAction,project,priority,status:"进行中",focus:true,week:true,createdAt:new Date().toISOString(),...extra});
 state.tasks=[
  task("demo-t1","靶机电池充电异常排查","补测低电量启动，记录充电指示与实测电流","demo-laser","P0",{planDate:today,due:today,notes:"<p>核对电池、保护板和充电接口的连接情况，整理复测结果。</p>",checklist:[{id:"demo-c1",text:"确认测试条件与电池电压",done:true},{id:"demo-c2",text:"补测并记录电流",done:false}]}),
  task("demo-t2","确认报靶终端第一版交付范围","核对离线报靶、历史记录与异常提示三个场景","demo-terminal","P1",{planDate:today}),
  task("demo-t3","新天线遮挡环境复测","按统一安装高度补测，汇总箱内与箱外的通信差异","demo-laser","P1",{planDate:today}),
  task("demo-t4","整理本周客户反馈与版本需求","把反馈补入需求池，明确现象、影响范围和验收条件","demo-process","P2",{planDate:today}),
  task("demo-w1","等待供应商确认电芯参数","确认持续放电能力及保护板规格","demo-laser","P1",{status:"等待",focus:false,followup:today}),
  task("demo-w2","确认终端外壳打样排期","收到加工排期后更新交付安排","demo-terminal","P2",{status:"等待",focus:false,followup:today}),
  task("demo-w3","收集下一轮客户试用反馈","整理试用清单，约定反馈时间","demo-process","P2",{status:"等待",focus:false,followup:fmt(addDays(new Date(),2))}),
  task("demo-i1","补充低电量提示的测试场景","","","P2",{status:"待处理",focus:false,week:false}),
  task("demo-i2","整理客户现场安装注意事项","","demo-process","P2",{status:"待处理",focus:false,week:false}),
  task("demo-d1","完成项目例会纪要","","demo-process","P2",{status:"已完成",focus:false,completed:today}),
  task("demo-l1","梳理下一版设备远程诊断方案","先收集现场排障中反复出现的共性问题","demo-terminal","P2",{type:"长期跟进",focus:false,week:false})
 ];
 state.favorites=["demo-laser","demo-terminal"];
 state.order.today=["demo-t1","demo-t2","demo-t3","demo-t4"];state.order.pinToday=["demo-t1"];
 state.order.waiting=["demo-w1","demo-w2","demo-w3"];state.order.inbox=["demo-i1","demo-i2"];
 state.quickNote={delta:{ops:[{insert:"下午补拍测试接线照片\n",attributes:{quickDone:"0"}},{insert:"把现场问题整理成可复用的检查清单\n",attributes:{quickDone:"0"}}]},updatedAt:new Date().toISOString()};
 state=normalizeState(state);ensureCurrentWeek();
 let plan=state.weeks[weekKey];plan.top=["完成充电异常复测并形成结论","确认终端第一版交付范围","整理客户反馈与下周验证清单"];
 plan.reviewDone="<p>已完成项目例会纪要，更新测试安排与问题清单。</p>";
 plan.reviewMiss="<p>电芯资料等待供应商补充，收到后继续核对。</p>";
 plan.reviewNext="<p>继续验证低电量启动和现场通信稳定性。</p>";
 let journal=journalWeek(weekKey),dates=Object.keys(journal.days).sort(),content=[
  "<p>整理本周项目安排，明确激光靶系统的验证重点。</p><ul><li>核对样机与测试条件。</li><li>更新问题清单和交付计划。</li></ul>",
  "<p>完成天线在不同遮挡条件下的复测，补充测试记录。</p><p>与供应商确认电芯和保护板参数，待收到资料后继续核对。</p>",
  "<p>继续排查靶机充电异常，补测低电量启动场景。</p><ol><li>记录电池电压、充电电流和指示状态。</li><li>整理复测结论，更新问题台账。</li></ol>"
 ];
 dates.filter(date=>date<=today).forEach((date,index)=>{journal.days[date].content=content[Math.min(index,2)]});
 state.memos=[
  normalizeMemo({id:"demo-memo",title:"样机验证前的检查",project:"demo-laser",pinned:true,content:"<p>确认版本、供电条件和测试环境，并记录异常现象。</p><h2>开始之前</h2><ul><li>核对固件版本与测试接线。</li><li>记录电池电压、环境与样机编号。</li><li>保留异常现场照片和复现步骤。</li></ul><h2>记录结论</h2><p>将现象、测试条件与判断依据一起整理，便于后续复测和交接。</p>"}),
  normalizeMemo({id:"demo-memo-install",title:"现场安装与交付注意事项",project:"demo-process",content:"<p>安装前确认设备清单、供电条件和通信范围。</p>"}),
  normalizeMemo({id:"demo-memo-feedback",title:"客户反馈的记录方式",project:"demo-terminal",content:"<p>描述使用场景、问题现象和影响，补充截图与复现步骤。</p>"})
 ];
 uiLayout.todayLeft=.60;saveUiLayout();journalUI.width=620;
 saveLocal(true);localStorage.setItem("cockpit-calm-demo-seeded-v1","1");
}
const demoReset=document.createElement("button");demoReset.type="button";demoReset.className="ui-preview-reset";demoReset.textContent="恢复示例内容";
demoReset.onclick=()=>confirmAction("恢复示例内容？","将替换此预览中试写的内容，正式工作台不受影响。",()=>{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem("cockpit-calm-demo-seeded-v1");location.reload()},"恢复示例");
$("#uiPreviewPanel").appendChild(demoReset);

// Seed the new overview once, preserving any later trial edits.
if(!localStorage.getItem('cockpit-overview-trial-seeded-v1')){const p=state.projects[0];if(p){p.overviewHtml='<p><strong>目标：</strong>完成样机验证与版本交付。</p><p><strong>范围：</strong>结构、电子、固件与终端适配。</p><p><strong>当前判断：</strong>优先完成可靠性验证，再确认批量工艺。</p><p>这里可以自由编辑项目背景与关键判断。</p>';saveLocal(true)}localStorage.setItem('cockpit-overview-trial-seeded-v1','1')}

const trialJournalStatus=journalStatus;journalStatus=function(){trialJournalStatus();const label=document.getElementById('journalStatus');if(label&&!journalUI.dirty&&!journalUI.error)label.textContent='试用内容已保存到本机'};

if(!localStorage.getItem('cockpit-stage-trial-seeded-v1')){
 const project=state.projects.find(p=>p.id==='demo-laser');
 if(project&&project.milestones[0]){let stage=project.milestones[0];stage.goal='验证工程样机在低电量、遮挡与连续工作条件下的可靠性，明确进入设计验证的依据。';stage.acceptance=[{id:'trial-power',deliverable:'供电与充电测试报告',condition:'低电量可启动；记录电流、温升与充电指示；异常均有复测结论。',evidence:'',result:'待验证'},{id:'trial-radio',deliverable:'遮挡环境通信记录',condition:'统一安装高度与距离，记录丢包率和失联恢复情况。',evidence:'',result:'待验证'}];stage.relatedTaskIds=['demo-t1','demo-t3'];stage.conclusion='待本轮复测结束后，整理遗留问题与阶段判断。';saveLocal(true)}
 localStorage.setItem('cockpit-stage-trial-seeded-v1','1');
}
