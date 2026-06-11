"use client";

import { CrmSlice } from "@/components/cases/CrmSlice";
import { CasesKpiRow } from "@/components/cases/KpiRow";
import { AppointmentsPanel } from "@/components/panels/Appointments";
import { LatePanel } from "@/components/panels/Late";
import { PrioritiesPanel } from "@/components/panels/Priorities";
import { Grid, spans } from "@/components/shell/Grid";
import { useFocusFlash } from "@/lib/deepLink";

/* Cases and Pipeline (spec 02 section 8.2): the four KPI cards, Fatima's
   morning list in full, deals running late, appointments with the refund
   rule, and the paginated CRM slice. The morning list is Fatima's queue for
   every viewer; whether names render is decided server-side per the signed
   in viewer, never here. */

export default function CasesPage() {
  useFocusFlash();

  return (
    <Grid>
      <CasesKpiRow />
      <div className={spans.c12} data-focus-id="morning-list">
        <PrioritiesPanel person="fatima" variant="cases" />
      </div>
      <div className={spans.c7} data-focus-id="running-late">
        <LatePanel variant="cases" />
      </div>
      <div className={spans.c5} data-focus-id="cases-appointments">
        <AppointmentsPanel variant="cases" />
      </div>
      <div className={spans.c12} data-focus-id="crm-slice">
        <CrmSlice />
      </div>
    </Grid>
  );
}
