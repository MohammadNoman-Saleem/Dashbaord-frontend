// THE fragile-isolation module. Everything that knows about WhatsApp Web's
// internals lives ONLY here. When WhatsApp reshuffles and the panel stops
// resolving numbers, this is the one file to fix.
//
// It runs in the MAIN world (manifest `world: "MAIN"`) because the signals it
// needs are page-context only and invisible to an isolated content script:
//   - the active chat's id is on the React fiber of #main
//     (props.chat.__x_id._serialized), NOT on any DOM attribute; and
//   - WhatsApp Web (2026) addresses chats by LID ("<n>@lid"), not by the phone.
//     Message data-id attributes are now bare message ids, so the phone is no
//     longer in the DOM.
//
// Resolution: read the active chat id from the fiber. If it is "<phone>@c.us"
// (unsaved contacts) the phone is the user part. If it is "<n>@lid" (saved
// contacts) look it up in IndexedDB model-storage -> contact store, whose record
// carries { id: "<n>@lid", phoneNumber: "<phone>@c.us" }.
//
// The main world cannot use chrome.* APIs, so it posts the resolved phone via
// window.postMessage; the isolated content.js relays it to the service worker.
(function () {
  const CUS = /(\d+)@c\.us/;

  function reactRoot(el) {
    const k = Object.keys(el).find(
      (k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'),
    );
    return k ? el[k] : null;
  }

  // A chat model carries __x_id plus chat-only fields; this avoids picking up a
  // message's id (which is the same lid anyway, but the discriminator keeps the
  // walk honest). Falls back to any @lid/@c.us id if no chat model is found.
  function looksLikeChat(o) {
    return (
      o &&
      (o.__x_chatlistPreview !== undefined ||
        o.__x_lastReceivedKey !== undefined ||
        o.formattedTitle !== undefined ||
        o.__x_unreadCount !== undefined)
    );
  }

  function serializedId(o) {
    const id = o.__x_id || o.id;
    if (!id) return null;
    const ser = id._serialized || id.__x__serialized;
    return typeof ser === 'string' && /@(c\.us|lid)$/.test(ser) ? ser : null;
  }

  // Walk #main's React tree for the active chat's serialized id.
  function activeChatId() {
    const main = document.querySelector('#main');
    if (!main) return null;
    const start = reactRoot(main);
    if (!start) return null;

    const seen = new WeakSet();
    let found = null;
    let fallback = null;
    let budget = 20000;

    (function walk(o, d) {
      if (found || o === null || d > 30 || budget-- <= 0) return;
      if (typeof o !== 'object' || seen.has(o)) return;
      seen.add(o);
      const ser = serializedId(o);
      if (ser) {
        if (looksLikeChat(o)) {
          found = ser;
          return;
        }
        if (!fallback) fallback = ser;
      }
      for (const k in o) {
        let v;
        try {
          v = o[k];
        } catch {
          continue;
        }
        walk(v, d + 1);
        if (found) return;
      }
    })(start, 0);

    return found || fallback;
  }

  // Resolve a chat id to a bare phone (digits). @c.us -> user part; @lid ->
  // IndexedDB contact lookup. Resolves null when unknown.
  function widToPhone(wid) {
    if (!wid) return Promise.resolve(null);
    const direct = CUS.exec(wid);
    if (direct) return Promise.resolve(direct[1]);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      const phoneFrom = (rec) => {
        const pn = rec && rec.phoneNumber;
        const m = pn && CUS.exec(pn);
        return m ? m[1] : null;
      };
      try {
        const req = indexedDB.open('model-storage');
        req.onerror = () => finish(null);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const os = db.transaction('contact', 'readonly').objectStore('contact');
            const g = os.get(wid);
            g.onsuccess = () => {
              if (g.result) {
                finish(phoneFrom(g.result));
                db.close();
                return;
              }
              // Fallback: keyPath is not the lid, scan for the matching record.
              const all = os.getAll(undefined, 8000);
              all.onsuccess = () => {
                const rec = (all.result || []).find((r) => r && r.id === wid);
                finish(phoneFrom(rec));
                db.close();
              };
              all.onerror = () => {
                finish(null);
                db.close();
              };
            };
            g.onerror = () => {
              finish(null);
              db.close();
            };
          } catch {
            finish(null);
            try {
              db.close();
            } catch {
              /* ignore */
            }
          }
        };
      } catch {
        finish(null);
      }
    });
  }

  let last = null;
  async function tick() {
    const wid = activeChatId();
    if (wid === last) return;
    last = wid;
    const phone = await widToPhone(wid);
    window.postMessage(
      { __saleem: 'chat', wid: wid || null, phone: phone || null },
      '*',
    );
  }

  let timer = null;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      tick();
    }, 400);
  });
  if (document.body) {
    observer.observe(document.body, { subtree: true, childList: true });
  }
  tick();

  // The isolated relay can force a re-scan (it may load after our first post).
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.__saleem === 'rescan') {
      last = null;
      tick();
    }
  });

  // Exposed for the offline unit test (harmless global in the page world).
  globalThis.SaleemWaMain = { activeChatId, widToPhone };
})();
