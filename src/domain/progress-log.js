// Preserve retired progress entries and drafts in saved/exported legacy task data.
function normalizeProgressLog(value){
 if(!Array.isArray(value))return [];
 return value.filter(entry=>entry&&typeof entry.text==="string"&&entry.text.trim()).map(entry=>({id:String(entry.id||uid("progress")),text:entry.text,createdAt:String(entry.createdAt||"")}));
}
