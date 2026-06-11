import { Grid, spans } from "@/components/shell/Grid";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

/* Shared loading layout for the funnel tabs: optional tile row plus one or
   two card blocks, matching the loaded grid so nothing jumps. Plain blocks,
   no spinners, per the states table in spec 02 section 10. */

export function FunnelTabSkeleton({ tiles = 0 }: { tiles?: number }) {
  return (
    <Grid>
      {Array.from({ length: tiles }, (_, i) => (
        <Card key={i} className={`${spans.c3} flex min-h-[122px] flex-col gap-2 px-[17px] py-[15px]`}>
          <Skeleton height={12} width={120} />
          <Skeleton height={28} width={90} />
          <Skeleton height={12} />
        </Card>
      ))}
      <Card className={`${spans.c7} px-[18px] py-[15px]`}>
        <Skeleton height={14} width={180} className="mb-3" />
        <Skeleton height={120} />
      </Card>
      <Card className={`${spans.c5} px-[18px] py-[15px]`}>
        <Skeleton height={14} width={150} className="mb-3" />
        <div className="flex flex-col gap-[10px]">
          <Skeleton height={12} />
          <Skeleton height={12} />
          <Skeleton height={12} />
          <Skeleton height={12} />
        </div>
      </Card>
    </Grid>
  );
}
