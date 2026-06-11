"use client";

import { Grid, spans } from "@/components/shell/Grid";
import { AttentionCard } from "@/components/home/AttentionCard";
import { GreetingBlock } from "@/components/home/GreetingBlock";
import { KpiStripRow } from "@/components/home/KpiStripRow";
import { PANEL_REGISTRY } from "@/components/home/panelRegistry";
import { PEOPLE, type PersonKey } from "@/config/people";
import { useFocusFlash } from "@/lib/deepLink";

/* The Command Center engine (02 section 8.1): one layout, per-person config.
   Top to bottom: greeting block, four-card KPI strip, the full-width
   attention card, then the person's panels in their configured order, all
   inside the 12-column grid. Panels are shared components keyed by PanelId;
   a panel renders identical markup on every home it appears on.

   Each panel wrapper carries data-focus-id equal to its PanelId (the
   attention card uses "attention"), so heartbeat blips and attention links
   can land on an exact panel via ?focus=. useFocusFlash mounts here, once
   for the home route. */

export function HomeEngine({ person }: { person: PersonKey }) {
  useFocusFlash();
  const config = PEOPLE[person];
  /* Evaluated at render time so a date-bearing subtitle corrects itself
     after midnight, matching the getters in config/titles.ts. */
  const subtitle = config.subtitle({ date: new Date() });

  return (
    <>
      <GreetingBlock greeting={config.greeting} subtitle={subtitle} />
      <KpiStripRow person={person} />
      <Grid className="mt-[14px]">
        <div className={spans.c12} data-focus-id="attention">
          <AttentionCard person={person} />
        </div>
        {config.panels.map((id) => {
          const { Component, span } = PANEL_REGISTRY[id];
          return (
            <div key={id} className={spans[span]} data-focus-id={id}>
              <Component person={person} />
            </div>
          );
        })}
      </Grid>
    </>
  );
}
