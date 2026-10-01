const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const code=fs.readFileSync('app.js','utf8');
const nodes=new Map();
let mobile=true;
const document={activeElement:null};
function el(id){
  if(!nodes.has(id)){
    const classes=new Set();
    const node={attributes:{},classList:{toggle(name,on){on?classes.add(name):classes.delete(name);},contains:name=>classes.has(name)},setAttribute(name,value){this.attributes[name]=value;},focus(){document.activeElement=this;},contains:node=>node===el('menuClose')};
    nodes.set(id,node);
  }
  return nodes.get(id);
}
const context={byId:el,document,window:{matchMedia:()=>({matches:mobile})}};
vm.createContext(context);
vm.runInContext(code.slice(code.indexOf('function setMenu('),code.indexOf('function setView(')),context);
context.setMenu(false);
assert.equal(el('sidebar').inert,true);
context.setMenu(true);
assert.equal(el('sidebar').inert,false);
assert.equal(el('menuBtn').attributes['aria-expanded'],'true');
assert.equal(el('menuScrim').classList.contains('open'),true);
assert.equal(document.activeElement,el('menuClose'));
context.setMenu(false);
assert.equal(el('sidebar').inert,true);
assert.equal(el('menuScrim').classList.contains('open'),false);
assert.equal(document.activeElement,el('menuBtn'));
for(let i=0;i<20;i++)context.setMenu(i%2===0);
assert.equal(el('menuBtn').attributes['aria-expanded'],'false');
mobile=false;context.setMenu(false);
assert.equal(el('sidebar').inert,false);
assert.equal(el('menuScrim').classList.contains('open'),false);
console.log('PASS mobile open/close, focus return, rapid toggles, desktop resize');
