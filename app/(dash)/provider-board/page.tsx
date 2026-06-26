"use client";

import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardHeader } from "@/components/ui/Card";
import { ProviderBoard } from "@/components/provider-board/ProviderBoard";
import { useViewer } from "@/lib/viewer";

/* The provider board page: a hospital-by-hospital view of which patients have
   been sent to which hospitals and how long each has been waiting. Because the
   cards show patient cases, the board is restricted to viewers who may see
   patient names (the API 403s everyone else); the nav item is gated the same
   way, and this page shows a plain note rather than the board for anyone else. */

export default function ProviderBoardPage() {
  const { me } = useViewer();
  const seesNames = me ? Boolean(me.capabilities.sees_patient_names) : false;

  return (
    <Grid>
      <div className={spans.c12}>
        {seesNames ? (
          <ProviderBoard />
        ) : (
          <Card>
            <CardHeader title="Provider board" subtitle="Restricted" />
            <p className="px-[18px] pb-[16px] text-[13px] text-ink-2">
              The provider board shows patient cases, so it is available to case
              managers who can see patient names.
            </p>
          </Card>
        )}
      </div>
    </Grid>
  );
}
