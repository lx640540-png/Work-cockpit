function validateImportedData(data){return BackupFormat.validate(data)}
function exportData(){
 let blob=new Blob([JSON.stringify({product:"工作台",formatVersion:8,exportedAt:new Date().toISOString(),...snapshotCore()},null,2)],{type:"application/json"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="工作台-"+todayKey()+".json";link.click();URL.revokeObjectURL(link.href);toast("JSON 已导出");
}
function importFile(file){
 let reader=new FileReader();reader.onload=()=>{try{let data=JSON.parse(reader.result);validateImportedData(data);confirmAction("导入这份 JSON？","当前数据会先创建安全快照，导入后不会直接覆盖云端。",()=>{try{checkpointLocal("导入 JSON 前的独立安全副本");markRestorePending();let backup=createSnapshot("导入 JSON 前的安全快照"),next=normalizeState(data);next.snapshots=[backup,...next.snapshots].slice(0,12);replaceState(next,"导入 JSON");toast("JSON 已导入本机；云端尚未覆盖")}catch(error){toast("导入未完成："+error.message)}},"导入")}catch(error){toast("导入失败："+error.message)}};reader.readAsText(file);
}
