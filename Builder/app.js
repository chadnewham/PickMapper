// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let state = {
  items:     {},   // { [id]: { id, description, pickIds: [], groupId? } }
  modifiers: {},   // { [id]: { id, description, isCustom? } }
  picks:     {},   // { [id]: { id, name, modifierIds: [], pickId? } }
};

let selectedItemId = null;
let editingPickId  = null;

// ─────────────────────────────────────────────
//  SESSION STORAGE KEYS
// ─────────────────────────────────────────────
const SESSIONS_INDEX_KEY  = 'pickbuilder_sessions_v1';
const SESSION_DATA_PREFIX = 'pickbuilder_sess_';
const CURRENT_SESSION_KEY = 'pickbuilder_current_v1';

let currentSessionId = null;

// ─────────────────────────────────────────────
//  SESSION MANAGEMENT
// ─────────────────────────────────────────────
function initSessions() {
  currentSessionId = localStorage.getItem(CURRENT_SESSION_KEY);

  if (!currentSessionId) {
    // First launch — check for data from old storage key and migrate it
    const legacy = localStorage.getItem('pickbuilder_v2');
    if (legacy) {
      try {
        const loaded = JSON.parse(legacy);
        migrateState(loaded);
        state = loaded;
        localStorage.removeItem('pickbuilder_v2');
      } catch (e) { /* ignore corrupt */ }
    }
    currentSessionId = genSessionId();
    localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
    _upsertSessionIndex({ createdAt: new Date().toISOString() });
    save();
  } else {
    _loadSessionData(currentSessionId);
  }

  updateSessionIndicator();
}

function _loadSessionData(id) {
  try {
    const raw = localStorage.getItem(SESSION_DATA_PREFIX + id);
    if (!raw) return;
    const loaded = JSON.parse(raw);
    migrateState(loaded);
    state = loaded;
  } catch (e) { /* corrupt — keep blank state */ }
}

function getSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_INDEX_KEY) ?? '[]');
  } catch { return []; }
}

function _upsertSessionIndex(extra = {}) {
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === currentSessionId);
  const entry = {
    id:         currentSessionId,
    itemCount:  Object.keys(state.items).length,
    pickCount:  Object.keys(state.picks).length,
    modCount:   Object.keys(state.modifiers).length,
    updatedAt:  new Date().toISOString(),
    ...extra,
  };
  if (idx >= 0) sessions[idx] = { ...sessions[idx], ...entry };
  else          sessions.push(entry);
  localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions));
}

function save() {
  if (!currentSessionId) return;
  localStorage.setItem(SESSION_DATA_PREFIX + currentSessionId, JSON.stringify(state));
  _upsertSessionIndex();
  updateSessionIndicator();
}

function newSession() {
  save(); // persist current state first
  currentSessionId = genSessionId();
  state = { items: {}, modifiers: {}, picks: {} };
  selectedItemId = null;
  editingPickId  = null;
  localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
  _upsertSessionIndex({ createdAt: new Date().toISOString() });
  save();
  closeModals();
  renderAll();
  toast('New session started', 'info');
}

function loadSession(id) {
  if (id === currentSessionId) { closeModals(); return; }
  save(); // persist current before switching
  currentSessionId = id;
  localStorage.setItem(CURRENT_SESSION_KEY, id);
  state = { items: {}, modifiers: {}, picks: {} };
  _loadSessionData(id);
  selectedItemId = null;
  editingPickId  = null;
  closeModals();
  renderAll();
  toast('Session loaded', 'info');
}

function deleteSession(id) {
  if (id === currentSessionId) return toast('Cannot delete the active session', 'error');
  const sessions = getSessions().filter(s => s.id !== id);
  localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions));
  localStorage.removeItem(SESSION_DATA_PREFIX + id);
  renderSessionList();
  toast('Session deleted');
}

function openSessionsModal() {
  renderSessionList();
  openModal('sessions-modal');
}

