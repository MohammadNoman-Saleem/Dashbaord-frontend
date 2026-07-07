// Side panel UI. It never talks to the backend directly; every call goes through
// the service worker (chrome.runtime messages), which holds the token and has
// the host permissions. This file only renders state and fires actions.

const $ = (id) => document.getElementById(id);

// The currently rendered match plus the prefill values the details form edits.
let current = { phone: null, match: null, stageOptions: [], details: {}, openEventIds: [], suggestion: null };

// Tier 1 kinds fire on one tap; tier 2 kinds show an inline confirm step first.
const ONE_TAP_KINDS = new Set([
  'set_follow_up',
  'set_lead_follow_up',
  'set_lead_status',
  'stamp',
  'add_tag',
]);
const MODAL_KINDS = new Set(['move_stage', 'convert_lead', 'park_lead']);

function describeChange(c) {
  if (!c) return null;
  switch (c.kind) {
    case 'set_follow_up':
    case 'set_lead_follow_up':
      return 'Set follow up to ' + c.date;
    case 'set_lead_status':
      return 'Set status: ' + c.status;
    case 'stamp':
      return 'Mark ' + String(c.event).replace(/_/g, ' ');
    case 'add_tag':
      return 'Add tag: ' + (Array.isArray(c.tag_names) ? c.tag_names.join(', ') : '');
    case 'move_stage':
      return 'Move stage to ' + c.to_stage;
    case 'convert_lead':
      return 'Convert to a ' + c.pipeline + ' deal at ' + c.stage;
    case 'park_lead':
      return 'Park as Not Qualified (' + c.reason + ')';
    default:
      return null;
  }
}

function setStatus(text) {
  $('status').textContent = text || '';
}
function show(id, on) {
  $(id).classList.toggle('hidden', !on);
}
function fmt(v) {
  return v === null || v === undefined || v === '' ? '-' : String(v);
}

// A case field may be a string or a shaped object (e.g. next_action). Render the
// human label, never "[object Object]".
function fmtField(v) {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'object') {
    const label = v.label || v.text || v.name || '';
    const due = v.due_label ? ' (' + v.due_label + ')' : '';
    return label ? label + due : JSON.stringify(v);
  }
  return String(v);
}

function renderHistory(c) {
  const items = [];
  for (const a of Array.isArray(c.activity) ? c.activity : []) {
    items.push({ t: a.label, d: a.detail });
  }
  for (const n of Array.isArray(c.notes) ? c.notes : []) {
    items.push({ t: n.title || 'Note', d: n.body });
  }
  const box = $('history');
  box.innerHTML = '';
  if (!items.length) {
    show('historyCard', false);
    return;
  }
  show('historyCard', true);
  for (const it of items.slice(0, 8)) {
    const div = document.createElement('div');
    div.className = 'hist';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = fmt(it.t);
    const d = document.createElement('div');
    d.className = 'd';
    d.textContent = fmt(it.d);
    div.appendChild(t);
    div.appendChild(d);
    box.appendChild(div);
  }
}

function renderTags(c) {
  const tags = Array.isArray(c.tags) ? c.tags : [];
  const box = $('pTags');
  box.innerHTML = '';
  for (const t of tags) {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = t;
    const x = document.createElement('span');
    x.className = 'x';
    x.textContent = '×';
    x.title = 'Remove tag';
    x.addEventListener('click', () => removeTag(t));
    span.appendChild(x);
    box.appendChild(span);
  }
  const dl = $('tagOptions');
  dl.innerHTML = '';
  for (const t of Array.isArray(c.available_tags) ? c.available_tags : []) {
    if (tags.includes(t)) continue;
    const opt = document.createElement('option');
    opt.value = t;
    dl.appendChild(opt);
  }
}

