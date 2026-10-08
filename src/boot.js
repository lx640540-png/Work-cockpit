let dateWatch=todayKey();
function checkDateChange(){let next=todayKey();if(next===dateWatch)return;dateWatch=next;ensureCurrentWeek();selectedWeekKey=currentWeekKey();activateScheduledTasks();captureCurrentWeek();saveLocal(true);requestRender()}
setInterval(checkDateChange,60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkDateChange()});
window.addEventListener("online",()=>{if(Cloud.user)Cloud.push()});
async function boot(){
 applyTheme(localStorage.getItem(THEME_KEY)||"system",false);
 restoreWorkspacePreferences();
 renderApp();
 await Cloud.init();
 refreshScheduledTasks();
 document.documentElement.classList.remove("booting");
}
boot().catch(error=>{console.error("应用启动失败",error);document.documentElement.classList.remove("booting");toast("启动时发生错误，本机数据未删除")});

