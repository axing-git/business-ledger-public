const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
async function setup(session=null){
  const nodes=new Map(),calls=[];
  const workspace={set inert(value){throw new Error('Do not lock the workspace: it contains mobile navigation');}};
  const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},reportValidity(){return true;}});return nodes.get(id);};
  let updateError=null;
  const auth={onAuthStateChange(){},getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session?.user}}),resetPasswordForEmail:async(email,options)=>{calls.push({email,options});return {error:null};},updateUser:async({password})=>{calls.push({password});return {data:{user:session?.user},error:updateError};}};
  const client={auth,from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})};
  const context={window:{SUPABASE_CONFIG:{},supabase:{createClient:()=>client},addEventListener(){}},document:{getElementById:el,querySelector:()=>workspace,addEventListener(){}},localStorage:{getItem:()=>null},URL,URLSearchParams,location:{origin:'https://example.com',pathname:'/ledger/',search:'?reset=1',hash:'',href:'https://example.com/ledger/?reset=1'},history:{replaceState(){}},setTimeout:()=>1,clearTimeout(){}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('cloud.js','utf8'),context);
  await context.window.ledgerCloud.init({replaceData(){},notify(){}});
  return {el,calls,workspace,setError:e=>updateError=e};
}
(async()=>{
  const expired=await setup();assert.equal(expired.el('recoverySubmit').disabled,true);assert.match(expired.el('recoveryMessage').textContent,/过期/);
  expired.el('recoveryBack').onclick();assert.equal(expired.el('cloudForm').hidden,false);
  expired.el('cloudEmail').value='test@example.com';await expired.el('authForgot').onclick();assert.equal(expired.calls[0].options.redirectTo,'https://example.com/ledger/?reset=1');
  assert.equal(expired.el('overviewView').inert,true);assert.equal(expired.el('recordsView').inert,true);assert.equal(expired.el('addBtn').disabled,true);
  assert.notEqual(expired.el('menuBtn').disabled,true);assert.notEqual(expired.el('cloudBtn').disabled,true);
  const valid=await setup({user:{id:'test-user',email:'test@example.com'}});assert.equal(valid.el('recoverySubmit').disabled,false);assert.equal(valid.el('overviewView').inert,true);
  valid.el('recoveryPassword').value='new-test-password';valid.el('recoveryConfirm').value='different';
  await valid.el('recoveryForm').onsubmit({preventDefault(){}});assert.equal(valid.calls.length,0);
  valid.el('recoveryConfirm').value='new-test-password';valid.setError({message:'update failed'});
  await valid.el('recoveryForm').onsubmit({preventDefault(){}});assert.match(valid.el('recoveryMessage').textContent,/update failed/);assert.equal(valid.el('recoveryForm').hidden,false);
  valid.setError(null);await valid.el('recoveryForm').onsubmit({preventDefault(){}});assert.equal(valid.el('recoveryPassword').value,'');assert.equal(valid.el('recoveryConfirm').value,'');assert.equal(valid.el('recoveryForm').hidden,true);assert.equal(valid.el('overviewView').inert,false);assert.equal(valid.el('recordsView').inert,false);assert.equal(valid.el('addBtn').disabled,false);
  console.log('PASS recovery email redirect, expired session, password mismatch, update failure, successful update and password clearing');
})().catch(error=>{console.error(error);process.exitCode=1;});
