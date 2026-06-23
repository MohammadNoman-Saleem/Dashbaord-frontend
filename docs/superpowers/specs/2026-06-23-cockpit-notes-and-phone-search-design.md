# Cockpit Patient Notes + Patient Phone Search - Design Spec

- Date: 2026-06-23
- Branch: `claude/self-contained` (worktree `C:/tmp/saleem-selfcontained`)
- Status: Approved to implement. Both features touch patient PII (NHRA), so privacy gating is part of the design.

## Feature 1: Cockpit patient notes (read + write)

### Today
The cockpit case file returns `notes: []` (stubbed, `lib/server/services/cockpit.ts:675`; shape `{ title, body, source }[]`). No Supabase notes table; the app's Zoho client has no Notes read/write. Net-new.

### Decision: store notes in Supabase, not Zoho
A new table read and written through the app's own serverless routes (the urgent/blockers pattern: zod-validated, audited). Postgres write only, so no Zoho write, no write-gate, no sign-off. Notes live in the dashboard, not Zoho CRM. (Rejected for now: Zoho CRM Notes, which would need a new Zoho Notes client plus a gated Zoho write.)

### Schema (new migration, applied to the shared Supabase)
```
create table if not exists case_notes (
  id          uuid primary key default gen_random_uuid(),
  zoho_id     text not null,            -- the case/deal/lead id the note attaches to
  author_key  text not null,           -- users.key of the author
  body        text not null,           -- free text, capped at 4000 chars at the route
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz              -- soft delete; null = active
);
create index if not exists case_notes_zoho_id_idx on case_notes (zoho_id) where deleted_at is null;
alter table case_notes enable row level security;  -- no policies; service-role only, like the other tables
```

### Routes (all `runtime = 'nodejs'`, `handler()` + `ctx.requireViewer()`, envelope-shaped)
- `GET /api/cockpit/case/[id]/notes` - active notes for the case, newest first. Each: `{ id, body, author_name, created_at, mine }`.
- `POST /api/cockpit/case/[id]/notes` - add. Zod `{ body: string 1..4000 }`. Inserts, audits `cockpit.note.add`, returns the new note.
- `DELETE /api/cockpit/case/[id]/notes/[noteId]` - soft delete. Author or a manager (admin / dept_head). Audits `cockpit.note.delete`.
- Edit is out of v1 (add + soft-delete). The case-file route still returns `notes: []`; the panel loads from this sub-resource so the cached case file is unaffected.

### Access / PII gating (default)
Notes are case-manager working text that may contain patient detail. Read and write gated to viewers with `sees_patient_names`; others see the case with initials but no notes. Author + timestamp stored and shown. Global PII sweep still runs.

### UI
A notes section in `components/cockpit/CaseFile` (new app stack: TS, Tailwind v4, React Query): list with author + relative time, a textarea, a Save action wired to a React Query mutation that invalidates the notes query. Delete shown only on removable notes. Follow the existing cockpit component + `lib/api` (fetcher/keys/contract) patterns.

## Feature 2: Patient search by phone

### Today
`crm-read.ts` already fetches `Patient_Mobile` (deals) and `Phone` (leads) and caches the full Deals + Leads sets the cockpit uses. The Zoho client has no server-side search.

### Decision: in-memory match over the cached CRM reads
A read-only route filters the cached leads + deals by normalized phone (strip to digits, match on the trailing 8 to 9 digits so `+973`, `00973`, and bare local numbers all match). No live Zoho search call.

### Route
- `GET /api/cockpit/search?phone=<raw>` - `runtime = 'nodejs'`, `handler()` + `ctx.requireViewer()`. Returns `{ matches: [{ kind: 'lead' | 'deal', zoho_id, name, stage_or_status, pipeline, owner, ref }] }`. `zoho_id` links into the existing case view.

### Access / PII gating (default)
Phone-to-patient is an identifiable lookup, so gated to `sees_patient_names` viewers only; others get 403. Phone input never logged; name/phone go through the per-field gate and global sweep. Each query writes a `cockpit.patient_search` audit row.

### UI
A search box in the cockpit header: enter a phone, see matches, click one to open the case file. New app stack.

## Cross-cutting
- Privacy is the top risk for both: per-field gate + global `sweepPatientPii` both apply; no patient value logged; the phone input is treated as sensitive.
- Both are serverless-safe (one Postgres table + reads). Neither needs the deferred write-gate, Zoho writes, or the document worker.
- Audit: note add/delete and each phone search write `audit_log` rows via `getAudit()`.
- Testing: `npm run ci` (dashes/red/hype/patient + typecheck + lint) + `next build`; manual smoke of add/list/delete notes and a phone search opening a known case; confirm a non-name-seer is refused notes and search.
- Migration location confirmed at build (the self-contained app owns a migrations path applied to the shared Supabase).
