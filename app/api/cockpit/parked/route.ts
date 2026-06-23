// GET /api/cockpit/parked?person=&page=&page_size=&bucket= -> the paginated
// parked pool. Ported from the NestJS CockpitController.parked. Thin: resolve
// the viewer and the effective person, parse page/page_size/bucket exactly as
// the Nest controller did, call the service, return the envelope. The per-field
// patient gate runs inside the service; the handler's global sweep is the
// backstop.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { cockpitService, type ParkedBucket } from '@/lib/server/services/cockpit';

// Node runtime: the service reaches pg/Zoho through getCrmRead().
export const runtime = 'nodejs';

// Accepted parked tab buckets. An unknown value is treated as no bucket (the
// whole pool), so a stale or malformed query never narrows to an empty tab.
const PARKED_BUCKETS: ParkedBucket[] = [
  'leads',
  'deals_treatment',
  'deals_telemedicine',
];
function parseBucket(value: string | null): ParkedBucket | undefined {
  const v = value?.trim();
  return v && (PARKED_BUCKETS as string[]).includes(v)
    ? (v as ParkedBucket)
    : undefined;
}

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const url = new URL(req.url);

  const person =
    url.searchParams.get('person')?.trim().toLowerCase() ||
    viewer.viewed_person;

  const pageParam = url.searchParams.get('page');
  const sizeParam = url.searchParams.get('page_size');
  const pageNum = pageParam ? Number.parseInt(pageParam, 10) : 1;
  const sizeNum = sizeParam ? Number.parseInt(sizeParam, 10) : undefined;

  const { data, parts } = await cockpitService.parked(
    person,
    viewer,
    Number.isNaN(pageNum) ? 1 : pageNum,
    sizeNum != null && !Number.isNaN(sizeNum) ? sizeNum : undefined,
    parseBucket(url.searchParams.get('bucket')),
  );
  return withMeta(data, mergeMeta(parts));
});
