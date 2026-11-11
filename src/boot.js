let dateWatch=todayKey();
function checkDateChange(){let next=todayKey();if(next===dateWatch)return;dateWatch=next;ensureCurrentWeek();selectedWeekKey=currentWeekKey();activateScheduledTasks();captureCurrentWeek();saveLocal(true);requestRender()}
setInterval(checkDateChange,60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkDateChange()});
window.addEventListener("online",()=>{if(Cloud.user)Cloud.push()});
async function boot(){
 applyTheme(localStorage.getItem(THEME_KEY)||"system",false);
 restoreWorkspacePreferences();
 renderApp();
 if(localReadIssue){const banner=document.createElement("div");banner.id="localReadFailure";banner.className="backup-warning";banner.setAttribute("role","alert");banner.textContent="本机主数据读取异常，原文仍保留，自动保存和同步已暂停。请在数据与恢复中选择明确的恢复来源。 ";let download=document.createElement("button");download.className="btn";download.textContent="下载异常原文";download.onclick=()=>{let a=document.createElement("a"),url=URL.createObjectURL(new Blob([localReadIssue.raw],{type:"text/plain"}));a.href=url;a.download="工作台-异常原文.txt";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};banner.append(download);document.body.prepend(banner);navigate("data");return;}
 window.WorkbenchLoader?.setMessage("正在检查登录与同步状态");
 await Cloud.init();
 refreshScheduledTasks();
 document.documentElement.classList.remove("booting");
 window.WorkbenchLoader?.finish();
}
boot().catch(error=>{console.error("应用启动失败",error);document.documentElement.classList.remove("booting");window.WorkbenchLoader?.finish();toast("启动时发生错误，本机数据未删除")});

