// Service worker: the only place that talks to the backend. A service-worker
// fetch with host_permissions bypasses CORS (a content-script fetch would not),
// and secrets never live here: it holds only the user's session JWT, obtained
// via the options page and stored in chrome.storage.local. The worker is
// ephemeral, so all state lives in chrome.storage (session for the live chat,
// local for config), never in module globals.

// Open the side panel when the toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

async function getConfig() {
  const { backendUrl, token } = await chrome.storage.local.get([
    'backendUrl',
    'token',
  ]);
  return { backendUrl: backendUrl || '', token: token || '' };
}

// One backend call. Returns { ok, status, data, error } and never throws, so the
// panel always gets a structured result to render. A body is sent only when
// given (GET requests omit it and the content-type header).
async function request(method, path, body) {
  const { backendUrl, token } = await getConfig();
  if (!backendUrl || !token) {
    return { ok: false, status: 0, error: 'not_configured' };
  }
  try {
    const res = await fetch(backendUrl.replace(/\/+$/, '') + path, {
      method,
      headers: {
        authorization: 'Bearer ' + token,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      const msg = json?.meta?.error?.message_plain || 'Request failed.';
      return { ok: false, status: res.status, error: msg };
    }
    return { ok: true, status: res.status, data: json?.data ?? null };
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
}

// POST helper (the common case).
function api(path, body) {
  return request('POST', path, body);
}

function lookup(phone) {
  return api('/api/extension/lookup', { phone });
}

function writeChange(caseId, change) {
  return api('/api/cockpit/case/' + encodeURIComponent(caseId) + '/write', {
    change,
  });
}

function addNote(caseId, module, content) {
  return api('/api/cockpit/case/' + encodeURIComponent(caseId) + '/notes', {
    module,
    content,
  });
}

// The case notes for the open patient (Zoho CRM Notes related-list), newest
// first. Read only; the panel renders the newest handful.
function getNotes(caseId, module) {
  return request(
    'GET',
    '/api/cockpit/case/' +
      encodeURIComponent(caseId) +
      '/notes?module=' +
      encodeURIComponent(module),
  );
}

// The WhatsApp template library, fetched once per browser session and cached in
// chrome.storage.session (the list is the same for every chat).
async function getTemplates() {
  const cached = await chrome.storage.session.get('templates');
  if (cached.templates) {
    return { ok: true, status: 200, data: cached.templates };
  }
  const res = await request('GET', '/api/whatsapp/templates');
  if (res.ok && res.data) {
    await chrome.storage.session.set({ templates: res.data });
  }
  return res;
}

// The provider board (which patient is on which hospital), reused from the
// dashboard. Cached in chrome.storage.session and invalidated on a write. The
// board carries the hospital directory and all active cards; getHospitals derives
// just the open patient's slice.
async function getBoard() {
  const cached = await chrome.storage.session.get('board');
  if (cached.board) {
    return { ok: true, status: 200, data: cached.board };
  }
  const res = await request('GET', '/api/provider-board');
  if (res.ok && res.data) {
    await chrome.storage.session.set({ board: res.data });
  }
  return res;
}

// The open patient's hospitals (with each link's referral id, for removal) plus
// the pickable hospital directory (minus the ones already linked), derived from
// the board.
async function getHospitals(caseId) {
  const res = await getBoard();
  if (!res.ok || !res.data) return res;
  const hospitals = Array.isArray(res.data.hospitals) ? res.data.hospitals : [];
  const cardsByHospital = res.data.cardsByHospital || {};
  const linked = [];
  for (const hospitalId of Object.keys(cardsByHospital)) {
    for (const card of cardsByHospital[hospitalId] || []) {
      if (card && card.patient_ref && card.patient_ref.zoho_id === caseId) {
        const h = hospitals.find((x) => x.id === hospitalId);
        linked.push({
          referral_id: card.id,
          hospital_id: hospitalId,
          hospital_name: h ? h.name : hospitalId,
        });
      }
    }
  }
  const linkedIds = new Set(linked.map((l) => l.hospital_id));
  const available = hospitals.filter((h) => !linkedIds.has(h.id));
  return { ok: true, status: 200, data: { linked, available } };
}

// Add the patient to a hospital and remove a link, reusing the provider-board
// routes. Both drop the cached board so the next read reflects the change.
async function addHospital(caseId, hospitalId, recordKind) {
  const res = await api('/api/provider-board', {
    hospital_id: hospitalId,
    record_kind: recordKind,
    zoho_id: caseId,
  });
  if (res.ok) await chrome.storage.session.remove('board');
  return res;
}

async function removeHospital(referralId) {
  const res = await request(
    'DELETE',
    '/api/provider-board/' + encodeURIComponent(referralId),
  );
  if (res.ok) await chrome.storage.session.remove('board');
  return res;
}

// Broadcast a panel update (ignored if the panel is closed).
function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Active chat changed: remember the phone, look it up, push to the panel.
  if (msg.type === 'wa_active_chat') {
    (async () => {
      await chrome.storage.session.set({ phone: msg.phone });
      if (!msg.phone) {
        await chrome.storage.session.set({ result: null });
        broadcast({ type: 'panel_update', phone: null, result: null });
        return;
      }
      broadcast({ type: 'loading', phone: msg.phone });
      const result = await lookup(msg.phone);
      await chrome.storage.session.set({ result });
      broadcast({ type: 'panel_update', phone: msg.phone, result });
    })();
    return false; // no response expected
  }

  // Panel opened: hand back the last known state.
  if (msg.type === 'get_state') {
    chrome.storage.session
      .get(['phone', 'result'])
      .then((s) => sendResponse({ phone: s.phone ?? null, result: s.result ?? null }));
    return true;
  }

  // Manual phone lookup (testing) from the panel.
  if (msg.type === 'lookup') {
    (async () => {
      const result = await lookup(msg.phone);
      await chrome.storage.session.set({ phone: msg.phone, result });
      sendResponse(result);
    })();
    return true;
  }

  if (msg.type === 'action_write') {
    writeChange(msg.caseId, msg.change).then(sendResponse);
    return true;
  }

  if (msg.type === 'action_note') {
    addNote(msg.caseId, msg.module, msg.content).then(sendResponse);
    return true;
  }

  // New inbound messages captured from the open chat: ingest first-party.
  if (msg.type === 'wa_messages') {
    (async () => {
      if (!msg.phone || !msg.messages || msg.messages.length === 0) return;
      const res = await api('/api/events/whatsapp', {
        chat: { phone: msg.phone },
        messages: msg.messages.map((m) => ({
          external_id: m.id,
          from_me: m.from_me,
          ts: m.t,
          body: m.body,
        })),
      });
      // Nudge an open panel to refresh its needs-action strip.
      if (res.ok) broadcast({ type: 'events_update' });
    })();
    return false;
  }

  // Resolve inbox events from the panel's needs-action strip.
  if (msg.type === 'events_resolve') {
    api('/api/events/resolve', { ids: msg.ids, action: msg.action || 'done' }).then(
      sendResponse,
    );
    return true;
  }

  if (msg.type === 'get_notes') {
    getNotes(msg.caseId, msg.module).then(sendResponse);
    return true;
  }

  if (msg.type === 'get_templates') {
    getTemplates().then(sendResponse);
    return true;
  }

  if (msg.type === 'get_hospitals') {
    getHospitals(msg.caseId).then(sendResponse);
    return true;
  }

  if (msg.type === 'action_add_hospital') {
    addHospital(msg.caseId, msg.hospitalId, msg.recordKind).then(sendResponse);
    return true;
  }

  if (msg.type === 'action_remove_hospital') {
    removeHospital(msg.referralId).then(sendResponse);
    return true;
  }

  return false;
});
