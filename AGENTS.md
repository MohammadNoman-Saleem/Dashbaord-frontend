<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# saleem-web

Self-contained Saleem internal dashboard. Next.js App Router + TypeScript on Vercel. The backend lives in this app's own API route handlers (`app/api/*`, backed by `lib/server/*`); there is no separate service. The browser talks only to this app's same-origin `/api` routes, and no client code calls a third party directly.

Hard rules for all code and copy in this repo:

1. No em dashes and no en dashes anywhere, including comments and commit messages (CI enforced).
2. No red hex or red-dominant rgb anywhere. Color literals exist only in `styles/tokens.css` (CI enforced). Components consume CSS variables via the Tailwind theme mapping in `app/globals.css`.
3. No hype words (CI enforced).
4. UI copy: sentence case, plain verbs, severity in words not color. BHD formatted "BHD 4,180", times "7:42 AM", dates "Jun 20".
5. patient_name may be referenced only by `components/ui/PatientRef.tsx` (CI enforced). Everything else renders the patient reference: Zoho ID + initials.
6. Visual source of truth: `Saleem_Dashboard_Redesign.html` in the Analytics-Dashboard repo under `Saleem Implementation plan/`. Behavior source of truth: `02_Frontend_Spec.md` there.
7. Response types are hand-written in `lib/api/contract.ts` and must stay in sync with the in-repo API route handlers (`app/api/*`) and their service DTOs in `lib/server/*`. Codegen is not wired; sync is enforced by review. Types must match what the routes actually return.

Run `npm run ci` before committing.
