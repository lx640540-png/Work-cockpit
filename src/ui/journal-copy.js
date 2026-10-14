// Export from Quill's document model so lists and inline formats survive copying.
function journalExport(format){
 if(format==="review"){
  let review=normalizeJournalReview(journalWeek(journalUI.week).review),labels={achievements:"本周成果",issues:"遗留问题",next:"下周跟进"};
  let parts=JOURNAL_REVIEW_FIELDS.filter(field=>review[field].trim()).map(field=>labels[field]+"\n"+review[field].trim());
  return parts.length?journalUI.week.slice(0,4)+"年 "+dateShort(journalUI.week)+"—"+dateShort(weekEnd(journalUI.week))+" 周五整理\n\n"+parts.join("\n\n"):"";
 }
 let week=journalWeek(journalUI.week),parts=[];
 for(let date of Object.keys(week.days).sort()){
  let editor=$('[data-journal-date="'+date+'"]'),q=quillFor(editor);if(!q||!q.getText().trim())continue;
  let title=journalDateLabel(date);if(format==="rich"){parts.push('<h2>'+esc(title)+'</h2>'+journalRichExport(q.getSemanticHTML()));continue}
  let lines=[],ops=q.getContents().ops,inline="";
  const escapeMD=text=>text.replace(/([\\`*_{}\[\]<>#!|])/g,"\\$1");let counters=[];
  for(let op of ops){if(typeof op.insert!=="string"){if(op.insert?.divider!==undefined)lines.push((op.insert.divider?String(op.insert.divider)+'\n':'')+'---');else if(op.insert?.focus)inline+='重点 ';continue}let chunks=op.insert.split("\n");for(let i=0;i<chunks.length;i++){
   let text=format==="markdown"?escapeMD(chunks[i]):chunks[i],attrs=op.attributes||{};
   if(text&&format==="markdown"){if(attrs.underline)text='<u>'+text+'</u>';if(attrs.bold)text='**'+text+'**';if(attrs.highlight)text='=='+text+'=='}inline+=text;
   if(i<chunks.length-1){let indent=Number(attrs.indent)||0,prefix="";if(attrs.list){if(attrs.list==="ordered"){counters.length=indent+1;counters[indent]=(counters[indent]||0)+1;prefix=counters[indent]+'. '}else{counters.length=indent;prefix='- '}prefix='  '.repeat(indent)+prefix}else{counters=[];if(format==="markdown"&&attrs.header)prefix='#'.repeat(attrs.header)+' '}
    lines.push(prefix+inline);inline="";
   }
  }}
  parts.push((format==="markdown"?'## ':'')+title+'\n'+lines.join('\n').trim());
 }
 return parts.join(format==="rich"?'':'\n\n');
}
async function journalCopy(format){
 let text=journalExport(format);if(!text){toast(format==="review"?"周五整理尚无内容":"本周暂无正文可复制");return}
 $(".journal-copy-menu").hidden=true;$('[data-journal-action="copy"]').setAttribute("aria-expanded","false");
 try{if(format==="rich"){if(!window.ClipboardItem||!navigator.clipboard?.write)throw new Error("rich clipboard unavailable");await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([text],{type:'text/html'}),'text/plain':new Blob([journalExport('plain')],{type:'text/plain'})})])}else await navigator.clipboard.writeText(text);toast("本周记录已复制")}catch{journalCopyFallback(format,text)}
}
function journalCopyFallback(format,text){
 let dialog=document.createElement("dialog");dialog.className="journal-copy-dialog";dialog.setAttribute("aria-label","手动复制本周记录");dialog.innerHTML='<h3>浏览器未允许自动复制</h3><p>选择以下内容，按 Ctrl/Cmd+C 复制。'+(format==='rich'?'粘贴到 Word 时选择保留源格式。':'')+'</p><div class="journal-copy-content" tabindex="0"></div><button type="button" class="btn">关闭</button>';
 let content=dialog.querySelector('.journal-copy-content');if(format==='rich'){content.contentEditable='true';content.innerHTML=text}else{let area=document.createElement('textarea');area.readOnly=true;area.value=text;content.appendChild(area)}dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();if(format==='rich'){content.focus();let range=document.createRange();range.selectNodeContents(content);let selection=getSelection();selection.removeAllRanges();selection.addRange(range)}else{let area=content.querySelector('textarea');area.focus();area.select()}
}

function journalRichExport(html){let box=document.createElement('div');box.innerHTML=sanitizeRichValue(html);let colors={yellow:'#fff0a8',green:'#c8efcf',blue:'#cce4ff'};box.querySelectorAll('span').forEach(node=>{let color=Object.keys(colors).find(value=>node.classList.contains('rich-highlight-'+value));if(color)node.style.backgroundColor=colors[color]});box.querySelectorAll('p,h2,h3').forEach(node=>{let level=(node.className.match(/ql-indent-([1-3])/)||[])[1];if(level)node.style.marginLeft=(Number(level)*24)+'px'});return box.innerHTML}
