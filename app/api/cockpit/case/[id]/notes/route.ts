// /api/cockpit/case/[id]/notes
//   GET  - notes for the case [id] (a deal/lead zoho_id), newest first, READ-ONLY.
//   POST - add a note to the case [id]'s Zoho CRM Notes related-list (write).
//
// Notes are sourced from ZOHO CRM (the Notes related-list on the Deal/Lead
// record), not from any local store. The GET reads through the read-only client;
// the POST writes through the write-scoped client (getZohoWriteClient().addNote),
// gated exactly like every cockpit write.
//
// PRIVACY (NHRA, compliance-critical): a note body is case-manager working text
// that may contain patient detail, so both verbs are gated to viewers with
// sees_patient_names; a non-name-seer gets ForbiddenError. The note body, title,
// and any patient identity are NEVER logged or placed in an audit payload: the
// read audits a COUNT, the write audits a content LENGTH only. The handler's
// global PII sweep is the backstop.
//
// WRITE GATE (POST): runtime nodejs; ctx.requireViewer(); the MCP service viewer
// (is_service) is rejected so no MCP caller can author a note; the whole write
// refuses unless WRITE_GATE_ENABLED is true (the hard cutover switch), with the
// same plain-language message the write-gate commit route uses. The body is
// zod-validated at the boundary.
//
// ?module selects the CRM module ('Deals' | 'Leads'). On GET, when absent we try
// Deals first, then fall back to Leads. On POST the module is required (a note
// must land on a known record): it is read from ?module or the body, and a
// missing/invalid module is a BadRequest, since there is no safe default for a
// write.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import { getAudit } from '@/lib/server/audit';
import { getEnv } from '@/lib/server/env';
import { getZohoWriteClient } from '@/lib/server/integrations/zoho/client';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import {
  listForRecord,
  type CaseNote,
  type NoteModule,
} from '@/lib/server/services/zoho-notes';

// Node runtime: the Zoho read client pulls in the auth/token path.
export const runtime = 'nodejs';

/** Read the case [id] segment from /api/cockpit/case/<id>/notes (second to
 *  last). Mirrors the case-file route's path-segment convention. */
function caseIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../case/<id>/notes -> <id> is the segment before the trailing 'notes'.
  return decodeURIComponent(segments[segments.length - 2] ?? '');
}

/** Read an explicit ?module param, accepting only the two CRM modules that
 *  carry case notes. Anything else (including absence) yields null so the
 *  handler falls back to the Deals-then-Leads probe. */
function moduleFromUrl(url: string): NoteModule | null {
  const raw = new URL(url).searchParams.get('module');
  if (raw === 'Deals' || raw === 'Leads') return raw;
  return null;
}

/** The POST body. content is the note body (1..8000 chars after trim); title is
 *  optional (<=255). module may be carried in the body as an alternative to
 *  ?module. Field VALUES (content/title) are validated here but never logged. */
const AddNoteSchema = z.object({
  content: z.string().trim().min(1, 'A note needs some text.').max(8000),
  title: z.string().trim().max(255).optional(),
  module: z.enum(['Deals', 'Leads']).optional(),
});

/** Rejects the MCP service viewer: cockpit writes are confirmed by a person in
 *  the UI only. Same guard as the write-gate commit route's assertPerson. */
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key cannot make cockpit writes; they are confirmed by a person in the cockpit.',
    );
  }
}

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Notes can carry patient detail: name-seers only.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to case notes.');
  }

  const zohoId = caseIdFromUrl(req.url);
  const explicit = moduleFromUrl(req.url);

  let notes: CaseNote[];
  if (explicit) {
    notes = await listForRecord(explicit, zohoId);
  } else {
    // No explicit module: try Deals, fall back to Leads when it has no notes.
    notes = await listForRecord('Deals', zohoId);
    if (notes.length === 0) {
      notes = await listForRecord('Leads', zohoId);
    }
  }

  // Audit the COUNT only; never the note title, body, or any patient identity.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.notes_view',
    entity_type: 'zoho_notes',
    entity_id: zohoId,
    context: { count: notes.length },
  });

  return withMeta(notes);
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Cockpit writes are confirmed by a person in the UI; the MCP service key
  // cannot author a note.
  assertPerson(viewer);
  // Notes can carry patient detail: name-seers only (same gate as the read).
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to case notes.');
  }

  // The hard cutover switch. With the gate off the route refuses outright and
  // never reaches Zoho, the same pattern as the write-gate commit route.
  if (!getEnv().WRITE_GATE_ENABLED) {
    throw new ForbiddenError(
      'Writes are turned off right now. The note was not saved.',
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = AddNoteSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues[0]?.message ?? 'Bad request.',
    );
  }

  // A write needs a known module; there is no safe Deals-then-Leads default for
  // a create. Prefer the explicit ?module, fall back to the body's module.
  // (Named noteModule, not module: Next reserves the bare `module` identifier.)
  const noteModule: NoteModule | null =
    moduleFromUrl(req.url) ?? parsed.data.module ?? null;
  if (!noteModule) {
    throw new BadRequestError(
      'A note needs its record module (Deals or Leads).',
    );
  }

  const zohoId = caseIdFromUrl(req.url);
  if (!zohoId) {
    throw new BadRequestError('Missing case id.');
  }

  const result = await getZohoWriteClient().addNote(noteModule, zohoId, {
    content: parsed.data.content,
    title: parsed.data.title,
  });
  if (!result.ok) {
    // Audit the failure with no note text; the Zoho code is not patient data.
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.note.add.failed',
      entity_type: 'zoho_notes',
      entity_id: zohoId,
      context: { module: noteModule, zoho_code: result.code },
    });
    throw new BadRequestError(
      'Zoho refused the note. Nothing was saved; try again or tell Al Saeed.',
    );
  }

  // Audit a content LENGTH only; NEVER the note content, the title, or any
  // patient identity. The new note id is fine for the trail.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.note.add',
    entity_type: 'zoho_notes',
    entity_id: zohoId,
    context: {
      module: noteModule,
      content_length: parsed.data.content.length,
      note_id: result.id,
    },
  });

  return withMeta({ added: true, id: result.id });
});
