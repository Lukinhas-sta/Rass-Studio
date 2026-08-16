(() => {
  'use strict';

  const VERSION = '4.15.0';
  const STUDIO_TZ = 'America/Sao_Paulo';

  function studioIsoDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: STUDIO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function addIsoDays(iso, days) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + Number(days || 0), 12));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
  }

  function studioWeekday(iso) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: STUDIO_TZ, weekday: 'short' })
      .format(new Date(`${iso}T12:00:00-03:00`))
      .replace('.', '');
  }

  // Impede a chamada pública legada de equipe, que hoje retorna 401.
  // A equipe pública continua vindo pela Edge Function protegida rass-public-booking.
  const R = window.RassRemote;
  if (R?.configured?.() && !R.__v415LegacyStaffGuard) {
    R.__v415LegacyStaffGuard = true;
    const initPublic0 = R.initPublic.bind(R);
    R.initPublic = async () => {
      try {
        await R.currentSession();
        const client = R.client;
        if (client && !client.__rassV415RpcGuard) {
          client.__rassV415RpcGuard = true;
          const rpc0 = client.rpc.bind(client);
          client.rpc = (name, args, options) => {
            if (name === 'rass_get_public_staff') return Promise.resolve({ data: [], error: null });
            return rpc0(name, args, options);
          };
        }
      } catch (_) {}
      return initPublic0();
    };
  }

  // Datas do site devem seguir o fuso do Studio, não UTC nem o fuso do visitante.
  if (!document.body.classList.contains('admin-body') && typeof window.renderPromotions === 'function') {
    window.renderPromotions = function() {
      const D = window.RassData;
      const section = document.getElementById('promocoes');
      const grid = document.getElementById('promoGrid');
      if (!D || !section || !grid) return;
      const now = studioIsoDate();
      const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
      const items = D.get('promotions').filter(p => p.active !== false && (!p.startDate || p.startDate <= now) && (!p.endDate || p.endDate >= now));
      section.classList.toggle('hidden', !items.length);
      grid.innerHTML = items.map(p => `<article class="promo-card reveal"><small>${esc(p.type || 'RASS STUDIO')}</small><h3>${esc(p.title)}</h3><p>${esc(p.description || '')}</p>${p.discount ? `<strong>${esc(p.discount)}</strong>` : ''}<a href="#agenda">Agendar agora →</a></article>`).join('');
    };
  }

  if (document.body.classList.contains('admin-body')) {
    const D = window.RassData;
    const qs = s => document.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
    const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const statusCss = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    const read = name => D?.get(name) || [];
    const brDate = iso => { const [y,m,d] = String(iso || '').split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };

    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard = function() {
        const apps = read('appointments'), srv = read('services'), jewelry = read('jewelry'), clients = read('clients'), tx = read('transactions');
        const today = studioIsoDate(), mk = today.slice(0, 7);
        const todayApps = apps.filter(a => a.date === today && !['Cancelado','Recusado'].includes(a.status)).sort((a,b) => String(a.time).localeCompare(String(b.time)));
        const pending = apps.filter(a => a.status === 'Pendente').length;
        const settings = D.get('settings') || {};
        const low = jewelry.filter(x => Number(x.qty) <= Number(settings.lowStockThreshold || 2)).length;
        const monthTx = tx.filter(t => String(t.date || '').startsWith(mk));
        const sum = arr => arr.reduce((n,x) => n + Number(x || 0), 0);
        const income = sum(monthTx.filter(t => t.type === 'entrada').map(t => t.amount));
        const expense = sum(monthTx.filter(t => t.type === 'saida').map(t => t.amount));

        const statGrid = qs('#statGrid');
        if (statGrid) statGrid.innerHTML = `<article class="stat-card"><small>HOJE</small><strong>${todayApps.length}</strong><span>agendamento${todayApps.length===1?'':'s'}</span></article><article class="stat-card"><small>PENDENTES</small><strong>${pending}</strong><span>aguardando confirmação</span></article><article class="stat-card"><small>CLIENTES</small><strong>${clients.length}</strong><span>cadastrados</span></article><article class="stat-card"><small>SERVIÇOS</small><strong>${srv.filter(x=>x.active!==false).length}</strong><span>${srv.filter(x=>x.type==='Unhas').length} de unhas</span></article><article class="stat-card"><small>ESTOQUE</small><strong>${low}</strong><span>itens em atenção</span></article><article class="stat-card"><small>SALDO DO MÊS</small><strong class="money-small">${money(income-expense)}</strong><span>${money(income)} em entradas</span></article>`;

        const todayEl = qs('#todayAppointments');
        if (todayEl) todayEl.innerHTML = todayApps.length ? `<div class="mini-list">${todayApps.slice(0,8).map(a=>`<div class="mini-row"><time>${esc(a.time)}</time><div><strong>${esc(a.name)}</strong><span>${esc(a.type||'')} · ${esc(a.service)}</span></div><span class="status-pill ${statusCss(a.status)}">${esc(a.status)}</span></div>`).join('')}</div>` : '<div class="empty-admin">Nenhum horário para hoje.</div>';

        const alerts = [];
        if (pending) alerts.push(`<button data-go="appointments"><strong>${pending} agendamento${pending===1?'':'s'} pendente${pending===1?'':'s'}</strong><span>Confirmar ou responder →</span></button>`);
        if (low) alerts.push(`<button data-go="jewelry"><strong>${low} item${low===1?'':'s'} com estoque baixo/zero</strong><span>Revisar estoque →</span></button>`);
        const unread = read('notifications').filter(x => !x.read).length;
        if (unread) alerts.push(`<button data-go="notifications"><strong>${unread} notificação${unread===1?'':'ões'} não lida${unread===1?'':'s'}</strong><span>Abrir central →</span></button>`);
        if (!settings.siteOpen) alerts.push('<button data-go="settings"><strong>Agenda online está pausada</strong><span>Alterar modo do site →</span></button>');
        const alertEl = qs('#studioAlerts');
        if (alertEl) {
          alertEl.innerHTML = alerts.length ? `<div class="alert-stack">${alerts.join('')}</div>` : '<div class="empty-admin">Tudo certo por aqui.</div>';
          alertEl.querySelectorAll('[data-go]').forEach(b => b.onclick = () => window.showTab?.(b.dataset.go));
        }

        const next7 = Array.from({length:7}, (_,i) => {
          const iso = addIsoDays(today, i);
          return { label: studioWeekday(iso), count: apps.filter(a => a.date === iso && !['Cancelado','Recusado'].includes(a.status)).length };
        });
        const mx = Math.max(1, ...next7.map(x => x.count));
        const chart = qs('#weekChart');
        if (chart) chart.innerHTML = next7.map(x => `<div><b style="height:${Math.max(8,(x.count/mx)*100)}%"></b><strong>${x.count}</strong><span>${x.label}</span></div>`).join('');
        const finance = qs('#financeSummary');
        if (finance) finance.innerHTML = `<div class="finance-mini"><div><span>Entradas</span><strong>${money(income)}</strong></div><div><span>Saídas</span><strong>${money(expense)}</strong></div><div class="balance"><span>Saldo</span><strong>${money(income-expense)}</strong></div></div>`;

        const valid = apps.filter(a => !['Cancelado','Recusado'].includes(a.status));
        const countBy = field => valid.reduce((m,a) => (m[a[field] || '—'] = (m[a[field] || '—'] || 0) + 1, m), {});
        const topOf = obj => Object.entries(obj).sort((a,b) => b[1] - a[1])[0] || ['—',0];
        const topService = topOf(countBy('service')), topType = topOf(countBy('type')), topTime = topOf(countBy('time'));
        const paid = apps.filter(a => a.status === 'Concluído' && Number(a.amount) > 0);
        const ticket = paid.length ? sum(paid.map(a => a.amount)) / paid.length : 0;
        const insights = qs('#studioInsights');
        if (insights) insights.innerHTML = `<article><small>SERVIÇO MAIS PROCURADO</small><strong>${esc(topService[0])}</strong><span>${topService[1]} pedido${topService[1]===1?'':'s'}</span></article><article><small>ÁREA MAIS PROCURADA</small><strong>${esc(topType[0])}</strong><span>${topType[1]} agendamento${topType[1]===1?'':'s'}</span></article><article><small>HORÁRIO MAIS PEDIDO</small><strong>${esc(topTime[0])}</strong><span>com base na agenda</span></article><article><small>TICKET MÉDIO</small><strong>${money(ticket)}</strong><span>atendimentos concluídos</span></article>`;
      };
    }

    if (typeof window.renderAppointments === 'function') {
      window.renderAppointments = function() {
        let items = read('appointments').slice().sort((a,b) => String(a.date+a.time).localeCompare(String(b.date+b.time)));
        const view = qs('#appointmentView')?.value, date = qs('#appointmentDateFilter')?.value, status = qs('#appointmentStatusFilter')?.value, type = qs('#appointmentTypeFilter')?.value;
        const today = studioIsoDate();
        if (view === 'today') items = items.filter(x => x.date === today);
        if (view === 'week') {
          const endIso = addIsoDays(today, 6);
          items = items.filter(x => x.date >= today && x.date <= endIso);
        }
        if (view === 'month') items = items.filter(x => String(x.date).startsWith(today.slice(0,7)));
        if (date) items = items.filter(x => x.date === date);
        if (status) items = items.filter(x => x.status === status);
        if (type) items = items.filter(x => x.type === type);
        const tbody = qs('#appointmentTable');
        if (!tbody) return;
        const staffById = id => read('staff').find(x => x.id === id);
        tbody.innerHTML = items.map(a => `<tr><td>${brDate(a.date)}</td><td><strong>${esc(a.time)}</strong></td><td><strong>${esc(a.name)}</strong><small class="table-sub">${esc(a.phone||'')}</small></td><td><span class="area-chip ${a.type==='Unhas'?'nails':''}">${esc(a.type||'Piercing')}</span><strong>${esc(a.service)}</strong></td><td>${esc(a.staff||staffById(a.staffId)?.name||'-')}</td><td>${Number(a.amount)>0?money(a.amount):'<small>Sob consulta</small>'}</td><td><select class="status-select ${statusCss(a.status)}" data-app-status="${esc(a.id)}">${['Pendente','Confirmado','Concluído','Cancelado','Recusado'].map(s=>`<option ${a.status===s?'selected':''}>${s}</option>`).join('')}</select></td><td><div class="row-actions"><button data-edit-app="${esc(a.id)}">Editar</button><button class="danger" data-delete-app="${esc(a.id)}">Excluir</button></div></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty-admin">Nenhum agendamento encontrado.</div></td></tr>';
        tbody.querySelectorAll('[data-app-status]').forEach(s => s.onchange = () => window.updateAppointmentStatus?.(s.dataset.appStatus, s.value));
        tbody.querySelectorAll('[data-edit-app]').forEach(b => b.onclick = () => window.openAppointment?.(b.dataset.editApp));
        tbody.querySelectorAll('[data-delete-app]').forEach(b => b.onclick = () => {
          if (confirm('Mover este agendamento para a lixeira?')) {
            D.remove('appointments', b.dataset.deleteApp, true);
            window.renderAll?.();
          }
        });
        window.renderBlocked?.();
      };
    }

    if (typeof window.openAppointment === 'function') {
      const open0 = window.openAppointment;
      window.openAppointment = function(id = '') {
        const out = open0(id);
        if (!id) {
          const input = qs('#appDate');
          if (input) input.value = studioIsoDate();
        }
        return out;
      };
    }

    if (typeof window.enterAdmin === 'function') {
      const enter0 = window.enterAdmin;
      window.enterAdmin = function() {
        const out = enter0();
        const label = qs('#todayLabel');
        if (label) label.textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: STUDIO_TZ, weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
        return out;
      };
    }

    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-new-transaction],[data-block-time]')) return;
      setTimeout(() => {
        const t = qs('#transactionDate'); if (t && qs('#transactionModal')?.classList.contains('open')) t.value = studioIsoDate();
        const b = qs('#blockDate'); if (b && qs('#blockModal')?.classList.contains('open')) b.value = studioIsoDate();
      }, 0);
    }, true);
  }

  // Otimiza imagens abaixo da dobra sem alterar aparência.
  function tuneImages(root = document) {
    root.querySelectorAll?.('#serviceSections img,#jewelryGrid img,#galleryGrid img,.experience img').forEach(img => {
      if (!img.hasAttribute('loading')) img.loading = 'lazy';
      if (!img.hasAttribute('decoding')) img.decoding = 'async';
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    tuneImages();
    const roots = ['serviceSections','jewelryGrid','galleryGrid'].map(id => document.getElementById(id)).filter(Boolean);
    if (roots.length && 'MutationObserver' in window) {
      const observer = new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) tuneImages(n); })));
      roots.forEach(root => observer.observe(root, { childList: true, subtree: true }));
    }
  }, { once: true });

  window.RASS_RUNTIME_VERSION = VERSION;
})();
