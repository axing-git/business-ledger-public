const STORAGE_KEY = 'xiaoman-ledger-2026-v1';
const PROFILE_KEY = 'xiaoman-ledger-profile-v1';
const SOURCES = { gj: '租号管家', yd: '租号营地' };

const defaultRecords = [];

const defaultProfile = { name:'租号生意账本', year:2026 };
let profile = loadProfile();
let records = loadRecords();
let activeFilter = 'all';
let currentView = 'overview';

function loadProfile(){ return structuredClone(defaultProfile); }
function loadRecords(){ return []; }
function saveRecords(){ window.ledgerCloud?.scheduleSync(); }
function saveProfile(){ window.ledgerCloud?.scheduleSync(); }
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(n){ return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',minimumFractionDigits:2}).format(Number(n)||0).replace('CN¥','¥'); }
function num(n){ return Number(n)||0; }
function percent(n){ return `${((Number(n)||0)*100).toFixed(1)}%`; }
function dateLabel(date){ const d=new Date(`${date}T00:00:00`); return {main:`${d.getMonth()+1}月${d.getDate()}日`,year:`${d.getFullYear()}`}; }
function sortedRecords(){ return [...records].sort((a,b)=>a.date.localeCompare(b.date)||(num(a.order)-num(b.order))); }
function defaultRecordDate(){
  const year=Number(profile.year),today=new Date();
  if(today.getFullYear()===year)return `${year}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  return `${year}-01-01`;
}
function applyProfile(){
  const year=Number(profile.year); setText('brandName',profile.name); setText('brandMeta',`DIGITAL BUSINESS · ${year}`); setText('yearDisplay',year); setText('breadcrumbName',profile.name); setText('summaryYearLabel',`${year} 年累计`); document.title=`${profile.name} · ${year}`;
  byId('recordDate').min=`${year}-01-01`; byId('recordDate').max=`${year}-12-31`;
}
function openSettings(){ byId('settingsName').value=profile.name; byId('settingsYear').value=profile.year; byId('settingsBackdrop').classList.add('open'); byId('settingsBackdrop').setAttribute('aria-hidden','false'); setTimeout(()=>byId('settingsName').focus(),50); }
function closeSettings(){ byId('settingsBackdrop').classList.remove('open'); byId('settingsBackdrop').setAttribute('aria-hidden','true'); }
function submitSettings(e){
  e.preventDefault(); const name=value('settingsName').trim()||defaultProfile.name,year=Math.min(2100,Math.max(2000,Math.round(numberValue('settingsYear'))||2026)); const oldYear=Number(profile.year);
  if(oldYear!==year&&records.length&&!confirm(`将经营年份从 ${oldYear} 修改为 ${year}，现有记录的年份也会一起修改。是否继续？`))return;
  if(oldYear!==year)records=records.map(r=>({...r,date:`${year}${r.date.slice(4)}`}));
  profile={name,year}; saveProfile(); saveRecords(); applyProfile(); closeSettings(); render(); showToast('账本设置已更新');
}
function downloadFile(filename,content,type){ const blob=new Blob([content],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0); }
function safeFilename(name){ return String(name||'生意账本').replace(/[\\/:*?"<>|]/g,'-'); }
function exportBackup(){
  const payload={format:'business-ledger-backup',version:1,exportedAt:new Date().toISOString(),profile,records};
  downloadFile(`${safeFilename(profile.name)}_${profile.year}_完整备份.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8'); showToast('完整备份已导出 · 收好它哦');
}
async function importBackup(file){
  try{
    const payload=JSON.parse(await file.text());
    validateLedger(payload);
    if(payload?.format!=='business-ledger-backup'||!Array.isArray(payload.records)||!payload.profile?.name||!payload.profile?.year)throw new Error('invalid');
    if(!confirm(`将使用备份“${payload.profile.name}”覆盖当前账本，共 ${payload.records.length} 条记录。是否继续？`))return;
    profile={name:String(payload.profile.name).slice(0,24),year:Number(payload.profile.year)}; records=payload.records; saveProfile(); saveRecords(); applyProfile(); render(); showToast('备份恢复成功 · 数据都回来啦');
  }catch{ alert('无法恢复：这不是有效的账本完整备份文件。'); }
  finally{ byId('importFile').value=''; }
}

function calculate(){
  const state={ cash:0, capital:0, withdrawals:0, sales:0, refunds:0, expenses:0, cogs:0, paid:0, gift:0, stock:{gj:{face:0,cost:0},yd:{face:0,cost:0}}, settlements:0 };
  const snapshots=[]; const monthly={};
  const monthOf=d=>d.slice(0,7);
  const monthBucket=d=>monthly[monthOf(d)] ||= {sales:0,profit:0,stock:0,label:`${Number(d.slice(5,7))}月`};

  sortedRecords().forEach(record=>{
    const r=record; const snap={id:r.id,cashDelta:0,profitDelta:0,detail:'',warning:'',consumption:{gj:0,yd:0},cogs:{gj:0,yd:0}};
    const month=monthBucket(r.date);
    if(r.type==='capital'){
      state.cash+=num(r.amount); state.capital+=num(r.amount); snap.cashDelta=num(r.amount); snap.detail='老板投入经营资金';
    } else if(r.type==='withdrawal'){
      state.cash-=num(r.amount); state.withdrawals+=num(r.amount); snap.cashDelta=-num(r.amount); snap.detail='老板取走资金';
    } else if(r.type==='expense'){
      state.cash-=num(r.amount); state.expenses+=num(r.amount); snap.cashDelta=-num(r.amount); snap.profitDelta=-num(r.amount); month.profit-=num(r.amount); snap.detail=r.category||'运营费用';
    } else if(r.type==='recharge'){
      const stock=state.stock[r.source]; const paid=num(r.paid),gift=num(r.gift);
      stock.face+=paid+gift; stock.cost+=paid; state.cash-=paid; state.paid+=paid; state.gift+=gift;
      snap.cashDelta=-paid; snap.detail=`${SOURCES[r.source]}库存 +${money(paid+gift)}`;
    } else if(r.type==='settlement'){
      const sales=num(r.sales),refund=num(r.refund); state.sales+=sales; state.refunds+=refund; state.cash+=sales-refund; state.settlements++;
      snap.cashDelta=sales-refund; month.sales+=sales;
      ['gj','yd'].forEach(key=>{
        const stock=state.stock[key], end=num(key==='gj'?r.endGJ:r.endYD), available=stock.face, rate=available>0?stock.cost/available:0;
        const consumption=available-end;
        if(consumption<-.005) snap.warning+=`${SOURCES[key]}期末库存高于可用库存；`;
        const used=Math.max(0,consumption), cogs=used*rate;
        snap.consumption[key]=used; snap.cogs[key]=cogs; state.cogs+=cogs;
        stock.face=end; stock.cost=consumption>=0?Math.max(0,stock.cost-cogs):end*rate;
      });
      snap.profitDelta=sales-refund-snap.cogs.gj-snap.cogs.yd; month.profit+=snap.profitDelta;
      snap.detail=`销售 ${money(sales)} · 成本 ${money(snap.cogs.gj+snap.cogs.yd)}`;
    }
    month.stock=state.stock.gj.face+state.stock.yd.face;
    snap.state=structuredClone(state); snapshots.push(snap);
  });
  state.netProfit=state.sales-state.refunds-state.cogs-state.expenses;
  state.retained=state.netProfit-state.withdrawals;
  state.stockCost=state.stock.gj.cost+state.stock.yd.cost;
  state.stockFace=state.stock.gj.face+state.stock.yd.face;
  return {state,snapshots,monthly};
}

let latestSnapshots=[];
function render(){
  const result=calculate(), s=result.state;
  latestSnapshots=result.snapshots;
  setText('netProfit',money(s.netProfit)); setText('totalSales',money(s.sales)); setText('cashBalance',money(s.cash));
  setText('stockCost',money(s.stockCost)); setText('stockFaceMini',`面值 ${money(s.stockFace)}`); setText('salesCount',`${s.settlements} 次销售结算`);
  setText('profitMargin',`净利率 ${s.sales?percent(s.netProfit/s.sales):'0%'}`); setText('profitStatus',s.netProfit>=0?'经营盈利':'尚未盈利');
  setText('gjFace',money(s.stock.gj.face)); setText('gjCost',money(s.stock.gj.cost)); setText('ydFace',money(s.stock.yd.face)); setText('ydCost',money(s.stock.yd.cost));
  const gjRate=s.stock.gj.face?s.stock.gj.cost/s.stock.gj.face:0, ydRate=s.stock.yd.face?s.stock.yd.cost/s.stock.yd.face:0;
  setText('gjRate',percent(gjRate)); setText('ydRate',percent(ydRate)); byId('gjRateBar').style.width=`${Math.min(100,gjRate*100)}%`; byId('ydRateBar').style.width=`${Math.min(100,ydRate*100)}%`;
  setText('capitalTotal',money(s.capital)); setText('paidTotal',money(s.paid)); setText('giftTotal',money(s.gift)); setText('cogsTotal',money(s.cogs)); setText('expenseTotal',money(s.expenses)); setText('retainedProfit',money(s.retained));
  const assets=Math.max(0,s.cash)+s.stockCost, cashShare=assets?Math.max(0,s.cash)/assets:0;
  setText('assetTotal',money(assets).replace('.00','')); setText('cashPercent',percent(cashShare)); setText('stockPercent',percent(1-cashShare)); byId('assetDonut').style.setProperty('--cash-angle',`${cashShare*100}%`);
  const last=sortedRecords().at(-1); setText('asOfDate',last?`截至 ${last.date.replace(/-/g,'.')}`:'暂无记录'); setText('recordCount',records.length);
  renderChart(result.monthly); renderRecentRecords(result.snapshots); renderRecords(result.snapshots);
}
function byId(id){ return document.getElementById(id); }
function setText(id,text){ byId(id).textContent=text; }

function renderChart(monthly){
  const data=Object.entries(monthly)
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([month,summary])=>({
      sales:num(summary.sales),
      profit:num(summary.profit),
      label:`${Number(month.slice(5,7))}月`
    }));
  if(!data.length){ byId('trendChart').innerHTML='<div class="empty-state show">暂无趋势数据</div>'; return; }
  const W=700,H=270,p={l:55,r:25,t:36,b:33}; const values=data.flatMap(d=>[d.sales,d.profit]);
  const max=Math.ceil(Math.max(...values,100)/500)*500, min=Math.floor(Math.min(...values,0)/500)*500, span=max-min;
  const x=i=>p.l+(data.length===1?(W-p.l-p.r)/2:i*(W-p.l-p.r)/(data.length-1)); const y=v=>p.t+(max-v)*(H-p.t-p.b)/span;
  const path=key=>data.map((d,i)=>`${i?'L':'M'} ${x(i)} ${y(d[key])}`).join(' ');
  const salesPath=path('sales'), profitPath=path('profit'), baseline=y(0); const area=`${salesPath} L ${x(data.length-1)} ${baseline} L ${x(0)} ${baseline} Z`;
  const grids=[0,.25,.5,.75,1].map(v=>{const tick=min+span*v;return `<line class="chart-grid" x1="${p.l}" y1="${y(tick)}" x2="${W-p.r}" y2="${y(tick)}"/><text class="chart-axis" x="2" y="${y(tick)+3}">${money(tick).replace('.00','')}</text>`;}).join('');
  const labels=data.map((d,i)=>`<line class="chart-grid" opacity=".5" stroke-dasharray="3 4" x1="${x(i)}" y1="${p.t}" x2="${x(i)}" y2="${H-p.b}"/><text class="chart-axis" text-anchor="middle" x="${x(i)}" y="${H-6}">${d.label}</text>`).join('');
  const points=(key,cls)=>data.map((d,i)=>{const value=d[key],cx=x(i),cy=y(value),label=money(value),width=Math.max(74,label.length*8.4),above=key==='sales'||value<0,boxY=above?Math.max(3,cy-31):Math.min(H-p.b-23,cy+10);return `<rect class="chart-value-bg ${cls}-bg" x="${cx-width/2}" y="${boxY}" width="${width}" height="23" rx="8"/><text class="chart-value ${cls}-value" text-anchor="middle" x="${cx}" y="${boxY+16}">${label}</text><circle class="chart-point" fill="${cls==='sales'?'#526bda':'#2db594'}" cx="${cx}" cy="${cy}" r="5"><title>${d.label} ${key==='sales'?'销售额':'当月净利润'} ${label}</title></circle>`;}).join('');
  byId('trendChart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#526bda" stop-opacity=".08"/><stop offset="1" stop-color="#526bda" stop-opacity="0"/></linearGradient></defs>${grids}${labels}<path class="chart-area" d="${area}"/><path class="sales-line" d="${salesPath}"/><path class="profit-line" d="${profitPath}"/>${points('sales','sales')}${points('profit','profit')}</svg>`;
}

function renderRecentRecords(snapshots){
  const snapMap=Object.fromEntries(snapshots.map(s=>[s.id,s]));
  const rows=sortedRecords().reverse().slice(0,3).map(r=>{const snap=snapMap[r.id],meta=recordMeta(r,snap),d=dateLabel(r.date),icon=r.type==='recharge'?(r.source==='gj'?'管':'营'):r.type==='settlement'?'售':r.type==='expense'?'费':'资',cls=meta.cash>=0?'positive':'negative';return `<div class="recent-row"><span class="recent-date">${d.main}</span><i class="recent-icon">${icon}</i><span>${meta.content}</span><strong class="recent-amount ${cls}">${meta.cash>=0?'+':''}${money(meta.cash)}</strong></div>`;});
  byId('recentRecords').innerHTML=rows.join('')||'<div class="empty-state show">还没有记录，先记一笔吧 ✦</div>';
}

function recordMeta(r,snap){
  if(r.type==='settlement') return {label:'销售盘点',cls:'settlement',content:`收入 ${money(r.sales)} · 退款 ${money(r.refund)}`,cash:snap.cashDelta,impact:`管家耗 ${money(snap.consumption.gj)} / 营地耗 ${money(snap.consumption.yd)}`};
  if(r.type==='recharge') return {label:'库存充值',cls:'recharge',content:`${SOURCES[r.source]} · 实付 ${money(r.paid)} + 赠送 ${money(r.gift)}`,cash:snap.cashDelta,impact:`库存面值 +${money(num(r.paid)+num(r.gift))}`};
  if(r.type==='expense') return {label:'运营费用',cls:'expense',content:`${escapeHtml(r.category)} · ${money(r.amount)}`,cash:snap.cashDelta,impact:'计入当期净利润'};
  if(r.type==='withdrawal') return {label:'老板取款',cls:'withdrawal',content:`取款 ${money(r.amount)}`,cash:snap.cashDelta,impact:'不计入经营费用'};
  return {label:'老板投入',cls:'capital',content:`投入 ${money(r.amount)}`,cash:snap.cashDelta,impact:'增加经营现金'};
}
function renderRecords(snapshots){
  const snapMap=Object.fromEntries(snapshots.map(s=>[s.id,s])); const q=byId('searchInput').value.trim().toLowerCase();
  const filtered=sortedRecords().reverse().filter(r=>{
    const filterMatch=activeFilter==='all'||r.type===activeFilter||(activeFilter==='capital'&&r.type==='withdrawal');
    const hay=JSON.stringify(r).toLowerCase(); return filterMatch&&(!q||hay.includes(q)||recordMeta(r,snapMap[r.id]).label.includes(q));
  });
  byId('recordsBody').innerHTML=filtered.map(r=>{ const snap=snapMap[r.id],meta=recordMeta(r,snap),d=dateLabel(r.date),cashClass=meta.cash>=0?'cash-positive':'cash-negative'; return `<tr>
    <td class="record-date"><strong>${d.main}</strong><small>${d.year}</small></td><td><span class="type-badge ${meta.cls}">${meta.label}</span></td>
    <td>${meta.content}${snap.warning?`<br><small class="cash-negative">${snap.warning}</small>`:''}</td><td class="${cashClass}">${meta.cash>=0?'+':''}${money(meta.cash)}</td>
    <td class="muted-cell">${meta.impact}</td><td class="muted-cell">${escapeHtml(r.note||'—')}</td><td><div class="row-actions"><button class="icon-btn" data-edit="${escapeHtml(r.id)}" title="修改">✎</button><button class="icon-btn delete" data-delete="${escapeHtml(r.id)}" title="删除">×</button></div></td></tr>`; }).join('');
  byId('emptyState').classList.toggle('show',!filtered.length);
}

function setMenu(open){
  const mobile=window.matchMedia('(max-width:760px)').matches;
  open=mobile&&open;
  byId('sidebar').classList.toggle('open',open);
  byId('sidebar').inert=mobile&&!open;
  byId('menuScrim').classList.toggle('open',open);
  byId('menuBtn').setAttribute('aria-expanded',String(open));
  byId('menuBtn').setAttribute('aria-label',open?'关闭菜单':'打开菜单');
  if(open)byId('menuClose').focus({preventScroll:true});
  else if(mobile&&byId('sidebar').contains(document.activeElement))byId('menuBtn').focus({preventScroll:true});
}
function setView(view){
  setMenu(false);
  if(view===currentView)return;
  currentView=view; document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(v=>v.classList.remove('active'));
  byId(view==='overview'?'overviewView':'recordsView').classList.add('active'); document.querySelector(`[data-view="${view}"]`).classList.add('active');
  setText('pageName',view==='overview'?'经营总览':'历史记录'); window.scrollTo({top:0,behavior:'instant'});
}
function openModal(id=null){
  byId('recordForm').reset(); byId('recordId').value=''; byId('recordDate').value=defaultRecordDate(); byId('refund').value=0; byId('gift').value=0;
  if(id){
    const r=records.find(x=>x.id===id); if(!r)return; byId('recordId').value=r.id; byId('recordType').value=r.type; byId('recordDate').value=r.date; byId('note').value=r.note||'';
    if(r.type==='settlement'){byId('sales').value=r.sales;byId('refund').value=r.refund;byId('endGJ').value=r.endGJ;byId('endYD').value=r.endYD;}
    if(r.type==='recharge'){byId('source').value=r.source;byId('funding').value=r.funding;byId('paid').value=r.paid;byId('gift').value=r.gift;}
    if(r.type==='expense'){byId('expenseCategory').value=r.category;byId('expenseAmount').value=r.amount;}
    if(r.type==='capital'||r.type==='withdrawal')byId('fundAmount').value=r.amount;
    setText('modalEyebrow','EDIT ENTRY'); setText('modalTitle','修改记录');
  } else { setText('modalEyebrow','NEW ENTRY'); setText('modalTitle','记一笔'); }
  updateFormFields(); byId('modalBackdrop').classList.add('open'); byId('modalBackdrop').setAttribute('aria-hidden','false'); setTimeout(()=>byId('recordDate').focus(),50);
}
function closeModal(){ byId('modalBackdrop').classList.remove('open'); byId('modalBackdrop').setAttribute('aria-hidden','true'); }
function updateFormFields(){
  const type=byId('recordType').value; document.querySelectorAll('.form-section[data-fields]').forEach(el=>el.classList.toggle('hidden',!el.dataset.fields.split(' ').includes(type)));
  setText('fundAmountLabel',type==='withdrawal'?'取款金额':'投入金额');
}
function value(id){return byId(id).value} function numberValue(id){return num(value(id))}
function submitRecord(e){
  e.preventDefault(); const id=value('recordId'),type=value('recordType'); let r={id:id||`r${Date.now()}`,order:id?(records.find(x=>x.id===id)?.order||Date.now()):Date.now(),date:value('recordDate'),type,note:value('note').trim()};
  if(type==='settlement') Object.assign(r,{sales:numberValue('sales'),refund:numberValue('refund'),endGJ:numberValue('endGJ'),endYD:numberValue('endYD')});
  if(type==='recharge') Object.assign(r,{source:value('source'),funding:value('funding'),paid:numberValue('paid'),gift:numberValue('gift')});
  if(type==='expense') Object.assign(r,{category:value('expenseCategory'),amount:numberValue('expenseAmount')});
  if(type==='capital'||type==='withdrawal') r.amount=numberValue('fundAmount');
  if(id) records=records.map(x=>x.id===id?r:x); else records.push(r); saveRecords(); render(); closeModal(); showToast(id?'修改已保存，全部数据已重算':'记录已添加，账本已重新计算');
}
function deleteRecord(id){ const r=records.find(x=>x.id===id); if(!r)return; if(confirm(`确定删除 ${r.date} 的这笔记录吗？\n删除后，后续数据会自动重新计算。`)){records=records.filter(x=>x.id!==id);saveRecords();render();showToast('记录已删除，全部数据已重算');} }
function showToast(message){setText('toast', ''); const t=byId('toast'); t.innerHTML=`<span>✓</span><p>${escapeHtml(message)}</p>`;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600);}
function exportCSV(){
  const rows=[['日期','类型','货源/分类','销售收入','实付充值','赠送库存','管家期末库存','营地期末库存','金额','备注']];
  sortedRecords().forEach(r=>rows.push([r.date,r.type,SOURCES[r.source]||r.category||'',r.sales||'',r.paid||'',r.gift||'',r.endGJ??'',r.endYD??'',r.amount||'',r.note||'']));
  const csv='\ufeff'+rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'); downloadFile(`${safeFilename(profile.name)}_${profile.year}.csv`,csv,'text/csv;charset=utf-8'); showToast('CSV 表格已导出');
}

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-record-filter]').forEach(b=>b.addEventListener('click',()=>{setView('records');activeFilter=b.dataset.recordFilter;document.querySelectorAll('#filterChips button').forEach(x=>x.classList.toggle('active',x.dataset.filter===activeFilter));renderRecords(latestSnapshots);}));
document.querySelectorAll('[data-go-records]').forEach(b=>b.addEventListener('click',()=>setView('records')));
byId('addBtn').addEventListener('click',()=>openModal()); byId('addBtn2').addEventListener('click',()=>openModal()); byId('closeModal').addEventListener('click',closeModal); byId('cancelModal').addEventListener('click',closeModal);
byId('modalBackdrop').addEventListener('click',e=>{if(e.target===byId('modalBackdrop'))closeModal()}); byId('recordType').addEventListener('change',updateFormFields); byId('recordForm').addEventListener('submit',submitRecord);
byId('recordsBody').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)openModal(edit.dataset.edit);if(del)deleteRecord(del.dataset.delete);});
let searchTimer;
byId('searchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>renderRecords(latestSnapshots),100);}); byId('filterChips').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;activeFilter=b.dataset.filter;document.querySelectorAll('#filterChips button').forEach(x=>x.classList.toggle('active',x===b));renderRecords(latestSnapshots);});
byId('resetBtn').addEventListener('click',()=>{if(confirm('确定清空当前账号的账本吗？\n全部记录将被删除，建议先导出完整备份。')){records=structuredClone(defaultRecords).map(r=>({...r,date:`${profile.year}${r.date.slice(4)}`}));saveRecords();render();showToast('已清空账本');}});
byId('exportBtn').addEventListener('click',exportCSV); byId('backupBtn').addEventListener('click',exportBackup); byId('importBtn').addEventListener('click',()=>byId('importFile').click()); byId('importFile').addEventListener('change',e=>{if(e.target.files?.[0])importBackup(e.target.files[0]);}); byId('settingsBtn').addEventListener('click',openSettings);
byId('settingsForm').addEventListener('submit',submitSettings); byId('settingsClose').addEventListener('click',closeSettings); byId('settingsCancel').addEventListener('click',closeSettings); byId('settingsBackdrop').addEventListener('click',e=>{if(e.target===byId('settingsBackdrop'))closeSettings();});
byId('menuBtn').addEventListener('click',()=>setMenu(!byId('sidebar').classList.contains('open')));
byId('menuClose').addEventListener('click',()=>setMenu(false));
byId('menuScrim').addEventListener('click',()=>setMenu(false));
byId('sidebar').addEventListener('click',e=>{if(e.target.closest('.sidebar-action,.cloud-status'))setMenu(false);});
window.matchMedia('(max-width:760px)').addEventListener('change',()=>setMenu(false));
setMenu(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){setMenu(false);closeModal();closeSettings();}});
function validateLedger(data){
  if(!data?.profile||typeof data.profile.name!=='string'||!Number.isInteger(Number(data.profile.year))||Number(data.profile.year)<2000||Number(data.profile.year)>2100||!Array.isArray(data.records))throw new Error('账本格式无效');
  const ids=new Set();
  for(const r of data.records){
    if(!r||typeof r.id!=='string'||ids.has(r.id)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!['capital','withdrawal','recharge','settlement','expense'].includes(r.type))throw new Error('记录格式无效');
    ids.add(r.id);
    if(r.type==='recharge'&&!['gj','yd'].includes(r.source))throw new Error('货源格式无效');
    for(const key of ['sales','refund','paid','gift','amount','endGJ','endYD'])if(r[key]!==undefined&&(!Number.isFinite(Number(r[key]))||Number(r[key])<0))throw new Error('金额格式无效');
  }
}
window.ledgerApp={
  getData:()=>({profile:structuredClone(profile),records:structuredClone(records)}),
  replaceData:data=>{
    validateLedger(data);
    if(data?.profile?.name&&data?.profile?.year)profile=data.profile;
    if(Array.isArray(data?.records))records=data.records;


    applyProfile(); render();
  },
  notify:showToast
};
applyProfile(); render(); window.ledgerCloud?.init(window.ledgerApp);
