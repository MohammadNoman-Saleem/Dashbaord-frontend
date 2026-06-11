// CI gate: patient_name may be referenced in UI code only by the PatientRef
// component. Everywhere else renders the patient reference (Zoho ID + initials).
// Generated contract types and fixtures legitimately carry the field, so the
// scan covers app/ and components/ only.
import { walk, report } from './lib/walk.mjs'

const ALLOWED = new Set(['components/ui/PatientRef.tsx'])
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
    if (ALLOWED.has(full)) continue
    text.split('\n').forEach((line, i) => {
      if (line.includes('patient_name')) {
        failures.push(`${full}:${i + 1} references patient_name (only PatientRef may)`)
      }
    })
  }
}

report(failures, 'patient_name confined to PatientRef')
