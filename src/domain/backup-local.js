// Independent of work-cockpit-v6 and its embedded snapshots.
const LOCAL_RECOVERY_KEY='work-cockpit-independent-recovery-v1';
const RESTORE_PENDING_KEY='work-cockpit-restore-pending-v1';
function recoveryOwner(){try{return JSON.parse(localStorage.getItem(CLOUD_LINK_KEY)||'null')?.userId||window.CloudSync?.user?.id||'local'}catch{return 'local'}}
function localRecoveryList(){try{const rows=JSON.parse(localStorage.getItem(LOCAL_RECOVERY_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return []}}
function checkpointLocal(label,value=state){
 let copy=JSON.parse(JSON.stringify(value));copy.snapshots=[];
 let rows=localRecoveryList(),entry={id:uid('independent'),owner:recoveryOwner(),label,createdAt:new Date().toISOString(),state:copy};
 let text=JSON.stringify([entry,...rows].slice(0,3));
 try{localStorage.setItem(LOCAL_RECOVERY_KEY,text);if(localStorage.getItem(LOCAL_RECOVERY_KEY)!==text)throw Error('校验失败')}catch{throw Error('安全副本保存失败，请先导出 JSON，再重试此操作')}
 return entry;
}
function markRestorePending(){localStorage.setItem(RESTORE_PENDING_KEY,JSON.stringify({owner:recoveryOwner(),createdAt:new Date().toISOString()}));if(window.CloudSync){window.CloudSync.importPending=true;clearTimeout(window.CloudSync.timer)}}
function clearRestorePending(){localStorage.removeItem(RESTORE_PENDING_KEY);if(window.CloudSync)window.CloudSync.importPending=false}
function hasRestorePending(){try{return !!JSON.parse(localStorage.getItem(RESTORE_PENDING_KEY)||'null')}catch{return true}}
function stageRecoveredState(value,label){
 validateImportedData(value);if(!flushPendingEdits())throw Error('当前编辑尚未保存，请先重试保存');checkpointLocal(label+'前的本机副本');markRestorePending();replaceState(value,label);toast('已恢复到本机，核对后可在同步窗口选择“替换云端”');
}
