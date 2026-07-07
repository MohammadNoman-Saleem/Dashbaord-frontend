// Validates one assumption behind the cockpit stale-after-write audit
// (docs/superpowers/specs/2026-07-06-cockpit-sla-freshness-audit.md): the
// two-tier cache in lib/server/cache.ts serves STALE data across serverless
// instances after a write invalidation.
//
// It models the read / write / invalidate algorithm of CacheService faithfully:
//   L1: a per-instance in-memory Map (each serverless instance has its own).
//   L2: a shared store (Postgres cache_entries), modeled here as one Map so the
//       check runs with no database.
// A read prefers L1 (fresh within TTL, else stale), then L2, then a cold fetch.
// invalidate() clears the calling instance's L1 and deletes the shared L2 row,
// but it cannot touch another instance's L1. That is the gap this proves.
//
// Run: node scripts/validate-cache-cross-instance.mjs
// Exits 0 when the model reproduces the staleness (assumption holds), 1 if not.

const sharedL2 = new Map(); // models the shared cache_entries table (L2).

class Instance {
  constructor(name) {
    this.name = name;
    this.l1 = new Map(); // this instance's in-memory L1 only.
  }

  // Mirrors CacheService.read: L1 first, then L2, then cold fetch.
  read(key, ttlMs, nowMs, fetcher) {
    const l1 = this.l1.get(key);
    if (l1) {
      const stale = nowMs - l1.fetchedAt >= ttlMs;
      return { value: l1.value, stale, tier: 'L1' };
    }
    const l2 = sharedL2.get(key);
    if (l2) {
      this.l1.set(key, { value: l2.value, fetchedAt: l2.fetchedAt });
      const stale = nowMs - l2.fetchedAt >= ttlMs;
      return { value: l2.value, stale, tier: 'L2' };
    }
    const value = fetcher();
    this.l1.set(key, { value, fetchedAt: nowMs });
    sharedL2.set(key, { value, fetchedAt: nowMs });
    return { value, stale: false, tier: 'cold' };
  }

  // Mirrors CacheService.invalidate: clears THIS instance's L1 and the shared
  // L2 row. It cannot reach another instance's L1.
  invalidate(key) {
    this.l1.delete(key);
    sharedL2.delete(key);
  }
}

const KEY = 'zoho_crm:deals_v10'; // the live deals read/invalidate key
const TTL = 10 * 60 * 1000; // zoho_crm TTL, 10 minutes, from sources.ts.
const t0 = 0;
const failures = [];

function expect(label, actual, wanted) {
  const ok = actual === wanted;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got "${actual}", wanted "${wanted}"`);
  if (!ok) failures.push(label);
}

const A = new Instance('A (handles the write)');
const B = new Instance('B (handles the refresh)');

// Both instances warm their L1 with the pre-write value v1.
A.read(KEY, TTL, t0, () => 'v1');
B.read(KEY, TTL, t0 + 1000, () => 'v1');

// A writes to Zoho (value is now v2 upstream) and invalidates the cache.
A.invalidate(KEY);

// One minute later, well within the 10-minute TTL:
const t1 = t0 + 60 * 1000;

// The writing instance A refetches fresh (its L1 was cleared, L2 deleted).
expect('A after its own write refetches fresh', A.read(KEY, TTL, t1, () => 'v2').value, 'v2');

// A refresh routed to instance B serves its warm pre-write L1: STALE.
expect('B on refresh serves the stale pre-write value', B.read(KEY, TTL, t1, () => 'v2').value, 'v1');

// Past the TTL, B's stale L1 hit triggers a refetch and B catches up.
const t2 = t0 + TTL + 1000;
const bLate = B.read(KEY, TTL, t2, () => 'v2');
expect('B past the TTL sees its L1 entry as stale', String(bLate.stale), 'true');

console.log('');
if (failures.length === 0) {
  console.log('Assumption confirmed: after a write on one instance, another warm');
  console.log('instance serves the stale value for up to the TTL. This is the');
  console.log('Vercel (multi-instance) cause. A single local instance does not hit');
  console.log('this, because a local refresh cold-misses L1 and L2 and refetches.');
  process.exit(0);
} else {
  console.log(`Model did not behave as assumed (${failures.length} check(s) failed).`);
  process.exit(1);
}