// The editable case details: lead -> status picklist; deal -> budget and
// treatment dates. Prefilled from the case so saving writes only what changed.
function renderDetails(c, data) {
  const isLead = current.match.kind === 'lead';
  show('leadDetails', isLead);
  show('dealDetails', !isLead);

  if (isLead) {
    const sel = $('statusSelect');
    sel.innerHTML = '';
    for (const s of data.lead_status_options || []) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === (c.lead_status || '')) opt.selected = true;
      sel.appendChild(opt);
    }
    current.details = { lead_status: c.lead_status || '' };
  } else {
    $('budgetInput').value = c.patient_budget ?? '';
    $('startInput').value = c.treatment_start || '';
    $('endInput').value = c.treatment_end || '';
    current.details = {
      patient_budget: c.patient_budget ?? '',
      treatment_start: c.treatment_start || '',
      treatment_end: c.treatment_end || '',
    };
  }
}

// The "needs action" strip: open reactive-inbox events for this case, plus a
// one-tap Confirm when the AI suggested a safe action (staleness-guarded).
function renderNeedsAction(data) {
  const events = Array.isArray(data.open_events) ? data.open_events : [];
  current.openEventIds = events.map((e) => e.id);
  current.suggestion = null;
  if (!events.length) {
    show('needsAction', false);
    return;
  }
  show('needsAction', true);
  const latest = events[0];
  const summary = events.map((e) => e.triage && e.triage.summary).find(Boolean);
  // Label the band honestly: the AI one-line read when we have it, else the raw
  // message text (or nothing yet), so it never mislabels a snippet as AI output.
  $('needsKind').textContent = summary ? 'AI summary' : 'Latest message';
  $('needsSnippet').textContent = summary || latest.message_snippet || 'New message waiting';
  const urgency = latest.triage && latest.triage.urgency ? latest.triage.urgency : 'new';
  $('needsMeta').textContent =
    events.length + ' open' + (urgency ? ' · ' + urgency : '');

  // Find the first event with a suggestion (either tier).
  const sugEvent = events.find(
    (e) =>
      e.triage &&
      e.triage.suggested_change &&
      (ONE_TAP_KINDS.has(e.triage.suggested_change.kind) ||
        MODAL_KINDS.has(e.triage.suggested_change.kind)),
  );
  const label = sugEvent && describeChange(sugEvent.triage.suggested_change);
  if (sugEvent && label) {
    const stamped = sugEvent.triage.stage_at_triage;
    const currentStage = current.match && current.match.stage_or_status;
    const stale = stamped != null && currentStage !== stamped;
    current.suggestion = {
      eventId: sugEvent.id,
      change: sugEvent.triage.suggested_change,
      modal: MODAL_KINDS.has(sugEvent.triage.suggested_change.kind),
      label,
    };
    show('needsSuggest', true);
    $('needsSuggestLabel').textContent =
      'Suggested: ' + label + (stale ? ' (case changed, re-check)' : '');
    $('needsConfirm').disabled = stale;
    show('needsModal', false);
  } else {
    show('needsSuggest', false);
    show('needsModal', false);
  }
}

// Re-lookup without the loading skeleton (background refresh after an event).
async function silentRefresh() {
  if (!current.phone) return;
  const result = await send({ type: 'lookup', phone: current.phone });
  render(current.phone, result);
}

// Show the spinner/skeleton while a lookup is in flight.
function showLoading(text) {
  show('notConfigured', false);
  show('empty', false);
  show('patient', false);
  show('notesCard', false);
  show('templatesCard', false);
  show('hospitalsCard', false);
  show('loading', true);
  $('loadingText').textContent = text || 'Looking up...';
  setStatus('');
}

