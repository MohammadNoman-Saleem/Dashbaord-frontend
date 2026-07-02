// Content script (ISOLATED world). It cannot read WhatsApp's React fiber or the
// page IndexedDB in a way the app exposes, so the heavy lifting is done by the
// MAIN-world adapter (adapter/wa-dom.js). This script is just the bridge: it
// receives the resolved phone via window.postMessage and relays it to the
// service worker (only the isolated world has chrome.* APIs). It never sends
// WhatsApp messages.
(function () {
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__saleem !== 'chat') return;
    try {
      chrome.runtime.sendMessage({ type: 'wa_active_chat', phone: d.phone || null });
    } catch {
      /* service worker asleep or context gone; next post retries */
    }
  });

  // Nudge the main-world adapter to rescan, in case it posted before we listened.
  window.postMessage({ __saleem: 'rescan' }, '*');
})();
