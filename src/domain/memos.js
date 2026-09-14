function createMemo(){
 let memo=normalizeMemo({id:uid("memo"),title:"新备忘录"});commit("新增备忘录",draft=>{draft.memos.unshift(memo);draft.order.memoActive.unshift(memo.id)},{immediate:true});selectedMemoId=memo.id;memoArchived=false;navigate("memos");
}
function moveMemosToTrash(ids,label="删除备忘录"){
 let selected=new Set(ids);if(!selected.size)return;
 commit(label,draft=>{draft.memos.filter(memo=>selected.has(memo.id)).forEach(memo=>draft.trash.unshift({id:uid("trash"),type:"memo",deletedAt:new Date().toISOString(),data:clone(memo)}));draft.memos=draft.memos.filter(memo=>!selected.has(memo.id));draft.order.memoActive=draft.order.memoActive.filter(id=>!selected.has(id));draft.order.memoArchived=draft.order.memoArchived.filter(id=>!selected.has(id))},{immediate:true});
 if(selected.has(selectedMemoId))selectedMemoId="";
}
function deleteMemo(id){
 let memo=memoById(id);if(!memo)return;confirmAction("删除备忘录？","备忘录会进入回收站，可稍后恢复。",()=>moveMemosToTrash([id]),"删除");
}
function memoToTask(id){let memo=memoById(id);if(!memo)return;openTask("",{title:memo.title,nextAction:"",notes:memo.content,project:memo.project,status:"待处理",inbox:true})}
