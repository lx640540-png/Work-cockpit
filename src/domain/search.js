// Shared literal/token matching; subsequence matching is limited to titles.
function normalizedSearchText(value){return String(value||'').normalize('NFKC').toLocaleLowerCase('zh-CN')}
function searchTokens(query){return [...new Set(normalizedSearchText(query).trim().split(/\s+/).filter(Boolean))]}
function titleSubsequence(text,query){let chars=Array.from(query);if(chars.length<2)return false;let at=0;for(let ch of Array.from(text))if(ch===chars[at]&&++at===chars.length)return true;return false}
function matchSearch(primary,fields,query){
 let q=normalizedSearchText(query).trim(),title=normalizedSearchText(primary),tokens=searchTokens(q),values=fields.map(f=>({...f,normalized:normalizedSearchText(f.text)}));if(!tokens.length)return{score:1,sources:[]};
 let all=tokens.every(token=>title.includes(token)||values.some(f=>f.normalized.includes(token))),jump=tokens.length===1&&titleSubsequence(title,q);
 if(!all&&!jump)return{score:0,sources:[]};
 let score=title===q?120:title.startsWith(q)?100:title.includes(q)?90:tokens.every(t=>title.includes(t))?80:all?60:30;
 return{score,sources:values.filter(f=>tokens.some(t=>f.normalized.includes(t))).map(f=>f.label),jump:!all&&jump};
}
function taskSearchFields(task){let project=projectById(task.project),milestone=milestoneOf(task,project);return[{label:'下一步',text:task.nextAction},{label:'备注',text:strip(task.notes)},{label:'推进记录',text:(task.progressLog||[]).map(e=>e.text).join(' ')},{label:'项目',text:[project?.name,project?.code].join(' ')},{label:'里程碑',text:milestone?.name},{label:'状态',text:[task.status,task.priority,task.type].join(' ')}]}
function taskSearchMatch(task,query){return matchSearch(task.title,taskSearchFields(task),query)}
function highlightSearch(value,query,allowJump=false){
 let chars=Array.from(String(value||'')),normalized='',map=[];chars.forEach((ch,i)=>{let part=normalizedSearchText(ch);normalized+=part;for(let j=0;j<part.length;j++)map.push(i)});
 let marks=new Set(),tokens=searchTokens(query);for(let token of tokens){let from=0,at;while((at=normalized.indexOf(token,from))>=0){for(let i=at;i<at+token.length;i++)marks.add(map[i]);from=at+Math.max(1,token.length)}}
 if(!marks.size&&allowJump&&tokens.length===1&&titleSubsequence(normalized,tokens[0])){let from=0;for(let ch of Array.from(tokens[0])){let at=normalized.indexOf(ch,from);for(let j=at;j<at+ch.length;j++)marks.add(map[j]);from=at+ch.length}}
 return chars.map((ch,i)=>(marks.has(i)&&!marks.has(i-1)?'<mark>':'')+esc(ch)+(marks.has(i)&&!marks.has(i+1)?'</mark>':'')).join('');
}
function taskSearchHint(task,query){
 if(!String(query||'').trim())return '';let match=taskSearchMatch(task,query);if(!match.score)return '';
 let fields=taskSearchFields(task).filter(f=>match.sources.includes(f.label)),chosen=fields.find(f=>['备注','推进记录'].includes(f.label))||fields[0];
 let source=match.jump?'标题跳字匹配':match.sources.length?'命中'+match.sources.join('、'):'命中标题';
 return '<small class="search-match-source">'+esc(source)+'</small>'+(chosen?'<small class="search-match-preview">'+highlightSearch(searchExcerpt(chosen.text,query),query)+'</small>':'');
}
