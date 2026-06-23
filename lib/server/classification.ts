// The single server-side classification source (07 section 2, 09 section 8).
// Every rule the dashboard derives from raw Zoho values lives here; the
// frontend never re-derives them. Pure functions with no framework imports
// so scripts/smoke-classification.mjs runs the compiled module directly.
//
// Field discovery (live, Jun 12 2026): the destination on Treatment deals is
// the multiselect picklist Prefered_Country_of_Treatment_Consultation (the
// same field exists on Leads); provider country is the plain Country text
// field on Provider-layout deals. Values arrive in Arabic as often as in
// English, so the keyword maps carry both spellings. Extend the maps here
// when new wording appears; never special-case in the UI.

export type Service = 'tele' | 'travel';
export type Locality = 'local' | 'travel' | 'unclassified';
export type DealKind = 'patient' | 'provider' | 'corp';
export type ProviderScope = 'local' | 'intl' | 'unclassified';
export type LeadStatusNormalized =
  | 'converted'
  | 'intro_done'
  | 'waiting'
  | 'new'
  | 'not_qualified';

export type SpecialtyGroup =
  | 'neuro_spine_rehab'
  | 'orthopedics'
  | 'gastro'
  | 'cosmetic'
  | 'womens_health'
  | 'other';

/** service on a patient deal: pipeline Telemedicine gives tele, Treatment
 *  gives travel. Caveat carried from the known-issues register: Consult Now
 *  and Novo consultations do not create Zoho deals, so deal lists are
 *  scheduled-appointment tele plus treatment deals; consult volume truth
 *  lives in the admin panel. */
export function serviceOfPipeline(pipeline: string | null): Service | null {
  if (pipeline === 'Telemedicine') return 'tele';
  if (pipeline === 'Treatment') return 'travel';
  return null;
}

/** kind on a deal, from its CRM layout: Customers gives patient, Provider
 *  gives provider, Corporates gives corp. */
export function kindOfLayout(layoutName: string | null): DealKind | null {
  if (layoutName === 'Customers') return 'patient';
  if (layoutName === 'Provider') return 'provider';
  if (layoutName === 'Corporates') return 'corp';
  return null;
}

/** Layout wins; the pipeline name is the fallback for cached records that
 *  predate the Layout field in the deals read. */
export function kindOfDeal(
  layoutName: string | null,
  pipeline: string | null,
): DealKind | null {
  const byLayout = kindOfLayout(layoutName);
  if (byLayout) return byLayout;
  if (pipeline === 'Telemedicine' || pipeline === 'Treatment') return 'patient';
  if (pipeline === 'Doctor' || pipeline === 'Hospital or Clinic')
    return 'provider';
  if (pipeline === 'Corporates') return 'corp';
  return null;
}

// Country-name normalization for the handful of names that appear in the
// live data in Arabic. Keys are lowercase.
const COUNTRY_NAMES: Record<string, string> = {
  البحرين: 'Bahrain',
  'مملكة البحرين': 'Bahrain',
  السعودية: 'Saudi Arabia',
  السعوديه: 'Saudi Arabia',
  عمان: 'Oman',
  عُمان: 'Oman',
  الكويت: 'Kuwait',
  قطر: 'Qatar',
  الامارات: 'UAE',
  الإمارات: 'UAE',
};

