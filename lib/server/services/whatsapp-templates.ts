// The WhatsApp template registry (Saleem Cockpit Implementation Plan, Phase 2).
// Templates are fixed, non-AI copy. The first-contact template is a short,
// neutral logistics greeting only: it carries no diagnostic, medication,
// dosage, or lab content (clinical boundary). The text below is a PLACEHOLDER
// and is PENDING RAZAN SIGN-OFF before go-live; do not treat it as final copy.
//
// Ported from the NestJS backend src/integrations/whatsapp/templates.ts. No DI,
// no DB, no patient data: a plain module of fixed copy the read route serves.
// SERVER ONLY by convention.
export interface WhatsAppTemplate {
  id: string;
  text: string;
}

// PLACEHOLDER, PENDING RAZAN SIGN-OFF. Neutral greeting/logistics only.
export const FIRST_CONTACT_TEMPLATE: WhatsAppTemplate = {
  id: 'first_contact',
  text: '<PLACEHOLDER first-contact greeting, pending Razan sign-off>',
};

const TEMPLATES: Record<string, WhatsAppTemplate> = {
  [FIRST_CONTACT_TEMPLATE.id]: FIRST_CONTACT_TEMPLATE,
};

/** Look up a template by id, or null when none is registered. */
export function getTemplate(id: string): WhatsAppTemplate | null {
  return TEMPLATES[id] ?? null;
}
