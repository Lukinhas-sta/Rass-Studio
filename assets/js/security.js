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

const R=window.RassRemote;
if(R&&document.body.classList.contains('admin-body')&&!R.__mfaRequired){
  R.__mfaRequired=true;
  const init0=R.initAdmin.bind(R),verify0=R.verifyMfa.bind(R);
  function box(){const f=document.getElementById('mfaLoginForm');if(!f)return null;let b=document.getElementById('requiredMfaSetup');if(!b){b=document.createElement('div');b.id='requiredMfaSetup';b.className='hidden';b.innerHTML='<p>Para proteger o painel, conecte um aplicativo autenticador. Escaneie o QR Code e depois digite o código de 6 dígitos.</p><img id="requiredMfaQr" alt="QR Code do autenticador" style="display:block;width:200px;max-width:100%;margin:12px auto;background:#fff;padding:8px;border-radius:12px"><small>Chave manual</small><code id="requiredMfaSecret" style="display:block;word-break:break-all;margin:6px 0 14px"></code>';f.insertBefore(b,f.firstChild)}return b}
  function show(data){const b=box();if(!b)return;b.classList.remove('hidden');const q=document.getElementById('requiredMfaQr'),s=document.getElementById('requiredMfaSecret');if(q)q.src=data?.totp?.qr_code||'';if(s)s.textContent=data?.totp?.secret||''}
  function hide(){document.getElementById('requiredMfaSetup')?.classList.add('hidden')}
  async function client(){await R.currentSession();if(!R.client)throw new Error('Supabase não configurado.');return R.client}
  async function member(c){const u=(await c.auth.getUser()).data?.user;if(!u||!u.email_confirmed_at||u.is_anonymous)return false;const {data,error}=await c.from('rass_admins').select('user_id').eq('user_id',u.id).eq('active',true).maybeSingle();return !error&&!!data}
  async function state(c){const [f,a]=await Promise.all([c.auth.mfa.listFactors(),c.auth.mfa.getAuthenticatorAssuranceLevel()]);if(f.error)throw f.error;if(a.error)throw a.error;const t=f.data?.totp||[];return{all:t,verified:t.find(x=>x.status==='verified')||null,aal:a.data}}
  async function enroll(c,all){for(const f of all.filter(x=>x.status!=='verified')){try{await c.auth.mfa.unenroll({factorId:f.id})}catch{}}const {data,error}=await c.auth.mfa.enroll({factorType:'totp',friendlyName:'Rass Studio'});if(error)throw new Error('Não foi possível iniciar o 2FA.');show(data)}
  R.login=async(email,password)=>{const c=await client();const {error}=await c.auth.signInWithPassword({email:String(email||'').trim().toLowerCase(),password});if(error)throw new Error('E-mail ou senha inválidos.');if(!await member(c)){await c.auth.signOut();throw new Error('Esta conta não está autorizada como administradora da Rass Studio.')}const s=await state(c);if(!s.verified)await enroll(c,s.all);else hide();return{mfaRequired:true,enrollmentRequired:!s.verified}};
  R.initAdmin=async()=>{const c=await client(),session=(await c.auth.getSession()).data?.session;if(!session)return false;if(!await member(c))return false;const s=await state(c);if(!s.verified){await enroll(c,s.all);return{mfaRequired:true,enrollmentRequired:true}}hide();if(s.aal?.currentLevel!=='aal2')return{mfaRequired:true};return init0()};
  R.verifyMfa=async code=>{const ok=await verify0(code);hide();return ok};
  R.disableMfa=async()=>{throw new Error('O 2FA é obrigatório para administradores da Rass Studio.')};
  const d=document.getElementById('disableMfaBtn');if(d){d.disabled=true;d.textContent='2FA obrigatório'}
}

import('./public-api.js?v=4.9').catch(e=>console.warn('[Rass] API protegida não carregou',e));
document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('a[target="_blank"]').forEach(a=>{const rel=new Set((a.getAttribute('rel')||'').split(/\s+/).filter(Boolean));rel.add('noopener');rel.add('noreferrer');a.setAttribute('rel',[...rel].join(' '))}));
window.RASS_HARDENING_VERSION='4.9.0';
})();