export function normalizeCountry(raw: string): string {
  const trimmed = raw.trim();
  return COUNTRY_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

// Destination groups (07 section 1 corridor_config plus Bahrain and Other).
// Token order inside a group does not matter; group order resolves ties by
// earliest match position in the raw text.
const DESTINATION_TOKENS: Array<{ group: string; tokens: string[] }> = [
  { group: 'Turkey', tokens: ['turkey', 'تركيا', 'تركيه'] },
  { group: 'India', tokens: ['india', 'الهند', 'هند'] },
  {
    group: 'UK',
    tokens: ['uk', 'united kingdom', 'britain', 'england', 'بريطانيا', 'لندن'],
  },
  { group: 'Thailand', tokens: ['thailand', 'تايلند', 'تايلاند'] },
  { group: 'Germany', tokens: ['germany', 'german', 'ألمان', 'المان'] },
  { group: 'Egypt', tokens: ['egypt', 'مصر'] },
  {
    group: 'Eastern Europe',
    tokens: ['czech', 'تشيك', 'التشيك', 'الجيك', 'slovakia', 'سلوفاكيا'],
  },
  { group: 'Jordan', tokens: ['jordan', 'الأردن', 'الاردن'] },
  { group: 'Bahrain', tokens: ['bahrain', 'البحرين'] },
];

// Short English tokens need word boundaries so 'uk' does not match inside
// other words; Arabic tokens match as substrings (no word-boundary regex
// support for Arabic script in practice).
function tokenIndex(haystack: string, token: string): number {
  if (/^[a-z]+$/.test(token) && token.length <= 3) {
    const m = new RegExp(`\\b${token}\\b`).exec(haystack);
    return m ? m.index : -1;
  }
  return haystack.indexOf(token);
}

/** All destination groups named in a raw destination value (the field is a
 *  multiselect and free text like "Bahrain and Egypt and Turkey" appears).
 *  Non-blank text matching no group returns ['Other']; blank returns []. */
export function destinationGroupsOf(
  raw: string | string[] | null | undefined,
): string[] {
  const text = (Array.isArray(raw) ? raw.join(' ') : (raw ?? ''))
    .toLowerCase()
    .trim();
  if (!text) return [];
  const hits: Array<{ group: string; at: number }> = [];
  for (const { group, tokens } of DESTINATION_TOKENS) {
    let best = -1;
    for (const token of tokens) {
      const at = tokenIndex(text, token);
      if (at >= 0 && (best === -1 || at < best)) best = at;
    }
    if (best >= 0) hits.push({ group, at: best });
  }
  if (hits.length === 0) return ['Other'];
  return hits.sort((a, b) => a.at - b.at).map((h) => h.group);
}

/** Primary destination group for a lead: first named group, or Other for
 *  non-blank text naming no known group, or null for blank. */
export function destinationGroupOf(
  raw: string | string[] | null | undefined,
): string | null {
  const groups = destinationGroupsOf(raw);
  return groups[0] ?? null;
}

/** locality within Treatment deals: destination equals Bahrain gives local;
 *  any other value gives travel; blank gives unclassified, which is
 *  surfaced, never silently bucketed. A value naming Bahrain alongside
 *  other countries is travel demand, not local. */
export function localityOfDestination(
  raw: string | string[] | null | undefined,
): Locality {
  const groups = destinationGroupsOf(raw);
  if (groups.length === 0) return 'unclassified';
  return groups.every((g) => g === 'Bahrain') ? 'local' : 'travel';
}

/** provider scope: provider record country equals Bahrain gives local,
 *  anything else intl, blank is unclassified and reported in the All footer
 *  as "n need a country set". */
export function providerScopeOf(
  country: string | null | undefined,
): ProviderScope {
  const value = (country ?? '').trim();
  if (!value) return 'unclassified';
  return normalizeCountry(value) === 'Bahrain' ? 'local' : 'intl';
}

// E.164 dialing prefixes per 07 section 2.
const DIAL_PREFIXES: Array<{ prefix: string; country: string }> = [
  { prefix: '+973', country: 'Bahrain' },
  { prefix: '+966', country: 'Saudi Arabia' },
  { prefix: '+968', country: 'Oman' },
  { prefix: '+965', country: 'Kuwait' },
  { prefix: '+974', country: 'Qatar' },
  { prefix: '+971', country: 'UAE' },
];

export const GCC_COUNTRIES = [
  'Bahrain',
  'Saudi Arabia',
  'Oman',
  'Kuwait',
  'Qatar',
  'UAE',
];

export interface OriginResult {
  country: string;
  inferred: boolean;
}

/** Origin inference on leads (07 section 2, 09 known issue 4). When the
 *  Zoho country field is present it wins and no inference happens. When
 *  blank, resolve from the E.164 prefix of the phone number; anything else
 *  maps to Other with inferred true. Two pragmatic extensions from the live
 *  data: a 00 international prefix is normalized to +, and a bare 8-digit
 *  number in the Bahrain national format (leading 1, 3, 6, or 7) resolves
 *  to Bahrain, because manual entries store local numbers without a
 *  dialing code. */
export function inferOrigin(
  countryField: string | null | undefined,
  phone: string | null | undefined,
): OriginResult {
  const country = (countryField ?? '').trim();
  if (country) return { country: normalizeCountry(country), inferred: false };

  let digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (!digits) return { country: 'Unknown', inferred: false };
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;

  if (digits.startsWith('+')) {
    for (const { prefix, country: c } of DIAL_PREFIXES) {
      if (digits.startsWith(prefix)) return { country: c, inferred: true };
    }
    return { country: 'Other', inferred: true };
  }
  if (/^[1367]\d{7}$/.test(digits)) {
    return { country: 'Bahrain', inferred: true };
  }
  return { country: 'Other', inferred: true };
}

// Specialty keyword map (07 section 2), extended with the Arabic wording
// seen in the live June campaign. Short English tokens ('gi') use word
// boundaries via tokenIndex.
const SPECIALTY_TOKENS: Array<{ group: SpecialtyGroup; tokens: string[] }> = [
  {
    group: 'neuro_spine_rehab',
    tokens: [
      'stroke',
      'rehab',
      'neuro',
      'spine',
      'disc',
      'epilepsy',
      'sclerosis',
      'hemiplegia',
      'spinal',
      'physiotherap',
      'occupational therapy',
      'جلطة',
      'جلطه',
      'شلل',
      'أعصاب',
      'اعصاب',
      'العمود الفقري',
      'دسك',
      'ديسك',
      'صرع',
      'تصلب',
      'تأهيل',
      'علاج طبيعي',
    ],
  },
  {
    group: 'orthopedics',
    tokens: [
      'knee',
      'joint',
      'thumb',
      'ortho',
      'ركبة',
      'الركبة',
      'ركبه',
      'مفاصل',
      'مفصل',
      'عظام',
      'إبهام',
      'ابهام',
    ],
  },
  {
    group: 'gastro',
    tokens: [
      'colon',
      'gi',
      'digestive',
      'قولون',
      'القولون',
      'الجهاز الهضمي',
      'هضمي',
      'معدة',
      'المعدة',
    ],
  },
  {
    group: 'cosmetic',
    tokens: [
      'rhinoplasty',
      'cosmetic',
      'breast reduction',
      'تجميل',
      'ترميم وتجميل',
      'تجميل الانف',
      'تجميل الأنف',
    ],
  },
  {
    group: 'womens_health',
    tokens: [
      'gyn',
      'fertility',
      'adenomyosis',
      'egg',
      'ivf',
      'عقم',
      'خصوبة',
      'تكيس',
      'أطفال الأنابيب',
      'اطفال الانابيب',
      'نسائية',
    ],
  },
];

/** Specialty grouping by keyword map. Non-blank text matching no group is
 *  other; blank is null so unspecified concerns surface as their own count
 *  instead of being bucketed. */
export function specialtyGroupOf(
  raw: string | null | undefined,
): SpecialtyGroup | null {
  const text = (raw ?? '').toLowerCase().trim();
  if (!text) return null;
  for (const { group, tokens } of SPECIALTY_TOKENS) {
    for (const token of tokens) {
      if (tokenIndex(text, token) >= 0) return group;
    }
  }
  return 'other';
}

// Lead status vocabulary, live values verified Jun 12 2026 (New, Waiting
// Response, Intro Call Scheduled, Intro Call Done, Not Qualified, Deal
// Ready) plus the picklist metadata values that may reappear.
const STATUS_MAP: Record<string, LeadStatusNormalized> = {
  'deal ready': 'converted',
  'intro call done': 'intro_done',
  contacted: 'intro_done',
  'pre-qualified': 'intro_done',
  'waiting response': 'waiting',
  'intro call scheduled': 'waiting',
  'contact in future': 'waiting',
  'attempted to contact': 'waiting',
  'not qualified': 'not_qualified',
  'junk lead': 'not_qualified',
  'lost lead': 'not_qualified',
};

/** status_normalized: maps the Zoho lead status plus the converted check.
 *  A linked Treatment deal (Zoho converted flag, or the Deal Ready status
 *  Zoho sets on conversion) makes it converted regardless of the status
 *  text. Anything unmapped, including blank, reads as new. */
export function normalizeLeadStatus(
  leadStatus: string | null | undefined,
  converted: boolean,
): LeadStatusNormalized {
  if (converted) return 'converted';
  const key = (leadStatus ?? '').toLowerCase().trim();
  return STATUS_MAP[key] ?? 'new';
}

/** Whether a raw Zoho lead status resolves to a known vocabulary value.
 *  A blank status is recognized: it legitimately means a new, untouched
 *  lead. A non-blank status that is not in the map is not recognized, so
 *  normalizeLeadStatus quietly folds it into new; callers that count
 *  qualified or won leads use this to surface an honest unclassified tally
 *  rather than miscounting an unknown status as new. */
export function isRecognizedLeadStatus(
  leadStatus: string | null | undefined,
): boolean {
  const key = (leadStatus ?? '').toLowerCase().trim();
  if (key === '') return true;
  return key in STATUS_MAP;
}
