(function(){
  const cfg=window.SUPABASE_CONFIG;
  let recovery=new URLSearchParams(location.search).get('reset')==='1'||new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
  let recovering=false;
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
  let sending=false,authMode='login';
  function setAuthMode(mode){
    if(sending)return;authMode=mode;const registering=mode==='register';
    el('authLogin').setAttribute('aria-pressed',String(!registering));el('authRegister').setAttribute('aria-pressed',String(registering));
    el('confirmPasswordField').hidden=!registering;el('cloudPasswordConfirm').disabled=!registering;el('cloudPasswordConfirm').required=registering;
    el('cloudPassword').minLength=registering?8:1;el('cloudPassword').autocomplete=registering?'new-password':'current-password';
    el('cloudPassword').value='';el('cloudPasswordConfirm').value='';el('cloudMessage').hidden=true;el('cloudSubmit').textContent=registering?'注册并发送验证邮件':'登录';
  }
  function loginMessage(text,error=false){const node=el('cloudMessage');node.textContent=text;node.hidden=false;node.dataset.error=String(error);}
  function loginError(error){
    const text=error?.message||'未知错误',code=error?.code||'';
    if(code==='invalid_credentials')return '邮箱或密码不正确，请检查后重试。';
    if(code==='email_not_confirmed')return '请先点击注册邮件中的验证链接，再使用密码登录。';
    if(code==='user_already_exists')return '该邮箱已注册，请切换到密码登录。';
    if(code==='weak_password')return '密码强度不足，请使用更长的密码并包含字母和数字。';
    if(code==='email_address_not_authorized'||/authorized|Email address not allowed/i.test(text))return '邮件服务尚未配置：默认服务只允许向项目成员的邮箱发送。需要配置 SMTP 后才能向其他邮箱发送。';
    if(/rate|too many/i.test(code+' '+text))return '发送过于频繁，请稍后再试。';
    if(/fetch|network|abort|timeout/i.test(text)||error?.name==='AbortError')return '连接登录服务失败或超时，请检查网络后重试。';
    return '操作失败：'+text;
  }
  let app, user=null, ready=false, revision=null, timer, saving=false, dirty=false, epoch=0;
  const el=id=>document.getElementById(id);
  const empty=()=>({profile:{name:'租号生意账本',year:2026},records:[]});
  const draftKey=id=>'ledger-public-draft:'+id;
  function status(kind,text){el('cloudDot').className='cloud-dot '+kind;el('cloudLabel').textContent=text;el('cloudHint').textContent=user?.email||'点击登录';el('saveState').textContent=text;}
  function lock(on){
    // Keep navigation and the cloud login entry reachable while data is locked.
    ['overviewView','recordsView'].forEach(id=>el(id).inert=on);
    ['addBtn','importBtn','settingsBtn','exportBtn','backupBtn'].forEach(id=>el(id).disabled=on);
  }
  function modal(){el('cloudForm').hidden=recovery;el('recoveryForm').hidden=!recovery;el('cloudTitle').textContent=recovery?'设置新密码':'云端同步';el('cloudSignedOut').hidden=!!user;el('cloudSignedIn').hidden=!user;el('cloudAccountEmail').textContent=user?.email||'';}
  function close(){el('cloudPassword').value='';el('cloudPasswordConfirm').value='';el('recoveryPassword').value='';el('recoveryConfirm').value='';el('cloudBackdrop').classList.remove('open');el('cloudBackdrop').setAttribute('aria-hidden','true');}
  function open(){modal();el('cloudBackdrop').classList.add('open');el('cloudBackdrop').setAttribute('aria-hidden','false');}
  async function activate(next){
    if(next?.id===user?.id)return;
    const token=++epoch;clearTimeout(timer);ready=false;dirty=false;user=next;revision=null;lock(true);app.replaceData(empty());modal();
    if(!user){status('','请先登录');return;}
    status('syncing','正在读取账本');
    try{
      const {data,error}=await client.from('ledgers').select('profile,records,updated_at').eq('user_id',user.id).maybeSingle();
      if(token!==epoch)return;if(error)throw error;
      revision=data?.updated_at||null;app.replaceData(data||empty());ready=true;lock(recovery);status('online',recovery?'请设置新密码':'已载入云端账本');
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
    el('authLogin').onclick=()=>setAuthMode('login');el('authRegister').onclick=()=>setAuthMode('register');
    el('recoveryBack').onclick=()=>{if(recovering)return;recovery=false;el('recoveryPassword').value='';el('recoveryConfirm').value='';history.replaceState(null,'',location.pathname);modal();lock(!ready);};
    el('authForgot').onclick=async()=>{
      if(sending||!client)return;if(!el('cloudEmail').reportValidity())return;
      sending=true;el('authForgot').disabled=true;el('cloudSubmit').disabled=true;loginMessage('正在发送密码重置邮件…');
      try{const {error}=await client.auth.resetPasswordForEmail(el('cloudEmail').value.trim(),{redirectTo:location.origin+location.pathname+'?reset=1'});if(error)throw error;loginMessage('如果该邮箱已注册，将收到密码重置邮件。请检查收件箱和垃圾邮件，点击最新邮件中的链接。');}
      catch(error){loginMessage(loginError(error),true);}
      finally{sending=false;el('authForgot').disabled=false;el('cloudSubmit').disabled=false;}
    };
    el('recoveryForm').onsubmit=async e=>{
      e.preventDefault();if(recovering||!client)return;
      const message=el('recoveryMessage'),password=el('recoveryPassword').value;
      if(password.length<8||password!==el('recoveryConfirm').value){message.textContent='新密码至少 8 位，且两次输入必须一致。';message.dataset.error='true';return;}
      recovering=true;el('recoverySubmit').disabled=true;message.textContent='正在保存新密码…';
      try{
        const {data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('重置链接已失效，请重新申请密码重置邮件。');
        const updated=await client.auth.updateUser({password});if(updated.error)throw updated.error;
        el('recoveryPassword').value='';el('recoveryConfirm').value='';recovery=false;
        const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete('reset');cleanUrl.hash='';history.replaceState(null,'',cleanUrl.pathname+cleanUrl.search);
        await activate(updated.data.user);modal();lock(!ready);close();app.notify('密码已更新，下次请使用新密码登录');
      }catch(error){message.textContent=loginError(error);message.dataset.error='true';}
      finally{recovering=false;el('recoverySubmit').disabled=false;}
    };
    el('authResend').onclick=async()=>{
      if(sending||!client)return;if(!el('cloudEmail').reportValidity())return;
      sending=true;el('authResend').disabled=true;el('cloudSubmit').disabled=true;loginMessage('正在重新发送验证邮件…');
      try{const {error}=await client.auth.resend({type:'signup',email:el('cloudEmail').value.trim(),options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;loginMessage('验证邮件请求已提交，请检查收件箱和垃圾邮件。');}
      catch(error){loginMessage(loginError(error),true);}
      finally{sending=false;el('authResend').disabled=false;el('cloudSubmit').disabled=false;}
    };
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
      const registering=authMode==='register',email=el('cloudEmail').value.trim(),password=el('cloudPassword').value;
      if(registering&&(password.length<8||password!==el('cloudPasswordConfirm').value)){loginMessage('注册密码至少 8 位，且两次输入必须一致。',true);return;}
      sending=true;const button=el('cloudSubmit');button.disabled=true;button.textContent=registering?'正在注册…':'正在登录…';
      loginMessage('正在连接登录服务，请稍候…');
      let notice;
      try{
        notice=setTimeout(()=>loginMessage('连接耗时较长，请检查网络；请求仍在处理中。',true),15000);
        const {data,error}=registering?await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await client.auth.signInWithPassword({email,password});
        if(error)throw error;
        el('cloudPassword').value='';el('cloudPasswordConfirm').value='';
        if(registering&&!data.session){loginMessage('注册请求已提交，请检查验证邮件（含垃圾邮件）。验证后切换到密码登录；若邮箱已注册，请直接登录。');}
        else{await activate(data.user||data.session?.user);if(ready)close();}
      }catch(error){loginMessage(loginError(error),true);}
      finally{clearTimeout(notice);sending=false;button.disabled=false;button.textContent=authMode==='register'?'注册并发送验证邮件':'登录';}
    };
    if(!client){status('error','登录组件加载失败，请刷新');loginMessage('登录组件未加载成功，请刷新页面后重试。',true);el('cloudSubmit').disabled=true;return;}
    const handleSession=async(event,session)=>{
      if(event==='PASSWORD_RECOVERY')recovery=true;
      if(recovery){open();el('recoverySubmit').disabled=!session;el('recoveryMessage').textContent=session?'链接已验证，请输入新密码。':'链接无效或已过期，请关闭此窗口，重新申请密码重置邮件。';}
      await activate(session?.user||null);
    };
    client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>handleSession(event,session),0);});
    try{const {data,error}=await client.auth.getSession();if(error)throw error;await handleSession('INITIAL_SESSION',data.session);}catch{status('error','登录状态读取失败，请刷新');}
    window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
  }
  window.ledgerCloud={init,scheduleSync};
})();