function renderSessionList() {
  const container = document.getElementById('sessions-list');
  const sessions  = getSessions().sort((a, b) =>
    new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt)
  );

  if (sessions.length === 0) {
    container.innerHTML = '<div class="empty-state">No sessions yet.</div>';
    return;
  }

  container.innerHTML = '';
  sessions.forEach(sess => {
    const isCurrent = sess.id === currentSessionId;
    const when = formatSessionDate(new Date(sess.updatedAt ?? sess.createdAt));

    const row = document.createElement('div');
    row.className = 'session-row' + (isCurrent ? ' is-current' : '');
    row.innerHTML = `
      <div class="session-dot"></div>
      <div class="session-info">
        <div class="session-timestamp">${when}${isCurrent ? ' &nbsp;<span class="badge" style="color:#60a5fa;border-color:#60a5fa;">current</span>' : ''}</div>
        <div class="session-summary">${sess.itemCount ?? 0} items · ${sess.pickCount ?? 0} picks · ${sess.modCount ?? 0} modifiers</div>
      </div>
      <div class="session-actions">
        ${!isCurrent ? `<button class="btn btn-ghost btn-sm" onclick="loadSession('${sess.id}')">Load</button>` : ''}
        ${!isCurrent ? `<button class="btn btn-danger btn-sm" onclick="deleteSession('${sess.id}')">Delete</button>` : ''}
      </div>
    `;
    container.appendChild(row);
  });
}

function updateSessionIndicator() {
  const el = document.getElementById('session-indicator');
  if (!el) return;
  const sessions = getSessions();
  const current  = sessions.find(s => s.id === currentSessionId);
  if (!current) { el.textContent = 'Sessions'; return; }
  const when = formatSessionDate(new Date(current.updatedAt ?? current.createdAt));
  el.textContent = `Session · ${when}`;
}

function formatSessionDate(date) {
  const now   = new Date();
  const today = now.toDateString() === date.toDateString();
  const yesterday = new Date(now - 864e5).toDateString() === date.toDateString();
  const time  = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (today)     return `Today, ${time}`;
  if (yesterday) return `Yesterday, ${time}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + `, ${time}`;
}

function genSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
}

// ─────────────────────────────────────────────
//  STATE MIGRATION  (v1 → v2 format)
// ─────────────────────────────────────────────
function migrateState(s) {
  s.items     ??= {};
  s.modifiers ??= {};
  s.picks     ??= {};

  Object.values(s.items).forEach(it => { it.pickIds ??= []; });

  Object.values(s.picks).forEach(pick => {
    if (Array.isArray(pick.itemIds)) {
      pick.itemIds.forEach(iid => {
        const item = s.items[iid];
        if (item && !item.pickIds.includes(pick.id)) item.pickIds.push(pick.id);
      });
      delete pick.itemIds;
    }
    pick.modifierIds      ??= [];
    pick.modifierSettings ??= {};
    pick.type             ??= 'optional';
    pick.sortOrder        ??= 0;
    pick.itemsToSelect    ??= 1;
  });
}

// ─────────────────────────────────────────────
//  API — GET GROUP IDs
//  To wire up the real endpoint, set API_CONFIG.baseUrl
//  and adjust buildApiPayload() / applyGroupIds() as needed.
// ─────────────────────────────────────────────
const API_CONFIG = {
  baseUrl:   null,   // e.g. 'https://api.example.com' — set this to enable real calls
  endpoints: {
    groupIds: '/v1/assign-group-ids',
  },
  headers: {
    'Content-Type': 'application/json',
    // 'Authorization': 'Bearer YOUR_TOKEN_HERE',
  },
};

function buildApiPayload() {
  // Sends the current mapping so the API can assign stable IDs.
  // Adjust this shape to match whatever the real API expects.
  return {
    items: Object.values(state.items).map(it => ({
      id:      it.id,
      pickIds: it.pickIds,
    })),
    picks: Object.values(state.picks).map(p => ({
      id:          p.id,
      name:        p.name,
      modifierIds: p.modifierIds,
    })),
  };
}

function applyGroupIds(data) {
  // Merges API response into current state and saves the session.
  // Adjust field names below to match what the real API returns.
  let itemsUpdated = 0, picksUpdated = 0;

  (data.items || []).forEach(it => {
    if (state.items[it.id] && it.groupId != null) {
      state.items[it.id].groupId = it.groupId;
      itemsUpdated++;
    }
  });

  (data.picks || []).forEach(p => {
    if (state.picks[p.id] && p.pickId != null) {
      state.picks[p.id].pickId = p.pickId;
      picksUpdated++;
    }
  });

  save();
  renderAll();
  toast(`IDs assigned — ${itemsUpdated} items, ${picksUpdated} picks`, 'info');
}

async function fetchGroupIds() {
  const btn = document.getElementById('fetch-ids-btn');
  btn.disabled    = true;
  btn.textContent = 'Fetching…';

  try {
    let data;

    if (API_CONFIG.baseUrl) {
      // ── Real API call ──────────────────────────────────────────
      const res = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.groupIds, {
        method:  'POST',
        headers: API_CONFIG.headers,
        body:    JSON.stringify(buildApiPayload()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      data = await res.json();
      // ──────────────────────────────────────────────────────────
    } else {
      // ── Mock (no baseUrl configured) ───────────────────────────
      await new Promise(r => setTimeout(r, 700)); // simulate latency
      data = _mockGenerateGroupIds();
      // ──────────────────────────────────────────────────────────
    }

    applyGroupIds(data);
  } catch (e) {
    toast(`Fetch failed: ${e.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Get Group IDs';
  }
}

