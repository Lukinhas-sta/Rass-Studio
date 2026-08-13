(function(){
  'use strict';
  const R=window.RassRemote,cfg=window.RASS_SUPABASE_CONFIG||{};
  if(!R||!R.configured?.())return;
  R.createAppointment=async function(app){
    const payload={name:String(app?.name||'').trim().slice(0,100),phone:String(app?.phone||'').trim().slice(0,30),email:String(app?.email||'').trim().slice(0,254),serviceId:String(app?.serviceId||''),staffId:String(app?.staffId||''),date:String(app?.date||'').slice(0,10),time:String(app?.time||'').slice(0,5),notes:String(app?.notes||'').trim().slice(0,1000)};
    const response=await fetch(`${String(cfg.url).replace(/\/$/,'')}/functions/v1/rass-public-booking`,{method:'POST',headers:{'Content-Type':'application/json','apikey':String(cfg.key||'')},body:JSON.stringify(payload),credentials:'omit',referrerPolicy:'no-referrer'});
    const body=await response.json().catch(()=>({}));
    if(!response.ok){if(response.status===409)throw new Error('Horário ocupado.');if(response.status===429)throw new Error('Limite de tentativas atingido.');throw new Error('Não foi possível registrar o agendamento.');}
    return body;
  };
  R.createQuote=async function(quote){
    await R.currentSession();
    const payload={name:String(quote?.name||'').trim().slice(0,100),phone:String(quote?.phone||'').trim().slice(0,30),service:String(quote?.service||'Personalizado').trim().slice(0,150),description:String(quote?.description||'').trim().slice(0,1500)};
    const {data,error}=await R.client.rpc('rass_submit_public_quote_client',{p_payload:payload});
    if(error)throw new Error('Não foi possível registrar o orçamento.');
    return data;
  };
})();
