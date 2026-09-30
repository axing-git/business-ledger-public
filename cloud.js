(function(){
  const cfg=window.SUPABASE_CONFIG;
  async function timedFetch(url,options={}){
    const controller=new AbortController();
    const abort=()=>controller.abort();
    if(options.signal?.aborted)abort();
    options.signal?.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,20000);
    try{return await fetch(url,{...options,signal:controller.signal});}
    finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);}
  }
  const client=window.supabase?.createClient(cfg.url,cfg.anonKey,{global:{fetch:timedFetch}});
  let sending=false;
  function loginMessage(text,error=false){const node=el('cloudMessage');node.textContent=text;node.hidden=false;node.dataset.error=String(error);}
  function loginError(error){
    const text=error?.message||'未知错误',code=error?.code||'';
    if(code==='email_address_not_authorized'||/authorized|Email address not allowed/i.test(text))return '邮件服务尚未配置：默认服务只允许向项目成员的邮箱发送。需要配置 SMTP 后才能向其他邮箱发送。';
    if(/rate|too many/i.test(code+' '+text))return '发送过于频繁，请稍后再试。';
    if(/fetch|network|abort|timeout/i.test(text)||error?.name==='AbortError')return '连接登录服务失败或超时，请检查网络后重试。';
    return '发送失败：'+text;
  }
  let app, user=null, ready=false, revision=null, timer, saving=false, dirty=false, epoch=0;
  const el=id=>document.getElementById(id);
  const empty=()=>({profile:{name:'租号生意账本',year:2026},records:[]});
  const draftKey=id=>'ledger-public-draft:'+id;
  function status(kind,text){el('cloudDot').className='cloud-dot '+kind;el('cloudLabel').textContent=text;el('cloudHint').textContent=user?.email||'点击登录';el('saveState').textContent=text;}
  function lock(on){document.querySelector('.workspace').inert=on;['importBtn','settingsBtn','exportBtn','backupBtn'].forEach(id=>el(id).disabled=on);}
  function modal(){el('cloudSignedOut').hidden=!!user;el('cloudSignedIn').hidden=!user;el('cloudAccountEmail').textContent=user?.email||'';}
  function close(){el('cloudBackdrop').classList.remove('open');el('cloudBackdrop').setAttribute('aria-hidden','true');}
  function open(){modal();el('cloudBackdrop').classList.add('open');el('cloudBackdrop').setAttribute('aria-hidden','false');}
  async function activate(next){
    if(next?.id===user?.id)return;
    const token=++epoch;clearTimeout(timer);ready=false;dirty=false;user=next;revision=null;lock(true);app.replaceData(empty());modal();
    if(!user){status('','请先登录');return;}
    status('syncing','正在读取账本');
    try{
      const {data,error}=await client.from('ledgers').select('profile,records,updated_at').eq('user_id',user.id).maybeSingle();
      if(token!==epoch)return;if(error)throw error;
      revision=data?.updated_at||null;app.replaceData(data||empty());ready=true;lock(false);status('online','已载入云端账本');
      const draft=localStorage.getItem(draftKey(user.id));
      if(draft&&confirm('此账号有尚未同步的草稿。是否恢复？取消会保留草稿并显示云端账本。')){app.replaceData(JSON.parse(draft));scheduleSync();}
    }catch(error){if(token===epoch){status('error','加载失败，请重试');app.notify(error.message||'网络连接失败');}}
  }
  function scheduleSync(){
    if(!ready||!user)return;
    dirty=true;try{localStorage.setItem(draftKey(user.id),JSON.stringify(app.getData()));}catch{app.notify('本机草稿保存失败，请立即导出备份');}
    status('syncing','有修改待同步');clearTimeout(timer);timer=setTimeout(syncNow,700);
  }
  async function syncNow(){
    if(!ready||!user||saving||!dirty)return;
    const token=epoch,id=user.id,payload=app.getData();saving=true;dirty=false;status('syncing','正在同步');
    try{
      const row={...payload,updated_at:new Date().toISOString()};
      const request=revision?client.from('ledgers').update(row).eq('user_id',id).eq('updated_at',revision):client.from('ledgers').insert({...row,user_id:id});
      const {data,error}=await request.select('updated_at').single();
      if(token!==epoch)return;
      if(error)throw error;
      revision=data.updated_at;
      if(!dirty){localStorage.removeItem(draftKey(id));status('online','已同步到云端');}
    }catch(error){if(token===epoch){dirty=true;status('error','未同步，请重试');app.notify('同步失败或其他设备已修改账本。草稿已保留；可先导出备份。');}return;}
    finally{saving=false;}
    if(dirty)setTimeout(syncNow,0);
  }
  async function init(ledgerApp){
    app=ledgerApp;lock(true);status('','请先登录');
    el('cloudBtn').onclick=open;el('cloudClose').onclick=close;el('cloudCancel').onclick=close;
    el('cloudBackdrop').onclick=e=>{if(e.target===el('cloudBackdrop'))close();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    el('cloudRetry').onclick=()=>{if(ready)syncNow();else{const next=user;user=null;activate(next);}};
    el('cloudLogout').onclick=async()=>{
      if(saving){app.notify('正在保存，请稍后退出');return;}
      if(dirty&&!confirm('还有未同步的修改，草稿会保存在本机。确定退出？'))return;
      clearTimeout(timer);const {error}=await client.auth.signOut();if(error){app.notify(error.message);return;}await activate(null);close();
    };
    el('cloudForm').onsubmit=async e=>{
      e.preventDefault();if(sending)return;
      if(!client){loginMessage('登录组件未加载，请刷新页面。',true);return;}
      sending=true;const button=el('cloudSubmit');button.disabled=true;button.textContent='正在发送…';
      loginMessage('正在连接登录服务，请稍候…');
      let notice;
      try{
        notice=setTimeout(()=>loginMessage('连接耗时较长，请检查网络；请求仍在处理中。',true),15000);
        const {error}=await client.auth.signInWithOtp({email:el('cloudEmail').value.trim(),options:{emailRedirectTo:location.origin+location.pathname}});
        if(error)throw error;
        loginMessage('登录链接已发送，请检查收件箱和垃圾邮件，并点击邮件中的链接。');
      }catch(error){loginMessage(loginError(error),true);}
      finally{clearTimeout(notice);sending=false;button.disabled=false;button.textContent='发送登录链接';}
    };
    if(!client){status('error','登录组件加载失败，请刷新');loginMessage('登录组件未加载成功，请刷新页面后重试。',true);el('cloudSubmit').disabled=true;return;}
    client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>activate(session?.user||null),0);});
    try{const {data,error}=await client.auth.getSession();if(error)throw error;await activate(data.session?.user||null);}catch{status('error','登录状态读取失败，请刷新');}
    window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
  }
  window.ledgerCloud={init,scheduleSync};
})();
