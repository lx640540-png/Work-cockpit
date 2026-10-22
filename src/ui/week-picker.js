// One calendar for the weekly workspace and the journal. Dates remain local date keys.
let weekPickerState=null;
function weekRangeLabel(key){let start=parseDate(key);return isoWeekYear(start)+'年第'+isoWeekNumber(start)+'周 · '+dateShort(key)+'—'+dateShort(weekEnd(key))}
function closeWeekPicker(restoreFocus=false){let picker=weekPickerState;if(!picker)return;weekPickerState=null;picker.box.remove();picker.trigger?.setAttribute('aria-expanded','false');if(restoreFocus&&picker.trigger?.isConnected)picker.trigger.focus({preventScroll:true})}
function positionWeekPicker(){
 let picker=weekPickerState;if(!picker)return;
 let rect=picker.trigger.getBoundingClientRect(),box=picker.box,region=picker.trigger.closest('#workJournal')?.getBoundingClientRect(),top=Math.max(8,region?region.top+8:8),bottom=Math.min(innerHeight-8,region?region.bottom-8:innerHeight-8);
 box.style.maxHeight=Math.max(120,bottom-top)+'px';let width=box.offsetWidth,height=box.offsetHeight;
 box.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
 box.style.top=Math.max(top,Math.min(bottom-height,rect.bottom+height+8<=bottom?rect.bottom+8:rect.top-height-8))+'px';
}
function openWeekPicker(trigger,key,onSelect){
 if(weekPickerState?.trigger===trigger){closeWeekPicker(true);return}
 closeWeekPicker();let box=document.createElement('div');box.className='ui-week-picker';box.id='sharedWeekPicker';box.setAttribute('role','dialog');box.setAttribute('aria-label','选择周');
 weekPickerState={trigger,key,month:key.slice(0,7),focus:key,onSelect,box};trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',box.id);
 (trigger.closest('dialog[open]')||document.body).appendChild(box);renderWeekPicker(true);
}
function renderWeekPicker(focus=false){
 let picker=weekPickerState;if(!picker)return;let {key,month,box}=picker,first=parseDate(month+'-01'),start=mondayOf(first),year=first.getFullYear(),now=new Date().getFullYear();
 let years=Array.from({length:Math.max(now+10,year)-Math.min(now-10,year)+1},(_,i)=>Math.min(now-10,year)+i);
 let rows=Array.from({length:6},(_,row)=>{let monday=fmt(addDays(start,row*7)),active=monday===key;
  return '<div role="row" class="ui-week-row'+(active?' selected':'')+'"><button type="button" class="ui-week-number" data-week-pick="'+monday+'" aria-label="选择'+esc(weekRangeLabel(monday))+'">'+isoWeekNumber(parseDate(monday))+'</button>'+Array.from({length:7},(_,col)=>{let date=fmt(addDays(start,row*7+col));return '<button type="button" role="gridcell" data-week-pick="'+date+'" aria-selected="'+active+'" tabindex="'+(date===picker.focus?'0':'-1')+'" aria-label="'+date+'，'+esc(weekRangeLabel(monday))+'"'+(date===todayKey()?' aria-current="date"':'')+' class="'+(date.slice(0,7)!==month?'outside ':'')+(date===todayKey()?'today':'')+'">'+Number(date.slice(8))+'</button>'}).join('')+'</div>'}).join('');
 box.innerHTML='<div class="ui-week-heading"><button type="button" data-week-month="-1" aria-label="上个月">‹</button><select aria-label="选择年份" data-week-year>'+years.map(value=>'<option value="'+value+'" '+(value===year?'selected':'')+'>'+value+'年</option>').join('')+'</select><select aria-label="选择月份" data-week-month-select>'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'" '+(i===first.getMonth()?'selected':'')+'>'+(i+1)+'月</option>').join('')+'</select><button type="button" data-week-month="1" aria-label="下个月">›</button></div><div role="grid" aria-label="按周选择日期"><div class="ui-week-row" role="row"><small>周</small>'+['一','二','三','四','五','六','日'].map(day=>'<small role="columnheader">'+day+'</small>').join('')+'</div>'+rows+'</div><div class="ui-week-footer"><span>'+esc(weekRangeLabel(key))+'</span><button type="button" data-week-now>本周</button></div>';
 positionWeekPicker();if(focus)(box.querySelector('[role=gridcell][data-week-pick="'+picker.focus+'"]')||box.querySelector('[role=gridcell][aria-selected=true]')||box.querySelector('[role=gridcell]'))?.focus({preventScroll:true});
}
function selectPickerWeek(date){let picker=weekPickerState;if(!picker||!journalDateValid(date))return;let key=fmt(mondayOf(parseDate(date))),select=picker.onSelect;closeWeekPicker();select(key)}
document.addEventListener('click',event=>{
 let trigger=event.target.closest('[data-open-week-picker]');if(trigger){openWeekPicker(trigger,selectedWeekKey,key=>{selectedWeekKey=key;ui.showAllWeekDone=false;requestRender()});return}
 let button=event.target.closest('.ui-week-picker button'),picker=weekPickerState;if(!button||!picker)return;
 if(button.dataset.weekPick)return selectPickerWeek(button.dataset.weekPick);
 if(button.hasAttribute('data-week-now'))return selectPickerWeek(currentWeekKey());
 if(button.dataset.weekMonth){let month=parseDate(picker.month+'-01');month.setMonth(month.getMonth()+Number(button.dataset.weekMonth));picker.month=fmt(month).slice(0,7);renderWeekPicker()}
});
document.addEventListener('change',event=>{
 if(!event.target.closest('.ui-week-picker')||!weekPickerState)return;
 let box=weekPickerState.box,year=box.querySelector('[data-week-year]').value,month=pad(Number(box.querySelector('[data-week-month-select]').value));weekPickerState.month=year+'-'+month;renderWeekPicker();
});
document.addEventListener('pointerdown',event=>{if(weekPickerState&&!weekPickerState.box.contains(event.target)&&!weekPickerState.trigger.contains(event.target))closeWeekPicker()});
document.addEventListener('keydown',event=>{
 let picker=weekPickerState;if(!picker)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeWeekPicker(true);return}
 let cell=event.target.closest('.ui-week-picker [role=gridcell]');if(!cell)return;
 let offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(offset===undefined)return;event.preventDefault();let date=fmt(addDays(parseDate(cell.dataset.weekPick),offset));picker.focus=date;picker.month=date.slice(0,7);renderWeekPicker(true);
});
window.addEventListener('resize',positionWeekPicker);
document.addEventListener('scroll',event=>{if(weekPickerState&&!weekPickerState.box.contains(event.target))positionWeekPicker()},true);
