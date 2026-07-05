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
// panel always gets a structured result to render.
async function api(path, body) {
  const { backendUrl, token } = await getConfig();
  if (!backendUrl || !token) {
    return { ok: false, status: 0, error: 'not_configured' };
  }
  try {
    const res = await fetch(backendUrl.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(body),
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

  return false;
});
