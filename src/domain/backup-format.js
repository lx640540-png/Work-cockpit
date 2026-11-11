/* Shared, dependency-free backup format. Browser classic script and Worker module. */
(function(root){
 const collections=new Set(['tasks','projects','memos','decisions','milestones','checklist','attachments']);
 function validate(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.tasks)||!Array.isArray(value.projects))throw Error('缺少事项或项目数据');
  function visit(obj,depth=0,parent=''){
   if(!obj||typeof obj!=='object')return;if(depth>50)throw Error('数据嵌套过深');
   for(const [key,item] of Object.entries(obj)){
    if(['__proto__','constructor','prototype'].includes(key))throw Error('数据包含不安全字段');
    if(collections.has(key)&&Array.isArray(item)){
     const ids=new Set();for(const entry of item){
      if(parent==='order'){if(!['string','number'].includes(typeof entry))throw Error('排序包含无效数据');continue}
      if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error(key+'包含无效数据');
      if(entry.id!==undefined&&entry.id!==null&&entry.id!==''){const id=String(entry.id);if(!/^[\p{L}\p{N}_.:-]{1,160}$/u.test(id))throw Error(key+'包含无效标识');if(ids.has(id))throw Error(key+'存在重复 ID：'+id);ids.add(id)}
     }
    }
    if(item&&typeof item==='object')visit(item,depth+1,key);
   }
  }visit(value);return value;
 }
 function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value)}
 function meaningful(value){if(/<img\b|data-rich-image|work-divider/.test(String(value||'')))return true;return String(value||'').replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/g,' ').trim().length>0}
 function summary(value){
  let journalDays=0;for(const week of Object.values(value?.meta?.workJournal?.weeks||{})){for(const day of Object.values(week.days||{}))if(meaningful(day.content))journalDays++;if(Object.values(week.review||{}).some(meaningful))journalDays++}
  let quickNote=(value?.quickNote?.delta?.ops||[]).some(op=>typeof op.insert==='object'||meaningful(op.insert));
  return {tasks:value?.tasks?.length||0,projects:value?.projects?.length||0,memos:value?.memos?.length||0,decisions:value?.decisions?.length||0,journalDays,quickNote:Number(quickNote)};
 }
 function risk(before,after){const a=summary(before),b=summary(after);return Object.keys(a).filter(k=>a[k]>0&&(b[k]===0||(a[k]>=10&&b[k]<a[k]/2)))}
 function content(value){let v=JSON.parse(JSON.stringify(value));delete v.snapshots;delete v.recoveryInfo;if(v.meta)delete v.meta.updatedAt;return stable(v)}
 function retained(rows,now=Date.now()){
  const keep=new Set(),days=new Set();let newestGood=rows.find(r=>r.status==='verified'&&!r.quarantined);if(newestGood)keep.add(newestGood.id);
  for(const row of rows){if(row.status!=='verified')continue;const age=now-Date.parse(row.created_at),day=row.created_at.slice(0,10);if(age<48*3600000||age<30*86400000&&!days.has(day)||row.pinned)keep.add(row.id);days.add(day)}return keep;
 }
 root.BackupFormat={validate,stable,summary,risk,content,retained};if(typeof module!=='undefined'&&module.exports)module.exports=root.BackupFormat;
})(globalThis);