function _mockGenerateGroupIds() {
  // Groups items with identical pick sets → same groupId.
  // In production this logic lives on the server.
  const sigMap = {};
  let   gNum   = 1;

  const items = Object.values(state.items).map(it => {
    const sig = [...it.pickIds].sort().join('|');
    if (sig) {
      if (!sigMap[sig]) sigMap[sig] = `GRP-${String(gNum++).padStart(3, '0')}`;
      return { id: it.id, groupId: sigMap[sig] };
    }
    return { id: it.id, groupId: null };
  });

  let pNum  = 1;
  const picks = Object.values(state.picks).map(p => ({
    id:     p.id,
    pickId: `PCK-${String(pNum++).padStart(3, '0')}`,
  }));

  return { items, picks };
}

// ─────────────────────────────────────────────
//  IMPORT
// ─────────────────────────────────────────────
function importData() {
  const raw = document.getElementById('import-json').value.trim();
  if (!raw) return toast('Paste JSON first', 'error');

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return toast('Invalid JSON', 'error'); }

  let iCount = 0, mCount = 0;

  (parsed.items || []).forEach(item => {
    if (!item.id) return;
    if (!state.items[item.id]) {
      state.items[item.id] = { id: item.id, description: item.description || item.id, pickIds: [] };
      iCount++;
    }
  });

  (parsed.modifiers || []).forEach(mod => {
    if (!mod.id) return;
    if (!state.modifiers[mod.id]) {
      state.modifiers[mod.id] = { id: mod.id, description: mod.description || mod.id };
      mCount++;
    }
  });

  save();
  closeModals();
  renderAll();
  toast(`Imported ${iCount} items, ${mCount} modifiers`);
}

function clearAllData() {
  if (!confirm('Clear all data in this session? This cannot be undone.')) return;
  state = { items: {}, modifiers: {}, picks: {} };
  selectedItemId = null;
  editingPickId  = null;
  save();
  closeModals();
  renderAll();
  toast('Session cleared');
}

// ─────────────────────────────────────────────
//  ITEM SELECTION
// ─────────────────────────────────────────────
function selectItem(id) {
  selectedItemId = (selectedItemId === id) ? null : id;
  renderItems();
  renderWorkspace();
  renderBank();
}

// ─────────────────────────────────────────────
//  PICKS — CRUD
// ─────────────────────────────────────────────
function genId() {
  return 'pk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function openCreatePickModal() {
  document.getElementById('new-pick-name').value = '';
  const hint = document.getElementById('create-pick-hint');
  hint.textContent = selectedItemId
    ? `This pick will be added to "${state.items[selectedItemId]?.description ?? selectedItemId}".`
    : 'This pick will be added to the bank only.';
  openModal('create-pick-modal');
}

