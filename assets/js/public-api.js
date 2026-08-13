(function(){
  'use strict';
  const R=window.RassRemote,cfg=window.RASS_SUPABASE_CONFIG||{};
  if(!R||!R.configured?.())return;
  const endpoint=()=>`${String(cfg.url).replace(/\/$/,'')}/functions/v1/rass-public-booking`;
  async function post(kind,payload){
    const response=await fetch(endpoint(),{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':String(cfg.key||'')},
      body:JSON.stringify({kind,payload}),
      credentials:'omit',
      referrerPolicy:'no-referrer'
    });
    const body=await response.json().catch(()=>({}));
    if(response.ok)return body;
    if(response.status===429)throw new Error('Limite de tentativas atingido. Tente novamente mais tarde.');
    if(response.status===503)throw new Error('O serviço está temporariamente indisponível. Tente novamente mais tarde.');
    if(kind==='appointment'&&response.status===409)throw new Error('Horário ocupado ou agenda indisponível.');
    throw new Error(kind==='quote'?'Não foi possível registrar o orçamento.':'Não foi possível registrar o agendamento.');
  }
  R.createAppointment=async function(app){
    const payload={
      name:String(app?.name||'').trim().slice(0,100),
      phone:String(app?.phone||'').trim().slice(0,30),
      email:String(app?.email||'').trim().slice(0,254),
      serviceId:String(app?.serviceId||''),
      staffId:String(app?.staffId||''),
      date:String(app?.date||'').slice(0,10),
      time:String(app?.time||'').slice(0,5),
      notes:String(app?.notes||'').trim().slice(0,1000)
    };
    return post('appointment',payload);
  };
  R.createQuote=async function(quote){
    const payload={
      name:String(quote?.name||'').trim().slice(0,100),
      phone:String(quote?.phone||'').trim().slice(0,30),
      service:String(quote?.service||'Personalizado').trim().slice(0,150),
      description:String(quote?.description||'').trim().slice(0,1500)
    };
    return post('quote',payload);
  };
})();