function render(phone, result) {
  show('loading', false);
  show('notesCard', false);
  show('templatesCard', false);
  show('hospitalsCard', false);
  current = { phone: phone || null, match: null, stageOptions: [], details: {}, openEventIds: [], suggestion: null };

  if (result && result.error === 'not_configured') {
    show('notConfigured', true);
    show('empty', false);
    show('patient', false);
    setStatus('');
    return;
  }
  show('notConfigured', false);

  if (result && result.ok === false) {
    show('patient', false);
    show('empty', true);
    $('emptyText').textContent =
      result.error === 'network'
        ? 'Cannot reach the backend. Is it running?'
        : 'Lookup failed: ' + fmt(result.error);
    setStatus('');
    return;
  }

  const data = result && result.data ? result.data : null;
  const match = data && data.match ? data.match : null;

  if (!match) {
    show('patient', false);
    show('empty', true);
    $('emptyText').textContent = phone
      ? 'No Zoho case matches this number.'
      : 'Open a WhatsApp chat to see the patient’s case.';
    setStatus(phone ? 'Checked ' + phone : '');
    return;
  }

  current.match = match;
  current.stageOptions = (data.stage_options || []).slice();

  const c = data.case || {};
  show('empty', false);
  show('patient', true);

  // Standing AI summary (the proactive case read) at the top of the Patient
  // card, so a matched patient always shows a clear AI line, mirroring the
  // cockpit case file. When the chat has a live unanswered message, the "Needs
  // action" hero shows that fresher message read instead, so hide this one to
  // avoid two bands.
  const hasLiveEvents = Array.isArray(data.open_events) && data.open_events.length > 0;
  if (c.ai_summary && !hasLiveEvents) {
    $('patientAiText').textContent = c.ai_summary;
    show('patientAi', true);
  } else {
    show('patientAi', false);
  }

  $('pName').textContent = fmt(
    match.patient_name || (match.patient_ref && match.patient_ref.initials),
  );
  $('pRef').textContent = fmt(match.patient_ref && match.patient_ref.ref);
  $('pStage').textContent = fmt(match.stage_or_status || c.stage || c.lead_status);
  $('pPipeline').textContent = fmt(match.pipeline || c.pipeline);
  $('pOwner').textContent = fmt(match.owner);
  $('pNext').textContent = fmtField(c.next_action);
  $('pFollow').textContent = fmt(c.next_follow_up);
  $('followDate').value = c.next_follow_up || '';

  renderCaseDetails(c);
  renderTags(c);
  renderDetails(c, data);
  renderHistory(c);
  renderNeedsAction(data);

  const stageSel = $('stageSelect');
  stageSel.innerHTML = '';
  if (current.stageOptions.length) {
    show('advanceWrap', true);
    for (const s of current.stageOptions) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === (match.stage_or_status || '')) opt.selected = true;
      stageSel.appendChild(opt);
    }
  } else {
    show('advanceWrap', false);
  }

  setStatus((match.kind === 'deal' ? 'Deal' : 'Lead') + ' matched');

  loadNotes();
  loadTemplates();
  loadHospitals();
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}
function caseId() {
  return current.match && current.match.patient_ref
    ? current.match.patient_ref.zoho_id
    : null;
}
function moduleOf() {
  return current.match && current.match.kind === 'deal' ? 'Deals' : 'Leads';
}
async function refresh() {
  if (!current.phone) return;
  showLoading('Refreshing...');
  const result = await send({ type: 'lookup', phone: current.phone });
  render(current.phone, result);
}
function reportActionResult(res, okText) {
  if (res && res.ok) {
    setStatus(okText);
  } else {
    setStatus('Failed: ' + fmt(res && res.error));
  }
}

async function write(change) {
  const id = caseId();
  if (!id) return null;
  return send({ type: 'action_write', caseId: id, change });
}

async function removeTag(tag) {
  setStatus('Removing tag...');
  const res = await write({ kind: 'remove_tag', tag_name: tag });
  reportActionResult(res, 'Tag removed');
  if (res && res.ok) refresh();
}

// Recent notes: fetch the newest Zoho CRM notes for the open case and render the
// last few. Read only; adding a note stays in the Actions card below.
async function loadNotes() {
  const id = caseId();
  if (!id) return;
  const res = await send({ type: 'get_notes', caseId: id, module: moduleOf() });
  // If the active chat changed while the notes were loading, drop this stale
  // response rather than show one patient's notes against another.
  if (caseId() !== id) return;
  renderNotes(res);
}

