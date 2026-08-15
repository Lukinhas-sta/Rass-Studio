(() => {
'use strict';
if(window.top!==window.self){try{window.top.location=window.self.location.href}catch(_){document.documentElement.innerHTML=''}}

const D=window.RassData;
if(D&&!D.__privateMemory){
  D.__privateMemory=true;
  const names=new Set(['appointments','quotes','clients','staff','blocked','transactions','notifications','trash']);
  const mem=new Map(),copy=v=>JSON.parse(JSON.stringify(v));
  const get0=D.get,set0=D.set,remove0=D.remove;
  for(const n of names){mem.set(n,copy(D.defaults[n]||[]));try{localStorage.removeItem(D.KEYS[n])}catch{}}
  D.get=n=>names.has(n)?copy(mem.get(n)||D.defaults[n]||[]):get0(n);
  D.set=(n,v,o={})=>{if(!names.has(n))return set0(n,v,o);mem.set(n,copy(v));try{return set0(n,v,o)}finally{try{localStorage.removeItem(D.KEYS[n])}catch{}}};
  D.update=(n,fn)=>{const v=D.get(n),next=fn(v)||v;return D.set(n,next)};
  D.push=(n,item)=>{const v=D.get(n);v.push(item);D.set(n,v);return item};
  D.remove=(n,id,trash=true)=>{if(!names.has(n))return remove0(n,id,trash);try{localStorage.setItem(D.KEYS[n],JSON.stringify(mem.get(n)||[]));localStorage.setItem(D.KEYS.trash,JSON.stringify(mem.get('trash')||[]));const out=remove0(n,id,trash);try{mem.set(n,JSON.parse(localStorage.getItem(D.KEYS[n])||'[]'))}catch{}try{mem.set('trash',JSON.parse(localStorage.getItem(D.KEYS.trash)||'[]'))}catch{}return out}finally{try{localStorage.removeItem(D.KEYS[n]);localStorage.removeItem(D.KEYS.trash)}catch{}}};
  D.notify=(title,message,kind='info',meta={})=>{const v=D.get('notifications'),item={id:D.uid('n'),title,message,kind,meta,read:false,createdAt:D.nowIso()};v.unshift(item);D.set('notifications',v);return item};
  D.upsertClient=({name,phone,email='',notes=''})=>{const p=String(phone||'').replace(/\D/g,''),v=D.get('clients');let c=v.find(x=>p&&String(x.phone||'').replace(/\D/g,'')===p);if(c){c.name=name||c.name;c.email=email||c.email;c.lastSeen=D.nowIso();if(notes&&!c.notes)c.notes=notes}else{c={id:D.uid('cli'),name:name||'Cliente',phone,email,notes,lastSeen:D.nowIso(),createdAt:D.nowIso()};v.push(c)}D.set('clients',v);return c};
}

const R=window.RassRemote,cfg=window.RASS_SUPABASE_CONFIG||{};
const edgeEndpoint=()=>`${String(cfg.url||'').replace(/\/$/,'')}/functions/v1/rass-public-booking`;
async function edgePost(kind,payload={}){
  const response=await fetch(edgeEndpoint(),{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':String(cfg.key||'')},
    body:JSON.stringify({kind,payload}),
    credentials:'omit',
    referrerPolicy:'no-referrer'
  });
  const body=await response.json().catch(()=>({}));
  if(response.ok)return body;
  const err=new Error(
    response.status===429?'Limite de tentativas atingido. Tente novamente em instantes.':
    response.status===503?'Serviço temporariamente indisponível. Tente novamente em instantes.':
    kind==='appointment'&&response.status===409?'Horário ocupado ou agenda indisponível.':
    kind==='availability'?'Não foi possível consultar os horários.':
    kind==='staff'?'Não foi possível carregar a equipe.':
    kind==='quote'?'Não foi possível registrar o orçamento.':'Não foi possível concluir a operação.'
  );
  err.status=response.status;err.code=body?.error||'';throw err;
}

async function imageBitmapFromFile(file){
  if(typeof createImageBitmap==='function')return createImageBitmap(file);
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};
    img.src=url;
  });
}
function canvasBlob(canvas,type,quality){return new Promise(resolve=>canvas.toBlob(resolve,type,quality))}
async function optimizeUploadImage(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))return file;
  if(file.size>20*1024*1024)throw new Error('A imagem original é muito grande. Use um arquivo de até 20 MB.');
  if(file.size<=1300*1024)return file;
  let source;
  try{source=await imageBitmapFromFile(file)}catch{return file}
  try{
    const width=Number(source.width||source.naturalWidth||0),height=Number(source.height||source.naturalHeight||0);
    if(!width||!height)return file;
    const maxSide=1920,scale=Math.min(1,maxSide/Math.max(width,height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return file;
    ctx.drawImage(source,0,0,canvas.width,canvas.height);
    let blob=await canvasBlob(canvas,'image/webp',.88);
    if(blob&&blob.size>5*1024*1024)blob=await canvasBlob(canvas,'image/webp',.80);
    if(!blob)return file;
    if(blob.size>=file.size&&file.size<=5*1024*1024)return file;
    const base=String(file.name||'imagem').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,80)||'imagem';
    return new File([blob],`${base}.webp`,{type:'image/webp',lastModified:Date.now()});
  }finally{try{source.close?.()}catch{}}
}

