(() => {
  'use strict';
  if (!document.body.classList.contains('admin-body')) return;

  const TABLE = 'rass_trash';
  const D = window.RassData;
  const R = window.RassRemote;
  if (!D || !R) return;

  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const fmt = iso => { try { return new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); } catch { return '-'; } };
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let installed = false;
  let hydrated = false;

  function clientReady() { return !!(R.adminMode && R.client); }
  function localTrash() { return Array.isArray(D.get('trash')) ? D.get('trash') : []; }
  function setLocalTrash(items) { D.set('trash', items, { remote:false }); }

  async function upsertTrash(entry) {
    if (!clientReady()) return false;
    const { error } = await R.client.from(TABLE).upsert({
      id: entry.id,
      entity: String(entry.entity || '').slice(0,40),
      item: entry.item || {},
      deleted_at: entry.deletedAt || new Date().toISOString()
    });
    if (error) throw error;
    return true;
  }

  async function deleteTrash(idValue) {
    if (!clientReady()) return false;
    const { error } = await R.client.from(TABLE).delete().eq('id', idValue);
    if (error) throw error;
    return true;
  }

  async function hydrateTrash() {
    if (!clientReady()) return false;
    const { data, error } = await R.client.from(TABLE).select('id,entity,item,deleted_at').order('deleted_at',{ascending:false}).limit(500);
    if (error) throw error;
    const remote = (data || []).map(r => ({id:r.id,entity:r.entity,item:r.item||{},deletedAt:r.deleted_at}));
    const byId = new Map(remote.map(x => [x.id,x]));
    // Preserva um item local recém-excluído caso a rede ainda esteja finalizando o INSERT.
    for (const item of localTrash()) if (!byId.has(item.id)) byId.set(item.id,item);
    const merged = [...byId.values()].sort((a,b)=>String(b.deletedAt||'').localeCompare(String(a.deletedAt||'')));
    setLocalTrash(merged);
    hydrated = true;
    window.renderTrash?.();
    return true;
  }

  function installRemoveHook() {
    if (installed) return;
    installed = true;
    const remove0 = D.remove.bind(D);
    D.remove = (name, itemId, toTrash = true) => {
      if (name === 'trash') {
        const removed = remove0(name, itemId, false);
        if (removed && clientReady()) deleteTrash(itemId).catch(() => window.toast?.('Não foi possível atualizar a lixeira no servidor.'));
        return removed;
      }
      if (!toTrash) return remove0(name, itemId, false);
      const removed = remove0(name, itemId, false);
      if (!removed) return null;
      const entry = { id:id(), entity:name, deletedAt:new Date().toISOString(), item:removed };
      const items = localTrash();
      items.unshift(entry);
      setLocalTrash(items);
      if (clientReady()) upsertTrash(entry).catch(() => window.toast?.('Item excluído, mas a cópia da lixeira ainda não sincronizou.'));
      return removed;
    };
  }

  function waitForEntitySync(entity, action) {
    return new Promise((resolve,reject) => {
      let done = false;
      const finish = (ok, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        document.removeEventListener('rass-sync-ok', onOk);
        document.removeEventListener('rass-sync-error', onError);
        ok ? resolve(value) : reject(value);
      };
      const onOk = e => { if (e.detail?.name === entity) finish(true,true); };
      const onError = e => { if (e.detail?.name === entity) finish(false,e.detail?.error || new Error('sync_failed')); };
      document.addEventListener('rass-sync-ok', onOk);
      document.addEventListener('rass-sync-error', onError);
      const timer = setTimeout(() => finish(false,new Error('sync_timeout')),12000);
      try { action(); } catch (error) { finish(false,error); }
    });
  }

  function installPersistentRenderer() {
    window.renderTrash = function() {
      const host = document.querySelector('#trashList');
      if (!host) return;
      const items = localTrash();
      host.innerHTML = items.map(t => `<div class="trash-row"><div><strong>${esc(t.item?.name||t.item?.title||t.item?.service||'Item')}</strong><span>${esc(t.entity)} · excluído em ${esc(fmt(t.deletedAt))}</span></div><div><button data-restore-trash="${esc(t.id)}">Restaurar</button><button class="danger" data-purge-trash="${esc(t.id)}">Excluir definitivo</button></div></div>`).join('') || '<div class="empty-admin">A lixeira está vazia.</div>';

      host.querySelectorAll('[data-restore-trash]').forEach(button => button.onclick = async () => {
        const entry = localTrash().find(x => x.id === button.dataset.restoreTrash);
        if (!entry) return;
        button.disabled = true;
        try {
          const target = D.get(entry.entity);
          if (!Array.isArray(target)) throw new Error('invalid_entity');
          if (!target.some(x => String(x.id) === String(entry.item?.id))) target.push(entry.item);
          await waitForEntitySync(entry.entity, () => D.set(entry.entity,target));
          await deleteTrash(entry.id);
          setLocalTrash(localTrash().filter(x => x.id !== entry.id));
          window.renderAll?.();
          window.toast?.('Item restaurado e sincronizado.');
        } catch (_) {
          window.toast?.('Não foi possível restaurar no servidor. O item continua na lixeira.');
        } finally { button.disabled = false; }
      });

      host.querySelectorAll('[data-purge-trash]').forEach(button => button.onclick = async () => {
        if (!confirm('Excluir este item definitivamente da lixeira?')) return;
        button.disabled = true;
        try {
          await deleteTrash(button.dataset.purgeTrash);
          setLocalTrash(localTrash().filter(x => x.id !== button.dataset.purgeTrash));
          window.renderTrash();
          window.toast?.('Item removido definitivamente.');
        } catch (_) {
          window.toast?.('Não foi possível excluir o item da lixeira no servidor.');
        } finally { button.disabled = false; }
      });
    };
  }

  function installEmptyTrashGuard() {
    const button = document.querySelector('#emptyTrash');
    if (!button || button.dataset.persistentTrash === '1') return;
    button.dataset.persistentTrash = '1';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const items = localTrash();
      if (!items.length) return window.toast?.('A lixeira já está vazia.');
      if (!confirm('Esvaziar a lixeira definitivamente?')) return;
      button.disabled = true;
      try {
        for (const item of items) await deleteTrash(item.id);
        setLocalTrash([]);
        window.renderTrash();
        window.toast?.('Lixeira esvaziada.');
      } catch (_) {
        await hydrateTrash().catch(()=>null);
        window.toast?.('Não foi possível esvaziar tudo. A lixeira foi atualizada com o servidor.');
      } finally { button.disabled = false; }
    }, true);
  }

  function waitForAdmin() {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (clientReady()) {
        clearInterval(timer);
        hydrateTrash().catch(() => window.toast?.('Não foi possível carregar a lixeira do servidor.'));
      } else if (tries > 600) clearInterval(timer);
    }, 250);
  }

  document.addEventListener('DOMContentLoaded', () => {
    installRemoveHook();
    installPersistentRenderer();
    installEmptyTrashGuard();
    waitForAdmin();
  }, { once:true });

  document.addEventListener('rass-sync-ok', () => {
    if (clientReady() && !hydrated) hydrateTrash().catch(()=>null);
  });

  window.RASS_TRASH_VERSION = '4.15.0';
})();
