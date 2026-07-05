// Options page: exchange username/password for a session JWT via the backend's
// POST /api/auth/token, then store { backendUrl, token, expires_at } in
// chrome.storage.local. The password is never stored.

const $ = (id) => document.getElementById(id);

function setStatus(text, ok) {
  const el = $('status');
  el.textContent = text;
  // Use the design tokens defined in options.html rather than raw colours.
  el.style.color = ok ? 'var(--recovery)' : 'var(--ink-2)';
}

// Restore the saved backend URL and show current sign-in state.
(async () => {
  const { backendUrl, token, expires_at, key } = await chrome.storage.local.get([
    'backendUrl',
    'token',
    'expires_at',
    'key',
  ]);
  if (backendUrl) $('backendUrl').value = backendUrl;
  if (token) {
    setStatus(
      'Signed in as ' + (key || 'user') + (expires_at ? ' (expires ' + new Date(expires_at).toLocaleString() + ')' : ''),
      true,
    );
  }
})();

$('save').addEventListener('click', async () => {
  const backendUrl = $('backendUrl').value.trim().replace(/\/+$/, '');
  const username = $('username').value.trim();
  const password = $('password').value;
  if (!backendUrl || !username || !password) {
    setStatus('Fill in every field.', false);
    return;
  }
  setStatus('Signing in…', true);
  try {
    const res = await fetch(backendUrl + '/api/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.data?.token) {
      setStatus(
        'Sign in failed: ' + (json?.meta?.error?.message_plain || res.status),
        false,
      );
      return;
    }
    const d = json.data;
    await chrome.storage.local.set({
      backendUrl,
      token: d.token,
      expires_at: d.expires_at,
      key: d.key,
    });
    $('password').value = '';
    setStatus('Signed in as ' + (d.key || username) + '. You can close this tab.', true);
  } catch {
    setStatus('Cannot reach the backend at ' + backendUrl + '.', false);
  }
});