if(R&&R.configured?.()){
  const initPublic0=R.initPublic.bind(R),upload0=R.uploadImage?.bind(R);
  R.initPublic=async()=>{
    const ok=await initPublic0();
    try{
      const out=await edgePost('staff',{}),rows=Array.isArray(out?.staff)?out.staff:[];
      if(D&&rows.length)D.set('staff',rows.map(x=>({id:x.id,name:x.name,specialties:x.specialties||[],active:true,phone:'',notes:''})),{remote:false});
    }catch(e){console.warn('[Rass] equipe pública indisponível',e?.message||e)}
    return ok;
  };
  R.unavailable=async(date,staffId,serviceId='')=>{
    let sid=serviceId;
    try{if(!sid&&typeof selectedService!=='undefined')sid=selectedService}catch{}
    const out=await edgePost('availability',{date:String(date||'').slice(0,10),staffId:String(staffId||''),serviceId:String(sid||'')});
    return Array.isArray(out?.slots)?out.slots:[];
  };
  R.createAppointment=async app=>edgePost('appointment',{
    name:String(app?.name||'').trim().slice(0,100),phone:String(app?.phone||'').trim().slice(0,30),email:String(app?.email||'').trim().slice(0,254),
    serviceId:String(app?.serviceId||''),staffId:String(app?.staffId||''),date:String(app?.date||'').slice(0,10),time:String(app?.time||'').slice(0,5),notes:String(app?.notes||'').trim().slice(0,1000)
  });
  R.createQuote=async quote=>edgePost('quote',{
    name:String(quote?.name||'').trim().slice(0,100),phone:String(quote?.phone||'').trim().slice(0,30),service:String(quote?.service||'Personalizado').trim().slice(0,150),description:String(quote?.description||'').trim().slice(0,1500)
  });
  if(upload0)R.uploadImage=async(file,folder)=>upload0(await optimizeUploadImage(file),folder);
}

