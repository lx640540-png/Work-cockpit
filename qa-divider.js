const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function context(overrides={}){let c=vm.createContext({document:{querySelectorAll:()=>[]},...overrides});vm.runInContext(fs.readFileSync('src/ui/rich-divider.js','utf8'),c);return c}
test('deletion never steals Backspace from an external input or textarea',()=>{
 let deleted=0;const c=context({richDividerContext:()=>{throw Error('must not inspect another editor')}});
 for(const tag of ['input','textarea','select']){let event={key:'Backspace',target:{closest:selector=>selector.startsWith('input,')?{tagName:tag}:null},preventDefault:()=>deleted++};assert.equal(c.handleRichDividerKeydown(event),false)}assert.equal(deleted,0);
});
test('deletion requires the owning editor and an exact selected divider range',()=>{
 let deleted=0,prevented=0,range={index:4,length:1},node={},editor={querySelector:()=>node};const c=context();
 c.richDividerContext=()=>({index:4,quill:{isEnabled:()=>true,getSelection:()=>range,deleteText:(index,count,source)=>{assert.equal(index,4);assert.equal(count,1);assert.equal(source,'user');deleted++},setSelection:()=>{}}});
 let event={key:'Delete',target:{closest:s=>s==='.rich-editor'?editor:null},preventDefault:()=>prevented++};assert.equal(c.handleRichDividerKeydown(event),true);assert.equal(deleted,1);range={index:2,length:3};assert.equal(c.handleRichDividerKeydown(event),false);assert.equal(prevented,1);
});
test('Chinese composition never enters the divider deletion command',()=>{let c=context();assert.equal(c.handleRichDividerKeydown({key:'Backspace',isComposing:true}),false);assert.equal(c.handleRichDividerKeydown({key:'Delete',keyCode:229}),false)});
test('CSS cleanup keeps distinct values and distinct media contexts',()=>{
 const {audit}=require('./scripts/audit-css');let files=[{name:'one',text:'.a{color:red;width:10px}@media(max-width:500px){.a{color:red}}.a{color:blue}'},{name:'two',text:'.a{color:red}'}];let removed=audit(files);assert.equal(removed.length,1);assert.match(files[0].text,/width:10px/);assert.match(files[0].text,/color:blue/);assert.match(files[0].text,/@media\(max-width:500px\)\{.a\{color:red/);
});
