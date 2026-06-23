// Shared cross-domain DTO types. These are the types more than one domain route
// references, hoisted here so later batches do not block on each other or fork
// duplicate definitions. Ported from the NestJS backend as plain interfaces
// (the @nestjs/swagger ApiProperty decorators are dropped).
//
// SERVER ONLY by convention; the frontend keeps its own hand-written copies in
// lib/api/contract.ts that must stay in sync per AGENTS.md. Add a type here only
// when a second domain needs it; keep single-domain DTOs in their own route.

// KpiStripCardDto: the compact KPI strip card. Used by both the kpi routes and
// the cases summary route (backend src/kpi/kpi.controller.ts and
// src/cases/cases.controller.ts). bar_state and dot are open string unions for
// forward compatibility, matching the backend's enum-annotated string fields.
export interface KpiStripCardDto {
  metric_key: string;
  label: string;
  value_display: string;
  small?: string;
  bar_pct?: number;
  bar_state?: 'default' | 'good' | 'warn' | string;
  note?: string;
  dot?: 'good' | 'warn' | 'mut' | string;
}

// SessionClaims: the HS256 session token payload. Issued by the auth login
// route, verified on the edge (middleware via jose) and per-route
// (requireViewer). Ported from backend src/auth/auth.service.ts SessionClaims.
export interface SessionClaims {
  sub: string; // user key
  name: string;
  role: string;
}
