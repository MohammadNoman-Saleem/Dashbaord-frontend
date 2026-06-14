"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BoardView } from "@/components/board/BoardView";
import type { BoardCatalogData, BoardProjectRef } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Pills } from "@/components/ui/Pills";
import { FieldSelect } from "@/components/ui/Field";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useFocusFlash } from "@/lib/deepLink";

/* Team board: the legacy ProjectsBoard kanban ported onto saleem-api's
   /api/board, now grouped into three top-level tabs.

   NOTE: this view is NOT in the approved v3 mockup. The visual language
   follows the existing design system (Card, Pills, Chip, tokens only);
   flagged for Khalid's review per the parking-list rule.

   The top tabs group every Zoho project in the portal: Cross-Dept (the
   Saleem Cross-Department project), IT (the Saleem IT and Product project),
   and Other (every other project). Inside a tab the viewer picks a project
   (only the Other tab has more than one) and one of its tasklists; the board
   draws that tasklist's tasks as status columns. Moving a card writes to
   Zoho through saleem-api (sanctioned deviation from the handover's
   read-only rule, pending Khalid and Al Saeed sign-off; the server audits
   every move against the real signed-in person).

   Raising work no longer lives on this page. The IT ticket form moved into
   the unified Raise drawer in the topbar (IT and Ops types), per the build
   lead's ticket-and-blocker merge. */

export default function BoardPage() {
  useFocusFlash();
  const [tab, setTab] = useState("cross");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tasklistId, setTasklistId] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: qk.boardCatalog(),
    queryFn: () =>
      fetchEnvelope<BoardCatalogData>("board", "/board/projects"),
    staleTime: 5 * 60_000,
  });

  const tabs = catalogQuery.data?.data?.tabs ?? [];
  const tabRef = tabs.find((t) => t.key === tab);
  const projects: BoardProjectRef[] = tabRef?.projects ?? [];

  /* Selections are derived, never stored-then-corrected, so no effect is
     needed to keep them valid as the tab or catalog changes: the project
     defaults to the tab's first when the stored id is not under this tab, and
     the tasklist defaults to that project's first when the stored id is not
     on it. A tab always opens on a concrete list; whole-project view is never
     the default. */
  const activeProject =
    projects.find((p) => p.id === projectId) ?? projects[0] ?? null;
  const activeTasklistId =
    activeProject?.tasklists.find((l) => l.id === tasklistId)?.id ??
    activeProject?.tasklists[0]?.id ??
    null;

  const tabItems =
    tabs.length > 0
      ? tabs.map((t) => ({ key: t.key, label: t.label }))
      : [
          { key: "cross", label: "Cross-Dept" },
          { key: "it", label: "IT" },
          { key: "other", label: "Other" },
        ];

  return (
    <div className="flex flex-col gap-[14px]" data-focus-id="team-board">
      <div className="flex flex-wrap items-center gap-[10px]">
        <Pills
          aria-label="Board tab"
          items={tabItems}
          value={tab}
          onChange={(key) => {
            setTab(key);
            setProjectId(null);
            setTasklistId(null);
          }}
        />

        <QueryPanel
          query={catalogQuery}
          skeleton={<Skeleton width={180} height={34} />}
        >
          {() => (
            <div className="flex flex-wrap items-center gap-[8px]">
              {projects.length > 1 ? (
                <FieldSelect
                  aria-label="Project"
                  value={activeProject?.id ?? ""}
                  onChange={(event) => {
                    setProjectId(event.target.value);
                    setTasklistId(null);
                  }}
                  className="w-auto"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </FieldSelect>
              ) : null}

              {activeProject && activeProject.tasklists.length > 0 ? (
                <FieldSelect
                  aria-label="Tasklist"
                  value={activeTasklistId ?? ""}
                  onChange={(event) => setTasklistId(event.target.value)}
                  className="w-auto"
                >
                  {activeProject.tasklists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name.trim()}
                    </option>
                  ))}
                </FieldSelect>
              ) : null}
            </div>
          )}
        </QueryPanel>
      </div>

      {activeProject ? (
        <BoardView
          tab={tab}
          projectId={activeProject.id}
          tasklistId={activeTasklistId}
        />
      ) : null}
    </div>
  );
}
