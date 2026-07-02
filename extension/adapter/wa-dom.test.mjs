// One runnable check for the fragile bit: resolving a WhatsApp chat id to a
// phone. @c.us is a pure parse; @lid goes through the IndexedDB contact store,
// stubbed here so the resolver's real path is exercised. The fiber walk
// (activeChatId) is integration-only and not covered offline.
// Run: node extension/adapter/wa-dom.test.mjs
import assert from 'node:assert';

// Minimal page-context stubs so the adapter's load-time IIFE runs without a DOM.
globalThis.document = { querySelector: () => null, body: null };
globalThis.window = { addEventListener: () => {}, postMessage: () => {} };
globalThis.MutationObserver = class {
  observe() {}
};

// Stubbed IndexedDB: model-storage -> contact store keyed by the lid.
const CONTACT = { id: '14843574759566@lid', phoneNumber: '97336544335@c.us', name: 'x' };
globalThis.indexedDB = {
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = {
        transaction: () => ({
          objectStore: () => ({
            get: (wid) => {
              const r = {};
              queueMicrotask(() => {
                r.result = wid === CONTACT.id ? CONTACT : undefined;
                if (r.onsuccess) r.onsuccess();
              });
              return r;
            },
            getAll: () => {
              const r = {};
              queueMicrotask(() => {
                r.result = [CONTACT];
                if (r.onsuccess) r.onsuccess();
              });
              return r;
            },
          }),
        }),
        close() {},
      };
      if (req.onsuccess) req.onsuccess();
    });
    return req;
  },
};

await import('./wa-dom.js');
const A = globalThis.SaleemWaMain;

// Unsaved contact: chat id is the phone jid, resolved by pure parse.
assert.equal(await A.widToPhone('97336544335@c.us'), '97336544335');

// Saved contact (2026 LID): resolved via the contact store to the phone.
assert.equal(await A.widToPhone('14843574759566@lid'), '97336544335');

// Nothing open.
assert.equal(await A.widToPhone(null), null);

console.log('wa-dom resolver checks passed');
