// CI gate: patient PII fields are confined to the few components that may
// reference them. patient_name renders only through PatientRef (and the
// quotation builder, which prefills it into a generated document); the WhatsApp
// fields render only in the case file, gated on the name-visibility capability.
// Everywhere else renders the patient reference (Zoho ID + initials) and treats
// the WhatsApp fields as absent.
//
// Matching uses a word boundary on the right so the capability key
// sees_patient_names (plural) is NOT a false positive for the field patient_name
// (singular). Generated contract types and fixtures legitimately carry these
// fields, so the scan covers app/ and components/ only, never lib/.
import { walk, report } from './lib/walk.mjs'

// Per-field allowlist: each guarded field may appear only in the files listed
// for it. A file allowed for one field is not thereby allowed for another, so
// the case file may render the WhatsApp fields without gaining the right to
// spell the patient name (which stays with PatientRef and the builder).
const ALLOWED = {
  patient_name: new Set([
    'components/ui/PatientRef.tsx',
    'components/cockpit/BuildQuotation.tsx',
  ]),
  patient_phone: new Set(['components/cockpit/CaseFile.tsx']),
  whatsapp_message: new Set(['components/cockpit/CaseFile.tsx']),
}

// Right-boundary patterns: patient_name must not be followed by a word
// character, so patient_names (the capability suffix) does not match.
const PATTERNS = {
  patient_name: /patient_name(?![\w])/,
  patient_phone: /patient_phone(?![\w])/,
  whatsapp_message: /whatsapp_message(?![\w])/,
}

const failures = []

for (const dir of ['app', 'components']) {
  let files = []
  try {
    files = walk(`${process.cwd()}/${dir}`, ['.ts', '.tsx'])
  } catch {
    continue // directory may not exist yet
  }
  for (const { rel, text } of files) {
    const full = `${dir}/${rel}`
    text.split('\n').forEach((line, i) => {
      for (const [field, pattern] of Object.entries(PATTERNS)) {
        if (pattern.test(line) && !ALLOWED[field].has(full)) {
          const allowed = [...ALLOWED[field]].join(', ')
          failures.push(`${full}:${i + 1} references ${field} (only ${allowed} may)`)
        }
      }
    })
  }
}

report(failures, 'patient PII fields confined to their allowlisted components')