if(R&&document.body.classList.contains('admin-body')&&!R.__mfaRequired){
  R.__mfaRequired=true;
  const finishAdmin=R.initAdmin.bind(R);
  const ACTIVITY_KEY='rass-studio-last-activity-v1';
  let pendingFactorId='';

  const touchActivity=()=>{try{localStorage.setItem(ACTIVITY_KEY,String(Date.now()))}catch{}};
  const lockUi=()=>{document.getElementById('loginScreen')?.classList.remove('hidden');document.getElementById('adminShell')?.classList.add('hidden')};
  function box(){const f=document.getElementById('mfaLoginForm');if(!f)return null;let b=document.getElementById('requiredMfaSetup');if(!b){b=document.createElement('div');b.id='requiredMfaSetup';b.className='hidden';b.innerHTML='<p><strong>Primeiro acesso com 2FA</strong><br>Abra o Google Authenticator, Microsoft Authenticator, Authy ou outro aplicativo compatível. Escaneie o QR Code e digite abaixo o código de 6 dígitos.</p><img id="requiredMfaQr" alt="QR Code do autenticador" style="display:block;width:200px;max-width:100%;margin:12px auto;background:#fff;padding:8px;border-radius:12px"><small>Se não conseguir escanear, use esta chave manual:</small><code id="requiredMfaSecret" style="display:block;word-break:break-all;margin:6px 0 14px"></code>';f.insertBefore(b,f.firstChild)}return b}
  function show(data){lockUi();const b=box();if(!b)return;b.classList.remove('hidden');const q=document.getElementById('requiredMfaQr'),s=document.getElementById('requiredMfaSecret');if(q){q.src=data?.totp?.qr_code||'';q.style.height='auto';q.style.objectFit='contain'}if(s)s.textContent=data?.totp?.secret||''}
  function hide(){const b=document.getElementById('requiredMfaSetup'),q=document.getElementById('requiredMfaQr'),s=document.getElementById('requiredMfaSecret');if(q)q.removeAttribute('src');if(s)s.textContent='';b?.classList.add('hidden')}
  async function client(){await R.currentSession();if(!R.client)throw new Error('Supabase não configurado.');return R.client}
  async function member(c){const {data:userData,error:userError}=await c.auth.getUser();const u=userData?.user;if(userError||!u||!u.email_confirmed_at||u.is_anonymous)return false;const {data,error}=await c.from('rass_admins').select('user_id').eq('user_id',u.id).eq('active',true).maybeSingle();return !error&&!!data}
  async function state(c){const [f,a]=await Promise.all([c.auth.mfa.listFactors(),c.auth.mfa.getAuthenticatorAssuranceLevel()]);if(f.error)throw f.error;if(a.error)throw a.error;const t=f.data?.totp||[];return{all:t,verified:t.find(x=>x.status==='verified')||null,aal:a.data||{}}}
  async function cleanupUnverified(c){
    const {data}=await c.auth.getSession(),session=data?.session;
    if(!session?.access_token)return false;
    const endpoint=`${String(cfg.url||'').replace(/\/$/,'')}/functions/v1/rass-admin-mfa`;
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':String(cfg.key||''),'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'cleanup_unverified_totp'}),credentials:'omit',referrerPolicy:'no-referrer'});
      return response.ok;
    }catch(e){console.warn('[Rass V4.13] limpeza de 2FA',e?.message||e);return false}
  }
  async function enroll(c){
    lockUi();
    await cleanupUnverified(c);
    const friendlyName=`Rass Studio ${Date.now().toString(36).slice(-7)}`;
    let out=await c.auth.mfa.enroll({factorType:'totp',friendlyName});
    if(out.error&&out.error.code==='mfa_factor_name_conflict'){
      await cleanupUnverified(c);
      out=await c.auth.mfa.enroll({factorType:'totp',friendlyName:`Rass Studio ${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`});
    }
    if(out.error||!out.data)throw new Error(out.error?.status===429?'Muitas tentativas de 2FA. Aguarde alguns segundos e tente novamente.':'Não foi possível preparar o autenticador. Atualize a página e tente novamente.');
    pendingFactorId=out.data.id;
    show(out.data);
  }

  R.login=async(email,password)=>{
    const c=await client();
    const {error}=await c.auth.signInWithPassword({email:String(email||'').trim().toLowerCase(),password});
    if(error)throw new Error('E-mail ou senha inválidos.');
    touchActivity();
    if(!await member(c)){await c.auth.signOut();throw new Error('Esta conta não está autorizada como administradora da Rass Studio.')}
    const s=await state(c);
    if(!s.verified){await enroll(c);return{mfaRequired:true,enrollmentRequired:true}}
    pendingFactorId='';hide();lockUi();
    if(s.aal?.currentLevel==='aal2'){touchActivity();return finishAdmin()}
    return{mfaRequired:true,enrollmentRequired:false};
  };

  R.initAdmin=async()=>{
    const c=await client(),session=(await c.auth.getSession()).data?.session;
    if(!session)return false;
    if(!await member(c))return false;
    const s=await state(c);
    if(!s.verified){await enroll(c);return{mfaRequired:true,enrollmentRequired:true}}
    pendingFactorId='';hide();
    if(s.aal?.currentLevel!=='aal2'){lockUi();return{mfaRequired:true,enrollmentRequired:false}}
    touchActivity();
    return finishAdmin();
  };

  R.verifyMfa=async code=>{
    const c=await client();
    if(!await member(c))throw new Error('Conta não autorizada.');
    const clean=String(code||'').replace(/\D/g,'').slice(0,6);
    if(clean.length!==6)throw new Error('Digite o código de 6 dígitos.');
    let factorId=pendingFactorId;
    if(!factorId){
      const {data,error}=await c.auth.mfa.listFactors();
      if(error)throw error;
      factorId=(data?.totp||[]).find(f=>f.status==='verified')?.id||'';
    }
    if(!factorId)throw new Error('O QR Code anterior perdeu a validade. Volte ao login para gerar um novo.');
    const {error}=await c.auth.mfa.challengeAndVerify({factorId,code:clean});
    if(error)throw new Error(error.status===429?'Muitas tentativas. Aguarde alguns segundos e tente novamente.':'Código inválido ou expirado. Confira o autenticador e tente novamente.');
    pendingFactorId='';hide();touchActivity();
    await c.auth.refreshSession().catch(()=>null);
    touchActivity();
    const result=await finishAdmin();
    if(!result?.ok)throw new Error('2FA confirmado, mas não foi possível carregar o painel. Atualize a página.');
    return true;
  };

  R.disableMfa=async()=>{throw new Error('O 2FA é obrigatório para administradores da Rass Studio.')};
  const d=document.getElementById('disableMfaBtn');if(d){d.disabled=true;d.textContent='2FA obrigatório'}

  function minutes(value){const [h,m]=String(value||'').slice(0,5).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:NaN}
  function overlap(aStart,aDuration,bStart,bDuration){return aStart<bStart+bDuration&&bStart<aStart+aDuration}
  function patchAppointmentGuard(){
    const form=document.getElementById('appointmentForm');if(!form||!D||form.dataset.v413Guard==='1')return;form.dataset.v413Guard='1';
    form.addEventListener('submit',event=>{
      const id=String(document.getElementById('appointmentId')?.value||''),date=String(document.getElementById('appDate')?.value||''),time=String(document.getElementById('appTime')?.value||'').slice(0,5),staffId=String(document.getElementById('appStaff')?.value||''),serviceId=String(document.getElementById('appService')?.value||'');
      if(!date||!time||!staffId||!serviceId){event.preventDefault();event.stopImmediatePropagation();alert('Preencha serviço, profissional, data e horário antes de salvar.');return}
      const services=D.get('services')||[],service=services.find(s=>s.id===serviceId),duration=Math.max(5,Number(service?.duration||60)),start=minutes(time);if(!Number.isFinite(start))return;
      const active=status=>!['Cancelado','Recusado'].includes(String(status||''));
      const conflict=(D.get('appointments')||[]).some(item=>{if(String(item.id)===id||item.date!==date||String(item.staffId||'')!==staffId||!active(item.status))return false;const otherStart=minutes(item.time);if(!Number.isFinite(otherStart))return false;const other=services.find(s=>s.id===item.serviceId),otherDuration=Math.max(5,Number(other?.duration||60));return overlap(start,duration,otherStart,otherDuration)});
      const settings=D.get('settings')||{},blockDuration=Math.max(5,Number(settings.interval||60));
      const blocked=(D.get('blocked')||[]).some(block=>{if(block.date!==date)return false;if(block.staffId&&String(block.staffId)!==staffId)return false;if(block.allDay)return true;const blockStart=minutes(block.time);return Number.isFinite(blockStart)&&overlap(start,duration,blockStart,blockDuration)});
      if(conflict||blocked){event.preventDefault();event.stopImmediatePropagation();alert(conflict?'Esse período já coincide com outro atendimento dessa profissional. Escolha outro horário.':'Esse período está bloqueado na agenda. Escolha outro horário ou remova o bloqueio primeiro.')}
    },true);
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(patchAppointmentGuard,0),{once:true});
  window.RASS_ADMIN_AUTH_VERSION='4.13.0';
}

