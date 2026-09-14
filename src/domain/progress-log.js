function normalizeProgressLog(value){
 if(!Array.isArray(value))return [];
 return value.filter(entry=>entry&&typeof entry.text==="string"&&entry.text.trim()).map(entry=>({id:String(entry.id||uid("progress")),text:entry.text,createdAt:String(entry.createdAt||"")}));
}
function progressEntriesForWeek(task,key){return (task.progressLog||[]).filter(entry=>{let date=fmt(new Date(entry.createdAt));return date>=key&&date<=weekEnd(key)})}
