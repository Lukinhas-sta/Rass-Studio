// RASS STUDIO — SUPABASE (produção)
// Somente a Publishable Key deste projeto e usada no navegador.
window.RASS_SUPABASE_CONFIG = {
  url: 'https://yncspxfsvlqdnodlsosb.supabase.co',
  key: 'sb_publishable_jALAHHuvrV5oxj2mugWTCQ_stD_vFyN'
};

/*
 * Rass Studio V4.15 — estabilização de produção.
 * Mantém o design existente e corrige interação mobile, carregamento progressivo,
 * confirmação de agendamento, WhatsApp e layout do 2FA no painel.
 */
(() => {
  'use strict';

  const digits = value => String(value || '').replace(/\D/g, '');
  const brDate = iso => {
    const p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso || '');
  };
  const html = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));

  function safeOpen(url) {
    try {
      const popup = window.open(url, '_blank', 'noopener');
      if (popup) return true;
    } catch (_) {}
    try {
      window.location.assign(url);
      return true;
    } catch (_) {
      return false;
    }
  }

  function studioWhatsapp(message) {
    const settings = window.RassData?.get('settings') || {};
    let p = digits(settings.whatsapp || '5515991799866');
    if (!p) return false;
    if (!p.startsWith('55')) p = `55${p}`;
    return safeOpen(`https://wa.me/${p}?text=${encodeURIComponent(message)}`);
  }

  function injectStabilityCss() {
    if (document.getElementById('rass-v415-stability-css')) return;
    const style = document.createElement('style');
    style.id = 'rass-v415-stability-css';
    style.textContent = `
      .booking-card::before{pointer-events:none!important}
      .booking-card .booking-step,.booking-card .mobile-booking-progress,.booking-card .mobile-booking-nav{position:relative;z-index:1}
      .booking .service-choice-grid{position:relative;z-index:2}
      .booking .service-choice{
        position:relative!important;display:flex!important;flex-direction:column!important;justify-content:center!important;
        gap:4px!important;margin:0!important;min-width:0!important;cursor:pointer!important;touch-action:manipulation!important;
        border:2px solid #777!important;background:#f8f6f2!important;color:#090909!important;
        transition:background .18s ease,color .18s ease,border-color .18s ease,transform .18s ease!important
      }
      .booking .service-choice:hover,.booking .service-choice:focus-visible{border-color:#090909!important}
      .booking .service-choice.active,.booking .service-choice[aria-pressed="true"]{
        background:#090909!important;color:#fff!important;border-color:#090909!important;box-shadow:0 7px 20px rgba(0,0,0,.16)!important
      }
      .booking .service-choice.active small,.booking .service-choice[aria-pressed="true"] small{color:#cfcfcf!important}
      .booking .service-choice.active::after,.booking .service-choice[aria-pressed="true"]::after{
        content:'✓';position:absolute;right:8px;top:6px;font-size:12px;font-weight:900;color:currentColor
      }
      .booking-success-v411{display:none;margin-top:14px;padding:14px 16px;border:1px solid #111;border-radius:14px;background:#fff;color:#111;line-height:1.45}
      .booking-success-v411.show{display:block}
      .booking-success-v411 strong{display:block;font-size:.9rem;margin-bottom:4px}
      .booking-success-v411 span{display:block;font-size:.76rem;color:#626262}
      .booking-success-v411 button{margin-top:10px;width:100%;border:0;border-radius:999px;padding:11px 14px;background:#090909;color:#fff;font:inherit;font-weight:700;cursor:pointer}
      #requiredMfaSetup{position:relative;z-index:3;margin:0 0 18px;padding:14px;border:1px solid #2e2e2e;border-radius:16px;background:#0d0d0d;overflow:hidden}
      #requiredMfaSetup p{margin:0 0 12px;line-height:1.55;font-size:.88rem}
      #requiredMfaQr{display:block!important;width:min(220px,68vw)!important;height:auto!important;aspect-ratio:1/1!important;object-fit:contain!important;margin:12px auto!important;background:#fff!important;padding:8px!important;border-radius:12px!important}
      #requiredMfaSecret{display:block!important;max-width:100%;overflow-wrap:anywhere;word-break:break-all;margin:6px 0 14px!important;font-size:.72rem;line-height:1.45;color:#ddd}
      #mfaLoginForm>label{position:relative;z-index:4;display:block}
      #mfaLoginCode{position:relative;z-index:4}
      .admin-table-wrap{overscroll-behavior-inline:contain}
      @media(max-width:760px){
        .booking .service-choice{min-height:70px!important;padding:11px 28px 11px 10px!important}
        .booking .service-choice>span{font-size:.78rem!important;line-height:1.18!important}
        .booking .service-choice small{font-size:.58rem!important;line-height:1.25!important;margin-top:3px!important}
        #requiredMfaSetup{padding:12px;margin-bottom:14px}
        #requiredMfaQr{width:min(210px,66vw)!important}
        .admin-login .login-card{max-height:calc(100dvh - 28px);overflow:auto;-webkit-overflow-scrolling:touch}
        .admin-modal-card{max-height:92dvh!important;overflow:auto!important;-webkit-overflow-scrolling:touch}
        .admin-table-wrap{-webkit-overflow-scrolling:touch}
      }
    `;
    document.head.appendChild(style);
  }

  function installReliableWhatsapp() {
    if (typeof window.openWhatsapp !== 'function' || window.__rassV415Whatsapp) return;
    window.__rassV415Whatsapp = true;
    window.openWhatsapp = message => studioWhatsapp(String(message || ''));
  }

  function makePublicHydrationProgressive() {
    const remote = window.RassRemote;
    if (!remote?.configured?.() || remote.__v415ProgressivePublic) return;
    remote.__v415ProgressivePublic = true;
    const hydrate = remote.initPublic.bind(remote);
    remote.initPublic = async () => {
      if (!remote.__v415HydrationPromise) {
        remote.__v415HydrationPromise = hydrate()
          .then(result => {
            document.dispatchEvent(new CustomEvent('rass-public-data-ready-v415'));
            return result;
          })
          .catch(error => {
            console.warn('[Rass V4.15] sincronização pública em segundo plano:', error?.message || error);
            return false;
          });
      }
      return true;
    };
  }

  function rerenderPublicAfterHydration() {
    if (document.body.classList.contains('admin-body')) return;
    try {
      if (typeof applySettings === 'function') applySettings();
      if (typeof renderServiceFilters === 'function') renderServiceFilters();
      if (typeof renderServices === 'function') renderServices();
      if (typeof renderJewelryFilters === 'function') renderJewelryFilters();
      if (typeof renderJewelry === 'function') renderJewelry();
      if (typeof renderGalleryFilters === 'function') renderGalleryFilters();
      if (typeof renderGallery === 'function') renderGallery();
      if (typeof renderPromotions === 'function') renderPromotions();

      if (typeof selectedService !== 'undefined' && selectedService && !window.RassData?.get('services')?.some(s => s.id === selectedService)) selectedService = '';
      if (typeof selectedStaff !== 'undefined' && selectedStaff && !window.RassData?.get('staff')?.some(s => s.id === selectedStaff)) selectedStaff = '';
      if (typeof renderBookingTypes === 'function') renderBookingTypes();
      if (typeof renderBookingServices === 'function') renderBookingServices();
      if (typeof renderBookingStaff === 'function') renderBookingStaff();
      if (typeof renderTimes === 'function' && document.getElementById('bookingDate')?.value && typeof selectedService !== 'undefined' && selectedService) renderTimes();
      if (typeof observe === 'function') observe();
    } catch (error) {
      console.warn('[Rass V4.15] atualização visual:', error?.message || error);
    }
  }

  function hardenBookingSelection() {
    const form = document.getElementById('bookingForm');
    if (!form || form.dataset.v415Selection === '1') return;
    form.dataset.v415Selection = '1';

    form.addEventListener('click', event => {
      const button = event.target.closest?.('[data-bservice]');
      if (!button || !form.contains(button)) return;
      const id = String(button.dataset.bservice || '');
      if (!id) return;
      setTimeout(() => {
        try {
          if (typeof selectedService !== 'undefined') selectedService = id;
          form.querySelectorAll('[data-bservice]').forEach(b => {
            const active = b.dataset.bservice === id;
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
          if (typeof renderBookingStaff === 'function') renderBookingStaff();
          if (document.getElementById('bookingDate')?.value && typeof renderTimes === 'function') renderTimes();
        } catch (error) {
          console.warn('[Rass V4.15] seleção de serviço:', error?.message || error);
        }
      }, 0);
    }, true);
  }

  function addBookingSavedFeedback() {
    const remote = window.RassRemote;
    if (!remote?.createAppointment || remote.__v415BookingFeedback) return;
    remote.__v415BookingFeedback = true;
    const create = remote.createAppointment.bind(remote);
    remote.createAppointment = async app => {
      const result = await create(app);
      document.dispatchEvent(new CustomEvent('rass-booking-saved-v415', { detail: { app, result } }));
      return result;
    };

    const status = document.getElementById('bookingOpenStatus');
    if (status && !document.getElementById('bookingSuccessV411')) {
      const card = document.createElement('div');
      card.id = 'bookingSuccessV411';
      card.className = 'booking-success-v411';
      status.insertAdjacentElement('afterend', card);
    }
  }

  function showBookingSaved(detail) {
    const app = detail?.app || {};
    const card = document.getElementById('bookingSuccessV411');
    if (!card) return;
    card.innerHTML = `<strong>Pedido salvo na agenda ✓</strong><span>${html(app.service || 'Serviço')} · ${html(brDate(app.date))} às ${html(app.time || '')}. O pedido ficou como pendente até a confirmação do Studio.</span><button type="button" id="bookingSavedWhatsappV415">Abrir WhatsApp com os dados</button>`;
    card.querySelector('#bookingSavedWhatsappV415')?.addEventListener('click', () => studioWhatsapp(`Olá! Solicitei um horário pelo site da Rass Studio.\n\nNome: ${app.name || ''}\nÁrea: ${app.type || ''}\nServiço: ${app.service || ''}\nProfissional: ${app.staff || ''}\nData: ${brDate(app.date)}\nHorário: ${app.time || ''}\nObservação: ${app.notes || 'Nenhuma'}`));
    card.classList.add('show');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clientWhatsapp(app, confirmed = false) {
    let p = digits(app?.phone);
    if (!p) return false;
    if (!p.startsWith('55')) p = `55${p}`;
    const message = confirmed
      ? `Olá, ${app.name || 'tudo bem'}! Seu horário na Rass Studio foi confirmado.\n\nServiço: ${app.service || '-'}\nData: ${brDate(app.date)}\nHorário: ${app.time || '-'}\nProfissional: ${app.staff || '-'}\n\nSe precisar alterar o horário, responda por aqui. 🤍`
      : `Olá, ${app.name || 'tudo bem'}! Estou falando sobre seu agendamento na Rass Studio.\n\nServiço: ${app.service || '-'}\nData: ${brDate(app.date)}\nHorário: ${app.time || '-'}`;
    return safeOpen(`https://wa.me/${p}?text=${encodeURIComponent(message)}`);
  }

  function improveAdminAppointments() {
    if (!document.body.classList.contains('admin-body') || !window.RassData) return;

    if (typeof updateAppointmentStatus === 'function' && !window.__rassV415StatusWrapped) {
      window.__rassV415StatusWrapped = true;
      const originalUpdate = updateAppointmentStatus;
      updateAppointmentStatus = function(id, status) {
        const app = window.RassData.get('appointments').find(a => a.id === id);
        const previous = app?.status;
        let done = false;
        const cleanup = () => {
          document.removeEventListener('rass-sync-ok', ok);
          document.removeEventListener('rass-sync-error', fail);
        };
        const ok = event => {
          if (done || event.detail?.name !== 'appointments') return;
          done = true; cleanup();
          if (status === 'Confirmado' && previous !== 'Confirmado' && typeof window.toast === 'function') window.toast('Agendamento confirmado. Use o botão WhatsApp para enviar a confirmação ao cliente.');
        };
        const fail = event => {
          if (done || event.detail?.name !== 'appointments') return;
          done = true; cleanup();
          if (typeof window.toast === 'function') window.toast('Não foi possível salvar a alteração no servidor. Atualize a agenda antes de confirmar com o cliente.');
        };
        document.addEventListener('rass-sync-ok', ok);
        document.addEventListener('rass-sync-error', fail);
        setTimeout(() => { if (!done) cleanup(); }, 12000);
        return originalUpdate(id, status);
      };
    }

    if (typeof renderAppointments === 'function' && !window.__rassV415AppointmentsWrapped) {
      window.__rassV415AppointmentsWrapped = true;
      const originalRender = renderAppointments;
      renderAppointments = function() {
        const result = originalRender();
        document.querySelectorAll('[data-app-status]').forEach(select => {
          const id = select.dataset.appStatus;
          const row = select.closest('tr');
          const actions = row?.querySelector('.row-actions');
          if (!actions || actions.querySelector(`[data-client-whatsapp="${id}"]`)) return;
          const app = window.RassData.get('appointments').find(a => a.id === id);
          if (!app?.phone) return;
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.clientWhatsapp = id;
          button.textContent = app.status === 'Confirmado' ? 'WhatsApp confirmação' : 'WhatsApp';
          button.addEventListener('click', () => clientWhatsapp(app, app.status === 'Confirmado'));
          actions.prepend(button);
        });
        return result;
      };
    }
  }

  function fixMfaDom() {
    const qr = document.getElementById('requiredMfaQr');
    if (qr) {
      qr.style.height = 'auto';
      qr.style.objectFit = 'contain';
      qr.removeAttribute('height');
    }
    const secret = document.getElementById('requiredMfaSecret');
    if (secret) secret.setAttribute('aria-label', 'Chave manual do autenticador');
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectStabilityCss();
    installReliableWhatsapp();
    makePublicHydrationProgressive();
    hardenBookingSelection();
    addBookingSavedFeedback();
    improveAdminAppointments();
    fixMfaDom();

    const observer = new MutationObserver(() => fixMfaDom());
    observer.observe(document.body, { childList: true, subtree: true });
  }, { once: true });

  document.addEventListener('rass-public-data-ready-v415', rerenderPublicAfterHydration);
  document.addEventListener('rass-booking-saved-v415', event => showBookingSaved(event.detail));
  window.RASS_STABILITY_VERSION = '4.15.0';
})();
