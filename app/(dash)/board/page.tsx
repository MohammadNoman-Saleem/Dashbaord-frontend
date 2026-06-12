"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { BoardView } from "@/components/board/BoardView";
import { RaiseTicketModal } from "@/components/board/RaiseTicketModal";
import { Button } from "@/components/ui/Button";
import { Pills } from "@/components/ui/Pills";
import { useFocusFlash } from "@/lib/deepLink";

/* Team board: the legacy ProjectsBoard kanban ported onto saleem-api's
   /api/board, plus the IT ticket form.

   NOTE: this view is NOT in the approved v3 mockup. The visual language
   follows the existing design system (Card, Pills, Chip, Modal, tokens
   only); flagged for Khalid's review per the parking-list rule.

   Scopes mirror the server: the five department tasklists inside the
   Saleem IT and Product project, plus the whole Cross-department project.
   Moving a card writes to Zoho through saleem-api (sanctioned deviation
   from the handover's read-only rule, pending Khalid and Al Saeed
   sign-off; the server audits every move against the real signed-in
   person). */

const SCOPES = [
  { key: "bugs", label: "Bugs" },
  { key: "features", label: "Features" },
  { key: "access", label: "Access" },
  { key: "integrations", label: "Integrations" },
  { key: "general", label: "General" },
  { key: "cross", label: "Cross-department" },
];

export default function BoardPage() {
  useFocusFlash();
  const [scope, setScope] = useState("cross");
  const [ticketOpen, setTicketOpen] = useState(false);

  return (
    <div className="flex flex-col gap-[14px]" data-focus-id="team-board">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <Pills
          aria-label="Board scope"
          items={SCOPES}
          value={scope}
          onChange={setScope}
        />
        <Button variant="primary" onClick={() => setTicketOpen(true)}>
          <Plus strokeWidth={1.8} aria-hidden="true" />
          Raise an IT ticket
        </Button>
      </div>

      <BoardView scope={scope} />

      <RaiseTicketModal open={ticketOpen} onClose={() => setTicketOpen(false)} />
    </div>
  );
}
