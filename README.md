# saleem-web

Internal Saleem dashboard and medical-travel case-manager cockpit. Built with Next.js App Router, React, and TanStack Query. The browser talks only to saleem-api over a `{ data, meta }` envelope; no client code calls a third party.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Point at the backend with `NEXT_PUBLIC_API_BASE` (default `http://localhost:4000`).

## Data seam

`lib/api/fetcher.ts` is the single HTTP entry point. `config/endpoints.ts` holds a fixture/live switch: set `NEXT_PUBLIC_USE_FIXTURES=true` to run against local JSON fixtures without a running backend.

## Privacy rule

`patient_name`, `patient_phone`, and `patient_whatsapp` may only be referenced inside allowlisted components (`components/ui/PatientRef.tsx`). Everything else renders Zoho ID plus initials. The CI check `npm run check:patient` enforces this.

## CI gates

Run before every commit:

```bash
npm run ci
```

This covers: `check:dashes`, `check:red`, `check:hype`, `check:patient`, `typecheck`, `lint`, `smoke:fixtures`, and `build`. All gates are enforced by the CI workflow on push.
