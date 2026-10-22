'use strict';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const clone=value=>JSON.parse(JSON.stringify(value));
const uid=prefix=>(prefix||"id")+"-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2));
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const strip=value=>{let node=document.createElement("div");node.innerHTML=String(value||"");return(node.textContent||"").replace(/\s+/g," ").trim()};
const normalizeRich=value=>{let text=String(value||"");if(!text)return"";if(/<[a-z][^>]*>/i.test(text))return text;return esc(text).replace(/\r\n?/g,"\n").replace(/\n/g,"<br>")};
const pad=value=>String(value).padStart(2,"0");
const fmt=date=>date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate());
const parseDate=value=>new Date(String(value)+"T00:00:00");
const addDays=(date,days)=>{let next=new Date(date);next.setDate(next.getDate()+days);return next};
const todayKey=()=>fmt(new Date());
const mondayOf=date=>{let next=new Date(date),day=(next.getDay()+6)%7;next.setHours(0,0,0,0);next.setDate(next.getDate()-day);return next};
const currentWeekKey=()=>fmt(mondayOf(new Date()));
const weekEnd=key=>fmt(addDays(parseDate(key),6));
const weekMode=key=>key<currentWeekKey()?"past":key>currentWeekKey()?"future":"current";
const dateShort=value=>value?Number(value.slice(5,7))+"/"+Number(value.slice(8,10)):"—";
const dateTime=value=>value?new Date(value).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
const isDone=task=>task.status==="已完成";
const projectById=id=>state.projects.find(project=>String(project.id)===String(id));
const taskById=id=>state.tasks.find(task=>String(task.id)===String(id));
const memoById=id=>state.memos.find(memo=>String(memo.id)===String(id));
const decisionById=id=>state.decisions.find(decision=>String(decision.id)===String(id));
const projectName=id=>projectById(id)?.name||"通用事项";
const statuses=["待处理","进行中","等待","已完成","暂停"];
const priorities=["P0","P1","P2","P3"];
const taskTypes=["任务","长期跟进"];
const STORAGE_KEY="work-cockpit-v6";
const LEGACY_KEYS=["smart-hardware-work-cockpit-v3","smart-hardware-work-cockpit-v2"];
const CLOUD_CONFIG_KEY="work-cockpit-supabase-config-v2";
const CLOUD_LINK_KEY="work-cockpit-cloud-link-v1";
const CLOUD_DEVICE_KEY="work-cockpit-device-id-v1";
const LOCAL_MODE_KEY="work-cockpit-local-mode-v1";
const LAYOUT_KEY="work-cockpit-layout-v1";
const DEFAULT_CLOUD_CONFIG={url:"https://nzujelkdbfmtgakrpvjy.supabase.co",key:"sb_publishable_mPO5isHU0eE7liYO_uFPPg_gsyhQ1SP"};
const RICH_HEIGHT_SPECS={taskNotesHeight:{default:220,min:160,max:520},decisionConclusionHeight:{default:160,min:120,max:360},decisionRationaleHeight:{default:160,min:120,max:360},reviewDoneHeight:{default:150,min:110,max:360},reviewMissHeight:{default:150,min:110,max:360},reviewNextHeight:{default:150,min:110,max:360}};

function loadUiLayout(){let value={};try{value=JSON.parse(localStorage.getItem(LAYOUT_KEY)||"{}")}catch(error){}let layout={todayWaitingShare:Math.max(.2,Math.min(.8,Number(value.todayWaitingShare)||.55)),todayHeight:Math.max(400,Math.min(900,Number(value.todayHeight)||460)),todayLeft:Math.max(.38,Math.min(.66,Number(value.todayLeft)||.52)),quickNoteLeft:Math.max(.34,Math.min(.66,Number(value.quickNoteLeft)||.5)),quickNoteHeight:Math.max(155,Math.min(520,Number(value.quickNoteHeight)||190)),projectListWidth:Math.max(280,Math.min(420,Number(value.projectListWidth)||300)),weekPlanLeft:Math.max(.34,Math.min(.66,Number(value.weekPlanLeft)||.5)),weekReviewLeft:Math.max(.34,Math.min(.66,Number(value.weekReviewLeft)||.46))};Object.entries(RICH_HEIGHT_SPECS).forEach(([key,spec])=>layout[key]=Math.max(spec.min,Math.min(spec.max,Number(value[key])||spec.default)));return layout}
let uiLayout=loadUiLayout();
function saveUiLayout(){localStorage.setItem(LAYOUT_KEY,JSON.stringify(uiLayout))}