function createPick() {
  const name = document.getElementById('new-pick-name').value.trim();
  if (!name) return toast('Pick name required', 'error');

  const id = genId();
  state.picks[id] = {
    id, name,
    modifierIds:      [],
    modifierSettings: {},
    type:             'optional',
    sortOrder:        0,
    itemsToSelect:    1,
  };

  if (selectedItemId && state.items[selectedItemId]) {
    state.items[selectedItemId].pickIds.push(id);
  }

  save();
  closeModals();
  renderAll();
  toast(`"${name}" created`, 'info');
  openEditPickModal(id);
}

function deletePick(pickId) {
  const name = state.picks[pickId]?.name ?? pickId;
  if (!confirm(`Delete "${name}" from the bank? It will be removed from all items.`)) return;
  Object.values(state.items).forEach(it => {
    it.pickIds = it.pickIds.filter(pid => pid !== pickId);
  });
  delete state.picks[pickId];
  save();
  renderAll();
  toast(`"${name}" deleted`);
}

function renamePick(pickId, newName) {
  newName = newName.trim();
  if (!state.picks[pickId] || !newName) return;
  state.picks[pickId].name = newName;
  save();
  renderWorkspace();
  renderBank();
}

// ─────────────────────────────────────────────
//  PICKS ↔ ITEMS
// ─────────────────────────────────────────────
function togglePickOnItem(pickId) {
  if (!selectedItemId) return toast('Select an item first', 'error');
  const item = state.items[selectedItemId];
  if (!item) return;

  if (item.pickIds.includes(pickId)) {
    item.pickIds = item.pickIds.filter(id => id !== pickId);
    toast('Removed from item');
  } else {
    item.pickIds.push(pickId);
    toast('Added to item', 'info');
  }
  save();
  renderWorkspace();
  renderBank();
  renderItems();
}

function removePickFromItem(pickId, e) {
  if (e) e.stopPropagation();
  if (!selectedItemId) return;
  const item = state.items[selectedItemId];
  if (!item) return;
  const name = state.picks[pickId]?.name ?? pickId;
  item.pickIds = item.pickIds.filter(id => id !== pickId);
  save();
  renderWorkspace();
  renderBank();
  renderItems();
  toast(`"${name}" removed from item`);
}

// ─────────────────────────────────────────────
//  MODIFIERS — CRUD
// ─────────────────────────────────────────────
function createModifier() {
  const id   = document.getElementById('new-mod-id').value.trim();
  const desc = document.getElementById('new-mod-desc').value.trim();
  if (!id || !desc) return toast('ID and description required', 'error');
  if (state.modifiers[id]) return toast('Modifier ID already exists', 'error');

  state.modifiers[id] = { id, description: desc, isCustom: true };
  document.getElementById('new-mod-id').value   = '';
  document.getElementById('new-mod-desc').value = '';
  save();
  updateStats();
  toast(`"${desc}" created`);
  backToEditPick();
}

function backToEditPick() {
  closeModals();
  if (editingPickId) openEditPickModal(editingPickId);
}

function toggleModOnPick(modId) {
  if (!editingPickId) return;
  const pick = state.picks[editingPickId];
  if (!pick) return;
  pick.modifierSettings ??= {};

  if (pick.modifierIds.includes(modId)) {
    pick.modifierIds = pick.modifierIds.filter(id => id !== modId);
    delete pick.modifierSettings[modId];
  } else {
    pick.modifierIds.push(modId);
    pick.modifierSettings[modId] = { sortOrder: pick.modifierIds.length, isDefault: false };
  }
  save();
  renderEditModList();
  renderWorkspace();
  renderBank();
}

// ── Pick attribute setters ──────────────────────
function setPickType(type) {
  if (!editingPickId) return;
  const pick = state.picks[editingPickId];
  if (!pick) return;
  pick.type = type;
  save();
  document.querySelectorAll('.type-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.value === type)
  );
  renderWorkspace();
  renderBank();
}

function updatePickSortOrder(value) {
  if (!editingPickId) return;
  const pick = state.picks[editingPickId];
  if (!pick) return;
  pick.sortOrder = Math.max(0, parseInt(value) || 0);
  save();
  renderWorkspace();
}

