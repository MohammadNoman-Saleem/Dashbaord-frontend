"use client";

import { Grid, spans } from "@/components/shell/Grid";
import { ProviderBoard } from "@/components/provider-board/ProviderBoard";

/* The provider board page: a hospital-by-hospital view of which patients have
   been sent to which hospitals and how long each has been waiting. Open to every
   signed-in viewer; patient names are gated per-field server-side, so
   non-name-seers see anonymized references (initials plus the Zoho id). Adding a
   patient by the name search stays with name-seers; everyone else adds by the
   Zoho reference shown on a card or in the case file. */

export default function ProviderBoardPage() {
  return (
    <Grid>
      <div className={spans.c12}>
        <ProviderBoard />
      </div>
    </Grid>
  );
}