// Relative time for a note's created_at (ISO). Small and local: the panel has no
// date library.
function fmtAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!then) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' hr ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + ' d ago';
  return new Date(iso).toLocaleDateString();
}

const NOTE_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'UL', 'OL', 'LI',
]);

// Render a note body defensively. The server already sanitizes it, but rather
// than trust that with innerHTML we parse the HTML and rebuild ONLY a small
// allowlist of formatting tags with NO attributes, dropping any other tag while
// keeping its text. This re-enforces the allowlist in the panel, so no untrusted
// markup or attribute can reach the DOM.
function renderNoteBody(container, html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const walk = (from, to) => {
    for (const node of from.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(node.textContent));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (NOTE_TAGS.has(node.tagName)) {
          const el = document.createElement(node.tagName.toLowerCase());
          walk(node, el);
          to.appendChild(el);
        } else {
          // Drop the tag but keep its text content.
          walk(node, to);
        }
      }
    }
  };
  walk(doc.body, container);
}

function renderNotes(res) {
  const box = $('notesList');
  box.innerHTML = '';
  show('notesCard', true);
  if (!res || !res.ok) {
    box.textContent = 'Could not load notes.';
    return;
  }
  const notes = Array.isArray(res.data) ? res.data : [];
  if (!notes.length) {
    box.textContent = 'No notes yet.';
    return;
  }
  for (const n of notes.slice(0, 5)) {
    const item = document.createElement('div');
    item.className = 'note';
    if (n.title) {
      const t = document.createElement('div');
      t.className = 'note-t';
      t.textContent = n.title;
      item.appendChild(t);
    }
    const body = document.createElement('div');
    body.className = 'note-b';
    renderNoteBody(body, n.body);
    item.appendChild(body);
    const meta = document.createElement('div');
    meta.className = 'note-m';
    meta.textContent =
      (n.author_name || 'Unknown') + ' · ' + fmtAgo(n.created_at);
    item.appendChild(meta);
    box.appendChild(item);
  }
}

// Templates: the same library the dashboard uses, fetched once and cached in the
// service worker. Each is shown with the patient's name filled into the
// placeholders, with a copy button.
let templatesCache = null;

async function loadTemplates() {
  if (templatesCache) {
    renderTemplates(true);
    return;
  }
  const res = await send({ type: 'get_templates' });
  if (res && res.ok && res.data && Array.isArray(res.data.templates)) {
    templatesCache = res.data.templates;
    renderTemplates(true);
    return;
  }
  renderTemplates(false);
}

function patientFullName() {
  return current.match && current.match.patient_name
    ? String(current.match.patient_name).trim()
    : '';
}

// Fill {{first_name}} and {{full_name}} from the open patient's name, matching
// the dashboard. Leaves the placeholder in place when no name is available.
function fillTemplate(bodyText) {
  const full = patientFullName();
  const first = full ? full.split(/\s+/)[0] : '';
  return String(bodyText || '')
    .replace(/\{\{\s*first_name\s*\}\}/g, first || '{{first_name}}')
    .replace(/\{\{\s*full_name\s*\}\}/g, full || '{{full_name}}');
}

function renderTemplates(ok) {
  const box = $('templatesList');
  box.innerHTML = '';
  show('templatesCard', true);
  if (!ok || !templatesCache) {
    box.textContent = 'Could not load templates.';
    return;
  }
  if (!templatesCache.length) {
    box.textContent = 'No templates yet.';
    return;
  }
  for (const tpl of templatesCache) {
    const filled = fillTemplate(tpl.body);
    const item = document.createElement('div');
    item.className = 'tmpl';
    const head = document.createElement('div');
    head.className = 'tmpl-h';
    const title = document.createElement('span');
    title.className = 'tmpl-t';
    title.textContent = tpl.title || 'Template';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'tmpl-copy';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => copyText(filled));
    head.appendChild(title);
    head.appendChild(copy);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'tmpl-b';
    bodyEl.textContent = filled;
    item.appendChild(head);
    item.appendChild(bodyEl);
    box.appendChild(item);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Copied');
  } catch {
    setStatus('Could not copy');
  }
}

