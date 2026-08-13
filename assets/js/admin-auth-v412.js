(() => {
  'use strict';

  const cfg = window.RASS_SUPABASE_CONFIG || {};
  const ACTIVITY_KEY = 'rass-studio-last-activity-v1';
  let installed = false;
  let pendingFactorId = '';

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const touchActivity = () => { try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch {} };

  function setupBox() {
    const form = document.getElementById('mfaLoginForm');
    if (!form) return null;
    let box = document.getElementById('requiredMfaSetup');
    if (!box) {
      box = document.createElement('div');
      box.id = 'requiredMfaSetup';
      box.className = 'hidden';
      box.innerHTML = '<p><strong>Primeiro acesso com 2FA</strong><br>Abra o Google Authenticator, Microsoft Authenticator, Authy ou outro aplicativo compatível. Escaneie o QR Code e digite abaixo o código de 6 dígitos.</p><img id="requiredMfaQr" alt="QR Code do autenticador"><small>Se não conseguir escanear, use esta chave manual:</small><code id="requiredMfaSecret"></code>';
      form.insertBefore(box, form.firstChild);
    }
    return box;
  }

  function showSetup(data) {
    const box = setupBox();
    if (!box) return;
    box.classList.remove('hidden');
    const qr = document.getElementById('requiredMfaQr');
    const secret = document.getElementById('requiredMfaSecret');
    if (qr) {
      qr.src = data?.totp?.qr_code || '';
      qr.style.height = 'auto';
      qr.style.objectFit = 'contain';
      qr.removeAttribute('height');
    }
    if (secret) secret.textContent = data?.totp?.secret || '';
  }

  function hideSetup() {
    const box = document.getElementById('requiredMfaSetup');
    const qr = document.getElementById('requiredMfaQr');
    const secret = document.getElementById('requiredMfaSecret');
    if (qr) qr.removeAttribute('src');
    if (secret) secret.textContent = '';
    box?.classList.add('hidden');
  }

  async function hasMembership(client) {
    const { data: userData, error: userError } = await client.auth.getUser();
    const user = userData?.user;
    if (userError || !user || !user.email_confirmed_at || user.is_anonymous) return false;
    const { data, error } = await client.from('rass_admins').select('user_id').eq('user_id', user.id).eq('active', true).maybeSingle();
    return !error && !!data;
  }

  async function factorState(client) {
    const [factorsResult, aalResult] = await Promise.all([
      client.auth.mfa.listFactors(),
      client.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorsResult.error) throw factorsResult.error;
    if (aalResult.error) throw aalResult.error;
    const factors = factorsResult.data?.totp || [];
    return {
      verified: factors.find(f => f.status === 'verified') || null,
      aal: aalResult.data || {},
    };
  }

  async function cleanupUnverified(client) {
    const { data } = await client.auth.getSession();
    const session = data?.session;
    if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');

    const endpoint = `${String(cfg.url || '').replace(/\/$/, '')}/functions/v1/rass-admin-mfa`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': String(cfg.key || ''),
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'cleanup_unverified_totp' }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (response.ok) return true;
      console.warn('[Rass V4.12] limpeza de 2FA retornou', response.status);
    } catch (error) {
      console.warn('[Rass V4.12] limpeza de 2FA indisponível', error?.message || error);
    }
    return false;
  }

  async function createEnrollment(client) {
    await cleanupUnverified(client);

    // Nome único evita que um cadastro interrompido bloqueie o próximo acesso.
    const friendlyName = `Rass Studio ${Date.now().toString(36).slice(-7)}`;
    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    });
    if (error) {
      if (error.code === 'mfa_factor_name_conflict') {
        await delay(250);
        await cleanupUnverified(client);
        const retry = await client.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `Rass Studio ${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
        });
        if (!retry.error && retry.data) {
          pendingFactorId = retry.data.id;
          showSetup(retry.data);
          return;
        }
      }
      throw new Error(error.status === 429
        ? 'Muitas tentativas de 2FA. Aguarde alguns segundos e tente novamente.'
        : 'Não foi possível preparar o autenticador. Atualize a página e tente novamente.');
    }
    pendingFactorId = data.id;
    showSetup(data);
  }

  function minutes(value) {
    const [h, m] = String(value || '').slice(0, 5).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  }

  function intervalsOverlap(aStart, aDuration, bStart, bDuration) {
    return aStart < bStart + bDuration && bStart < aStart + aDuration;
  }

  function patchAppointmentGuard() {
    const form = document.getElementById('appointmentForm');
    const data = window.RassData;
    if (!form || !data || form.dataset.v412Guard === '1') return;
    form.dataset.v412Guard = '1';

    form.addEventListener('submit', event => {
      const id = String(document.getElementById('appointmentId')?.value || '');
      const date = String(document.getElementById('appDate')?.value || '');
      const time = String(document.getElementById('appTime')?.value || '').slice(0, 5);
      const staffId = String(document.getElementById('appStaff')?.value || '');
      const serviceId = String(document.getElementById('appService')?.value || '');
      if (!date || !time || !staffId || !serviceId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert('Preencha serviço, profissional, data e horário antes de salvar.');
        return;
      }

      const services = data.get('services') || [];
      const service = services.find(s => s.id === serviceId);
      const duration = Math.max(5, Number(service?.duration || 60));
      const start = minutes(time);
      if (!Number.isFinite(start)) return;

      const active = status => !['Cancelado', 'Recusado'].includes(String(status || ''));
      const appointments = data.get('appointments') || [];
      const conflict = appointments.some(item => {
        if (String(item.id) === id || item.date !== date || String(item.staffId || '') !== staffId || !active(item.status)) return false;
        const otherStart = minutes(item.time);
        if (!Number.isFinite(otherStart)) return false;
        const otherService = services.find(s => s.id === item.serviceId);
        const otherDuration = Math.max(5, Number(otherService?.duration || 60));
        return intervalsOverlap(start, duration, otherStart, otherDuration);
      });

      const settings = data.get('settings') || {};
      const blockDuration = Math.max(5, Number(settings.interval || 60));
      const blocked = (data.get('blocked') || []).some(block => {
        if (block.date !== date) return false;
        if (block.staffId && String(block.staffId) !== staffId) return false;
        if (block.allDay) return true;
        const blockStart = minutes(block.time);
        return Number.isFinite(blockStart) && intervalsOverlap(start, duration, blockStart, blockDuration);
      });

      if (conflict || blocked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert(conflict
          ? 'Esse período já encosta em outro atendimento dessa profissional. Escolha outro horário.'
          : 'Esse período está bloqueado na agenda. Escolha outro horário ou remova o bloqueio primeiro.');
      }
    }, true);
  }

  async function install() {
    if (installed || !document.body?.classList.contains('admin-body')) return;
    const remote = window.RassRemote;
    if (!remote?.configured?.()) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
      else setTimeout(install, 25);
      return;
    }

    installed = true;
    window.RASS_ADMIN_AUTH_VERSION = '4.12.1';

    // Captura a implementação endurecida existente. Depois da verificação AAL2,
    // ela continua responsável por hidratar e liberar o painel.
    const finishAdmin = remote.initAdmin.bind(remote);

    async function client() {
      await remote.currentSession();
      if (!remote.client) throw new Error('Supabase não configurado.');
      return remote.client;
    }

    remote.login = async (email, password) => {
      const c = await client();
      const normalized = String(email || '').trim().toLowerCase();
      const { error } = await c.auth.signInWithPassword({ email: normalized, password });
      if (error) throw new Error('E-mail ou senha inválidos.');
      touchActivity();
      if (!await hasMembership(c)) {
        await c.auth.signOut();
        throw new Error('Esta conta não está autorizada como administradora da Rass Studio.');
      }

      const state = await factorState(c);
      if (!state.verified) {
        await createEnrollment(c);
        return { mfaRequired: true, enrollmentRequired: true };
      }
      pendingFactorId = '';
      hideSetup();
      return { mfaRequired: true, enrollmentRequired: false };
    };

    remote.initAdmin = async () => {
      const c = await client();
      const { data } = await c.auth.getSession();
      if (!data?.session) return false;
      if (!await hasMembership(c)) return false;

      const state = await factorState(c);
      if (!state.verified) {
        await createEnrollment(c);
        return { mfaRequired: true, enrollmentRequired: true };
      }
      pendingFactorId = '';
      hideSetup();
      if (state.aal?.currentLevel !== 'aal2') return { mfaRequired: true, enrollmentRequired: false };
      touchActivity();
      return finishAdmin();
    };

    remote.verifyMfa = async code => {
      const c = await client();
      const clean = String(code || '').replace(/\D/g, '').slice(0, 6);
      if (clean.length !== 6) throw new Error('Digite o código de 6 dígitos.');

      let factorId = pendingFactorId;
      if (!factorId) {
        const { data, error } = await c.auth.mfa.listFactors();
        if (error) throw error;
        factorId = (data?.totp || []).find(f => f.status === 'verified')?.id || '';
      }
      if (!factorId) throw new Error('O autenticador não foi encontrado. Entre novamente para gerar um novo QR Code.');

      const { error } = await c.auth.mfa.challengeAndVerify({ factorId, code: clean });
      if (error) {
        throw new Error(error.status === 429
          ? 'Muitas tentativas. Aguarde alguns segundos e tente novamente.'
          : 'Código inválido ou expirado. Confira o autenticador e tente novamente.');
      }

      pendingFactorId = '';
      hideSetup();
      touchActivity();
      await c.auth.refreshSession().catch(() => null);
      touchActivity();
      const result = await finishAdmin();
      if (!result?.ok) throw new Error('2FA confirmado, mas não foi possível carregar o painel. Atualize a página.');
      return true;
    };

    // O admin.js configura os formulários no DOMContentLoaded. Rodamos logo depois
    // para impedir conflitos de duração/bloqueios antes que a gravação seja tentada.
    setTimeout(patchAppointmentGuard, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
