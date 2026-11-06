// Device-local appearance settings; demo data isolation is a separate build concern.
const VISUAL_PREVIEW_KEY="work-cockpit-visual-preview-v1";
const VISUAL_PREVIEW_ENABLED=true;
let visualPreview={mode:"new",frame:"full",radius:10,density:"comfortable",font:"system",scrollbars:"auto"};
try{let saved=JSON.parse(localStorage.getItem(VISUAL_PREVIEW_KEY)||"null");if(saved)visualPreview={...visualPreview,...saved}}catch{}
visualPreview.mode=visualPreview.mode==="old"?"old":"new";
visualPreview.frame=visualPreview.frame==="inset"?"inset":"full";
visualPreview.radius=Math.min(14,Math.max(6,Number(visualPreview.radius)||10));
visualPreview.density=visualPreview.density==="compact"?"compact":"comfortable";
const UI_FONT_PROFILES={
 system:{label:'系统优先',stack:'-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei","Preview CJK",sans-serif',heading:600,control:500},
 dengxian:{label:'等线',family:'DengXian',stack:'"DengXian","等线",sans-serif',heading:700,control:400},
 pingfang:{label:'苹方',family:'PingFang SC',stack:'"PingFang SC",sans-serif',heading:600,control:500},
 yahei:{label:'微软雅黑',family:'Microsoft YaHei',stack:'"Microsoft YaHei",sans-serif',heading:700,control:400}
};
const uiFontAvailability={};
function uiFontInstalled(key){
 if(key==='system')return true;if(key in uiFontAvailability)return uiFontAvailability[key];
 let family=UI_FONT_PROFILES[key]?.family;if(!family)return false;
 let ctx=document.createElement('canvas').getContext('2d'),sample='工作记录与样机验证 AaMmWw 0123456789';
 return uiFontAvailability[key]=['monospace','serif'].some(base=>{ctx.font='72px '+base;let width=ctx.measureText(sample).width;ctx.font='72px "'+family+'",'+base;return Math.abs(ctx.measureText(sample).width-width)>.1});
}
function syncUiAppearance(){
 let requested=UI_FONT_PROFILES[visualPreview.font]?visualPreview.font:'system',available=uiFontInstalled(requested),active=available?requested:'system',profile=UI_FONT_PROFILES[active],root=document.documentElement;
 root.dataset.uiFont=active;root.dataset.scrollbars=visualPreview.scrollbars==='always'?'always':'auto';
 root.style.setProperty('--ui-font-stack',profile.stack);root.style.setProperty('--ui-heading-weight',profile.heading);root.style.setProperty('--ui-control-weight',profile.control);
 let note=$('#previewFontNote');if(note)note.textContent=available?'字体只影响本机界面，不改变记录内容。':'当前设备未检测到'+UI_FONT_PROFILES[requested].label+'，已使用系统优先。';
 $('#previewFontSample')?.replaceChildren('工作记录与样机验证 Aa 123');
}
function syncVisualPreview(){
 if(!VISUAL_PREVIEW_ENABLED)return;
 syncUiAppearance();
 let root=document.documentElement;
 root.dataset.visualPreview=visualPreview.mode;
 root.dataset.workspacePage=currentPage;
 root.toggleAttribute("data-calm-today",visualPreview.mode==="new");
 root.toggleAttribute("data-calm-page",visualPreview.mode==="new"&&currentPage==="today");
 root.dataset.previewFrame=visualPreview.frame;
 root.style.setProperty("--preview-radius",visualPreview.radius+"px");
 root.style.setProperty("--preview-row-height",visualPreview.density==="compact"?"52px":"60px");
 $$("[data-preview-mode]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.previewMode===visualPreview.mode)));
 let note=$("#uiPreviewNote");if(note)note.textContent="项目 · 任务 · 工作记录";
 $("#previewRadiusValue")?.replaceChildren(String(visualPreview.radius));
 requestAnimationFrame(()=>{if(journalUI.open)journalLayout();if(typeof layoutComponentPreview==="function")layoutComponentPreview()});
}
function rememberVisualPreview(){try{localStorage.setItem(VISUAL_PREVIEW_KEY,JSON.stringify(visualPreview))}catch{}syncVisualPreview()}
function initVisualPreview(){
 if(!VISUAL_PREVIEW_ENABLED)return;
 if($("#uiPreviewStrip"))return;
 let strip=document.createElement("section");strip.id="uiPreviewStrip";strip.className="ui-preview-strip";strip.setAttribute("aria-label","界面设置");
 strip.innerHTML='<div class="ui-preview-title"><strong>工作台</strong><small id="uiPreviewNote">项目 · 任务 · 工作记录</small></div><div class="ui-preview-controls"><button type="button" data-preview-components aria-pressed="false">组件展示</button><div class="ui-preview-modes" role="group" aria-label="界面版本"><button type="button" data-preview-mode="old" aria-pressed="false">原版</button><button type="button" data-preview-mode="new" aria-pressed="true">新版</button></div><button type="button" class="ui-preview-settings" aria-expanded="false" aria-controls="uiPreviewPanel">调整样式</button></div><div class="ui-preview-panel" id="uiPreviewPanel" hidden><label><span>页面外框</span><select id="previewFrame"><option value="full">铺满可用区域</option><option value="inset">保留少量留白</option></select></label><label><span>内容密度</span><select id="previewDensity"><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label><label><span>界面字体</span><select id="previewFont"><option value="system">系统优先</option><option value="dengxian">等线</option><option value="pingfang">苹方</option><option value="yahei">微软雅黑</option></select></label><div class="preview-font-sample" id="previewFontSample">工作记录与样机验证 Aa 123</div><p id="previewFontNote" role="status"></p><label><span>滚动条</span><select id="previewScrollbars"><option value="auto">操作时显示</option><option value="always">始终显示</option></select></label><label><span>卡片圆角</span><input id="previewRadius" type="range" min="6" max="14" step="1"><output id="previewRadiusValue" for="previewRadius">10</output></label><p>外观设置保存在当前设备；切换样式不会重载页面。</p><button type="button" class="ui-preview-reset">恢复默认样式</button></div>';
 document.body.prepend(strip);
 const syncControls=()=>{$("#previewFont").value=visualPreview.font||"system";$("#previewScrollbars").value=visualPreview.scrollbars||"auto";$("#previewFrame").value=visualPreview.frame;$("#previewDensity").value=visualPreview.density;$("#previewRadius").value=String(visualPreview.radius)};syncControls();
 strip.addEventListener("mousedown",event=>{if(event.target.closest("[data-preview-mode]"))event.preventDefault()});
 strip.addEventListener("click",event=>{let button=event.target.closest("button");if(!button)return;if(button.hasAttribute("data-preview-components")){toggleComponentPreview()}else if(button.dataset.previewMode){visualPreview.mode=button.dataset.previewMode;rememberVisualPreview()}else if(button.matches(".ui-preview-settings")){let panel=$("#uiPreviewPanel");panel.hidden=!panel.hidden;button.setAttribute("aria-expanded",String(!panel.hidden))}else if(button.matches(".ui-preview-reset")){visualPreview={mode:"new",frame:"full",radius:10,density:"comfortable",font:"system",scrollbars:"auto"};syncControls();rememberVisualPreview()}});
 strip.addEventListener("input",event=>{let target=event.target;if(target.id==="previewFont")visualPreview.font=target.value;else if(target.id==="previewScrollbars")visualPreview.scrollbars=target.value;else if(target.id==="previewRadius")visualPreview.radius=Number(target.value);else if(target.id==="previewFrame")visualPreview.frame=target.value;else if(target.id==="previewDensity")visualPreview.density=target.value;else return;rememberVisualPreview()});
 document.addEventListener("pointerdown",event=>{if(!strip.contains(event.target)){$("#uiPreviewPanel").hidden=true;$(".ui-preview-settings",strip).setAttribute("aria-expanded","false")}});
 strip.addEventListener("keydown",event=>{if(event.key==="Escape"){$("#uiPreviewPanel").hidden=true;$(".ui-preview-settings",strip).setAttribute("aria-expanded","false");$(".ui-preview-settings",strip).focus();event.stopPropagation()}});
 syncVisualPreview();
}
initVisualPreview();