if(typeof window.initScroll==='function'){
  window.initScroll=function(){
    const p=document.getElementById('scrollProgress'),h=document.querySelector('.header'),top=document.getElementById('backTop'),links=[...document.querySelectorAll('#nav [data-section]')];
    let queued=false;
    const run=()=>{queued=false;const y=scrollY,max=Math.max(1,document.documentElement.scrollHeight-innerHeight);if(p)p.style.width=Math.min(100,y/max*100)+'%';h?.classList.toggle('scrolled',y>30);top?.classList.toggle('show',y>650);let cur='inicio';for(const a of links){const e=document.getElementById(a.dataset.section);if(e&&e.getBoundingClientRect().top<=160)cur=e.id}for(const a of links)a.classList.toggle('active',a.dataset.section===cur)};
    const queue=()=>{if(queued)return;queued=true;requestAnimationFrame(run)};
    run();addEventListener('scroll',queue,{passive:true});addEventListener('resize',queue,{passive:true});if(top)top.onclick=()=>scrollTo({top:0,behavior:'smooth'});
  };
}
if(typeof window.initGlow==='function'){
  window.initGlow=function(){
    if(!matchMedia('(pointer:fine)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const g=document.getElementById('cursorGlow');if(!g)return;let tx=innerWidth/2,ty=innerHeight/2,x=tx,y=ty,raf=0;
    addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY},{passive:true});
    const loop=()=>{raf=0;if(document.hidden)return;x+=(tx-x)*.13;y+=(ty-y)*.13;g.style.left=x+'px';g.style.top=y+'px';raf=requestAnimationFrame(loop)};
    const resume=()=>{if(!document.hidden&&!raf)raf=requestAnimationFrame(loop)};document.addEventListener('visibilitychange',resume);resume();
  };
}
if(matchMedia('(prefers-reduced-motion: reduce)').matches){for(const n of ['initMagnetic','initTilt','initParallax'])if(typeof window[n]==='function')window[n]=()=>{}}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('a[target="_blank"]').forEach(a=>{const rel=new Set((a.getAttribute('rel')||'').split(/\s+/).filter(Boolean));rel.add('noopener');rel.add('noreferrer');a.setAttribute('rel',[...rel].join(' '))});
  document.querySelectorAll('.modal,.gallery-lightbox,.admin-modal').forEach(el=>{el.setAttribute('role','dialog');el.setAttribute('aria-modal','true')});
  document.querySelectorAll('.modal-close,.lightbox-close').forEach(b=>{if(!b.getAttribute('aria-label'))b.setAttribute('aria-label','Fechar')});
  document.querySelector('[data-gallery-prev]')?.setAttribute('aria-label','Foto anterior');document.querySelector('[data-gallery-next]')?.setAttribute('aria-label','Próxima foto');
});
window.RASS_HARDENING_VERSION='4.13.0';
})();