function updatePickItemsToSelect(value) {
  if (!editingPickId) return;
  const pick = state.picks[editingPickId];
  if (!pick) return;
  pick.itemsToSelect = Math.max(1, parseInt(value) || 1);
  save();
}

// ── Modifier attribute setters ──────────────────
function updateModSortOrder(modId, value) {
  if (!editingPickId) return;
  const pick = state.picks[editingPickId];
  if (!pick) return;
  pick.modifierSettings ??= {};
  pick.modifierSettings[modId] ??= { sortOrder: 0, isDefault: false };
  pick.modifierSettings[modId].sortOrder = Math.max(0, parseInt(value) || 0);
  save();
}

function toggleModDefault(modId, checked) {
  if (!editingPickId) return;
  const pick = state.picks[editingPickId];
  if (!pick) return;
  pick.modifierSettings ??= {};
  pick.modifierSettings[modId] ??= { sortOrder: 0, isDefault: false };
  pick.modifierSettings[modId].isDefault = checked;
  save();
}

function removeModFromEditPick(modId) { toggleModOnPick(modId); }

// ─────────────────────────────────────────────
//  RENDER — ITEMS
// ─────────────────────────────────────────────
function renderItems() {
  const container = document.getElementById('items-list');
  const q = document.getElementById('items-search').value.toLowerCase().trim();

  const allItems = Object.values(state.items);
  const items = allItems.filter(it =>
    !q || it.id.toLowerCase().includes(q) || it.description.toLowerCase().includes(q)
  );

  document.getElementById('items-count').textContent = allItems.length;

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">${
      allItems.length === 0
        ? 'No items imported yet.<br>Use <strong>Import Data</strong> to begin.'
        : 'No items match your search.'
    }</div>`;
    return;
  }

  container.innerHTML = '';
  items.forEach(item => {
    const n = item.pickIds.length;
    const isSelected = selectedItemId === item.id;
    const hasGroupId = !!item.groupId;

    const row = document.createElement('div');
    row.className = 'item-row' +
      (isSelected ? ' selected' : '') +
      (n > 0 ? ' has-picks' : '');

    const groupBadge = hasGroupId
      ? `<span class="badge" style="color:#a78bfa;border-color:#a78bfa;" title="Group ID: ${escHtml(item.groupId)}">${escHtml(item.groupId)}</span>`
      : '';

    row.innerHTML = `
      <span class="item-id">${escHtml(item.id)}</span>
      <span class="item-desc">${escHtml(item.description)}</span>
      ${groupBadge}
      <span class="item-pick-count">${n} pick${n !== 1 ? 's' : ''}</span>
    `;

    row.addEventListener('click', () => selectItem(item.id));
    container.appendChild(row);
  });
}

// ─────────────────────────────────────────────
//  RENDER — WORKSPACE
// ─────────────────────────────────────────────
function renderWorkspace() {
  const noSel    = document.getElementById('workspace-no-sel');
  const itemInfo = document.getElementById('workspace-item-info');
  const body     = document.getElementById('workspace-body');

  if (!selectedItemId || !state.items[selectedItemId]) {
    noSel.style.display    = '';
    itemInfo.style.display = 'none';
    body.innerHTML = `
      <div class="workspace-empty">
        <div class="workspace-empty-icon">🗂</div>
        <div>Select an item from the list<br>to view and manage its picks.</div>
      </div>`;
    return;
  }

  const item = state.items[selectedItemId];
  noSel.style.display    = 'none';
  itemInfo.style.display = '';
  document.getElementById('ws-item-id').textContent   = item.id;
  document.getElementById('ws-item-name').textContent = item.description;

  body.innerHTML = '';

  if (item.pickIds.length === 0) {
    body.innerHTML = `
      <div class="workspace-empty">
        <div class="workspace-empty-icon">📋</div>
        <div>No picks assigned yet.<br>
          Click <strong>+ New Pick</strong> to create one, or<br>
          click a pick in the bank to assign it.</div>
      </div>`;
    return;
  }

  // Render picks sorted by their sortOrder
  const sortedPickIds = [...item.pickIds].sort((a, b) =>
    (state.picks[a]?.sortOrder ?? 0) - (state.picks[b]?.sortOrder ?? 0)
  );

  sortedPickIds.forEach(pickId => {
    const pick = state.picks[pickId];
    if (!pick) return;

    const card = document.createElement('div');
    card.className = 'ws-pick-card';

    const type = pick.type ?? 'optional';

    // Modifiers sorted by their per-pick sortOrder
    const sortedMods = [...pick.modifierIds].sort((a, b) =>
      (pick.modifierSettings?.[a]?.sortOrder ?? 0) - (pick.modifierSettings?.[b]?.sortOrder ?? 0)
    );
    const modChips = sortedMods.map(mid => {
      const mod = state.modifiers[mid];
      const isDefault = pick.modifierSettings?.[mid]?.isDefault;
      return `<span class="chip mod">
        ${isDefault ? '<span title="Default" style="color:#fbbf24;margin-right:2px;">★</span>' : ''}${escHtml(mod?.description ?? mid)}
      </span>`;
    }).join('');

    const pickIdBadge = pick.pickId
      ? `<span class="badge" style="color:#a78bfa;border-color:#a78bfa;">${escHtml(pick.pickId)}</span>`
      : '';

    const selectBadge = pick.itemsToSelect > 1
      ? `<span class="badge" title="Items to select">select ${pick.itemsToSelect}</span>`
      : '';

    card.innerHTML = `
      <div class="ws-pick-header">
        <span class="ws-pick-name">${escHtml(pick.name)}</span>
        <div class="ws-pick-actions">
          <span class="type-badge ${type}">${type}</span>
          ${pick.sortOrder > 0 ? `<span class="badge">#${pick.sortOrder}</span>` : ''}
          ${selectBadge}
          ${pickIdBadge}
          <span class="badge">${pick.modifierIds.length}m</span>
          <button class="btn btn-ghost btn-icon btn-sm" title="Edit pick"
                  onclick="openEditPickModal('${pickId}')">✏</button>
          <button class="btn btn-ghost btn-icon btn-sm" title="Remove from this item"
                  onclick="removePickFromItem('${pickId}', event)">✕</button>
        </div>
      </div>
      <div class="ws-pick-mods">${modChips || '<span style="color:var(--text-muted);font-size:12px;">No modifiers — click ✏ to add</span>'}</div>
    `;

    body.appendChild(card);
  });

  const addHint = document.createElement('div');
  addHint.className = 'ws-add-hint';
  addHint.innerHTML = `<span>→ Click picks in the bank to assign more</span>`;
  body.appendChild(addHint);
}

// ─────────────────────────────────────────────
//  RENDER — PICK BANK
// ─────────────────────────────────────────────
function renderBank() {
  const container = document.getElementById('bank-list');
  const hint      = document.getElementById('bank-hint');
  const q = document.getElementById('bank-search').value.toLowerCase().trim();

  const allPicks = Object.values(state.picks);
  const picks = allPicks.filter(p =>
    !q || p.name.toLowerCase().includes(q)
  );

  document.getElementById('bank-count').textContent = allPicks.length;

  hint.textContent = selectedItemId
    ? `Click to add/remove from "${state.items[selectedItemId]?.description ?? ''}"`
    : 'Select an item, then click a pick to assign it.';

  if (picks.length === 0) {
    container.innerHTML = `<div class="empty-state">${
      allPicks.length === 0
        ? 'No picks yet.<br>Select an item and click <strong>+ New Pick</strong>.'
        : 'No picks match your search.'
    }</div>`;
    return;
  }

  const onItem = new Set(
    selectedItemId ? (state.items[selectedItemId]?.pickIds ?? []) : []
  );

  const usageCount = {};
  Object.values(state.items).forEach(it =>
    it.pickIds.forEach(pid => { usageCount[pid] = (usageCount[pid] ?? 0) + 1; })
  );

  container.innerHTML = '';
  picks.forEach(pick => {
    const isOnItem = onItem.has(pick.id);
    const usage    = usageCount[pick.id] ?? 0;

    const row = document.createElement('div');
    row.className = 'bank-row' + (isOnItem ? ' on-item' : '');

    const type = pick.type ?? 'optional';
    const pickIdBadge = pick.pickId
      ? `<span class="badge" style="color:#a78bfa;border-color:#a78bfa;" title="Pick ID">${escHtml(pick.pickId)}</span>`
      : '';

    row.innerHTML = `
      <div class="bank-check">${isOnItem ? '✓' : ''}</div>
      <span class="bank-name">${escHtml(pick.name)}</span>
      <span class="type-badge ${type}" style="font-size:9px;padding:1px 5px;">${type === 'optional' ? 'OPT' : 'REQ'}</span>
      ${pickIdBadge}
      <span class="badge">${pick.modifierIds.length}m</span>
      <span class="badge" title="${usage} item${usage !== 1 ? 's' : ''} use this pick">${usage}i</span>
      <div class="bank-row-actions">
        <button class="btn btn-ghost btn-icon" title="Edit modifiers"
                onclick="openEditPickModal('${pick.id}');event.stopPropagation()">✏</button>
        <button class="btn btn-ghost btn-icon" title="Delete pick"
                onclick="deletePick('${pick.id}');event.stopPropagation()">🗑</button>
      </div>
    `;

    row.addEventListener('click', () => togglePickOnItem(pick.id));
    container.appendChild(row);
  });
}

// ─────────────────────────────────────────────
//  EDIT PICK MODIFIERS MODAL
// ─────────────────────────────────────────────
function openEditPickModal(pickId) {
  editingPickId = pickId;
  const pick = state.picks[pickId];
  if (!pick) return;
  document.getElementById('edit-pick-title').textContent = `Edit — ${pick.name}`;
  document.getElementById('edit-mod-search').value = '';

  // Populate pick-level settings
  const type = pick.type ?? 'optional';
  document.querySelectorAll('.type-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.value === type)
  );
  document.getElementById('pick-sort-order').value       = pick.sortOrder ?? 0;
  document.getElementById('pick-items-to-select').value  = pick.itemsToSelect ?? 1;

  renderEditModList();
  openModal('edit-pick-modal');
}

function renderEditModList() {
  if (!editingPickId) return;
  const pick = state.picks[editingPickId];
  if (!pick) return;

  const q = document.getElementById('edit-mod-search').value.toLowerCase().trim();

  // Active modifier chips — sorted by sortOrder
  const chipsEl = document.getElementById('edit-pick-chips');
  if (pick.modifierIds.length === 0) {
    chipsEl.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">None yet — select below</span>';
  } else {
    const sorted = [...pick.modifierIds].sort((a, b) =>
      (pick.modifierSettings?.[a]?.sortOrder ?? 0) - (pick.modifierSettings?.[b]?.sortOrder ?? 0)
    );
    chipsEl.innerHTML = sorted.map(mid => {
      const mod = state.modifiers[mid];
      const isDefault = pick.modifierSettings?.[mid]?.isDefault;
      return `<span class="chip mod">
        ${isDefault ? '<span style="color:#fbbf24;margin-right:3px;">★</span>' : ''}${escHtml(mod?.description ?? mid)}
        <span class="chip-x" onclick="removeModFromEditPick('${mid}')">×</span>
      </span>`;
    }).join('');
  }

  const listEl  = document.getElementById('edit-mod-list');
  const allMods = Object.values(state.modifiers).filter(m =>
    !q || m.id.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  );

  if (allMods.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding:20px">No modifiers${q ? ' match.' : ' imported yet.'}</div>`;
    return;
  }

  listEl.innerHTML = '';
  allMods.forEach(mod => {
    const isChecked = pick.modifierIds.includes(mod.id);
    const settings  = pick.modifierSettings?.[mod.id] ?? { sortOrder: 0, isDefault: false };

    const row = document.createElement('div');
    row.className = 'mod-toggle-row' + (isChecked ? ' checked' : '');

    // Inline controls only shown for checked mods — stopPropagation so clicking them
    // doesn't toggle the mod off.
    const settingsHtml = isChecked ? `
      <div class="mod-settings" onclick="event.stopPropagation()">
        <span class="mod-setting-label">Sort</span>
        <input type="number" class="mod-sort-input" min="0" value="${settings.sortOrder}"
               onchange="updateModSortOrder('${mod.id}', this.value)">
        <span class="mod-setting-label">Default</span>
        <input type="checkbox" class="mod-default-check" ${settings.isDefault ? 'checked' : ''}
               onchange="toggleModDefault('${mod.id}', this.checked)">
      </div>` : '';

    row.innerHTML = `
      <div class="mod-toggle-check">${isChecked ? '✓' : ''}</div>
      <span class="mod-toggle-id">${escHtml(mod.id)}</span>
      <span class="mod-toggle-desc">${escHtml(mod.description)}</span>
      ${mod.isCustom ? '<span class="badge" style="color:#f59e0b;border-color:#f59e0b;flex-shrink:0;">custom</span>' : ''}
      ${settingsHtml}
    `;
    row.addEventListener('click', e => {
      if (!e.target.closest('.mod-settings')) toggleModOnPick(mod.id);
    });
    listEl.appendChild(row);
  });
}

