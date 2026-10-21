function openChoice(trigger,field,id){
 closeChoice();trigger.setAttribute("aria-expanded","true");trigger.setAttribute("aria-haspopup","listbox");
 let pop=$("#choicePopover"),values=field==="priority"?priorities:statuses,current=taskById(id)?.[field];pop.innerHTML=uiChoiceOptions(values,current);let rect=trigger.getBoundingClientRect();pop.style.left=Math.min(rect.left,innerWidth-145)+"px";pop.style.top=Math.min(rect.bottom+5,innerHeight-values.length*34-20)+"px";pop.hidden=false;pop.dataset.field=field;pop.dataset.task=id;pop.setAttribute("role","listbox");pop.setAttribute("aria-label",field==="priority"?"优先级":"任务状态");pop._trigger=trigger;pop.querySelector(".active,button")?.focus({preventScroll:true});pop.onkeydown=event=>uiOptionKeydown(event,pop,restore=>{closeChoice();if(restore!==false)trigger.focus({preventScroll:true})});
}
function closeChoice(){let pop=$("#choicePopover");pop._trigger?.setAttribute("aria-expanded","false");pop.hidden=true}
let activeHoverSelect=null,hoverSelectTimer=0;
function closeHoverSelect(owner=activeHoverSelect){if(!owner)return;owner.classList.remove("open");owner.querySelector(".hover-select-menu")?.setAttribute("hidden","");owner.querySelector(".hover-select-trigger")?.setAttribute("aria-expanded","false");if(activeHoverSelect===owner)activeHoverSelect=null}
function openHoverSelect(owner){if(!owner)return;clearTimeout(hoverSelectTimer);if(typeof activeHoverDetail!=="undefined"&&activeHoverDetail)closeHoverDetail(activeHoverDetail);if(activeHoverSelect&&activeHoverSelect!==owner)closeHoverSelect(activeHoverSelect);owner.classList.add("open");owner.querySelector(".hover-select-menu")?.removeAttribute("hidden");owner.querySelector(".hover-select-trigger")?.setAttribute("aria-expanded","true");activeHoverSelect=owner}
function syncHoverSelect(select){
 let owner=select?.closest(".hover-select"),trigger=owner?.querySelector(".hover-select-trigger"),menu=owner?.querySelector(".hover-select-menu");if(!owner||!trigger||!menu)return;
 let current=select.options[select.selectedIndex],label=trigger.querySelector("span");label.textContent=current?.textContent||"请选择";trigger.disabled=select.disabled;trigger.setAttribute("aria-expanded",owner.classList.contains("open")?"true":"false");
 menu.innerHTML=Array.from(select.options).map((option,index)=>'<button type="button" data-hover-select-option="'+index+'" role="option" aria-selected="'+(index===select.selectedIndex)+'" class="'+(index===select.selectedIndex?"active":"")+'" '+(option.disabled?"disabled":"")+'>'+esc(option.textContent)+'</button>').join("");
}
function enhanceHoverSelects(root=document){
 if(!root)return;root.querySelectorAll("select:not([data-hover-select-ready])").forEach(select=>{
  select.dataset.hoverSelectReady="1";let owner=document.createElement("div");owner.className="hover-select";select.before(owner);owner.appendChild(select);
  owner.insertAdjacentHTML("beforeend",'<button type="button" class="hover-select-trigger" aria-haspopup="listbox" aria-expanded="false"><span></span><b aria-hidden="true">⌄</b></button><div class="hover-select-menu" role="listbox" hidden></div>');
  syncHoverSelect(select);let trigger=owner.querySelector(".hover-select-trigger"),menu=owner.querySelector(".hover-select-menu");
  owner.addEventListener("pointerenter",event=>{if(isMouseHover(event))openHoverSelect(owner)});
  owner.addEventListener("pointerleave",event=>{if(!isMouseHover(event))return;clearTimeout(hoverSelectTimer);hoverSelectTimer=setTimeout(()=>{if(!owner.matches(":hover,:focus-within"))closeHoverSelect(owner)},80)});
  trigger.addEventListener("click",()=>owner.classList.contains("open")?closeHoverSelect(owner):openHoverSelect(owner));
  trigger.addEventListener("keydown",event=>{if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;event.preventDefault();openHoverSelect(owner);let enabled=Array.from(menu.querySelectorAll("button:not(:disabled)")),index=Math.max(0,enabled.findIndex(button=>button.classList.contains("active")));if(event.key==="ArrowDown")index=Math.min(enabled.length-1,index+1);else if(event.key==="ArrowUp")index=Math.max(0,index-1);else index=event.key==="End"?enabled.length-1:0;enabled[index]?.focus()});
  menu.addEventListener("click",event=>{let option=event.target.closest("[data-hover-select-option]");if(!option||option.disabled)return;select.selectedIndex=Number(option.dataset.hoverSelectOption);select.dispatchEvent(new Event("change",{bubbles:true}));syncHoverSelect(select);closeHoverSelect(owner);trigger.focus({preventScroll:true})});
  menu.addEventListener("keydown",event=>uiOptionKeydown(event,menu,restore=>{closeHoverSelect(owner);if(restore!==false)trigger.focus({preventScroll:true})}));
 });
}

