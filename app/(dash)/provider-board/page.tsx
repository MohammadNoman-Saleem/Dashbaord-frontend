"use client";

import { Grid, spans } from "@/components/shell/Grid";
import { ProviderBoard } from "@/components/provider-board/ProviderBoard";

/* The provider board page: a hospital-by-hospital view of which patients have
   been sent to which hospitals and how long each has been waiting. Open to every
   signed-in viewer; patient names are gated per-field server-side, so
   non-name-seers see anonymized references (initials plus the Zoho id). Adding a
   patient needs the name-seer-gated patient search, so that one action stays
   with name-seers inside the board; viewing, removing cards, and managing
   hospital columns are open to all. */

export default function ProviderBoardPage() {
  return (
    <Grid>
      <div className={spans.c12}>
        <ProviderBoard />
      </div>
    </Grid>
  );
}