// Case details rows (condition, reason for treatment, preferred country,
// destination, origin, source) from the lookup's case.details list.
function renderCaseDetails(c) {
  const box = $('pDetails');
  box.innerHTML = '';
  const details = Array.isArray(c.details) ? c.details : [];
  for (const d of details) {
    if (!d || d.v == null || d.v === '') continue;
    const row = document.createElement('div');
    row.className = 'row';
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = d.k;
    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = d.v;
    row.appendChild(k);
    row.appendChild(v);
    box.appendChild(row);
  }
}

// Hospitals: reuses the provider board. Shows the hospitals the open patient is
// on as removable chips, plus a dropdown of the directory to add another.
async function loadHospitals() {
  const id = caseId();
  if (!id) return;
  const res = await send({ type: 'get_hospitals', caseId: id });
  // Drop a stale response if the active chat changed while loading.
  if (caseId() !== id) return;
  renderHospitals(res);
}

function renderHospitals(res) {
  const list = $('hospitalsList');
  const sel = $('hospitalSelect');
  list.innerHTML = '';
  sel.innerHTML = '<option value="">Select a hospital</option>';
  show('hospitalsCard', true);
  if (!res || !res.ok || !res.data) {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Could not load hospitals.';
    list.appendChild(hint);
    return;
  }
  const linked = Array.isArray(res.data.linked) ? res.data.linked : [];
  const available = Array.isArray(res.data.available) ? res.data.available : [];
  if (!linked.length) {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Not sent to any hospital yet';
    list.appendChild(hint);
  } else {
    for (const l of linked) {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = l.hospital_name;
      const x = document.createElement('span');
      x.className = 'x';
      x.textContent = '×';
      x.title = 'Remove hospital';
      x.addEventListener('click', () => removeHospital(l.referral_id));
      span.appendChild(x);
      list.appendChild(span);
    }
  }
  for (const h of available) {
    const opt = document.createElement('option');
    opt.value = h.id;
    opt.textContent = h.country ? h.name + ' (' + h.country + ')' : h.name;
    sel.appendChild(opt);
  }
}

async function addHospitalFromPanel() {
  const id = caseId();
  const hospitalId = $('hospitalSelect').value;
  if (!id || !hospitalId || !current.match) return;
  setStatus('Adding hospital...');
  const res = await send({
    type: 'action_add_hospital',
    caseId: id,
    hospitalId,
    recordKind: current.match.kind,
  });
  reportActionResult(res, 'Hospital added');
  if (res && res.ok) loadHospitals();
}

async function removeHospital(referralId) {
  setStatus('Removing hospital...');
  const res = await send({ type: 'action_remove_hospital', referralId });
  reportActionResult(res, 'Hospital removed');
  if (res && res.ok) loadHospitals();
}

// --- wiring ---

