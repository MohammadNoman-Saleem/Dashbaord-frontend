# My tasks panel (personal Zoho Projects tasks on the Command Center)

Date: 2026-07-06
Status: approved, implementing on branch `feature/my-tasks-panel`

## Goal

Give each person a card on their Command Center that lists the Zoho Projects
tasks assigned to them, so they see what they need to work on when they log in.
Clicking a task opens the Board view with that task's detail panel already open.

## Decisions (from brainstorming)

- Source: Zoho Projects tasks, from the two projects the app already reads
  (Saleem IT and Product, Saleem Cross-Department).
- Audience: every person's home.
- Prominence: a high-emphasis card, with the emphasis scaled to urgency. The
  card takes the accent treatment and an urgency line when there are overdue or
  due-today tasks, and stays calm with a positive empty state otherwise. No red,
  severity stays in words, per the design rules.

## Reuse

Reuses the existing Zoho Projects read singleton and `TasksService` in
`lib/server/services/board.ts`, plus its `isOpen`, `ownerZpuidOf`, and date
helpers. The existing `GET /api/tasks` stays as the shared team slice. It is too
thin for this (no task id, project id, or assignee id, and pre-sliced to the top
ten), so a sibling read is added rather than overloading it.

## Backend

- `TasksService.mine(zpuid)`: reads the tracked projects (cached once under
  `zoho_projects:my-tasks` for all assignees), keeps open tasks, filters by
  `owner_zpuid === zpuid`, sorts overdue first then soonest due (undated last),
  and caps at 7 rows. Returns the rows plus `overdue_count`, `due_today_count`,
  and `total` over the full assigned-open set, so the urgency line stays accurate
  when the rows are capped. Due state and overdue days are computed against the
  Bahrain calendar day.
- Route `GET /api/tasks/mine`: resolves the viewer's `viewed_person` to a zpuid
  via `assignableUsers()` (an empty result when the person has no Zoho user, so
  the card reads empty rather than erroring), calls `mine()`, returns the
  envelope. Identity is derived server-side from the session, never the client.

## Contract (lib/api/contract.ts)

- `MyTaskRow { id, project_id, tab: 'cross' | 'it', title, due_display,`
  `due_state: 'overdue' | 'today' | 'upcoming' | 'none', overdue_days,`
  `priority: string | null, status }`
- `MyTasksData { rows: MyTaskRow[], overdue_count, due_today_count, total }`

## Wiring

- `config/endpoints.ts`: add the `my_tasks` key, mode live, with a type-aligned
  fixture stub for dev smoke.
- `lib/fixtures/my-tasks.ts` plus its registration in `lib/fixtures/index.ts`.
- `lib/api/keys.ts`: `qk.myTasks(person)`, keyed by person so a view-as switch
  refetches.

## Panel (components/panels/MyTasks.tsx, id p-my-tasks, span c6)

- Title "My tasks". An urgency line when `overdue_count` or `due_today_count` is
  above zero ("2 overdue, 1 due today") with the accent treatment, calm
  otherwise.
- Rows show the title, the due state in words (Overdue by N days, Due today,
  Due Jul 9, No due date) and a priority or status chip. No owner column, since
  it is the viewer's own list.
- Each row links to the board deep link for its task. Read only. Changes go
  through the board or the assistant, matching the other task panel.
- Empty state: "You are all caught up." Loading skeleton like the other panels.
- Registered in `panelRegistry` as c6 and added to every person's config. On
  Fatima's home it fills the currently empty slot.

## Click to open on the Board

The board page keeps tab, project, and tasklist in local state and reads none of
them from the URL today. Add:

- `lib/deepLink.ts`: `boardTaskHref(tab, projectId, taskId, currentAs?)` ->
  `/board?tab=...&project=...&task=...`.
- `app/(dash)/board/page.tsx`: seed the tab and project from the URL params, and
  pass the task id down.
- `components/board/BoardView.tsx`: accept `initialOpenTaskId` and open the task
  detail modal for it on mount. The modal reads the task fresh by id and project,
  so the task need not be in the currently drawn tasklist.

## Privacy

Zoho Projects task titles are internal free text. The global patient-PII sweep
strips known patient fields, not free-text titles, so a title that named a
patient would pass through. Out of scope to solve here and flagged. Titles in
these two projects are IT and cross-department work.

## Verification

`npm run ci` (dashes, red, hype, patient, typecheck, lint). A fixture-driven
render of the panel in light and dark at c6 width, then a click on a row to
confirm the board opens with the task detail panel.