// ─────────────────────────────────────────────
//  EXPORT MAPPING
// ─────────────────────────────────────────────
function exportMapping() {
  const assignedModIds = new Set(
    Object.values(state.picks).flatMap(p => p.modifierIds)
  );

  const output = {
    picks: Object.values(state.picks).map(pick => {
      const usage = Object.values(state.items).filter(it => it.pickIds.includes(pick.id));
      const sortedModIds = [...pick.modifierIds].sort((a, b) =>
        (pick.modifierSettings?.[a]?.sortOrder ?? 0) - (pick.modifierSettings?.[b]?.sortOrder ?? 0)
      );
      return {
        id:            pick.id,
        ...(pick.pickId ? { pickId: pick.pickId } : {}),
        name:          pick.name,
        type:          pick.type          ?? 'optional',
        sortOrder:     pick.sortOrder     ?? 0,
        itemsToSelect: pick.itemsToSelect ?? 1,
        modifiers:     sortedModIds.map(mid => ({
          ...resolveModifier(mid),
          sortOrder: pick.modifierSettings?.[mid]?.sortOrder ?? 0,
          isDefault: pick.modifierSettings?.[mid]?.isDefault ?? false,
        })),
        usedBy:        usage.map(it => ({ id: it.id, description: it.description })),
      };
    }),
    items: Object.values(state.items).map(it => ({
      id:          it.id,
      description: it.description,
      ...(it.groupId ? { groupId: it.groupId } : {}),
      picks: it.pickIds.map(pid => {
        const p = state.picks[pid];
        return p ? { id: p.id, name: p.name } : { id: pid };
      }),
    })),
    unassignedItems: Object.values(state.items)
      .filter(it => it.pickIds.length === 0)
      .map(it => ({ id: it.id, description: it.description })),
    unassignedModifiers: Object.values(state.modifiers)
      .filter(m => !assignedModIds.has(m.id))
      .map(m => resolveModifier(m.id)),
  };

  downloadJSON(output, `pick-mapping-${dateStr()}.json`);
  toast('Mapping exported');
}

// ─────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────
function updateStats() {
  const i = Object.keys(state.items).length;
  const p = Object.keys(state.picks).length;
  const m = Object.keys(state.modifiers).length;
  document.getElementById('stats').textContent =
    `${i} items · ${p} picks · ${m} modifiers`;
}

function renderAll() {
  renderItems();
  renderWorkspace();
  renderBank();
  updateStats();
}

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────
function resolveModifier(id) {
  const m = state.modifiers[id];
  return m ? { id: m.id, description: m.description } : { id };
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function dateStr() { return new Date().toISOString().slice(0, 10); }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────
//  MODALS
// ─────────────────────────────────────────────
function openModal(id) {
  if (id === 'sessions-modal') renderSessionList();
  document.getElementById(id).classList.add('open');
  setTimeout(() => {
    const first = document.getElementById(id).querySelector('input, textarea');
    if (first) first.focus();
  }, 50);
}

function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeModals();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModals();
});

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
window.onload = () => {
  initSessions();
  renderAll();
};