$('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$('hospitalBtn').addEventListener('click', addHospitalFromPanel);

$('tagBtn').addEventListener('click', async () => {
  const tag = $('tagInput').value.trim();
  if (!tag) return;
  setStatus('Adding tag...');
  const res = await write({ kind: 'add_tag', tag_names: [tag] });
  reportActionResult(res, 'Tag added');
  if (res && res.ok) {
    $('tagInput').value = '';
    refresh();
  }
});

$('statusBtn').addEventListener('click', async () => {
  const status = $('statusSelect').value;
  if (!status || status === current.details.lead_status) return;
  setStatus('Updating status...');
  const res = await write({ kind: 'set_lead_status', status });
  reportActionResult(res, 'Status updated');
  if (res && res.ok) refresh();
});

// Save only the deal fields that actually changed, one edit_field write each.
$('detailsBtn').addEventListener('click', async () => {
  const d = current.details;
  const edits = [];
  const budget = $('budgetInput').value.trim();
  if (budget !== String(d.patient_budget ?? '')) {
    edits.push({ field: 'patient_budget', value: budget });
  }
  const start = $('startInput').value;
  if (start !== d.treatment_start) {
    edits.push({ field: 'treatment_start', value: start });
  }
  const end = $('endInput').value;
  if (end !== d.treatment_end) {
    edits.push({ field: 'treatment_end', value: end });
  }
  if (!edits.length) {
    setStatus('Nothing changed');
    return;
  }
  setStatus('Saving details...');
  let ok = true;
  for (const e of edits) {
    const res = await write({ kind: 'edit_field', field: e.field, value: e.value });
    if (!res || !res.ok) {
      reportActionResult(res, '');
      ok = false;
      break;
    }
  }
  if (ok) {
    setStatus('Details saved');
    refresh();
  }
});

$('advanceBtn').addEventListener('click', async () => {
  const to = $('stageSelect').value;
  if (!to) return;
  setStatus('Advancing...');
  const res = await write({ kind: 'move_stage', to_stage: to });
  reportActionResult(res, 'Stage updated');
  if (res && res.ok) refresh();
});

$('noteBtn').addEventListener('click', async () => {
  const id = caseId();
  const content = $('noteText').value.trim();
  if (!id || !content) return;
  setStatus('Saving note...');
  const res = await send({
    type: 'action_note',
    caseId: id,
    module: moduleOf(),
    content,
  });
  reportActionResult(res, 'Note saved');
  if (res && res.ok) $('noteText').value = '';
});

$('followBtn').addEventListener('click', async () => {
  const date = $('followDate').value;
  if (!date) return;
  const kind =
    current.match.kind === 'deal' ? 'set_follow_up' : 'set_lead_follow_up';
  setStatus('Setting follow up...');
  const res = await write({ kind, date });
  reportActionResult(res, 'Follow up set');
  if (res && res.ok) refresh();
});

async function fireSuggestion(s, id) {
  setStatus('Confirming...');
  // Fire the prefilled write, then resolve ONLY the event it came from.
  const w = await send({ type: 'action_write', caseId: id, change: s.change });
  if (!w || !w.ok) {
    setStatus('Failed: ' + fmt(w && w.error));
    return;
  }
  await send({ type: 'events_resolve', ids: [s.eventId], action: 'done' });
  setStatus('Done');
  silentRefresh();
}

$('needsConfirm').addEventListener('click', async () => {
  const s = current.suggestion;
  const id = caseId();
  if (!s || !id) return;
  if (s.modal) {
    // Tier 2: show the inline confirm step instead of firing immediately.
    $('needsModalText').textContent = s.label;
    show('needsModal', true);
    return;
  }
  await fireSuggestion(s, id);
});

$('needsModalOk').addEventListener('click', async () => {
  const s = current.suggestion;
  const id = caseId();
  if (!s || !id) return;
  show('needsModal', false);
  await fireSuggestion(s, id);
});

$('needsModalCancel').addEventListener('click', () => {
  show('needsModal', false);
});

$('needsHandled').addEventListener('click', async () => {
  if (!current.openEventIds.length) return;
  setStatus('Marking handled...');
  const res = await send({
    type: 'events_resolve',
    ids: current.openEventIds,
    action: 'done',
  });
  if (res && res.ok) {
    setStatus('Marked handled');
    silentRefresh();
  } else {
    setStatus('Failed: ' + fmt(res && res.error));
  }
});

$('manualBtn').addEventListener('click', async () => {
  const phone = $('manualPhone').value.trim();
  if (!phone) return;
  showLoading('Looking up ' + phone);
  const result = await send({ type: 'lookup', phone });
  render(phone, result);
});

// Live updates pushed by the service worker when the active chat changes.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'loading') showLoading('Looking up ' + (msg.phone || ''));
  if (msg.type === 'panel_update') render(msg.phone, msg.result);
  // New events were ingested for the open chat: refresh the strip quietly.
  if (msg.type === 'events_update') silentRefresh();
});

// On open, pull the last known state.
(async () => {
  const state = await send({ type: 'get_state' });
  if (state) render(state.phone, state.result);
})();
