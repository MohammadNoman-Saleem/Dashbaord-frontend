// The provider-agnostic WhatsApp send port and its no-op adapter, ported from
// the NestJS backend src/integrations/whatsapp/whatsapp.port.ts and
// noop.adapter.ts. The @Injectable adapter and the string DI token (WHATSAPP_PORT)
// become a plain interface plus a globalThis-pinned singleton (g.__whatsapp).
//
// The write gate depends on the WhatsAppPort interface, never on a concrete
// provider, so the provider decision (Cloud API / DOO / Twilio) can land later
// without touching the gate. The no-op adapter makes NO network call and sends
// nothing: scaffolding for the send-and-log path while the provider is undecided
// and the template awaits Razan sign-off. Every send reports not-sent, so the
// gate audits a failure and never stamps.
//
// The `to` argument is the patient phone number (patient data). It is never
// logged, echoed in an error, or returned to the caller; the result carries no
// patient data. The real provider adapter slots in behind getWhatsApp() after
// the provider decision and must keep this contract and use the medical-travel
// WhatsApp number (separate from the DOO teleconsult number).
//
// SERVER ONLY. Node runtime by convention (the real adapter will be Node-only).
// Never import from a client component.

export interface WhatsAppSendResult {
  sent: boolean;
  /** Provider's message id on success, for the audit trail. Not patient data. */
  provider_message_id: string | null;
  /** A short, provider-side reason on failure. Must contain no patient data. */
  error?: string;
}

export interface WhatsAppPort {
  /** Send a registered template to a number. `vars` fills template variables.
   *  Resolves whether or not the provider accepted it; never throws for a
   *  provider-side decline (the caller reads `sent`). */
  sendTemplate(
    to: string,
    templateId: string,
    vars: Record<string, string>,
  ): Promise<WhatsAppSendResult>;
}

export class NoopWhatsAppAdapter implements WhatsAppPort {
  sendTemplate(
    to: string,
    templateId: string,
    vars: Record<string, string>,
  ): Promise<WhatsAppSendResult> {
    // No network call: the arguments are accepted and dropped. `to` is patient
    // data and is never logged or echoed; it is referenced only to satisfy the
    // contract until the real adapter lands.
    void to;
    void templateId;
    void vars;
    return Promise.resolve({
      sent: false,
      provider_message_id: null,
      error: 'WhatsApp provider not configured',
    });
  }
}

// globalThis-pinned singleton: one adapter instance per warm instance. Swapping
// in the real provider adapter is a one-line change here.
const WHATSAPP_KEY = '__whatsapp';

type GlobalWithWhatsApp = typeof globalThis & {
  [WHATSAPP_KEY]?: WhatsAppPort;
};

export function getWhatsApp(): WhatsAppPort {
  const g = globalThis as GlobalWithWhatsApp;
  if (!g[WHATSAPP_KEY]) {
    g[WHATSAPP_KEY] = new NoopWhatsAppAdapter();
  }
  return g[WHATSAPP_KEY];
}
